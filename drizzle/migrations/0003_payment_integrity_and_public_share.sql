-- Phase 2 / migration 0003: payment idempotency, allocation isolation and privacy-safe sharing.
-- Client-side direct writes were revoked by 0002.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS request_fingerprint text;
CREATE UNIQUE INDEX IF NOT EXISTS payments_business_idempotency_unique
  ON public.payments(business_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Every allocation must be an authorised, same-client, same-business, same-currency
-- application. Lock invoice and funding row to serialise competing transactions.
CREATE OR REPLACE FUNCTION public.guard_allocation_limits()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  invoice public.documents;
  payment public.payments;
  credit public.documents;
  due numeric(18,2);
  allocated numeric(18,2);
  funding_allocated numeric(18,2);
BEGIN
  IF NEW.reversed_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT * INTO invoice FROM public.documents WHERE id = NEW.invoice_id FOR UPDATE;
  IF invoice.id IS NULL OR invoice.type <> 'INVOICE' OR invoice.status <> 'ISSUED'
     OR invoice.business_id <> NEW.business_id THEN
    RAISE EXCEPTION 'Allocation target must be an issued invoice of the same business';
  END IF;
  IF NEW.amount <= 0 OR NEW.amount <> round(NEW.amount,2) THEN
    RAISE EXCEPTION 'Allocation must be a positive 2-decimal amount';
  END IF;

  due := invoice.total_amount -
    CASE WHEN invoice.wht_applicable THEN invoice.wht_amount ELSE 0 END;
  SELECT COALESCE(SUM(amount),0) INTO allocated FROM public.allocations
  WHERE invoice_id = NEW.invoice_id AND reversed_at IS NULL AND id <> NEW.id;
  IF allocated + NEW.amount > due THEN
    RAISE EXCEPTION 'Allocation exceeds invoice balance';
  END IF;

  IF (NEW.payment_id IS NULL) = (NEW.credit_note_id IS NULL) THEN
    RAISE EXCEPTION 'Allocation needs exactly one funding source';
  END IF;
  IF NEW.payment_id IS NOT NULL THEN
    SELECT * INTO payment FROM public.payments WHERE id = NEW.payment_id FOR UPDATE;
    IF payment.id IS NULL OR payment.business_id <> invoice.business_id
       OR payment.client_id <> invoice.client_id OR payment.currency <> invoice.currency
       OR payment.status NOT IN ('COMPLETED','RECONCILED') OR payment.reversed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Payment does not match invoice business/client/currency or is reversed';
    END IF;
    SELECT COALESCE(SUM(amount),0) INTO funding_allocated FROM public.allocations
    WHERE payment_id = payment.id AND reversed_at IS NULL AND id <> NEW.id;
    IF funding_allocated + NEW.amount > payment.amount THEN
      RAISE EXCEPTION 'Allocated amount exceeds payment';
    END IF;
  ELSE
    SELECT * INTO credit FROM public.documents WHERE id = NEW.credit_note_id FOR UPDATE;
    IF credit.id IS NULL OR credit.type <> 'CREDIT_NOTE' OR credit.status <> 'ISSUED'
       OR credit.business_id <> invoice.business_id OR credit.client_id <> invoice.client_id
       OR credit.currency <> invoice.currency OR credit.parent_document_id <> invoice.id THEN
      RAISE EXCEPTION 'Credit note must match the referenced invoice, business, client and currency';
    END IF;
    SELECT COALESCE(SUM(amount),0) INTO funding_allocated FROM public.allocations
    WHERE credit_note_id = credit.id AND reversed_at IS NULL AND id <> NEW.id;
    IF funding_allocated + NEW.amount > credit.total_amount THEN
      RAISE EXCEPTION 'Credit allocation exceeds credit note total';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Prevent an internal routine from retroactively reassigning historical allocations.
CREATE OR REPLACE FUNCTION public.guard_allocation_history()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Posted allocation cannot be deleted'; END IF;
  IF to_jsonb(NEW) - 'reversed_at' IS DISTINCT FROM to_jsonb(OLD) - 'reversed_at'
     OR (OLD.reversed_at IS NOT NULL AND NEW.reversed_at IS DISTINCT FROM OLD.reversed_at) THEN
    RAISE EXCEPTION 'Allocation is immutable; only a first reversal timestamp may be set';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER allocations_history BEFORE UPDATE OR DELETE ON public.allocations
FOR EACH ROW EXECUTE FUNCTION public.guard_allocation_history();

-- Explicitly track unapplied customer funds, rather than losing them in revenue.
CREATE VIEW public.unallocated_payment_balances WITH (security_invoker = true) AS
SELECT p.business_id, p.client_id, p.id AS payment_id, p.currency, p.amount,
  (p.amount - COALESCE(SUM(a.amount) FILTER (WHERE a.reversed_at IS NULL),0))::numeric(18,2) AS unallocated
FROM public.payments p
LEFT JOIN public.allocations a ON a.payment_id=p.id
WHERE p.reversed_at IS NULL AND p.status IN ('COMPLETED','RECONCILED')
GROUP BY p.business_id,p.client_id,p.id,p.currency,p.amount;
GRANT SELECT ON public.unallocated_payment_balances TO authenticated;

-- The only public payment-write API. The idempotency lock serialises retries.
CREATE OR REPLACE FUNCTION public.record_payment_v2(_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  business_id uuid := NULLIF(_request->>'business_id','')::uuid;
  client_id uuid := NULLIF(_request->>'client_id','')::uuid;
  idempotency uuid := NULLIF(_request->>'idempotency_key','')::uuid;
  amount_value numeric := (_request->>'amount')::numeric;
  currency_code text;
  channel_value public.payment_channel;
  req_fingerprint text := md5(_request::text);
  allocated_item jsonb;
  payment public.payments;
  receipt public.receipts;
  invoice record;
  available numeric(18,2);
  take_amount numeric(18,2);
  remaining numeric(18,2);
  receipt_number text;
  item_count integer;
BEGIN
  IF jsonb_typeof(_request) IS DISTINCT FROM 'object' OR auth.uid() IS NULL
     OR business_id IS NULL OR client_id IS NULL OR idempotency IS NULL
     OR NOT public.can_write_business(business_id) THEN
    RAISE EXCEPTION 'Unauthorised or missing payment request identifiers';
  END IF;
  IF amount_value IS NULL OR amount_value <= 0 OR amount_value <> round(amount_value,2) THEN
    RAISE EXCEPTION 'Payment amount must be positive with two decimal places';
  END IF;
  SELECT upper(COALESCE(NULLIF(trim(_request->>'currency'),''),b.base_currency))
  INTO currency_code FROM public.businesses b WHERE b.id=business_id;
  IF currency_code IS NULL OR currency_code !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Invalid payment currency';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id=client_id AND c.business_id=business_id) THEN
    RAISE EXCEPTION 'Payment client is outside this business';
  END IF;
  channel_value := (_request->>'channel')::public.payment_channel;
  IF channel_value IS NULL THEN RAISE EXCEPTION 'Payment channel required'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(business_id::text||':'||idempotency::text,0));
  SELECT * INTO payment FROM public.payments p
  WHERE p.business_id=business_id AND p.idempotency_key=idempotency FOR UPDATE;
  IF payment.id IS NOT NULL THEN
    IF payment.request_fingerprint IS DISTINCT FROM req_fingerprint THEN
      RAISE EXCEPTION 'Idempotency key was previously used for a different request';
    END IF;
    SELECT * INTO receipt FROM public.receipts r WHERE r.payment_id=payment.id;
    SELECT amount - COALESCE(SUM(a.amount),0) INTO remaining
    FROM public.payments p LEFT JOIN public.allocations a
      ON a.payment_id=p.id AND a.reversed_at IS NULL
    WHERE p.id=payment.id GROUP BY p.amount;
    RETURN jsonb_build_object('payment',to_jsonb(payment),'receipt',to_jsonb(receipt),
      'unallocated',CASE WHEN payment.reversed_at IS NOT NULL THEN 0 ELSE remaining END,
      'idempotent',true);
  END IF;

  IF _request ? 'allocations' AND jsonb_typeof(_request->'allocations') <> 'array' THEN
    RAISE EXCEPTION 'Allocations must be a JSON array';
  END IF;
  item_count := COALESCE(jsonb_array_length(COALESCE(_request->'allocations','[]'::jsonb)),0);
  IF item_count > 200 THEN RAISE EXCEPTION 'Too many allocations'; END IF;

  -- Serialise commands for the same client/currency. Combined with per-invoice
  -- and funding-row locks in guard_allocation_limits this prevents double spend.
  PERFORM pg_advisory_xact_lock(hashtextextended(business_id::text||':'||client_id::text||':'||currency_code,0));
  INSERT INTO public.payments (
    business_id,client_id,reference,channel,channel_txn_id,amount,currency,
    payment_date,status,payer_name,payer_phone,notes,created_by,
    idempotency_key,request_fingerprint
  ) VALUES (
    business_id,client_id,NULLIF(_request->>'reference',''),channel_value,
    NULLIF(_request->>'channel_txn_id',''),amount_value,currency_code,
    COALESCE(NULLIF(_request->>'payment_date','')::timestamptz,now()),'COMPLETED',
    _request->>'payer_name',_request->>'payer_phone',_request->>'notes',auth.uid(),
    idempotency,req_fingerprint
  ) RETURNING * INTO payment;
  remaining := amount_value;
  IF item_count > 0 THEN
    FOR allocated_item IN SELECT value FROM jsonb_array_elements(_request->'allocations') LOOP
      IF jsonb_typeof(allocated_item) <> 'object' THEN
        RAISE EXCEPTION 'Invalid allocation entry';
      END IF;
      take_amount := (allocated_item->>'amount')::numeric;
      IF take_amount IS NULL OR take_amount <= 0 OR take_amount <> round(take_amount,2)
         OR take_amount > remaining THEN
        RAISE EXCEPTION 'Invalid allocation amount';
      END IF;
      INSERT INTO public.allocations(business_id,invoice_id,payment_id,amount,created_by)
      VALUES(business_id,(allocated_item->>'invoice_id')::uuid,payment.id,take_amount,auth.uid());
      remaining := remaining - take_amount;
    END LOOP;
  ELSE
    FOR invoice IN
      SELECT d.id AS invoice_id FROM public.documents d
      WHERE d.business_id=business_id AND d.client_id=client_id
        AND d.currency=currency_code AND d.type='INVOICE' AND d.status='ISSUED'
      ORDER BY d.issue_date,d.doc_number FOR UPDATE OF d
    LOOP
      EXIT WHEN remaining <= 0;
      SELECT l.balance INTO available FROM public.invoice_ledger l
        WHERE l.invoice_id=invoice.invoice_id;
      IF available > 0 THEN
        take_amount := LEAST(remaining,available);
        INSERT INTO public.allocations(business_id,invoice_id,payment_id,amount,created_by)
        VALUES(business_id,invoice.invoice_id,payment.id,take_amount,auth.uid());
        remaining := remaining-take_amount;
      END IF;
    END LOOP;
  END IF;
  receipt_number := public.next_document_number(business_id,'RCP');
  INSERT INTO public.receipts(business_id,payment_id,client_id,receipt_number,received_by,template_id)
  VALUES(business_id,payment.id,client_id,receipt_number,_request->>'payer_name',
    (SELECT default_template FROM public.businesses WHERE id=business_id))
  RETURNING * INTO receipt;
  INSERT INTO public.audit_logs(business_id,actor_id,action,entity_type,entity_id,details)
  VALUES(business_id,auth.uid(),'PAYMENT_RECORDED','payment',payment.id,
    jsonb_build_object('amount',payment.amount,'currency',currency_code,'channel',channel_value,
    'receipt',receipt.receipt_number,'unallocated',remaining,'source','MANUAL_ENTRY'));
  RETURN jsonb_build_object('payment',to_jsonb(payment),'receipt',to_jsonb(receipt),
    'unallocated',remaining,'idempotent',false);
END;
$$;
REVOKE ALL ON FUNCTION public.record_payment_v2(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_payment_v2(jsonb) TO authenticated;

-- Legacy payment RPC remains for migration history, but cannot be called by
-- browser authenticated users (it lacks a mandatory request idempotency key).
REVOKE EXECUTE ON FUNCTION public.record_payment(
  uuid,uuid,numeric,public.payment_channel,text,timestamptz,
  text,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;

-- Reversal requires reason, reconciles allocation and receipt audit atomically.
CREATE OR REPLACE FUNCTION public.reverse_payment(_payment_id uuid, _reason text)
RETURNS public.payments LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE payment public.payments;
BEGIN
  IF auth.uid() IS NULL OR length(trim(COALESCE(_reason,''))) < 3 THEN
    RAISE EXCEPTION 'Reversal requires authenticated actor and reason'; END IF;
  SELECT * INTO payment FROM public.payments WHERE id=_payment_id FOR UPDATE;
  IF payment.id IS NULL OR NOT public.can_write_business(payment.business_id) THEN
    RAISE EXCEPTION 'Payment not found or not authorised'; END IF;
  IF payment.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'Already reversed'; END IF;

  UPDATE public.allocations SET reversed_at=now()
  WHERE payment_id=payment.id AND reversed_at IS NULL;
  UPDATE public.receipts SET voided_at=now() WHERE payment_id=payment.id AND voided_at IS NULL;
  UPDATE public.payments SET status='REVERSED',reversed_at=now(),reversal_reason=trim(_reason)
  WHERE id=payment.id RETURNING * INTO payment;
  INSERT INTO public.audit_logs(business_id,actor_id,action,entity_type,entity_id,details)
  VALUES(payment.business_id,auth.uid(),'PAYMENT_REVERSED','payment',payment.id,
    jsonb_build_object('amount',payment.amount,'reason',trim(_reason)));
  RETURN payment;
END;
$$;
REVOKE ALL ON FUNCTION public.reverse_payment(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_payment(uuid,text) TO authenticated;

-- Issue credit notes only against their own client's invoice, with unallocated
-- amounts retained in the credit note rather than treated as applied payments.
CREATE OR REPLACE FUNCTION public.issue_credit_note(_credit_note_id uuid)
RETURNS public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
  credit public.documents;
  parent public.documents;
  balance_due numeric;
  applied numeric;
BEGIN
  SELECT * INTO credit FROM public.documents WHERE id=_credit_note_id FOR UPDATE;
  IF credit.id IS NULL OR credit.type <> 'CREDIT_NOTE'
     OR NOT public.can_write_business(credit.business_id) THEN RAISE EXCEPTION 'Credit note not available'; END IF;
  IF credit.parent_document_id IS NOT NULL THEN
    SELECT * INTO parent FROM public.documents WHERE id=credit.parent_document_id FOR UPDATE;
    IF parent.id IS NULL OR parent.type <> 'INVOICE' OR parent.status <> 'ISSUED'
       OR parent.business_id<>credit.business_id OR parent.client_id<>credit.client_id
       OR parent.currency<>credit.currency THEN
      RAISE EXCEPTION 'Credit must reference an issued invoice of same client, currency and business';
    END IF;
  END IF;
  credit := public.finalize_document(_credit_note_id);
  IF parent.id IS NOT NULL THEN
    SELECT l.balance INTO balance_due FROM public.invoice_ledger l WHERE l.invoice_id=parent.id;
    applied := LEAST(credit.total_amount,GREATEST(COALESCE(balance_due,0),0));
    IF applied>0 THEN
      INSERT INTO public.allocations(business_id,invoice_id,credit_note_id,amount,created_by)
      VALUES(credit.business_id,parent.id,credit.id,applied,auth.uid());
    END IF;
  END IF;
  RETURN credit;
END;
$$;

-- Public bearer links receive only invoice-display fields: no owner IDs,
-- internal notes, payer phones, membership, audit metadata or other tenants.
CREATE OR REPLACE FUNCTION public.get_shared_document(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
  link_record public.share_links;
  business_record public.businesses;
  doc public.documents;
  receipt_record public.receipts;
  payment_record public.payments;
  visible_business jsonb;
BEGIN
  IF length(COALESCE(_token,'')) < 32 THEN RETURN NULL; END IF;
  SELECT * INTO link_record FROM public.share_links
  WHERE token=_token AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());
  IF link_record.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO business_record FROM public.businesses WHERE id=link_record.business_id;
  IF business_record.id IS NULL THEN RETURN NULL; END IF;

  visible_business := jsonb_build_object(
    'name',business_record.name,'trading_name',business_record.trading_name,
    'physical_address',business_record.physical_address,'postal_address',business_record.postal_address,
    'city',business_record.city,'country',business_record.country,
    'email',business_record.email,'phone',business_record.phone,
    'kra_pin',business_record.kra_pin,'vat_number',business_record.vat_number,
    'base_currency',business_record.base_currency,
    'bank_name',business_record.bank_name,'bank_branch',business_record.bank_branch,
    'bank_account_name',business_record.bank_account_name,
    'bank_account_number',business_record.bank_account_number,'bank_swift',business_record.bank_swift,
    'mpesa_paybill',business_record.mpesa_paybill,
    'mpesa_account_format',business_record.mpesa_account_format,
    'signatory_name',business_record.signatory_name,'signatory_title',business_record.signatory_title,
    'default_template',business_record.default_template,
    'default_legal_terms',business_record.default_legal_terms
  );

  IF link_record.document_id IS NOT NULL THEN
    SELECT * INTO doc FROM public.documents WHERE id=link_record.document_id
      AND business_id=link_record.business_id AND status<>'DRAFT';
    IF doc.id IS NULL THEN RETURN NULL; END IF;
    UPDATE public.documents SET first_viewed_at=COALESCE(first_viewed_at,now()) WHERE id=doc.id;
    UPDATE public.share_links SET view_count=view_count+1,last_seen_at=now() WHERE id=link_record.id;
    RETURN jsonb_build_object(
      'kind','document','business',visible_business,
      'document',jsonb_build_object(
        'id',doc.id,'type',doc.type,'status',doc.status,'doc_number',doc.doc_number,
        'version',doc.version,'client_name',doc.client_name,'client_email',doc.client_email,
        'client_kra_pin',doc.client_kra_pin,'client_address',doc.client_address,
        'currency',doc.currency,'exchange_rate',doc.exchange_rate,
        'subtotal',doc.subtotal,'discount_total',doc.discount_total,
        'taxable_total',doc.taxable_total,'tax_total',doc.tax_total,
        'total_amount',doc.total_amount,'tax_breakdown',doc.tax_breakdown,
        'wht_applicable',doc.wht_applicable,'wht_rate',doc.wht_rate,'wht_amount',doc.wht_amount,
        'issue_date',doc.issue_date,'due_date',doc.due_date,'valid_until',doc.valid_until,
        'template_id',doc.template_id,'notes',doc.notes,'legal_terms',doc.legal_terms,
        'kra_status',doc.kra_status,
        'kra_control_code',CASE WHEN doc.kra_status='TRANSMITTED' THEN doc.kra_control_code ELSE NULL END
      ),
      'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'id',i.id,'position',i.position,'description',i.description,
         'unit',i.unit,'quantity',i.quantity,'unit_price',i.unit_price,
         'discount_pct',i.discount_pct,'tax_category',i.tax_category,
         'taxable_amount',i.taxable_amount,'tax_amount',i.tax_amount,'net_amount',i.net_amount
       ) ORDER BY i.position) FROM public.document_items i WHERE i.document_id=doc.id),'[]'::jsonb),
      'ledger',(SELECT jsonb_build_object('balance',l.balance,'paid_amount',l.paid_amount,
        'credited_amount',l.credited_amount,'payment_status',l.payment_status)
        FROM public.invoice_ledger l WHERE l.invoice_id=doc.id)
    );
  END IF;
  SELECT * INTO receipt_record FROM public.receipts
  WHERE id=link_record.receipt_id AND business_id=link_record.business_id;
  IF receipt_record.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO payment_record FROM public.payments
  WHERE id=receipt_record.payment_id AND business_id=link_record.business_id;
  IF payment_record.id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.share_links SET view_count=view_count+1,last_seen_at=now() WHERE id=link_record.id;
  RETURN jsonb_build_object('kind','receipt','business',visible_business,
    'receipt',jsonb_build_object('receipt_number',receipt_record.receipt_number,
      'created_at',receipt_record.created_at,'received_by',receipt_record.received_by,
      'notes',receipt_record.notes,'voided_at',receipt_record.voided_at,
      'template_id',receipt_record.template_id),
    'payment',jsonb_build_object('amount',payment_record.amount,
      'currency',payment_record.currency,'channel',payment_record.channel,
      'payment_date',payment_record.payment_date,'reference',payment_record.reference,
      'channel_txn_id',payment_record.channel_txn_id,'payer_name',payment_record.payer_name));
END;
$$;
REVOKE ALL ON FUNCTION public.get_shared_document(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_document(text) TO anon,authenticated;

-- Explicitly restrict every privileged public function to necessary API callers.
REVOKE EXECUTE ON FUNCTION public.guard_allocation_limits() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_allocation_history() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_document_immutability() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_item_immutability() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.issue_credit_note(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.issue_credit_note(uuid) TO authenticated;

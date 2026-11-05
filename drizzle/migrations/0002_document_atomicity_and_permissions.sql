-- Phase 2 / migration 0002: atomic drafts and authoritative document lifecycle.
-- Apply AFTER 0000 and 0001. Do not rewrite already-deployed migrations.
-- Deploy only after checking existing data against docs/phase-2/README.md.

-- Lock down table writes; all new mutations use narrow SECURITY DEFINER commands.
-- Server functions are individually permission-checked and audited.
REVOKE INSERT, UPDATE, DELETE ON public.documents, public.document_items,
  public.document_versions, public.document_sequences, public.payments,
  public.allocations, public.receipts, public.audit_logs
FROM authenticated, anon, PUBLIC;

-- Existing internal functions must not remain exposed as unintended APIs.
REVOKE EXECUTE ON FUNCTION public.next_document_number(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_document(uuid) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.document_items
  ADD CONSTRAINT document_items_quantity_valid CHECK (quantity > 0),
  ADD CONSTRAINT document_items_price_valid CHECK (unit_price >= 0),
  ADD CONSTRAINT document_items_discount_valid CHECK (discount_pct >= 0 AND discount_pct <= 100),
  ADD CONSTRAINT document_items_tax_rate_valid CHECK (tax_rate >= 0 AND tax_rate <= 1);
ALTER TABLE public.documents
  ADD CONSTRAINT documents_exchange_rate_valid CHECK (exchange_rate > 0),
  ADD CONSTRAINT documents_terms_valid CHECK (payment_terms_days >= 0),
  ADD CONSTRAINT documents_wht_rate_valid CHECK (wht_rate >= 0 AND wht_rate <= 1);

-- Issued records can only transition state or record defined delivery/view metadata.
-- Immutable monetary and customer snapshots cannot be modified after issue.
CREATE OR REPLACE FUNCTION public.guard_document_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.status = 'DRAFT' THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','sent_at','first_viewed_at','voided_at','reason','converted_to_id','updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','sent_at','first_viewed_at','voided_at','reason','converted_to_id','updated_at']) THEN
    RAISE EXCEPTION 'Issued document is immutable; create an adjustment instead';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       (OLD.status IN ('ISSUED','ACCEPTED') AND NEW.status IN ('VOID','CANCELLED'))
       OR (OLD.status = 'ISSUED' AND NEW.status IN ('ACCEPTED','REJECTED','EXPIRED')
           AND OLD.type IN ('QUOTATION','PRO_FORMA'))
       OR (OLD.status IN ('ISSUED','ACCEPTED') AND NEW.status = 'CONVERTED'
           AND OLD.type IN ('QUOTATION','PRO_FORMA'))
     ) THEN
    RAISE EXCEPTION 'Invalid issued document state transition';
  END IF;
  IF NEW.converted_to_id IS DISTINCT FROM OLD.converted_to_id
     AND NOT (NEW.status = 'CONVERTED' AND OLD.type IN ('QUOTATION','PRO_FORMA')
              AND OLD.converted_to_id IS NULL AND NEW.converted_to_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Cannot alter document conversion linkage';
  END IF;
  IF NEW.voided_at IS DISTINCT FROM OLD.voided_at
     AND NOT (NEW.status = 'VOID' AND OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid void timestamp update';
  END IF;
  IF NEW.reason IS DISTINCT FROM OLD.reason AND NEW.status <> 'VOID' THEN
    RAISE EXCEPTION 'Void reason can only change on a void';
  END IF;
  IF OLD.sent_at IS NOT NULL AND NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
    RAISE EXCEPTION 'Sent timestamp cannot be rewritten';
  END IF;
  IF OLD.first_viewed_at IS NOT NULL AND NEW.first_viewed_at IS DISTINCT FROM OLD.first_viewed_at THEN
    RAISE EXCEPTION 'First view timestamp cannot be rewritten';
  END IF;
  RETURN NEW;
END;
$$;

-- No totals may be recalculated on an issued document.
CREATE OR REPLACE FUNCTION public.recalculate_document(_document_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  d public.documents;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = _document_id FOR UPDATE;
  IF d.id IS NULL OR d.status <> 'DRAFT' OR NOT public.can_write_business(d.business_id) THEN
    RAISE EXCEPTION 'Recalculation requires an authorised draft';
  END IF;

  UPDATE public.document_items i
  SET gross_amount = round(i.quantity * i.unit_price, 2),
      discount_amount = round(i.quantity * i.unit_price * i.discount_pct / 100.0, 2),
      taxable_amount = round(i.quantity * i.unit_price, 2) - round(i.quantity * i.unit_price * i.discount_pct / 100.0, 2),
      tax_amount = round((round(i.quantity * i.unit_price, 2) - round(i.quantity * i.unit_price * i.discount_pct / 100.0, 2)) * i.tax_rate, 2),
      net_amount = round(i.quantity * i.unit_price, 2) - round(i.quantity * i.unit_price * i.discount_pct / 100.0, 2)
                   + round((round(i.quantity * i.unit_price, 2) - round(i.quantity * i.unit_price * i.discount_pct / 100.0, 2)) * i.tax_rate, 2)
  WHERE i.document_id = _document_id;

  UPDATE public.documents doc
  SET subtotal = COALESCE(aggregated.gross,0),
      discount_total = COALESCE(aggregated.disc,0),
      taxable_total = COALESCE(aggregated.taxable,0),
      tax_total = COALESCE(aggregated.tax,0),
      total_amount = COALESCE(aggregated.taxable,0)+COALESCE(aggregated.tax,0),
      wht_amount = CASE WHEN doc.wht_applicable
                       THEN round(COALESCE(aggregated.taxable,0)*doc.wht_rate,2) ELSE 0 END,
      tax_breakdown = COALESCE(b.breakdown,'[]'::jsonb)
  FROM (
    SELECT SUM(gross_amount) gross, SUM(discount_amount) disc,
           SUM(taxable_amount) taxable, SUM(tax_amount) tax
    FROM public.document_items WHERE document_id = _document_id
  ) aggregated
  LEFT JOIN (
    SELECT jsonb_agg(jsonb_build_object('category',tax_category,'rate',tax_rate,
               'taxable',taxable,'tax',tax) ORDER BY tax_category) breakdown
    FROM (SELECT tax_category, tax_rate, SUM(taxable_amount) taxable, SUM(tax_amount) tax
          FROM public.document_items WHERE document_id = _document_id GROUP BY tax_category,tax_rate) row_totals
  ) b ON true
  WHERE doc.id = _document_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.recalculate_document(uuid) FROM PUBLIC, anon, authenticated;

-- Handles create AND update with one transaction, no partially saved line items.
CREATE OR REPLACE FUNCTION public.save_document_draft(
  _business_id uuid, _client_id uuid, _payload jsonb, _items jsonb, _document_id uuid DEFAULT NULL
) RETURNS public.documents LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  client_record public.clients;
  saved public.documents;
  item jsonb;
  line_category public.tax_category;
  line_rate numeric(6,4);
  desired_type public.doc_type;
  desired_currency text;
  desired_rate numeric;
  desired_template text;
  parent_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_write_business(_business_id) THEN
    RAISE EXCEPTION 'Not authorised to save draft';
  END IF;
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object'
     OR jsonb_typeof(_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 200 THEN
    RAISE EXCEPTION 'Draft requires 1 to 200 line items';
  END IF;
  SELECT * INTO client_record FROM public.clients
    WHERE id = _client_id AND business_id = _business_id FOR SHARE;
  IF client_record.id IS NULL THEN RAISE EXCEPTION 'Client is not in selected business'; END IF;

  desired_type := (_payload->>'type')::public.doc_type;
  desired_currency := upper(trim(COALESCE(_payload->>'currency','')));
  desired_rate := COALESCE((_payload->>'exchange_rate')::numeric,1);
  desired_template := COALESCE(NULLIF(_payload->>'template_id',''),'executive-atelier');
  parent_id := NULLIF(_payload->>'parent_document_id','')::uuid;
  IF desired_currency !~ '^[A-Z]{3}$' OR desired_rate <= 0
     OR desired_template NOT IN (
       'executive-atelier','modern-minimal','midnight-ledger','linear-mono',
       'editorial-classic','nordic-studio','swiss-grid','compact-ledger'
     ) THEN RAISE EXCEPTION 'Invalid currency, rate or template'; END IF;
  IF COALESCE((_payload->>'payment_terms_days')::integer,30) < 0
     OR COALESCE((_payload->>'wht_rate')::numeric,0) NOT BETWEEN 0 AND 1 THEN
    RAISE EXCEPTION 'Invalid terms or withholding rate';
  END IF;
  IF parent_id IS NOT NULL AND NOT EXISTS(
     SELECT 1 FROM public.documents p WHERE p.id = parent_id
     AND p.business_id = _business_id AND p.client_id = _client_id
  ) THEN RAISE EXCEPTION 'Invalid linked document'; END IF;

  IF _document_id IS NULL THEN
    INSERT INTO public.documents(
      business_id,client_id,type,status,client_name,client_email,client_kra_pin,client_address,
      currency,exchange_rate,wht_applicable,wht_rate,issue_date,payment_terms_days,
      template_id,notes,legal_terms,parent_document_id,created_by
    ) VALUES (
      _business_id,_client_id,desired_type,'DRAFT',client_record.name,client_record.email,
      client_record.kra_pin,client_record.address,desired_currency,desired_rate,
      COALESCE((_payload->>'wht_applicable')::boolean,false),
      COALESCE((_payload->>'wht_rate')::numeric,0),
      COALESCE((_payload->>'issue_date')::date,CURRENT_DATE),
      COALESCE((_payload->>'payment_terms_days')::integer,30),
      desired_template,_payload->>'notes',_payload->>'legal_terms',parent_id,auth.uid()
    ) RETURNING * INTO saved;
  ELSE
    SELECT * INTO saved FROM public.documents WHERE id = _document_id FOR UPDATE;
    IF saved.id IS NULL OR saved.business_id <> _business_id OR saved.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Draft not found or cannot be edited';
    END IF;
    UPDATE public.documents SET
      client_id = _client_id, client_name = client_record.name,
      client_email = client_record.email, client_kra_pin = client_record.kra_pin,
      client_address = client_record.address, type = desired_type, currency = desired_currency,
      exchange_rate = desired_rate,
      wht_applicable = COALESCE((_payload->>'wht_applicable')::boolean,false),
      wht_rate = COALESCE((_payload->>'wht_rate')::numeric,0),
      issue_date = COALESCE((_payload->>'issue_date')::date,CURRENT_DATE),
      payment_terms_days = COALESCE((_payload->>'payment_terms_days')::integer,30),
      template_id = desired_template, notes = _payload->>'notes',
      legal_terms = _payload->>'legal_terms', parent_document_id = parent_id
    WHERE id = _document_id RETURNING * INTO saved;
    DELETE FROM public.document_items WHERE document_id = saved.id;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    IF jsonb_typeof(item) <> 'object'
       OR length(trim(COALESCE(item->>'description',''))) = 0
       OR COALESCE((item->>'quantity')::numeric,0) <= 0
       OR COALESCE((item->>'unit_price')::numeric,-1) < 0
       OR COALESCE((item->>'discount_pct')::numeric,0) NOT BETWEEN 0 AND 100 THEN
      RAISE EXCEPTION 'Invalid document line item';
    END IF;
    line_category := (item->>'tax_category')::public.tax_category;
    line_rate := CASE line_category WHEN 'VAT_16' THEN 0.16 WHEN 'VAT_8' THEN 0.08 ELSE 0 END;
    INSERT INTO public.document_items(
      document_id,position,description,unit,quantity,unit_price,
      discount_pct,tax_category,tax_rate
    ) VALUES(
      saved.id,COALESCE((item->>'position')::integer,1),trim(item->>'description'),
      NULLIF(item->>'unit',''),(item->>'quantity')::numeric,
      (item->>'unit_price')::numeric,COALESCE((item->>'discount_pct')::numeric,0),
      line_category,line_rate
    );
  END LOOP;
  PERFORM public.recalculate_document(saved.id);
  SELECT * INTO saved FROM public.documents WHERE id = saved.id;
  INSERT INTO public.audit_logs(business_id,actor_id,action,entity_type,entity_id,details)
  VALUES(_business_id,auth.uid(),'DOCUMENT_DRAFT_SAVED','document',saved.id,
     jsonb_build_object('total',saved.total_amount,'currency',saved.currency,'items',jsonb_array_length(_items)));
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.save_document_draft(uuid,uuid,jsonb,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_document_draft(uuid,uuid,jsonb,jsonb,uuid) TO authenticated;

-- Replace two unaudited direct document-status UPDATEs with intentional transitions.
CREATE OR REPLACE FUNCTION public.set_document_status(_document_id uuid, _status public.doc_lifecycle)
RETURNS public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public,pg_temp AS $$
DECLARE d public.documents;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = _document_id FOR UPDATE;
  IF d.id IS NULL OR auth.uid() IS NULL OR NOT public.can_write_business(d.business_id) THEN
    RAISE EXCEPTION 'Document not available'; END IF;
  IF d.type NOT IN ('QUOTATION','PRO_FORMA') OR d.status <> 'ISSUED'
     OR _status NOT IN ('ACCEPTED','REJECTED','EXPIRED') THEN
    RAISE EXCEPTION 'Unsupported status transition'; END IF;
  UPDATE public.documents SET status = _status WHERE id = d.id RETURNING * INTO d;
  INSERT INTO public.audit_logs (business_id,actor_id,action,entity_type,entity_id,details)
  VALUES (d.business_id,auth.uid(),'DOCUMENT_STATUS_CHANGED','document',d.id,jsonb_build_object('status',_status));
  RETURN d;
END;
$$;
REVOKE ALL ON FUNCTION public.set_document_status(uuid,public.doc_lifecycle) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_document_status(uuid,public.doc_lifecycle) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_document_sent(_document_id uuid)
RETURNS public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public,pg_temp AS $$
DECLARE d public.documents;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = _document_id FOR UPDATE;
  IF d.id IS NULL OR auth.uid() IS NULL OR NOT public.can_write_business(d.business_id)
     OR d.status = 'DRAFT' OR d.status IN ('VOID','CANCELLED') THEN
    RAISE EXCEPTION 'Cannot mark this document as sent'; END IF;
  UPDATE public.documents SET sent_at = COALESCE(sent_at,now()) WHERE id = d.id RETURNING * INTO d;
  INSERT INTO public.audit_logs(business_id,actor_id,action,entity_type,entity_id,details)
  VALUES(d.business_id,auth.uid(),'DOCUMENT_SENT_MANUAL','document',d.id,'{}'::jsonb);
  RETURN d;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_document_sent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_document_sent(uuid) TO authenticated;

-- Existing definer workflow entry points need explicit grants and a signed-in session.
REVOKE EXECUTE ON FUNCTION public.finalize_document(uuid),
  public.issue_credit_note(uuid), public.convert_document(uuid,public.doc_type),
  public.void_document(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_document(uuid),
  public.issue_credit_note(uuid), public.convert_document(uuid,public.doc_type),
  public.void_document(uuid,text) TO authenticated;

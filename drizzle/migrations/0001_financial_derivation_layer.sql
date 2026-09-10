-- =====================================================================
-- Derivation layer: numbering, totals, immutability, payments, receipts
-- =====================================================================

-- ---------- generic updated_at ----------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER businesses_touch BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER clients_touch BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER documents_touch BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER payments_touch BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- atomic sequence allocation ----------
CREATE OR REPLACE FUNCTION public.next_document_number(_business_id uuid, _prefix text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _year integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  _next integer;
BEGIN
  IF NOT public.can_write_business(_business_id) THEN
    RAISE EXCEPTION 'Not permitted to allocate numbers for this business';
  END IF;

  INSERT INTO public.document_sequences (business_id, prefix, year, last_value)
  VALUES (_business_id, _prefix, _year, 1)
  ON CONFLICT (business_id, prefix, year)
  DO UPDATE SET last_value = public.document_sequences.last_value + 1
  RETURNING last_value INTO _next;

  RETURN _prefix || '-' || _year::text || '-' || lpad(_next::text, 4, '0');
END;
$$;

-- ---------- line + document math (single source of truth) ----------
CREATE OR REPLACE FUNCTION public.recalculate_document(_document_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _doc public.documents;
BEGIN
  SELECT * INTO _doc FROM public.documents WHERE id = _document_id;
  IF _doc.id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;
  IF NOT public.can_write_business(_doc.business_id) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  -- per-line derivation: discount applies before tax
  UPDATE public.document_items i
  SET gross_amount    = round(i.quantity * i.unit_price, 2),
      discount_amount = round(i.quantity * i.unit_price * i.discount_pct / 100.0, 2),
      taxable_amount  = round(i.quantity * i.unit_price, 2)
                        - round(i.quantity * i.unit_price * i.discount_pct / 100.0, 2),
      tax_amount      = round((round(i.quantity * i.unit_price, 2)
                        - round(i.quantity * i.unit_price * i.discount_pct / 100.0, 2)) * i.tax_rate, 2),
      net_amount      = round(i.quantity * i.unit_price, 2)
                        - round(i.quantity * i.unit_price * i.discount_pct / 100.0, 2)
                        + round((round(i.quantity * i.unit_price, 2)
                        - round(i.quantity * i.unit_price * i.discount_pct / 100.0, 2)) * i.tax_rate, 2)
  WHERE i.document_id = _document_id;

  UPDATE public.documents d
  SET subtotal       = COALESCE(t.gross, 0),
      discount_total = COALESCE(t.disc, 0),
      taxable_total  = COALESCE(t.taxable, 0),
      tax_total      = COALESCE(t.tax, 0),
      total_amount   = COALESCE(t.taxable, 0) + COALESCE(t.tax, 0),
      wht_amount     = CASE WHEN d.wht_applicable
                            THEN round(COALESCE(t.taxable, 0) * d.wht_rate, 2) ELSE 0 END,
      tax_breakdown  = COALESCE(b.breakdown, '[]'::jsonb)
  FROM (
    SELECT SUM(gross_amount) gross, SUM(discount_amount) disc,
           SUM(taxable_amount) taxable, SUM(tax_amount) tax
    FROM public.document_items WHERE document_id = _document_id
  ) t
  LEFT JOIN (
    SELECT jsonb_agg(jsonb_build_object(
             'category', tax_category, 'rate', tax_rate,
             'taxable', taxable, 'tax', tax) ORDER BY tax_category) breakdown
    FROM (
      SELECT tax_category, tax_rate, SUM(taxable_amount) taxable, SUM(tax_amount) tax
      FROM public.document_items WHERE document_id = _document_id
      GROUP BY tax_category, tax_rate
    ) g
  ) b ON true
  WHERE d.id = _document_id;
END;
$$;

-- ---------- immutability of finalised documents ----------
CREATE OR REPLACE FUNCTION public.guard_document_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'DRAFT' THEN
    RETURN NEW;
  END IF;

  IF NEW.subtotal <> OLD.subtotal
     OR NEW.discount_total <> OLD.discount_total
     OR NEW.taxable_total <> OLD.taxable_total
     OR NEW.tax_total <> OLD.tax_total
     OR NEW.total_amount <> OLD.total_amount
     OR NEW.wht_amount <> OLD.wht_amount
     OR NEW.currency <> OLD.currency
     OR NEW.exchange_rate <> OLD.exchange_rate
     OR NEW.client_id <> OLD.client_id
     OR NEW.type <> OLD.type
     OR NEW.issue_date <> OLD.issue_date
     OR COALESCE(NEW.doc_number, '') <> COALESCE(OLD.doc_number, '') THEN
    RAISE EXCEPTION 'Document % is finalised and cannot be modified. Issue a credit note or void it instead.',
      COALESCE(OLD.doc_number, OLD.id::text);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER documents_immutability BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_immutability();

CREATE OR REPLACE FUNCTION public.guard_item_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _doc_id uuid := COALESCE(NEW.document_id, OLD.document_id);
  _status public.doc_lifecycle;
BEGIN
  SELECT status INTO _status FROM public.documents WHERE id = _doc_id;
  IF _status IS NOT NULL AND _status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Line items of a finalised document cannot be changed';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER document_items_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.document_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_item_immutability();

-- ---------- overpayment / over-allocation guard ----------
CREATE OR REPLACE FUNCTION public.guard_allocation_limits()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _invoice public.documents;
  _due numeric(18,2);
  _allocated numeric(18,2);
  _payment public.payments;
  _pay_allocated numeric(18,2);
BEGIN
  SELECT * INTO _invoice FROM public.documents WHERE id = NEW.invoice_id;
  IF _invoice.id IS NULL OR _invoice.type <> 'INVOICE' THEN
    RAISE EXCEPTION 'Allocations may only target invoices';
  END IF;
  IF _invoice.status = 'DRAFT' THEN
    RAISE EXCEPTION 'Cannot allocate against a draft invoice';
  END IF;
  IF _invoice.business_id <> NEW.business_id THEN
    RAISE EXCEPTION 'Allocation business mismatch';
  END IF;

  _due := _invoice.total_amount
          - CASE WHEN _invoice.wht_applicable THEN _invoice.wht_amount ELSE 0 END;

  SELECT COALESCE(SUM(amount), 0) INTO _allocated
  FROM public.allocations
  WHERE invoice_id = NEW.invoice_id AND reversed_at IS NULL AND id <> NEW.id;

  IF _allocated + NEW.amount > _due + 0.005 THEN
    RAISE EXCEPTION 'Allocation exceeds the outstanding balance of invoice % (outstanding %)',
      COALESCE(_invoice.doc_number, _invoice.id::text), _due - _allocated;
  END IF;

  IF NEW.payment_id IS NOT NULL THEN
    SELECT * INTO _payment FROM public.payments WHERE id = NEW.payment_id;
    IF _payment.currency <> _invoice.currency THEN
      RAISE EXCEPTION 'Payment currency % does not match invoice currency %',
        _payment.currency, _invoice.currency;
    END IF;
    SELECT COALESCE(SUM(amount), 0) INTO _pay_allocated
    FROM public.allocations
    WHERE payment_id = NEW.payment_id AND reversed_at IS NULL AND id <> NEW.id;
    IF _pay_allocated + NEW.amount > _payment.amount + 0.005 THEN
      RAISE EXCEPTION 'Allocated amount exceeds the payment total';
    END IF;
  END IF;

  IF NEW.credit_note_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.documents c
      WHERE c.id = NEW.credit_note_id AND c.type = 'CREDIT_NOTE'
        AND c.status <> 'DRAFT' AND c.currency = _invoice.currency
    ) THEN
      RAISE EXCEPTION 'Credit note must be issued and share the invoice currency';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER allocations_limits BEFORE INSERT OR UPDATE ON public.allocations
  FOR EACH ROW EXECUTE FUNCTION public.guard_allocation_limits();

-- ---------- derived ledger views (RLS respected via security_invoker) ----------
CREATE VIEW public.invoice_ledger
WITH (security_invoker = true) AS
SELECT d.id AS invoice_id,
       d.business_id,
       d.client_id,
       d.doc_number,
       d.client_name,
       d.currency,
       d.issue_date,
       d.due_date,
       d.status,
       d.total_amount,
       CASE WHEN d.wht_applicable THEN d.wht_amount ELSE 0 END AS wht_withheld,
       (d.total_amount - CASE WHEN d.wht_applicable THEN d.wht_amount ELSE 0 END) AS amount_due,
       COALESCE(a.paid, 0) AS paid_amount,
       COALESCE(a.credited, 0) AS credited_amount,
       (d.total_amount - CASE WHEN d.wht_applicable THEN d.wht_amount ELSE 0 END
         - COALESCE(a.paid, 0) - COALESCE(a.credited, 0)) AS balance,
       CASE
         WHEN d.status IN ('VOID','CANCELLED') THEN 'VOID'
         WHEN (d.total_amount - CASE WHEN d.wht_applicable THEN d.wht_amount ELSE 0 END
               - COALESCE(a.paid, 0) - COALESCE(a.credited, 0)) <= 0.005 THEN 'PAID'
         WHEN COALESCE(a.paid, 0) + COALESCE(a.credited, 0) > 0.005 THEN 'PARTIALLY_PAID'
         WHEN d.due_date IS NOT NULL AND d.due_date < CURRENT_DATE THEN 'OVERDUE'
         ELSE 'UNPAID'
       END AS payment_status,
       CASE WHEN d.due_date IS NOT NULL THEN (CURRENT_DATE - d.due_date) ELSE 0 END AS days_overdue
FROM public.documents d
LEFT JOIN (
  SELECT invoice_id,
         SUM(CASE WHEN payment_id IS NOT NULL THEN amount ELSE 0 END) paid,
         SUM(CASE WHEN credit_note_id IS NOT NULL THEN amount ELSE 0 END) credited
  FROM public.allocations WHERE reversed_at IS NULL
  GROUP BY invoice_id
) a ON a.invoice_id = d.id
WHERE d.type = 'INVOICE';

GRANT SELECT ON public.invoice_ledger TO authenticated;

CREATE VIEW public.client_balances
WITH (security_invoker = true) AS
SELECT c.id AS client_id,
       c.business_id,
       c.name,
       c.currency,
       COALESCE(SUM(l.amount_due), 0) AS invoiced,
       COALESCE(SUM(l.paid_amount), 0) AS paid,
       COALESCE(SUM(l.credited_amount), 0) AS credited,
       COALESCE(SUM(CASE WHEN l.payment_status <> 'VOID' THEN l.balance ELSE 0 END), 0) AS outstanding,
       COALESCE(SUM(CASE WHEN l.payment_status = 'OVERDUE'
                          OR (l.balance > 0.005 AND l.due_date < CURRENT_DATE)
                         THEN l.balance ELSE 0 END), 0) AS overdue
FROM public.clients c
LEFT JOIN public.invoice_ledger l ON l.client_id = c.id AND l.status NOT IN ('VOID','CANCELLED')
GROUP BY c.id, c.business_id, c.name, c.currency;

GRANT SELECT ON public.client_balances TO authenticated;

-- ---------- finalise a document (number + snapshot + audit) ----------
CREATE OR REPLACE FUNCTION public.finalize_document(_document_id uuid)
RETURNS public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _doc public.documents;
  _prefix text;
  _number text;
  _client public.clients;
BEGIN
  SELECT * INTO _doc FROM public.documents WHERE id = _document_id FOR UPDATE;
  IF _doc.id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;
  IF NOT public.can_write_business(_doc.business_id) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF _doc.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only drafts can be issued';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.document_items WHERE document_id = _document_id) THEN
    RAISE EXCEPTION 'Add at least one line item before issuing';
  END IF;

  PERFORM public.recalculate_document(_document_id);
  SELECT * INTO _doc FROM public.documents WHERE id = _document_id;

  _prefix := CASE _doc.type
    WHEN 'INVOICE' THEN 'INV'
    WHEN 'PRO_FORMA' THEN 'PF'
    WHEN 'QUOTATION' THEN 'QT'
    WHEN 'CREDIT_NOTE' THEN 'CN'
    WHEN 'DEBIT_NOTE' THEN 'DN'
  END;
  _number := public.next_document_number(_doc.business_id, _prefix);

  SELECT * INTO _client FROM public.clients WHERE id = _doc.client_id;

  UPDATE public.documents SET
    doc_number = _number,
    status = 'ISSUED',
    finalized_at = now(),
    client_name = COALESCE(_client.name, client_name),
    client_email = COALESCE(_client.email, client_email),
    client_kra_pin = COALESCE(_client.kra_pin, client_kra_pin),
    client_address = COALESCE(_client.address, client_address),
    due_date = CASE
      WHEN type = 'INVOICE' THEN COALESCE(due_date, issue_date + payment_terms_days)
      ELSE due_date END,
    valid_until = CASE
      WHEN type IN ('QUOTATION','PRO_FORMA') THEN COALESCE(valid_until, issue_date + 30)
      ELSE valid_until END
  WHERE id = _document_id
  RETURNING * INTO _doc;

  INSERT INTO public.document_versions (document_id, business_id, version, snapshot, reason, created_by)
  VALUES (_document_id, _doc.business_id, _doc.version,
          jsonb_build_object(
            'document', to_jsonb(_doc),
            'items', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.position)
                               FROM public.document_items i WHERE i.document_id = _document_id), '[]'::jsonb)
          ),
          'Issued', auth.uid());

  INSERT INTO public.audit_logs (business_id, actor_id, action, entity_type, entity_id, details)
  VALUES (_doc.business_id, auth.uid(), 'DOCUMENT_ISSUED', 'document', _document_id,
          jsonb_build_object('number', _number, 'type', _doc.type, 'total', _doc.total_amount));

  RETURN _doc;
END;
$$;

-- ---------- void a finalised document ----------
CREATE OR REPLACE FUNCTION public.void_document(_document_id uuid, _reason text)
RETURNS public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _doc public.documents;
BEGIN
  SELECT * INTO _doc FROM public.documents WHERE id = _document_id FOR UPDATE;
  IF _doc.id IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF NOT public.can_write_business(_doc.business_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF _doc.status IN ('VOID','CANCELLED') THEN RAISE EXCEPTION 'Already void'; END IF;
  IF EXISTS (SELECT 1 FROM public.allocations WHERE invoice_id = _document_id AND reversed_at IS NULL) THEN
    RAISE EXCEPTION 'Reverse the payments allocated to this invoice before voiding it';
  END IF;

  UPDATE public.documents
  SET status = 'VOID', voided_at = now(), reason = _reason
  WHERE id = _document_id RETURNING * INTO _doc;

  INSERT INTO public.audit_logs (business_id, actor_id, action, entity_type, entity_id, details)
  VALUES (_doc.business_id, auth.uid(), 'DOCUMENT_VOIDED', 'document', _document_id,
          jsonb_build_object('number', _doc.doc_number, 'reason', _reason));

  RETURN _doc;
END;
$$;

-- ---------- record a payment, allocate it, derive the receipt ----------
CREATE OR REPLACE FUNCTION public.record_payment(
  _business_id uuid,
  _client_id uuid,
  _amount numeric,
  _channel public.payment_channel,
  _currency text DEFAULT NULL,
  _payment_date timestamptz DEFAULT now(),
  _reference text DEFAULT NULL,
  _channel_txn_id text DEFAULT NULL,
  _payer_name text DEFAULT NULL,
  _payer_phone text DEFAULT NULL,
  _notes text DEFAULT NULL,
  _allocations jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _payment public.payments;
  _currency text := COALESCE(_currency, (SELECT base_currency FROM public.businesses WHERE id = _business_id));
  _remaining numeric(18,2) := round(_amount, 2);
  _alloc jsonb;
  _invoice record;
  _take numeric(18,2);
  _receipt public.receipts;
  _receipt_number text;
BEGIN
  IF NOT public.can_write_business(_business_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;

  INSERT INTO public.payments (business_id, client_id, reference, channel, channel_txn_id,
                               amount, currency, payment_date, status, payer_name, payer_phone, notes, created_by)
  VALUES (_business_id, _client_id, NULLIF(_reference, ''), _channel, NULLIF(_channel_txn_id, ''),
          round(_amount, 2), _currency, COALESCE(_payment_date, now()), 'COMPLETED',
          _payer_name, _payer_phone, _notes, auth.uid())
  RETURNING * INTO _payment;

  -- explicit allocations [{invoice_id, amount}]
  IF jsonb_array_length(COALESCE(_allocations, '[]'::jsonb)) > 0 THEN
    FOR _alloc IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
      _take := round((_alloc->>'amount')::numeric, 2);
      IF _take > 0 THEN
        INSERT INTO public.allocations (business_id, invoice_id, payment_id, amount, created_by)
        VALUES (_business_id, (_alloc->>'invoice_id')::uuid, _payment.id, _take, auth.uid());
        _remaining := _remaining - _take;
      END IF;
    END LOOP;
  ELSE
    -- otherwise settle oldest outstanding invoices first
    FOR _invoice IN
      SELECT invoice_id, balance FROM public.invoice_ledger
      WHERE client_id = _client_id AND currency = _currency
        AND status NOT IN ('VOID','CANCELLED') AND balance > 0.005
      ORDER BY issue_date, doc_number
    LOOP
      EXIT WHEN _remaining <= 0.005;
      _take := LEAST(_remaining, _invoice.balance);
      INSERT INTO public.allocations (business_id, invoice_id, payment_id, amount, created_by)
      VALUES (_business_id, _invoice.invoice_id, _payment.id, round(_take, 2), auth.uid());
      _remaining := _remaining - round(_take, 2);
    END LOOP;
  END IF;

  -- a completed payment always yields a receipt
  _receipt_number := public.next_document_number(_business_id, 'RCP');
  INSERT INTO public.receipts (business_id, payment_id, client_id, receipt_number, received_by, template_id)
  VALUES (_business_id, _payment.id, _client_id, _receipt_number, _payer_name,
          COALESCE((SELECT default_template FROM public.businesses WHERE id = _business_id), 'executive-atelier'))
  RETURNING * INTO _receipt;

  INSERT INTO public.audit_logs (business_id, actor_id, action, entity_type, entity_id, details)
  VALUES (_business_id, auth.uid(), 'PAYMENT_RECORDED', 'payment', _payment.id,
          jsonb_build_object('amount', _payment.amount, 'currency', _currency,
                             'channel', _channel, 'receipt', _receipt_number,
                             'unallocated', _remaining));

  RETURN jsonb_build_object(
    'payment', to_jsonb(_payment),
    'receipt', to_jsonb(_receipt),
    'unallocated', _remaining
  );
END;
$$;

-- ---------- reverse a payment: unwind allocations, void the receipt ----------
CREATE OR REPLACE FUNCTION public.reverse_payment(_payment_id uuid, _reason text)
RETURNS public.payments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _payment public.payments;
BEGIN
  SELECT * INTO _payment FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF _payment.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF NOT public.can_write_business(_payment.business_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF _payment.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'Payment already reversed'; END IF;

  UPDATE public.allocations SET reversed_at = now()
  WHERE payment_id = _payment_id AND reversed_at IS NULL;

  UPDATE public.receipts SET voided_at = now() WHERE payment_id = _payment_id AND voided_at IS NULL;

  UPDATE public.payments
  SET status = 'REVERSED', reversed_at = now(), reversal_reason = _reason
  WHERE id = _payment_id RETURNING * INTO _payment;

  INSERT INTO public.audit_logs (business_id, actor_id, action, entity_type, entity_id, details)
  VALUES (_payment.business_id, auth.uid(), 'PAYMENT_REVERSED', 'payment', _payment_id,
          jsonb_build_object('amount', _payment.amount, 'reason', _reason));

  RETURN _payment;
END;
$$;

-- ---------- issue a credit note against an invoice and apply it ----------
CREATE OR REPLACE FUNCTION public.issue_credit_note(_credit_note_id uuid)
RETURNS public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cn public.documents;
  _outstanding numeric(18,2);
  _apply numeric(18,2);
BEGIN
  SELECT * INTO _cn FROM public.documents WHERE id = _credit_note_id;
  IF _cn.id IS NULL OR _cn.type <> 'CREDIT_NOTE' THEN RAISE EXCEPTION 'Not a credit note'; END IF;

  _cn := public.finalize_document(_credit_note_id);

  IF _cn.parent_document_id IS NOT NULL THEN
    SELECT balance INTO _outstanding FROM public.invoice_ledger WHERE invoice_id = _cn.parent_document_id;
    _apply := LEAST(_cn.total_amount, COALESCE(_outstanding, 0));
    IF _apply > 0.005 THEN
      INSERT INTO public.allocations (business_id, invoice_id, credit_note_id, amount, created_by)
      VALUES (_cn.business_id, _cn.parent_document_id, _cn.id, round(_apply, 2), auth.uid());
    END IF;
  END IF;

  RETURN _cn;
END;
$$;

-- ---------- convert a quotation / pro-forma into an invoice ----------
CREATE OR REPLACE FUNCTION public.convert_document(_source_id uuid, _target_type public.doc_type)
RETURNS public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _src public.documents;
  _new public.documents;
BEGIN
  SELECT * INTO _src FROM public.documents WHERE id = _source_id FOR UPDATE;
  IF _src.id IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF NOT public.can_write_business(_src.business_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF _src.type NOT IN ('QUOTATION','PRO_FORMA') THEN
    RAISE EXCEPTION 'Only quotations and pro-formas can be converted';
  END IF;
  IF _src.converted_to_id IS NOT NULL THEN RAISE EXCEPTION 'Already converted'; END IF;
  IF _src.status = 'DRAFT' THEN RAISE EXCEPTION 'Issue the document before converting it'; END IF;

  INSERT INTO public.documents (
    business_id, client_id, type, status, client_name, client_email, client_kra_pin, client_address,
    currency, exchange_rate, wht_applicable, wht_rate, issue_date, payment_terms_days,
    parent_document_id, template_id, notes, legal_terms, created_by
  )
  VALUES (
    _src.business_id, _src.client_id, _target_type, 'DRAFT', _src.client_name, _src.client_email,
    _src.client_kra_pin, _src.client_address, _src.currency, _src.exchange_rate,
    _src.wht_applicable, _src.wht_rate, CURRENT_DATE, _src.payment_terms_days,
    _src.id, _src.template_id, _src.notes, _src.legal_terms, auth.uid()
  )
  RETURNING * INTO _new;

  INSERT INTO public.document_items (
    document_id, position, description, unit, quantity, unit_price, discount_pct, tax_category, tax_rate
  )
  SELECT _new.id, position, description, unit, quantity, unit_price, discount_pct, tax_category, tax_rate
  FROM public.document_items WHERE document_id = _src.id;

  PERFORM public.recalculate_document(_new.id);

  UPDATE public.documents SET converted_to_id = _new.id, status = 'CONVERTED' WHERE id = _src.id;

  INSERT INTO public.audit_logs (business_id, actor_id, action, entity_type, entity_id, details)
  VALUES (_src.business_id, auth.uid(), 'DOCUMENT_CONVERTED', 'document', _src.id,
          jsonb_build_object('from', _src.doc_number, 'to_type', _target_type, 'new_id', _new.id));

  SELECT * INTO _new FROM public.documents WHERE id = _new.id;
  RETURN _new;
END;
$$;

-- ---------- onboarding: create a business and enrol the owner atomically ----------
CREATE OR REPLACE FUNCTION public.create_business(_name text, _base_currency text DEFAULT 'KES')
RETURNS public.businesses LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _b public.businesses;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;

  INSERT INTO public.businesses (owner_id, name, base_currency)
  VALUES (auth.uid(), _name, COALESCE(NULLIF(_base_currency, ''), 'KES'))
  RETURNING * INTO _b;

  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (_b.id, auth.uid(), 'OWNER');

  INSERT INTO public.audit_logs (business_id, actor_id, action, entity_type, entity_id, details)
  VALUES (_b.id, auth.uid(), 'BUSINESS_CREATED', 'business', _b.id, jsonb_build_object('name', _name));

  RETURN _b;
END;
$$;

-- ---------- public portal read by share token (no auth) ----------
CREATE OR REPLACE FUNCTION public.get_shared_document(_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _link public.share_links;
  _doc public.documents;
  _receipt public.receipts;
  _payment public.payments;
  _biz public.businesses;
BEGIN
  SELECT * INTO _link FROM public.share_links WHERE token = _token;
  IF _link.id IS NULL OR _link.revoked_at IS NOT NULL
     OR (_link.expires_at IS NOT NULL AND _link.expires_at < now()) THEN
    RETURN NULL;
  END IF;

  UPDATE public.share_links
  SET view_count = view_count + 1, last_seen_at = now()
  WHERE id = _link.id;

  SELECT * INTO _biz FROM public.businesses WHERE id = _link.business_id;

  IF _link.document_id IS NOT NULL THEN
    SELECT * INTO _doc FROM public.documents WHERE id = _link.document_id;
    UPDATE public.documents SET first_viewed_at = COALESCE(first_viewed_at, now())
    WHERE id = _doc.id;

    RETURN jsonb_build_object(
      'kind', 'document',
      'business', to_jsonb(_biz) - 'owner_id',
      'document', to_jsonb(_doc),
      'items', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.position)
                         FROM public.document_items i WHERE i.document_id = _doc.id), '[]'::jsonb),
      'ledger', (SELECT to_jsonb(l) FROM public.invoice_ledger l WHERE l.invoice_id = _doc.id)
    );
  END IF;

  SELECT * INTO _receipt FROM public.receipts WHERE id = _link.receipt_id;
  SELECT * INTO _payment FROM public.payments WHERE id = _receipt.payment_id;

  RETURN jsonb_build_object(
    'kind', 'receipt',
    'business', to_jsonb(_biz) - 'owner_id',
    'receipt', to_jsonb(_receipt),
    'payment', to_jsonb(_payment)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_document(text) TO anon, authenticated;

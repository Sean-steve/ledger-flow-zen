-- Phase 2 / migration 0005: currency-aware receivables and controlled document transitions.
-- Existing client_balances falsely mixed currencies under the client's default code.
CREATE OR REPLACE VIEW public.client_balances WITH (security_invoker = true) AS
SELECT c.id AS client_id,
       c.business_id,
       c.name,
       COALESCE(l.currency,c.currency) AS currency,
       COALESCE(SUM(l.amount_due),0) AS invoiced,
       COALESCE(SUM(l.paid_amount),0) AS paid,
       COALESCE(SUM(l.credited_amount),0) AS credited,
       COALESCE(SUM(CASE WHEN l.payment_status<>'VOID' THEN l.balance ELSE 0 END),0) AS outstanding,
       COALESCE(SUM(CASE WHEN l.payment_status='OVERDUE'
               OR (l.balance>0 AND l.due_date<CURRENT_DATE) THEN l.balance ELSE 0 END),0) AS overdue
FROM public.clients c
LEFT JOIN public.invoice_ledger l ON l.client_id=c.id
  AND l.status NOT IN ('VOID','CANCELLED')
GROUP BY c.id,c.business_id,c.name,COALESCE(l.currency,c.currency);
GRANT SELECT ON public.client_balances TO authenticated;

-- Credit that was not applied to an invoice remains explicit.
CREATE VIEW public.unallocated_credit_balances WITH (security_invoker = true) AS
SELECT d.id AS credit_note_id,d.business_id,d.client_id,d.currency,d.total_amount,
  (d.total_amount-COALESCE(SUM(a.amount) FILTER (WHERE a.reversed_at IS NULL),0))::numeric(18,2)
  AS unapplied
FROM public.documents d
LEFT JOIN public.allocations a ON a.credit_note_id=d.id
WHERE d.type='CREDIT_NOTE' AND d.status='ISSUED'
GROUP BY d.id,d.business_id,d.client_id,d.currency,d.total_amount;
GRANT SELECT ON public.unallocated_credit_balances TO authenticated;

-- Quotes/pro-formas can only be converted to a draft invoice, not into arbitrary document types.
CREATE OR REPLACE FUNCTION public.convert_document(_source_id uuid, _target_type public.doc_type)
RETURNS public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
  source_doc public.documents;
  target_doc public.documents;
BEGIN
  SELECT * INTO source_doc FROM public.documents WHERE id=_source_id FOR UPDATE;
  IF source_doc.id IS NULL OR NOT public.can_write_business(source_doc.business_id) THEN
    RAISE EXCEPTION 'Source document unavailable'; END IF;
  IF _target_type<>'INVOICE' OR source_doc.type NOT IN ('QUOTATION','PRO_FORMA')
     OR source_doc.status NOT IN ('ISSUED','ACCEPTED') OR source_doc.converted_to_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only issued/accepted quotations and pro-formas convert to invoices';
  END IF;
  INSERT INTO public.documents(
    business_id,client_id,type,status,client_name,client_email,client_kra_pin,
    client_address,currency,exchange_rate,wht_applicable,wht_rate,issue_date,
    payment_terms_days,parent_document_id,template_id,notes,legal_terms,created_by
  ) VALUES(
    source_doc.business_id,source_doc.client_id,'INVOICE','DRAFT',source_doc.client_name,
    source_doc.client_email,source_doc.client_kra_pin,source_doc.client_address,
    source_doc.currency,source_doc.exchange_rate,source_doc.wht_applicable,
    source_doc.wht_rate,CURRENT_DATE,source_doc.payment_terms_days,source_doc.id,
    source_doc.template_id,source_doc.notes,source_doc.legal_terms,auth.uid()
  ) RETURNING * INTO target_doc;

  INSERT INTO public.document_items(
    document_id,position,description,unit,quantity,unit_price,
    discount_pct,tax_category,tax_rate
  ) SELECT target_doc.id,position,description,unit,quantity,unit_price,
           discount_pct,tax_category,tax_rate
    FROM public.document_items WHERE document_id=source_doc.id;
  PERFORM public.recalculate_document(target_doc.id);
  UPDATE public.documents SET status='CONVERTED',converted_to_id=target_doc.id
    WHERE id=source_doc.id;
  INSERT INTO public.audit_logs(business_id,actor_id,action,entity_type,entity_id,details)
  VALUES(source_doc.business_id,auth.uid(),'DOCUMENT_CONVERTED','document',source_doc.id,
    jsonb_build_object('target',target_doc.id,'type','INVOICE'));
  SELECT * INTO target_doc FROM public.documents WHERE id=target_doc.id;
  RETURN target_doc;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.convert_document(uuid,public.doc_type) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.convert_document(uuid,public.doc_type) TO authenticated;

-- Do not void invoices with active payments or credit notes with active allocations.
CREATE OR REPLACE FUNCTION public.void_document(_document_id uuid,_reason text)
RETURNS public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.documents;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id=_document_id FOR UPDATE;
  IF d.id IS NULL OR NOT public.can_write_business(d.business_id) THEN
    RAISE EXCEPTION 'Document unavailable'; END IF;
  IF d.status NOT IN ('ISSUED','ACCEPTED')
     OR length(trim(COALESCE(_reason,'')))<3 THEN
    RAISE EXCEPTION 'Only issued documents can be voided with a reason'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.allocations a
    WHERE (a.invoice_id=d.id OR a.credit_note_id=d.id) AND a.reversed_at IS NULL
  ) THEN RAISE EXCEPTION 'Reverse/resolve active allocations before voiding'; END IF;
  UPDATE public.documents SET status='VOID',voided_at=now(),reason=trim(_reason)
    WHERE id=d.id RETURNING * INTO d;
  INSERT INTO public.audit_logs(business_id,actor_id,action,entity_type,entity_id,details)
  VALUES(d.business_id,auth.uid(),'DOCUMENT_VOIDED','document',d.id,
    jsonb_build_object('number',d.doc_number,'reason',trim(_reason)));
  RETURN d;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.void_document(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.void_document(uuid,text) TO authenticated;

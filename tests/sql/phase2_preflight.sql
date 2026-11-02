-- READ-ONLY production/staging preflight; run before migrations 0002-0005.
DO $check$
DECLARE bad bigint;
BEGIN
  IF to_regclass('public.documents') IS NULL OR to_regclass('public.payments') IS NULL OR
     to_regclass('public.allocations') IS NULL OR
     to_regprocedure('public.finalize_document(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Baseline 0000/0001 are not installed; stop before Phase 2 migration';
  END IF;

  SELECT COUNT(*) INTO bad FROM public.documents d
  LEFT JOIN public.clients c ON c.id=d.client_id AND c.business_id=d.business_id
  WHERE c.id IS NULL;
  IF bad<>0 THEN RAISE EXCEPTION 'Document/client tenant mismatches: %',bad; END IF;

  SELECT COUNT(*) INTO bad FROM public.documents d
  JOIN public.documents parent ON parent.id=d.parent_document_id
  WHERE d.business_id<>parent.business_id OR d.client_id<>parent.client_id;
  IF bad<>0 THEN RAISE EXCEPTION 'Document parent tenant mismatches: %',bad; END IF;

  SELECT COUNT(*) INTO bad FROM public.payments p
  LEFT JOIN public.clients c ON c.id=p.client_id AND c.business_id=p.business_id
  WHERE c.id IS NULL;
  IF bad<>0 THEN RAISE EXCEPTION 'Payment client tenant mismatches: %',bad; END IF;

  SELECT COUNT(*) INTO bad FROM public.receipts r
  LEFT JOIN public.payments p ON p.id=r.payment_id
    AND p.business_id=r.business_id AND p.client_id=r.client_id
  WHERE p.id IS NULL;
  IF bad<>0 THEN RAISE EXCEPTION 'Receipt/payment relationship mismatches: %',bad; END IF;

  SELECT COUNT(*) INTO bad FROM public.allocations a
  JOIN public.documents d ON d.id=a.invoice_id
  LEFT JOIN public.payments p ON p.id=a.payment_id
  LEFT JOIN public.documents credit ON credit.id=a.credit_note_id
  WHERE a.business_id<>d.business_id
    OR (p.id IS NOT NULL AND (p.business_id<>d.business_id OR p.client_id<>d.client_id OR p.currency<>d.currency))
    OR (credit.id IS NOT NULL AND
      (credit.business_id<>d.business_id OR credit.client_id<>d.client_id OR credit.currency<>d.currency));
  IF bad<>0 THEN RAISE EXCEPTION 'Allocation funding relationship mismatches: %',bad; END IF;

  SELECT COUNT(*) INTO bad FROM public.document_items
  WHERE quantity<=0 OR unit_price<0 OR discount_pct NOT BETWEEN 0 AND 100
     OR tax_rate NOT BETWEEN 0 AND 1;
  IF bad<>0 THEN RAISE EXCEPTION 'Invalid line item values: %',bad; END IF;

  SELECT COUNT(*) INTO bad FROM public.documents
  WHERE exchange_rate<=0 OR payment_terms_days<0
     OR wht_rate NOT BETWEEN 0 AND 1
     OR (status<>'DRAFT' AND doc_number IS NULL);
  IF bad<>0 THEN RAISE EXCEPTION 'Invalid document totals/terms: %',bad; END IF;

  SELECT COUNT(*) INTO bad FROM public.businesses b
  WHERE NOT EXISTS(SELECT 1 FROM public.business_members m
    WHERE m.business_id=b.id AND m.role='OWNER');
  IF bad<>0 THEN RAISE EXCEPTION 'Businesses with no owner membership: %',bad; END IF;

  RAISE NOTICE 'Phase 2 read-only preflight passed; snapshot and backup still required';
END;
$check$;

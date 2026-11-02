-- Phase 2.1: READ-ONLY staged financial reconciliation.
-- All counts are global; no customer names, phone numbers, tokens or account IDs are printed.
-- Run as a privileged database operator, never as a browser or anonymous role.
-- RAISE EXCEPTION causes ON_ERROR_STOP to fail and activation transaction to roll back.
DO $reconcile$
DECLARE
  failures text[] := ARRAY[]::text[];
  bad bigint;
  business_count bigint;
  invoice_count bigint;
  payment_count bigint;
  receipt_count bigint;
  allocation_count bigint;
  currency_count bigint;
  total_receivables numeric;
BEGIN
  IF to_regclass('public.invoice_ledger') IS NULL
     OR to_regclass('public.client_balances') IS NULL
     OR to_regclass('public.unallocated_payment_balances') IS NULL
     OR to_regclass('public.unallocated_credit_balances') IS NULL
     OR to_regclass('fdos_internal.applied_phases') IS NULL
     OR to_regclass('fdos_internal.environment_binding') IS NULL THEN
    RAISE EXCEPTION 'Staging migrations or environment binding are missing';
  END IF;
  IF (SELECT count(*) FROM fdos_internal.environment_binding WHERE environment_type='STAGING') <> 1 THEN
    RAISE EXCEPTION 'Not bound to exactly one staging environment';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fdos_internal.applied_phases WHERE phase='phase2_0002_0005') THEN
    RAISE EXCEPTION 'Phase 2 migrations were not recorded';
  END IF;

  SELECT COUNT(*) INTO bad FROM public.documents d
  LEFT JOIN public.clients c ON c.id=d.client_id AND c.business_id=d.business_id
  WHERE c.id IS NULL;
  IF bad>0 THEN failures := array_append(failures,'document_client_tenant'); END IF;

  SELECT COUNT(*) INTO bad FROM public.payments p
  LEFT JOIN public.clients c ON c.id=p.client_id AND c.business_id=p.business_id
  WHERE c.id IS NULL;
  IF bad>0 THEN failures := array_append(failures,'payment_client_tenant'); END IF;

  SELECT COUNT(*) INTO bad FROM public.receipts r
  LEFT JOIN public.payments p ON p.id=r.payment_id AND p.business_id=r.business_id
    AND p.client_id=r.client_id
  WHERE p.id IS NULL;
  IF bad>0 THEN failures := array_append(failures,'receipt_payment_identity'); END IF;

  SELECT COUNT(*) INTO bad FROM public.share_links s
  LEFT JOIN public.documents d ON d.id=s.document_id
  LEFT JOIN public.receipts r ON r.id=s.receipt_id
  WHERE (s.document_id IS NOT NULL AND
           (d.id IS NULL OR d.business_id<>s.business_id OR d.status='DRAFT'))
     OR (s.receipt_id IS NOT NULL AND (r.id IS NULL OR r.business_id<>s.business_id));
  IF bad>0 THEN failures := array_append(failures,'share_link_isolation'); END IF;

  SELECT COUNT(*) INTO bad FROM public.allocations a
  LEFT JOIN public.documents d ON d.id=a.invoice_id
  LEFT JOIN public.payments p ON p.id=a.payment_id
  LEFT JOIN public.documents credit ON credit.id=a.credit_note_id
  WHERE d.id IS NULL OR d.type<>'INVOICE' OR d.business_id<>a.business_id
    OR (a.payment_id IS NOT NULL AND
        (p.id IS NULL OR p.business_id<>d.business_id OR p.client_id<>d.client_id
          OR p.currency<>d.currency))
    OR (a.credit_note_id IS NOT NULL AND
        (credit.id IS NULL OR credit.business_id<>d.business_id
          OR credit.client_id<>d.client_id OR credit.currency<>d.currency));
  IF bad>0 THEN failures := array_append(failures,'allocation_tenant_or_currency'); END IF;

  SELECT count(*) INTO bad FROM (
    SELECT d.id FROM public.documents d
    LEFT JOIN (
      SELECT document_id,COALESCE(SUM(gross_amount),0) gross,
             COALESCE(SUM(discount_amount),0) discount,
             COALESCE(SUM(taxable_amount),0) taxable,
             COALESCE(SUM(tax_amount),0) tax,
             COALESCE(SUM(net_amount),0) net
      FROM public.document_items GROUP BY document_id
    ) item ON item.document_id=d.id
    WHERE abs(d.subtotal-COALESCE(item.gross,0))>0.005
       OR abs(d.discount_total-COALESCE(item.discount,0))>0.005
       OR abs(d.taxable_total-COALESCE(item.taxable,0))>0.005
       OR abs(d.tax_total-COALESCE(item.tax,0))>0.005
       OR abs(d.total_amount-COALESCE(item.net,0))>0.005
  ) broken;
  IF bad>0 THEN failures := array_append(failures,'document_line_total_drift'); END IF;

  SELECT count(*) INTO bad FROM public.documents d
  WHERE d.status<>'DRAFT' AND (d.doc_number IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.document_versions v WHERE v.document_id=d.id));
  IF bad>0 THEN failures := array_append(failures,'issued_document_snapshot'); END IF;

  SELECT count(*) INTO bad FROM (
    SELECT p.id FROM public.payments p
    LEFT JOIN public.allocations a ON a.payment_id=p.id AND a.reversed_at IS NULL
    GROUP BY p.id,p.amount
    HAVING COALESCE(SUM(a.amount),0)>p.amount+0.005
  ) broken;
  IF bad>0 THEN failures := array_append(failures,'payment_overallocation'); END IF;

  SELECT count(*) INTO bad FROM (
    SELECT credit.id FROM public.documents credit
    LEFT JOIN public.allocations a ON a.credit_note_id=credit.id AND a.reversed_at IS NULL
    WHERE credit.type='CREDIT_NOTE'
    GROUP BY credit.id,credit.total_amount
    HAVING COALESCE(SUM(a.amount),0)>credit.total_amount+0.005
  ) broken;
  IF bad>0 THEN failures := array_append(failures,'credit_overallocation'); END IF;

  SELECT COUNT(*) INTO bad FROM public.invoice_ledger
  WHERE status NOT IN ('DRAFT','VOID','CANCELLED') AND
    (balance< -0.005 OR balance>amount_due+0.005);
  IF bad>0 THEN failures := array_append(failures,'invoice_balance_out_of_bounds'); END IF;

  SELECT COUNT(*) INTO bad FROM public.allocations a JOIN public.payments p ON p.id=a.payment_id
  WHERE a.reversed_at IS NULL AND (p.reversed_at IS NOT NULL
     OR p.status NOT IN ('COMPLETED','RECONCILED'));
  IF bad>0 THEN failures := array_append(failures,'reversed_funding_still_allocated'); END IF;

  SELECT COUNT(*) INTO bad FROM public.receipts r JOIN public.payments p ON p.id=r.payment_id
  WHERE (p.reversed_at IS NOT NULL AND r.voided_at IS NULL)
     OR (p.reversed_at IS NULL AND r.voided_at IS NOT NULL);
  IF bad>0 THEN failures := array_append(failures,'receipt_void_state'); END IF;

  SELECT COUNT(*) INTO bad FROM public.payments p WHERE p.status='COMPLETED' AND NOT EXISTS
    (SELECT 1 FROM public.receipts r WHERE r.payment_id=p.id);
  IF bad>0 THEN failures := array_append(failures,'completed_payment_without_receipt'); END IF;

  SELECT COUNT(*) INTO bad FROM public.unallocated_payment_balances
  WHERE unallocated< -0.005 OR unallocated>amount+0.005;
  IF bad>0 THEN failures := array_append(failures,'unallocated_payment_liability'); END IF;

  SELECT COUNT(*) INTO bad FROM public.unallocated_credit_balances
  WHERE unapplied< -0.005 OR unapplied>total_amount+0.005;
  IF bad>0 THEN failures := array_append(failures,'unapplied_credit_liability'); END IF;

  SELECT COUNT(*) INTO bad FROM (
    SELECT l.client_id,l.currency,SUM(l.balance) outstanding
    FROM public.invoice_ledger l WHERE l.status NOT IN ('VOID','CANCELLED')
    GROUP BY l.client_id,l.currency
  ) expected LEFT JOIN public.client_balances c
    ON c.client_id=expected.client_id AND c.currency=expected.currency
  WHERE c.client_id IS NULL OR abs(expected.outstanding-c.outstanding)>0.005;
  IF bad>0 THEN failures := array_append(failures,'client_currency_balance_mismatch'); END IF;

  SELECT COUNT(*) INTO bad FROM pg_class cls JOIN pg_namespace ns ON ns.oid=cls.relnamespace
  WHERE ns.nspname='public' AND cls.relname IN (
    'businesses','business_members','clients','documents','document_items',
    'payments','allocations','receipts','share_links','audit_logs'
  ) AND cls.relkind='r' AND NOT cls.relrowsecurity;
  IF bad>0 THEN failures := array_append(failures,'row_security_disabled'); END IF;

  IF has_table_privilege('authenticated','public.payments','INSERT')
     OR has_table_privilege('authenticated','public.payments','UPDATE')
     OR has_table_privilege('authenticated','public.allocations','INSERT')
     OR has_table_privilege('authenticated','public.documents','UPDATE')
     OR has_function_privilege('anon','public.record_payment_v2(jsonb)','EXECUTE') THEN
    failures := array_append(failures,'unsafe_financial_grants');
  END IF;

  SELECT COUNT(*) INTO business_count FROM public.businesses;
  SELECT COUNT(*) INTO invoice_count FROM public.documents WHERE type='INVOICE';
  SELECT COUNT(*) INTO payment_count FROM public.payments;
  SELECT COUNT(*) INTO receipt_count FROM public.receipts;
  SELECT COUNT(*) INTO allocation_count FROM public.allocations WHERE reversed_at IS NULL;
  SELECT COUNT(DISTINCT currency) INTO currency_count FROM public.documents;
  SELECT COALESCE(SUM(CASE WHEN currency='KES' AND
              status NOT IN ('VOID','CANCELLED','DRAFT') THEN balance ELSE 0 END),0)
    INTO total_receivables FROM public.invoice_ledger;

  RAISE NOTICE 'Financial staging counts (no customer identifiers): businesses %, invoices %, payments %, receipts %, active allocations %, document currencies %',
    business_count,invoice_count,payment_count,receipt_count,allocation_count,currency_count;
  RAISE NOTICE 'KES issued invoice receivables (KES only; not a multi-currency total): %',total_receivables;

  IF COALESCE(array_length(failures,1),0)>0 THEN
    RAISE EXCEPTION 'Financial reconciliation failed: %',array_to_string(failures,', ');
  END IF;
  RAISE NOTICE 'Financial staging reconciliation PASS (internal records only; external source parity not verified)';
END;
$reconcile$;

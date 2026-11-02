-- Transactional/role regression smoke suite against empty ephemeral PostgreSQL 16.
-- Requires 0000,0001,0002,0003 already applied.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

DO $test$
DECLARE
  b uuid; c uuid; another uuid;
  d public.documents; second_doc public.documents;
  result jsonb; replay jsonb; req jsonb; public_doc jsonb;
  receipt uuid; payment_id uuid; balance numeric;
  key uuid := '22222222-2222-4222-8222-222222222222';
  denied boolean;
BEGIN
  SELECT id INTO b FROM public.create_business('Financial correctness test','KES');
  IF b IS NULL THEN RAISE EXCEPTION 'business creation failed'; END IF;
  INSERT INTO public.clients(business_id,name,currency) VALUES(b,'Client One','KES') RETURNING id INTO c;
  INSERT INTO public.clients(business_id,name,currency) VALUES(b,'Client Two','KES') RETURNING id INTO another;

  d := public.save_document_draft(
    b,c, '{"type":"INVOICE","issue_date":"2026-11-02","currency":"KES","template_id":"modern-minimal"}',
    '[{"position":1,"description":"Test service","quantity":1,"unit_price":100,"discount_pct":0,"tax_category":"VAT_16"}]',null
  );
  IF d.total_amount<>116 OR d.status<>'DRAFT' THEN
    RAISE EXCEPTION 'draft calculation incorrect, expected 116: %',d.total_amount; END IF;

  d := public.save_document_draft(
    b,c, '{"type":"INVOICE","issue_date":"2026-11-02","currency":"KES","template_id":"modern-minimal"}',
    '[{"position":1,"description":"Test service","quantity":1,"unit_price":100,"discount_pct":0,"tax_category":"VAT_16"}]',d.id
  );
  IF (SELECT count(*) FROM public.document_items WHERE document_id=d.id)<>1 THEN
    RAISE EXCEPTION 'draft update duplicated line items'; END IF;
  d := public.finalize_document(d.id);
  IF d.status<>'ISSUED' OR d.doc_number IS NULL OR
    (SELECT count(*) FROM public.document_versions WHERE document_id=d.id)<>1 THEN
    RAISE EXCEPTION 'draft finalisation failed'; END IF;

  denied := false;
  BEGIN
    UPDATE public.documents SET total_amount=1 WHERE id=d.id;
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'authenticated direct document write was allowed'; END IF;

  second_doc := public.save_document_draft(
    b,another, '{"type":"INVOICE","issue_date":"2026-11-02","currency":"KES"}',
    '[{"position":1,"description":"Other client","quantity":1,"unit_price":200,"tax_category":"VAT_16"}]',null
  );
  second_doc := public.finalize_document(second_doc.id);

  req := jsonb_build_object('business_id',b,'client_id',c,'idempotency_key',key,
    'currency','KES','amount','60.00','channel','BANK_TRANSFER',
    'payment_date','2026-11-02T12:00:00Z','reference','TEST-TRANSFER-001',
    'allocations',jsonb_build_array());
  result := public.record_payment_v2(req);
  payment_id := (result->'payment'->>'id')::uuid;
  receipt := (result->'receipt'->>'id')::uuid;
  IF payment_id IS NULL OR receipt IS NULL THEN RAISE EXCEPTION 'payment did not create receipt'; END IF;
  SELECT l.balance INTO balance FROM public.invoice_ledger l WHERE l.invoice_id=d.id;
  IF balance<>56 THEN RAISE EXCEPTION 'partial allocation expected 56, got %',balance; END IF;

  replay := public.record_payment_v2(req);
  IF (replay->'payment'->>'id')::uuid<>payment_id OR (replay->>'idempotent')::boolean IS NOT TRUE
    OR (SELECT count(*) FROM public.payments WHERE business_id=b)<>1 THEN
    RAISE EXCEPTION 'idempotent replay duplicated payment'; END IF;

  denied := false;
  BEGIN
    PERFORM public.record_payment_v2(req || '{"amount":"61.00"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'idempotency collision was allowed'; END IF;

  denied := false;
  BEGIN
    PERFORM public.record_payment_v2(jsonb_build_object('business_id',b,'client_id',c,
      'idempotency_key','33333333-3333-4333-8333-333333333333',
      'currency','KES','amount','10.00','channel','CASH',
      'allocations',jsonb_build_array(jsonb_build_object('invoice_id',second_doc.id,'amount','10.00'))));
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'cross-client allocation accepted'; END IF;

  denied := false;
  BEGIN
    INSERT INTO public.allocations(business_id,invoice_id,payment_id,amount)
    VALUES (b,d.id,payment_id,1);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'authenticated direct allocation insert allowed'; END IF;

  PERFORM public.reverse_payment(payment_id,'Incorrect reference confirmed');
  SELECT l.balance INTO balance FROM public.invoice_ledger l WHERE l.invoice_id=d.id;
  IF balance<>116 OR (SELECT voided_at FROM public.receipts WHERE id=receipt) IS NULL THEN
    RAISE EXCEPTION 'payment reversal failed to restore invoice/void receipt'; END IF;

  INSERT INTO public.share_links(business_id,document_id,token)
  VALUES(b,d.id,'phase2-valid-share-token-1234567890123456789012');
  public_doc := public.get_shared_document('phase2-valid-share-token-1234567890123456789012');
  IF public_doc IS NULL OR public_doc->'business' ? 'owner_id'
    OR public_doc->'document' ? 'created_by' THEN
    RAISE EXCEPTION 'public payload leaked privileged metadata'; END IF;

  RAISE NOTICE 'Phase 2 PostgreSQL smoke: draft/issue/permissions/partial/idempotency/cross-client/reversal/sharing PASS';
END;
$test$;


-- Owner and tenant rules, including a live ADMIN role with lesser permissions.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $owners$
DECLARE
  b uuid; other_business uuid; c uuid; other_client uuid;
  foreign_doc public.documents;
  denied boolean;
BEGIN
  SELECT id INTO b FROM public.create_business('Phase2 owner guard A','KES');
  SELECT id INTO other_business FROM public.create_business('Phase2 owner guard B','KES');
  INSERT INTO public.clients(business_id,name,currency)
    VALUES(b,'Scoped client','KES') RETURNING id INTO c;
  INSERT INTO public.clients(business_id,name,currency)
    VALUES(other_business,'Other business client','KES') RETURNING id INTO other_client;
  INSERT INTO public.business_members(business_id,user_id,role)
    VALUES(b,'55555555-5555-4555-8555-555555555555','ADMIN');

  denied:=false;
  BEGIN UPDATE public.businesses SET owner_id='55555555-5555-4555-8555-555555555555' WHERE id=b;
  EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'owner id was mutable'; END IF;

  denied:=false;
  BEGIN UPDATE public.business_members SET role='VIEWER'
    WHERE business_id=b AND user_id=auth.uid();
  EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'last owner was demoted'; END IF;

  denied:=false;
  BEGIN UPDATE public.clients SET business_id=other_business WHERE id=c;
  EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'cross-business client transfer succeeded'; END IF;

  foreign_doc:=public.save_document_draft(other_business,other_client,
    '{"type":"INVOICE","currency":"KES"}',
    '[{"description":"Other document","quantity":1,"unit_price":100,"tax_category":"VAT_16"}]',null);
  foreign_doc:=public.finalize_document(foreign_doc.id);
  denied:=false;
  BEGIN INSERT INTO public.share_links(business_id,document_id,token)
    VALUES(b,foreign_doc.id,'phase2-invalid-cross-business-share-1234567890');
  EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'cross-business share was allowed'; END IF;

  RAISE NOTICE 'Phase 2 business/tenant/last-owner guard checks PASS';
END;
$owners$;
SELECT set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',false);
DO $admin$
DECLARE b uuid; denied boolean := false;
BEGIN
  SELECT id INTO b FROM public.businesses WHERE name='Phase2 owner guard A';
  IF b IS NULL THEN RAISE EXCEPTION 'admin cannot see assigned business'; END IF;
  UPDATE public.business_members SET role='OWNER'
  WHERE business_id=b AND user_id=auth.uid();
  IF (SELECT role FROM public.business_members
       WHERE business_id=b AND user_id=auth.uid())='OWNER' THEN
    RAISE EXCEPTION 'admin self-promoted to OWNER'; END IF;
  BEGIN UPDATE public.businesses SET owner_id=auth.uid() WHERE id=b;
  EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'admin changed business owner'; END IF;
  RAISE NOTICE 'Phase 2 admin role escalation checks PASS';
END;
$admin$;
RESET ROLE;

RESET ROLE;
SET ROLE anon;
DO $test$
DECLARE payload jsonb; denied boolean := false;
BEGIN
  payload := public.get_shared_document('phase2-valid-share-token-1234567890123456789012');
  IF payload IS NULL OR payload->'business' ? 'owner_id' THEN
    RAISE EXCEPTION 'anonymous share must return minimal fields'; END IF;
  BEGIN
    PERFORM public.record_payment_v2('{"amount":"1.00"}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'anonymous payment RPC executed'; END IF;
  RAISE NOTICE 'Anonymous privacy and payment ACL PASS';
END;
$test$;
RESET ROLE;

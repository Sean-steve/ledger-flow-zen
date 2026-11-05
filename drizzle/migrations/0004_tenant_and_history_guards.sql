-- Phase 2 / migration 0004: prevent business-owner and tenant-relationship tampering.
-- Additive security controls; existing tables remain intact.

CREATE OR REPLACE FUNCTION public.guard_business_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Owner transfer requires a governed service command';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER business_owner_immutable
BEFORE UPDATE OF owner_id ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.guard_business_owner();

-- A business ADMIN must not promote itself to OWNER or invite arbitrary owners.
DROP POLICY IF EXISTS "self or owner enrols" ON public.business_members;
CREATE POLICY "owner manages enrolment" ON public.business_members FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(business_id,ARRAY['OWNER']::public.member_role[]));
DROP POLICY IF EXISTS "owner updates roster" ON public.business_members;
CREATE POLICY "owner updates roster" ON public.business_members FOR UPDATE TO authenticated
  USING (public.has_business_role(business_id,ARRAY['OWNER']::public.member_role[]))
  WITH CHECK (public.has_business_role(business_id,ARRAY['OWNER']::public.member_role[]));

CREATE OR REPLACE FUNCTION public.guard_last_business_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF OLD.role='OWNER' AND
    (TG_OP='DELETE' OR (TG_OP='UPDATE' AND NEW.role<>'OWNER')) AND
    (SELECT count(*) FROM public.business_members m
     WHERE m.business_id=OLD.business_id AND m.role='OWNER')<=1 THEN
    RAISE EXCEPTION 'Cannot remove or demote the final business owner';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER business_last_owner_guard
BEFORE UPDATE OR DELETE ON public.business_members
FOR EACH ROW EXECUTE FUNCTION public.guard_last_business_owner();

CREATE OR REPLACE FUNCTION public.guard_client_business()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    RAISE EXCEPTION 'Cannot transfer clients between businesses';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER client_business_immutable
BEFORE UPDATE OF business_id ON public.clients FOR EACH ROW EXECUTE FUNCTION public.guard_client_business();

-- Cross-table tenants remain matched even when a privileged command inserts a document.
CREATE OR REPLACE FUNCTION public.guard_document_relationship()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id=NEW.client_id AND c.business_id=NEW.business_id) THEN
    RAISE EXCEPTION 'Document client/business mismatch';
  END IF;
  IF NEW.parent_document_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.documents parent
    WHERE parent.id=NEW.parent_document_id AND parent.business_id=NEW.business_id
      AND parent.client_id=NEW.client_id
  ) THEN
    RAISE EXCEPTION 'Document parent must match business and client';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER documents_relationship_guard
BEFORE INSERT OR UPDATE OF business_id,client_id,parent_document_id
ON public.documents FOR EACH ROW EXECUTE FUNCTION public.guard_document_relationship();

CREATE OR REPLACE FUNCTION public.guard_payment_client()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.clients c WHERE c.id=NEW.client_id
                AND c.business_id=NEW.business_id) THEN
    RAISE EXCEPTION 'Payment client/business mismatch';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payments_client_relationship
BEFORE INSERT OR UPDATE OF business_id,client_id ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.guard_payment_client();

-- Once a payment is posted, only authorised reversal metadata can change.
CREATE OR REPLACE FUNCTION public.guard_payment_history()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF to_jsonb(NEW) - ARRAY['status','reversed_at','reversal_reason','updated_at'] IS DISTINCT FROM
     to_jsonb(OLD) - ARRAY['status','reversed_at','reversal_reason','updated_at'] THEN
    RAISE EXCEPTION 'Posted payment cannot be rewritten';
  END IF;
  IF OLD.reversed_at IS NOT NULL
     OR NEW.status<>'REVERSED' OR NEW.reversed_at IS NULL OR
     length(trim(COALESCE(NEW.reversal_reason,'')))<3 OR
     OLD.status NOT IN ('COMPLETED','RECONCILED') THEN
    RAISE EXCEPTION 'Only first auditable payment reversal is allowed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payments_history_immutable
BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.guard_payment_history();

CREATE OR REPLACE FUNCTION public.guard_receipt_relationship()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.payments p
                WHERE p.id=NEW.payment_id AND p.business_id=NEW.business_id
                AND p.client_id=NEW.client_id) THEN
    RAISE EXCEPTION 'Receipt payment/business/client mismatch';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER receipts_payment_relationship
BEFORE INSERT OR UPDATE OF payment_id,business_id,client_id
ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.guard_receipt_relationship();

CREATE OR REPLACE FUNCTION public.guard_share_relationship()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  IF NEW.document_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.documents d WHERE d.id=NEW.document_id
      AND d.business_id=NEW.business_id AND d.status<>'DRAFT'
  ) THEN RAISE EXCEPTION 'Share link cannot expose another business or an unissued draft'; END IF;
  IF NEW.receipt_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.receipts r WHERE r.id=NEW.receipt_id
      AND r.business_id=NEW.business_id
  ) THEN RAISE EXCEPTION 'Share receipt/business mismatch'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shares_relationship_guard
BEFORE INSERT OR UPDATE OF business_id,document_id,receipt_id ON public.share_links
FOR EACH ROW EXECUTE FUNCTION public.guard_share_relationship();

REVOKE EXECUTE ON FUNCTION public.guard_business_owner(),
  public.guard_last_business_owner(), public.guard_client_business(),
  public.guard_document_relationship(), public.guard_payment_client(),
  public.guard_payment_history(), public.guard_receipt_relationship(),
  public.guard_share_relationship()
FROM PUBLIC, anon, authenticated;

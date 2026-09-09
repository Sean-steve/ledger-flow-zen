-- =====================================================================
-- Financial Document OS — canonical schema
-- =====================================================================

-- ---------- enums ----------
CREATE TYPE public.doc_type AS ENUM ('INVOICE','PRO_FORMA','QUOTATION','CREDIT_NOTE','DEBIT_NOTE');
CREATE TYPE public.doc_lifecycle AS ENUM ('DRAFT','ISSUED','ACCEPTED','REJECTED','EXPIRED','CONVERTED','VOID','CANCELLED');
CREATE TYPE public.payment_channel AS ENUM ('MPESA_C2B','MPESA_TILL','BANK_TRANSFER','RTGS','CASH','CHEQUE','CARD','OTHER');
CREATE TYPE public.payment_state AS ENUM ('INITIATED','COMPLETED','RECONCILED','FAILED','REVERSED');
CREATE TYPE public.tax_category AS ENUM ('VAT_16','VAT_8','ZERO_RATED','EXEMPT');
CREATE TYPE public.client_state AS ENUM ('ACTIVE','ON_HOLD','INACTIVE');
CREATE TYPE public.member_role AS ENUM ('OWNER','ADMIN','ACCOUNTANT','VIEWER');

-- ---------- profiles ----------
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY,
  email       text,
  full_name   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read"   ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile write"  ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- ---------- businesses ----------
CREATE TABLE public.businesses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              uuid NOT NULL DEFAULT auth.uid(),
  name                  text NOT NULL,
  trading_name          text,
  kra_pin               text,
  vat_number            text,
  email                 text,
  phone                 text,
  physical_address      text,
  postal_address        text,
  city                  text,
  country               text NOT NULL DEFAULT 'Kenya',
  base_currency         text NOT NULL DEFAULT 'KES',
  default_tax_category  public.tax_category NOT NULL DEFAULT 'VAT_16',
  default_wht_rate      numeric(6,4) NOT NULL DEFAULT 0.05,
  default_terms_days    integer NOT NULL DEFAULT 30,
  default_template      text NOT NULL DEFAULT 'executive-atelier',
  mpesa_paybill         text,
  mpesa_account_format  text DEFAULT '{DOCUMENT_NO}',
  bank_name             text,
  bank_branch           text,
  bank_account_name     text,
  bank_account_number   text,
  bank_swift            text,
  logo_path             text,
  signature_path        text,
  seal_path             text,
  signatory_name        text,
  signatory_title       text,
  default_notes         text,
  default_legal_terms   text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX businesses_owner_idx ON public.businesses(owner_id);

-- ---------- membership (roles live in their own table) ----------
CREATE TABLE public.business_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  role        public.member_role NOT NULL DEFAULT 'VIEWER',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);
CREATE INDEX business_members_user_idx ON public.business_members(user_id);

-- security-definer access helpers (avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.has_business_access(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_members m
    WHERE m.business_id = _business_id AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_business_role(_business_id uuid, _roles public.member_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_members m
    WHERE m.business_id = _business_id AND m.user_id = auth.uid() AND m.role = ANY(_roles)
  );
$$;

-- can the current user write financial data for this business?
CREATE OR REPLACE FUNCTION public.can_write_business(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_business_role(_business_id, ARRAY['OWNER','ADMIN','ACCOUNTANT']::public.member_role[]);
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member reads business"  ON public.businesses FOR SELECT TO authenticated USING (public.has_business_access(id));
CREATE POLICY "owner creates business" ON public.businesses FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "admin updates business" ON public.businesses FOR UPDATE TO authenticated
  USING (public.has_business_role(id, ARRAY['OWNER','ADMIN']::public.member_role[]))
  WITH CHECK (public.has_business_role(id, ARRAY['OWNER','ADMIN']::public.member_role[]));
CREATE POLICY "owner deletes business" ON public.businesses FOR DELETE TO authenticated USING (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_members TO authenticated;
GRANT ALL ON public.business_members TO service_role;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member reads roster" ON public.business_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_business_access(business_id));
CREATE POLICY "self or owner enrols" ON public.business_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR public.has_business_role(business_id, ARRAY['OWNER','ADMIN']::public.member_role[])
  );
CREATE POLICY "owner updates roster" ON public.business_members FOR UPDATE TO authenticated
  USING (public.has_business_role(business_id, ARRAY['OWNER','ADMIN']::public.member_role[]))
  WITH CHECK (public.has_business_role(business_id, ARRAY['OWNER','ADMIN']::public.member_role[]));
CREATE POLICY "owner removes roster" ON public.business_members FOR DELETE TO authenticated
  USING (public.has_business_role(business_id, ARRAY['OWNER']::public.member_role[]));

-- ---------- clients ----------
CREATE TABLE public.clients (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name               text NOT NULL,
  contact_person     text,
  email              text,
  phone              text,
  kra_pin            text,
  address            text,
  city               text,
  country            text NOT NULL DEFAULT 'Kenya',
  currency           text NOT NULL DEFAULT 'KES',
  payment_terms_days integer NOT NULL DEFAULT 30,
  credit_limit       numeric(18,2),
  status             public.client_state NOT NULL DEFAULT 'ACTIVE',
  notes              text,
  created_by         uuid DEFAULT auth.uid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clients_business_idx ON public.clients(business_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read clients"  ON public.clients FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "writers add clients"   ON public.clients FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers edit clients"  ON public.clients FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "admins drop clients"   ON public.clients FOR DELETE TO authenticated USING (public.has_business_role(business_id, ARRAY['OWNER','ADMIN']::public.member_role[]));

-- ---------- fx rates (manual, per business) ----------
CREATE TABLE public.fx_rates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  currency     text NOT NULL,
  rate_to_base numeric(18,6) NOT NULL,
  as_of_date   date NOT NULL DEFAULT CURRENT_DATE,
  source       text NOT NULL DEFAULT 'MANUAL',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, currency, as_of_date)
);
CREATE INDEX fx_rates_lookup_idx ON public.fx_rates(business_id, currency, as_of_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fx_rates TO authenticated;
GRANT ALL ON public.fx_rates TO service_role;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read fx" ON public.fx_rates FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "writers set fx"  ON public.fx_rates FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers edit fx" ON public.fx_rates FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers drop fx" ON public.fx_rates FOR DELETE TO authenticated USING (public.can_write_business(business_id));

-- ---------- document number sequences ----------
CREATE TABLE public.document_sequences (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  prefix      text NOT NULL,
  year        integer NOT NULL,
  last_value  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, prefix, year)
);
GRANT SELECT ON public.document_sequences TO authenticated;
GRANT ALL ON public.document_sequences TO service_role;
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read sequences" ON public.document_sequences FOR SELECT TO authenticated USING (public.has_business_access(business_id));

-- ---------- documents (invoice / pro-forma / quote / credit note / debit note) ----------
CREATE TABLE public.documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id          uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id            uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  type                 public.doc_type NOT NULL,
  status               public.doc_lifecycle NOT NULL DEFAULT 'DRAFT',
  doc_number           text,
  version              integer NOT NULL DEFAULT 1,
  -- client snapshot, frozen at finalisation
  client_name          text NOT NULL,
  client_email         text,
  client_kra_pin       text,
  client_address       text,
  -- money
  currency             text NOT NULL DEFAULT 'KES',
  exchange_rate        numeric(18,6) NOT NULL DEFAULT 1,
  subtotal             numeric(18,2) NOT NULL DEFAULT 0,
  discount_total       numeric(18,2) NOT NULL DEFAULT 0,
  taxable_total        numeric(18,2) NOT NULL DEFAULT 0,
  tax_total            numeric(18,2) NOT NULL DEFAULT 0,
  wht_applicable       boolean NOT NULL DEFAULT false,
  wht_rate             numeric(6,4) NOT NULL DEFAULT 0,
  wht_amount           numeric(18,2) NOT NULL DEFAULT 0,
  total_amount         numeric(18,2) NOT NULL DEFAULT 0,
  tax_breakdown        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- dates
  issue_date           date NOT NULL DEFAULT CURRENT_DATE,
  due_date             date,
  valid_until          date,
  payment_terms_days   integer NOT NULL DEFAULT 30,
  -- links
  parent_document_id   uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  converted_to_id      uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  -- presentation & text
  template_id          text NOT NULL DEFAULT 'executive-atelier',
  notes                text,
  legal_terms          text,
  reason               text,
  -- compliance boundary (never claims live fiscalisation)
  kra_status           text NOT NULL DEFAULT 'NOT_CONFIGURED',
  kra_control_code     text,
  kra_transmitted_at   timestamptz,
  -- lifecycle stamps
  finalized_at         timestamptz,
  first_viewed_at      timestamptz,
  sent_at              timestamptz,
  voided_at            timestamptz,
  created_by           uuid DEFAULT auth.uid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_number_unique UNIQUE (business_id, doc_number),
  CONSTRAINT documents_totals_nonneg CHECK (total_amount >= 0 AND tax_total >= 0 AND subtotal >= 0),
  CONSTRAINT documents_finalized_has_number CHECK (status = 'DRAFT' OR doc_number IS NOT NULL)
);
CREATE INDEX documents_business_type_idx ON public.documents(business_id, type, status);
CREATE INDEX documents_client_idx ON public.documents(client_id);
CREATE INDEX documents_parent_idx ON public.documents(parent_document_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read documents" ON public.documents FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "writers add documents"  ON public.documents FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers edit documents" ON public.documents FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers drop drafts"    ON public.documents FOR DELETE TO authenticated USING (public.can_write_business(business_id) AND status = 'DRAFT');

-- ---------- document line items ----------
CREATE TABLE public.document_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  position        integer NOT NULL DEFAULT 0,
  description     text NOT NULL,
  unit            text,
  quantity        numeric(18,4) NOT NULL DEFAULT 1,
  unit_price      numeric(18,4) NOT NULL DEFAULT 0,
  discount_pct    numeric(6,3) NOT NULL DEFAULT 0,
  tax_category    public.tax_category NOT NULL DEFAULT 'VAT_16',
  tax_rate        numeric(6,4) NOT NULL DEFAULT 0.16,
  gross_amount    numeric(18,2) NOT NULL DEFAULT 0,
  discount_amount numeric(18,2) NOT NULL DEFAULT 0,
  taxable_amount  numeric(18,2) NOT NULL DEFAULT 0,
  tax_amount      numeric(18,2) NOT NULL DEFAULT 0,
  net_amount      numeric(18,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_items_doc_idx ON public.document_items(document_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_items TO authenticated;
GRANT ALL ON public.document_items TO service_role;
ALTER TABLE public.document_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read items" ON public.document_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.has_business_access(d.business_id)));
CREATE POLICY "writers add items" ON public.document_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.can_write_business(d.business_id)));
CREATE POLICY "writers edit items" ON public.document_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.can_write_business(d.business_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.can_write_business(d.business_id)));
CREATE POLICY "writers drop items" ON public.document_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.can_write_business(d.business_id)));

-- ---------- immutable version snapshots ----------
CREATE TABLE public.document_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  version     integer NOT NULL,
  snapshot    jsonb NOT NULL,
  reason      text,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);
CREATE INDEX document_versions_doc_idx ON public.document_versions(document_id, version DESC);
GRANT SELECT, INSERT ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read versions" ON public.document_versions FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "writers add versions"  ON public.document_versions FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));

-- ---------- payments ----------
CREATE TABLE public.payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id          uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  reference          text,
  channel            public.payment_channel NOT NULL,
  channel_txn_id     text,
  amount             numeric(18,2) NOT NULL,
  currency           text NOT NULL DEFAULT 'KES',
  exchange_rate      numeric(18,6) NOT NULL DEFAULT 1,
  payment_date       timestamptz NOT NULL DEFAULT now(),
  status             public.payment_state NOT NULL DEFAULT 'COMPLETED',
  payer_name         text,
  payer_phone        text,
  notes              text,
  reversed_at        timestamptz,
  reversal_reason    text,
  created_by         uuid DEFAULT auth.uid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_positive CHECK (amount > 0),
  CONSTRAINT payments_reference_unique UNIQUE (business_id, reference)
);
CREATE INDEX payments_business_idx ON public.payments(business_id, payment_date DESC);
CREATE INDEX payments_client_idx ON public.payments(client_id);
CREATE UNIQUE INDEX payments_channel_txn_unique
  ON public.payments(business_id, channel, channel_txn_id)
  WHERE channel_txn_id IS NOT NULL AND channel_txn_id <> '';
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read payments" ON public.payments FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "writers add payments"  ON public.payments FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers edit payments" ON public.payments FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));

-- ---------- allocations: payments and credit notes applied to invoices ----------
CREATE TABLE public.allocations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_id     uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  payment_id     uuid REFERENCES public.payments(id) ON DELETE CASCADE,
  credit_note_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  amount         numeric(18,2) NOT NULL,
  reversed_at    timestamptz,
  created_by     uuid DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT allocations_amount_positive CHECK (amount > 0),
  CONSTRAINT allocations_single_source CHECK (
    (payment_id IS NOT NULL AND credit_note_id IS NULL)
    OR (payment_id IS NULL AND credit_note_id IS NOT NULL)
  )
);
CREATE INDEX allocations_invoice_idx ON public.allocations(invoice_id);
CREATE INDEX allocations_payment_idx ON public.allocations(payment_id);
CREATE INDEX allocations_credit_idx ON public.allocations(credit_note_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocations TO authenticated;
GRANT ALL ON public.allocations TO service_role;
ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read allocations" ON public.allocations FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "writers add allocations"  ON public.allocations FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers edit allocations" ON public.allocations FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));

-- ---------- receipts (always derived from a payment) ----------
CREATE TABLE public.receipts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  payment_id     uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE CASCADE,
  client_id      uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  receipt_number text NOT NULL,
  template_id    text NOT NULL DEFAULT 'executive-atelier',
  received_by    text,
  notes          text,
  voided_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receipts_number_unique UNIQUE (business_id, receipt_number)
);
CREATE INDEX receipts_business_idx ON public.receipts(business_id, created_at DESC);
GRANT SELECT, UPDATE ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read receipts" ON public.receipts FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "writers edit receipts" ON public.receipts FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));

-- ---------- share links (client portal) ----------
CREATE TABLE public.share_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  document_id  uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  receipt_id   uuid REFERENCES public.receipts(id) ON DELETE CASCADE,
  token        text NOT NULL UNIQUE,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  view_count   integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  created_by   uuid DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT share_links_single_target CHECK (
    (document_id IS NOT NULL AND receipt_id IS NULL)
    OR (document_id IS NULL AND receipt_id IS NOT NULL)
  )
);
CREATE INDEX share_links_doc_idx ON public.share_links(document_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.share_links TO authenticated;
GRANT ALL ON public.share_links TO service_role;
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read shares" ON public.share_links FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "writers add shares"  ON public.share_links FOR INSERT TO authenticated WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers edit shares" ON public.share_links FOR UPDATE TO authenticated USING (public.can_write_business(business_id)) WITH CHECK (public.can_write_business(business_id));
CREATE POLICY "writers drop shares" ON public.share_links FOR DELETE TO authenticated USING (public.can_write_business(business_id));

-- ---------- audit log (append only) ----------
CREATE TABLE public.audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  actor_id    uuid DEFAULT auth.uid(),
  actor_name  text,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_business_idx ON public.audit_logs(business_id, created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "members write audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.has_business_access(business_id) AND actor_id = auth.uid());
-- deliberately no UPDATE/DELETE policy: the trail is append-only
-- Phase 7 — safe, additive business configuration.
-- Brand assets are stored in PostgreSQL; executable SVG/HTML is not allowed.
CREATE TABLE public.business_branding (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  accent_color text NOT NULL DEFAULT '#2563EB' CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  header_tagline text CHECK (char_length(header_tagline)<=100),
  footer_note text CHECK (char_length(footer_note)<=500),
  logo_mime text CHECK (logo_mime IS NULL OR logo_mime IN ('image/png','image/jpeg','image/webp')),
  logo_bytes bytea CHECK (logo_bytes IS NULL OR octet_length(logo_bytes)<=262144),
  logo_sha256 text CHECK (logo_sha256 IS NULL OR logo_sha256 ~ '^[a-f0-9]{64}$'),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branding_logo_consistent CHECK (
    (logo_mime IS NULL AND logo_bytes IS NULL AND logo_sha256 IS NULL)
    OR (logo_mime IS NOT NULL AND logo_bytes IS NOT NULL AND logo_sha256 IS NOT NULL)
  )
);
ALTER TABLE public.business_branding ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.business_branding TO authenticated;
CREATE POLICY "members read business branding" ON public.business_branding
  FOR SELECT TO authenticated USING (public.has_business_access(business_id));

CREATE TABLE public.business_template_rules (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  doc_type public.doc_type NOT NULL,
  template_id text NOT NULL CHECK (template_id IN (
    'executive-atelier','modern-minimal','midnight-ledger','linear-mono',
    'editorial-classic','nordic-studio','swiss-grid','compact-ledger'
  )),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,doc_type)
);
ALTER TABLE public.business_template_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.business_template_rules TO authenticated;
CREATE POLICY "members read type-specific templates" ON public.business_template_rules
  FOR SELECT TO authenticated USING (public.has_business_access(business_id));

CREATE TABLE public.business_integrations (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT false,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  mpesa_enabled boolean NOT NULL DEFAULT false,
  etims_sandbox_enabled boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.business_integrations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.business_integrations TO authenticated;
CREATE POLICY "members read integration preferences" ON public.business_integrations
  FOR SELECT TO authenticated USING (public.has_business_access(business_id));
-- Strict disabled-by-default. Provider credentials remain only in server env,
-- and activation still requires independent environment approval.
INSERT INTO public.business_integrations(business_id)
  SELECT id FROM public.businesses ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.initialize_business_integrations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.business_integrations(business_id) VALUES (NEW.id)
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER initialize_business_integrations_after_insert
  AFTER INSERT ON public.businesses FOR EACH ROW
  EXECUTE FUNCTION public.initialize_business_integrations();

CREATE TABLE public.business_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (length(email) BETWEEN 5 AND 250),
  role public.member_role NOT NULL CHECK (role <> 'OWNER'),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','ACCEPTED','REVOKED')),
  expires_at timestamptz NOT NULL,
  invited_by uuid NOT NULL,
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invited_accepted_state CHECK (
    status <> 'ACCEPTED' OR (accepted_by IS NOT NULL AND accepted_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX business_pending_invites_idx
  ON public.business_invitations(business_id,email) WHERE status='PENDING';
CREATE INDEX business_invitations_recent_idx
  ON public.business_invitations(business_id,created_at DESC);
ALTER TABLE public.business_invitations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.business_invitations TO authenticated;
CREATE POLICY "members read invite metadata" ON public.business_invitations
  FOR SELECT TO authenticated USING (
    public.has_business_role(business_id,
      ARRAY['OWNER','ADMIN']::public.member_role[])
  );
-- No direct web-client write grants to branding, integration controls, roster,
-- template rules or invitation tables. Backend validates business roles.

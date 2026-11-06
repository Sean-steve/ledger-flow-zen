-- Phase 6 — additive local-first reminder automation and financial notifications.
-- No autonomous outbound delivery without explicit opt-in and server-side gates.
CREATE TABLE public.automation_policies (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  channel text NOT NULL DEFAULT 'EMAIL' CHECK (channel IN ('EMAIL','WHATSAPP')),
  due_soon_days smallint NOT NULL DEFAULT 3 CHECK (due_soon_days BETWEEN 0 AND 14),
  on_due boolean NOT NULL DEFAULT true,
  overdue_every_days smallint NOT NULL DEFAULT 7 CHECK (overdue_every_days BETWEEN 0 AND 30),
  auto_send_enabled boolean NOT NULL DEFAULT false,
  max_per_run smallint NOT NULL DEFAULT 30 CHECK (max_per_run BETWEEN 1 AND 100),
  last_scanned_at timestamptz,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.automation_policies TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.automation_policies TO service_role;
ALTER TABLE public.automation_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "automation policy member read" ON public.automation_policies
  FOR SELECT TO authenticated USING (public.has_business_access(business_id));

CREATE TABLE public.automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  source_key text NOT NULL CHECK (length(source_key) BETWEEN 8 AND 240),
  kind text NOT NULL CHECK (kind IN ('DUE_SOON','DUE_TODAY','OVERDUE')),
  channel text NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP')),
  status text NOT NULL DEFAULT 'READY'
    CHECK (status IN ('READY','HELD','PREVIEWED','ACCEPTED','FAILED','UNKNOWN','SKIPPED')),
  scheduled_on date NOT NULL,
  balance_snapshot numeric(18,2) NOT NULL CHECK (balance_snapshot >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  request_key uuid NOT NULL DEFAULT gen_random_uuid(),
  outbox_id uuid REFERENCES public.communication_outbox(id) ON DELETE SET NULL,
  hold_code text,
  processed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,source_key),
  UNIQUE (business_id,request_key)
);
CREATE INDEX automation_jobs_pending_idx ON public.automation_jobs
  (business_id,status,created_at DESC);
GRANT SELECT ON public.automation_jobs TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.automation_jobs TO service_role;
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "automation jobs member read" ON public.automation_jobs
  FOR SELECT TO authenticated USING (public.has_business_access(business_id));

CREATE TABLE public.financial_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  source_key text NOT NULL CHECK (length(source_key) BETWEEN 8 AND 240),
  kind text NOT NULL CHECK (kind IN
    ('REMINDER_READY','PAYMENT_RECORD_CREATED','MPESA_REVIEW_REQUIRED')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 400),
  record_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE(business_id,source_key)
);
CREATE INDEX financial_notifications_recent_idx ON public.financial_notifications
  (business_id,read_at,created_at DESC);
GRANT SELECT ON public.financial_notifications TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.financial_notifications TO service_role;
ALTER TABLE public.financial_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financial notifications member read" ON public.financial_notifications
  FOR SELECT TO authenticated USING (public.has_business_access(business_id));
-- Writes only via the local authenticated API and the operator-owned scheduler.

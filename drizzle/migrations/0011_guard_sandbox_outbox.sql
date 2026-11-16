-- Phase 9: independent Nflake Guard SANDBOX connector.
-- Adds a small, private, durable outbox. Does not modify invoices or payments.
-- Operator-owned tables are deliberately invisible to authenticated/anon DB roles.
BEGIN;
CREATE TABLE IF NOT EXISTS fdos_local.guard_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL UNIQUE REFERENCES public.documents(id) ON DELETE RESTRICT,
  guard_project_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  last_snapshot_hash text,
  last_sequence bigint NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guard_links_business_idx ON fdos_local.guard_links(business_id);

CREATE TABLE IF NOT EXISTS fdos_local.guard_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES fdos_local.guard_links(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  sequence bigint NOT NULL CHECK (sequence > 0),
  payload text NOT NULL CHECK (length(payload) BETWEEN 5 AND 32768),
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','RETRY','DELIVERED','HELD')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_http_status integer,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (link_id,sequence)
);
CREATE INDEX IF NOT EXISTS guard_outbox_delivery_idx
  ON fdos_local.guard_outbox(status,next_attempt_at,created_at);

REVOKE ALL ON fdos_local.guard_links, fdos_local.guard_outbox FROM PUBLIC, anon, authenticated;
COMMIT;

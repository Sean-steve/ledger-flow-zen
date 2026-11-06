-- Phase 5: segregated M-Pesa payment requests and verified posting evidence.
-- Local PostgreSQL 16 only. Never alter the historical payment ledger directly.
-- All provider write operations happen in the trusted API, not browser CRUD.
CREATE TABLE public.mpesa_profiles (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  shortcode text NOT NULL UNIQUE,
  shortcode_type text NOT NULL DEFAULT 'PAYBILL'
    CHECK (shortcode_type IN ('PAYBILL','TILL')),
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mpesa_profile_shortcode_fmt CHECK (shortcode ~ '^[0-9]{5,9}$')
);
ALTER TABLE public.mpesa_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mpesa_profiles TO authenticated;
CREATE POLICY mpesa_profile_read ON public.mpesa_profiles
  FOR SELECT TO authenticated USING (public.has_business_access(business_id));

CREATE TABLE public.mpesa_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,
  request_key uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('PREVIEW','SANDBOX')),
  status text NOT NULL CHECK (status IN (
    'PREVIEW','PENDING','CONFIRMED','FAILED','UNKNOWN','REVIEW_REQUIRED'
  )),
  shortcode text NOT NULL CHECK (shortcode ~ '^[0-9]{5,9}$'),
  phone text NOT NULL CHECK (phone ~ '^254[0-9]{9}$'),
  currency text NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
  amount numeric(18,2) NOT NULL CHECK (amount > 0 AND amount = trunc(amount)),
  merchant_request_id text,
  checkout_request_id text UNIQUE,
  payment_id uuid UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  receipt_id uuid UNIQUE REFERENCES public.receipts(id) ON DELETE RESTRICT,
  provider_receipt text,
  provider_result_code text,
  provider_error_code text,
  requested_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  UNIQUE (business_id,request_key),
  UNIQUE (shortcode,provider_receipt),
  CONSTRAINT mpesa_preview_never_has_external_id CHECK (
    mode <> 'PREVIEW' OR
    (checkout_request_id IS NULL AND merchant_request_id IS NULL)),
  CONSTRAINT mpesa_confirmed_payment_exists CHECK (
    status <> 'CONFIRMED' OR (payment_id IS NOT NULL AND receipt_id IS NOT NULL
      AND provider_receipt IS NOT NULL AND confirmed_at IS NOT NULL)),
  CONSTRAINT mpesa_unconfirmed_payment_missing CHECK (
    status = 'CONFIRMED' OR (payment_id IS NULL AND receipt_id IS NULL))
);
CREATE INDEX mpesa_intents_business_created_idx
  ON public.mpesa_intents(business_id,created_at DESC);
CREATE INDEX mpesa_intents_invoice_idx ON public.mpesa_intents(invoice_id);
ALTER TABLE public.mpesa_intents ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mpesa_intents TO authenticated;
CREATE POLICY mpesa_intents_read ON public.mpesa_intents
  FOR SELECT TO authenticated USING (public.has_business_access(business_id));

-- Provider event summaries never include raw customer payloads or OAuth keys.
CREATE TABLE public.mpesa_provider_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  intent_id uuid REFERENCES public.mpesa_intents(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('STK','C2B','LOCAL_TEST')),
  event_type text NOT NULL CHECK (event_type IN (
    'REQUESTED','ACCEPTED','DECLINED','UNKNOWN','RECEIVED',
    'VERIFIED','REVIEW_REQUIRED','DUPLICATE'
  )),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  provider_receipt text,
  result_code text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mpesa_provider_events_intent_idx
  ON public.mpesa_provider_events(intent_id,created_at DESC);
ALTER TABLE public.mpesa_provider_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mpesa_provider_events TO authenticated;
CREATE POLICY mpesa_events_read ON public.mpesa_provider_events
  FOR SELECT TO authenticated USING (public.has_business_access(business_id));

-- C2B callbacks are UNVERIFIED evidence until independently reconciled against
-- the merchant's M-Pesa statement or an authenticated provider status check.
-- The application must never create a payment or receipt from this inbox alone.
CREATE TABLE public.mpesa_c2b_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  shortcode text NOT NULL CHECK (shortcode ~ '^[0-9]{5,9}$'),
  provider_receipt text NOT NULL CHECK (length(provider_receipt) BETWEEN 6 AND 32),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  bill_reference text,
  phone_masked text,
  status text NOT NULL DEFAULT 'REVIEW_REQUIRED'
    CHECK (status IN ('REVIEW_REQUIRED','RECONCILED_MANUALLY','DISMISSED')),
  review_reason text NOT NULL DEFAULT 'UNVERIFIED_PROVIDER_CALLBACK',
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shortcode,provider_receipt)
);
CREATE INDEX mpesa_c2b_inbox_business_recent_idx
  ON public.mpesa_c2b_inbox(business_id,created_at DESC);
ALTER TABLE public.mpesa_c2b_inbox ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.mpesa_c2b_inbox TO authenticated;
CREATE POLICY mpesa_c2b_read ON public.mpesa_c2b_inbox
  FOR SELECT TO authenticated USING (public.has_business_access(business_id));

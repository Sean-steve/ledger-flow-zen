-- FDOS Phase 3 — local-first communications.
-- Additive only. Existing financial tables and records are never rewritten.
CREATE UNIQUE INDEX IF NOT EXISTS clients_business_id_id_for_communications
  ON public.clients(business_id,id);

CREATE TABLE public.client_communication_preferences (
  business_id uuid NOT NULL,
  client_id uuid NOT NULL,
  whatsapp_opted_in_at timestamptz,
  whatsapp_opt_in_source text,
  whatsapp_opted_out_at timestamptz,
  email_opted_out_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,client_id),
  FOREIGN KEY (business_id,client_id) REFERENCES public.clients(business_id,id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_consent_evidence CHECK (
    (whatsapp_opted_in_at IS NULL AND whatsapp_opt_in_source IS NULL)
    OR (whatsapp_opted_in_at IS NOT NULL AND whatsapp_opt_in_source IN
        ('DIRECT_REQUEST','WEB_FORM','WRITTEN','OTHER'))
  )
);
ALTER TABLE public.client_communication_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.client_communication_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_communication_preferences TO service_role;
CREATE POLICY "communication preferences member read"
  ON public.client_communication_preferences FOR SELECT TO authenticated
  USING (public.has_business_access(business_id));
CREATE POLICY "communication preferences writer insert"
  ON public.client_communication_preferences FOR INSERT TO authenticated
  WITH CHECK (public.can_write_business(business_id) AND updated_by = auth.uid());
CREATE POLICY "communication preferences writer update"
  ON public.client_communication_preferences FOR UPDATE TO authenticated
  USING (public.can_write_business(business_id))
  WITH CHECK (public.can_write_business(business_id) AND updated_by = auth.uid());

CREATE TABLE public.communication_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE RESTRICT,
  receipt_id uuid REFERENCES public.receipts(id) ON DELETE RESTRICT,
  share_link_id uuid REFERENCES public.share_links(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP')),
  recipient text NOT NULL,
  subject text NOT NULL,
  preview_text text NOT NULL,
  status text NOT NULL CHECK (status IN ('PREVIEW','QUEUED','ACCEPTED','FAILED','UNKNOWN')),
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('preview','live')),
  request_key uuid NOT NULL,
  provider_id text,
  provider_error_code text,
  requested_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id,request_key),
  FOREIGN KEY (business_id,client_id) REFERENCES public.clients(business_id,id),
  CONSTRAINT communication_outbox_single_target CHECK (
    (document_id IS NOT NULL AND receipt_id IS NULL) OR
    (document_id IS NULL AND receipt_id IS NOT NULL)
  ),
  CONSTRAINT communication_preview_never_accepted CHECK (
    delivery_mode <> 'preview' OR (status = 'PREVIEW' AND provider_id IS NULL AND accepted_at IS NULL)
  )
);
CREATE INDEX communication_outbox_business_recent_idx
  ON public.communication_outbox(business_id,created_at DESC);
ALTER TABLE public.communication_outbox ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.communication_outbox TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.communication_outbox TO service_role;
CREATE POLICY "outbox member read"
  ON public.communication_outbox FOR SELECT TO authenticated
  USING (public.has_business_access(business_id));
-- All writes to the outbox are done by the trusted local API after it verifies
-- business role, recipient, lifecycle state, and consent. No direct app SQL writes.

-- Earlier financial hardening revokes direct audit INSERTs. This narrow,
-- authenticated function preserves the immutable trail without broad grants.
CREATE OR REPLACE FUNCTION public.record_comm_pref_audit(
  _business_id uuid,_client_id uuid,_channel text,_allowed boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_write_business(_business_id) THEN
    RAISE EXCEPTION 'Not permitted to record a communication preference';
  END IF;
  INSERT INTO public.audit_logs
    (business_id,actor_id,action,entity_type,entity_id,details)
  VALUES(_business_id,auth.uid(),'COMMUNICATION_PREFERENCE_UPDATED','CLIENT',
    _client_id,jsonb_build_object('channel',_channel,'allowed',_allowed));
END;
$$;
REVOKE ALL ON FUNCTION public.record_comm_pref_audit(uuid,uuid,text,boolean)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_comm_pref_audit(uuid,uuid,text,boolean)
  TO authenticated;

-- Standalone FDOS local auth/session store; NOT GoTrue or Supabase Cloud.
-- Run with trusted local DB operator during one-time bootstrap.
CREATE SCHEMA IF NOT EXISTS fdos_local;
REVOKE ALL ON SCHEMA fdos_local FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS fdos_local.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_lowercase CHECK(email = lower(trim(email)))
);
CREATE TABLE IF NOT EXISTS fdos_local.sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES fdos_local.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS fdos_sessions_expiry_idx ON fdos_local.sessions(expires_at);
REVOKE ALL ON ALL TABLES IN SCHEMA fdos_local FROM PUBLIC,anon,authenticated;

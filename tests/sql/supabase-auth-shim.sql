-- Ephemeral PostgreSQL 16 CI bootstrap: Supabase role/auth shim only.
-- Never apply this file to a real hosted database.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

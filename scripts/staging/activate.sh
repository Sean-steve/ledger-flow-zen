#!/usr/bin/env bash
# Operator-controlled, one-time activation; never called automatically on push.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."

: "${FDOS_STAGING_DATABASE_URL:?Provide the staging-only PostgreSQL connection URL}"
: "${FDOS_STAGING_ID:?Provide a unique fdos-staging-... environment identifier}"
: "${FDOS_STAGING_PROJECT_REF:?Provide the staging project reference}"
: "${FDOS_STAGING_MODE:?Set FDOS_STAGING_MODE=bootstrap or upgrade}"
: "${FDOS_STAGING_APPROVAL:?Set FDOS_STAGING_APPROVAL=ACTIVATE_STAGING after reviewing preflight}"
: "${FDOS_STAGING_BACKUP_VERIFIED:?Set FDOS_STAGING_BACKUP_VERIFIED=YES only after verifying a restore point}"

if [[ "${FDOS_STAGING_MODE}" != "bootstrap" && "${FDOS_STAGING_MODE}" != "upgrade" ]]; then
  echo "Mode must be bootstrap or upgrade" >&2; exit 1
fi
if [[ "${FDOS_STAGING_APPROVAL}" != "ACTIVATE_STAGING" ||
      "${FDOS_STAGING_BACKUP_VERIFIED}" != "YES" ]]; then
  echo "Staging approval and verified backup are both required" >&2; exit 1
fi
command -v psql >/dev/null || { echo "psql required" >&2; exit 1; }
node scripts/staging/verify-target.mjs
set +x # No credentials or payment records should ever be echoed.
echo "Activating the isolated financial staging database in ${FDOS_STAGING_MODE} mode."

# All DDL, transaction locks, binding and reconciliation run in ONE transaction.
# psql ON_ERROR_STOP makes a failure close the session and roll back changes.
{
  cat <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('fdos-staging-activation', 0));
SQL
  if [[ "${FDOS_STAGING_MODE}" == "bootstrap" ]]; then
    cat <<'SQL'
DO $verify$
BEGIN
  IF to_regclass('public.businesses') IS NOT NULL OR
     to_regclass('public.documents') IS NOT NULL OR
     to_regclass('public.payments') IS NOT NULL THEN
    RAISE EXCEPTION 'Bootstrap requires a new empty FDOS schema; no existing finance tables';
  END IF;
  IF to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'Supabase auth.uid() is missing; do not bootstrap bare PostgreSQL as an app backend';
  END IF;
END;
$verify$;
\i drizzle/migrations/0000_core_financial_schema.sql
\i drizzle/migrations/0001_financial_derivation_layer.sql
SQL
  else
    cat <<'SQL'
DO $verify$
DECLARE applied boolean := false;
BEGIN
  IF to_regclass('public.documents') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'Upgrade requires an existing Supabase FDOS 0000/0001 baseline';
  END IF;
  IF to_regclass('fdos_internal.applied_phases') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM fdos_internal.applied_phases WHERE phase = ''phase2_0002_0005'')' INTO applied;
  END IF;
  IF applied THEN RAISE EXCEPTION 'Phase 2 migrations are already marked applied'; END IF;
END;
$verify$;
\i tests/sql/phase2_preflight.sql
SQL
  fi
  cat <<'SQL'
\i drizzle/migrations/0002_document_atomicity_and_permissions.sql
\i drizzle/migrations/0003_payment_integrity_and_public_share.sql
\i drizzle/migrations/0004_tenant_and_history_guards.sql
\i drizzle/migrations/0005_currency_and_document_transitions.sql
CREATE SCHEMA IF NOT EXISTS fdos_internal;
REVOKE ALL ON SCHEMA fdos_internal FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS fdos_internal.applied_phases (
  phase text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO fdos_internal.applied_phases(phase) VALUES ('phase2_0002_0005');
CREATE TABLE IF NOT EXISTS fdos_internal.environment_binding (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  stage_id text NOT NULL,
  project_ref text NOT NULL,
  source_commit text,
  environment_type text NOT NULL CHECK (environment_type = 'STAGING'),
  activated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO fdos_internal.environment_binding (
  singleton, stage_id, project_ref, source_commit, environment_type
) VALUES(true, :'stage_id', :'project_ref', :'git_sha', 'STAGING')
ON CONFLICT (singleton) DO NOTHING;
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM fdos_internal.environment_binding
  WHERE stage_id=:'stage_id' AND project_ref=:'project_ref'
    AND environment_type='STAGING'
) THEN 1 ELSE (1/0) END AS correct_staging_target;
\i scripts/staging/reconcile.sql
COMMIT;
SQL
} | psql "$FDOS_STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -v stage_id="$FDOS_STAGING_ID" -v project_ref="$FDOS_STAGING_PROJECT_REF" \
  -v git_sha="${GITHUB_SHA:-local-operator}"
echo "Staging migration transaction and initial financial reconciliation completed."

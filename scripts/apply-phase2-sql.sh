#!/usr/bin/env bash
# Apply ONLY migrations 0002-0005 to a database with verified 0000+0001 baseline.
# Require an explicit staging/production database URL and operator approval.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the intended database; never use a frontend key}"
if [[ "${CONFIRM_FINANCIAL_MIGRATION:-}" != "YES" ]]; then
  echo "Refusing migration: set CONFIRM_FINANCIAL_MIGRATION=YES after backup and preflight review" >&2
  exit 1
fi
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'PSQL'
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('fdos_phase2_0002_0005'));
\i tests/sql/phase2_preflight.sql
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
COMMIT;
PSQL
echo "Phase 2 migrations committed. Run read-only reconciliation and backup verification."

#!/usr/bin/env bash
# Phase 7: one-time additive local PostgreSQL migration.
set -euo pipefail
cd "$(dirname "$0")/../.."
sql() { docker compose -f compose.postgres.local.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U fdos_dev -d fdos_local "$@"; }
existing="$(printf "SELECT to_regclass('public.business_branding') IS NOT NULL;\n" | sql -At)"
if [[ "$existing" == "t" ]]; then
  echo "Phase 7 configuration tables already present; data preserved."
  exit 0
fi
phase6="$(printf "SELECT to_regclass('public.automation_jobs') IS NOT NULL;\n" | sql -At)"
if [[ "$phase6" != "t" ]]; then echo "Phase 6 migration required" >&2; exit 1; fi
{ echo 'BEGIN;'; cat drizzle/migrations/0010_business_configuration.sql; echo 'COMMIT;'; } | sql >/dev/null
echo "Phase 7 business configuration ready without resetting financial records."

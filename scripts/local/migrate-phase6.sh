#!/usr/bin/env bash
# Additive Phase 6 schema migration, safe for existing local PostgreSQL volumes.
set -euo pipefail
cd "$(dirname "$0")/../.."
sql() { docker compose -f compose.postgres.local.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U fdos_dev -d fdos_local "$@"; }
exists="$(printf "SELECT to_regclass('public.automation_jobs') IS NOT NULL;\n" | sql -At)"
if [[ "$exists" == "t" ]]; then
  echo "Phase 6 automation schema present; existing records preserved."
  exit 0
fi
previous="$(printf "SELECT to_regclass('public.mpesa_intents') IS NOT NULL;\n" | sql -At)"
if [[ "$previous" != "t" ]]; then
 echo "Phase 5 must be installed before Phase 6" >&2
 exit 1
fi
{ echo 'BEGIN;'; cat drizzle/migrations/0009_automation_notifications.sql; echo 'COMMIT;'; } | sql >/dev/null
echo "Phase 6 automation schema ready; financial and payment records preserved."

#!/usr/bin/env bash
# Safe, one-time additive Phase 5 migration for an existing local database.
set -euo pipefail
cd "$(dirname "$0")/../.."
sql() { docker compose -f compose.postgres.local.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U fdos_dev -d fdos_local "$@"; }
has_schema="$(printf "SELECT to_regclass('public.fiscal_submissions') IS NOT NULL;\n" | sql -At)"
if [[ "$has_schema" != "t" ]]; then echo "Run Phases 0–4 first" >&2; exit 1; fi
has_phase5="$(printf "SELECT to_regclass('public.mpesa_intents') IS NOT NULL;\n" | sql -At)"
if [[ "$has_phase5" == "t" ]]; then echo "Phase 5 schema already present; no reset."; exit 0; fi
{ echo 'BEGIN;'; cat drizzle/migrations/0008_mpesa_payment_reconciliation.sql; echo 'COMMIT;'; } | sql >/dev/null
echo "Phase 5 M-Pesa schema ready. Historical financial data was not changed."

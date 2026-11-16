#!/usr/bin/env bash
# Additive connector migration; preserves all financial records.
set -euo pipefail
cd "$(dirname "$0")/../.."
sql() { docker compose -f compose.postgres.local.yml exec -T postgres psql -X -v ON_ERROR_STOP=1 -U fdos_dev -d fdos_local "$@"; }
present="$(printf "SELECT to_regclass('fdos_local.guard_links') IS NOT NULL;\n" | sql -At)"
if [[ "$present" == "t" ]]; then
  echo "Guard connector outbox already installed; data preserved."
  exit 0
fi
needed="$(printf "SELECT to_regclass('public.invoice_ledger') IS NOT NULL AND to_regclass('fdos_local.users') IS NOT NULL;\n" | sql -At)"
if [[ "$needed" != "t" ]]; then echo "Local FDOS financial database must be bootstrapped first" >&2; exit 1; fi
sql -f /dev/stdin < drizzle/migrations/0011_guard_sandbox_outbox.sql >/dev/null
echo "Guard connector installed (isolated sandbox outbox)."

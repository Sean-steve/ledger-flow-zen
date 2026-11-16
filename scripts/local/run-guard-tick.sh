#!/usr/bin/env bash
# Optional single sandbox reconciliation pass; cron/systemd install is opt-in.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ ! -f .env.local ]]; then
  echo "Missing .env.local" >&2
  exit 1
fi
set -a
# shellcheck source=/dev/null
source .env.local
set +a
exec node --env-file=.env.local server/local/guard-worker.mjs

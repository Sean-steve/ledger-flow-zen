#!/usr/bin/env bash
# Run every 15–60 minutes from a systemd timer or crontab. Never expose API.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ ! -f .env.local ]]; then
 echo "Missing .env.local" >&2; exit 1
fi
set -a
# shellcheck source=/dev/null
source .env.local
set +a
node --env-file=.env.local server/local/automation-worker.mjs

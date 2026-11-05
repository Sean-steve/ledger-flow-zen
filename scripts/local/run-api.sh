#!/usr/bin/env bash
# Loads local secrets into the current shell for Docker Compose and the Node API.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ ! -f .env.local ]]; then
  echo "Copy .env.local.example to .env.local and configure a unique password" >&2
  exit 1
fi
set -a
# shellcheck source=/dev/null
source .env.local
set +a
bash scripts/local/bootstrap.sh
echo "Starting local financial API at http://127.0.0.1:${FDOS_API_PORT:-5012}"
exec node --env-file=.env.local server/local/api.mjs

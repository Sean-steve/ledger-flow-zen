#!/usr/bin/env bash
# Invoked only from approved manual GitHub staging workflow over pinned SSH host keys.
set -euo pipefail
cd /opt/fdos/ledger-flow-zen
expected="${1:-}"
ref="${2:-}"
[[ "$expected" =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ "$ref" == "main" || "$ref" == "phase8.1/staging-release-evidence" ]] ||
  { echo "Invalid deployment ref" >&2; exit 1; }
git fetch --no-tags origin "refs/heads/$ref"
[[ "$(git rev-parse FETCH_HEAD)" == "$expected" ]] ||
  { echo "Ref moved or revision does not match approval" >&2; exit 1; }
git checkout --detach "$expected"
bash scripts/staging/deploy.sh "$expected"

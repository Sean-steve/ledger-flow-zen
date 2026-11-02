#!/usr/bin/env bash
# Read-only verification of a previously activated staging database.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
: "${FDOS_STAGING_DATABASE_URL:?Dedicated staging DATABASE URL required}"
: "${FDOS_STAGING_ID:?Dedicated stage ID required}"
: "${FDOS_STAGING_PROJECT_REF:?Dedicated staging ref required}"
node scripts/staging/verify-target.mjs
psql "$FDOS_STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -v stage_id="$FDOS_STAGING_ID" -v project_ref="$FDOS_STAGING_PROJECT_REF" <<'SQL'
BEGIN READ ONLY;
SELECT CASE WHEN EXISTS(
 SELECT 1 FROM fdos_internal.environment_binding
 WHERE stage_id=:'stage_id' AND project_ref=:'project_ref' AND environment_type='STAGING'
) THEN 'STAGING_BINDING_OK' ELSE (1/0)::text END;
\i scripts/staging/reconcile.sql
ROLLBACK;
SQL
echo "Staging bound identity and internal financial reconciliation passed."

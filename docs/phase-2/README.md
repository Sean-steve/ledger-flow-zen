# Phase 2 — Financial Engine & PostgreSQL Consolidation

Status: **code and ephemeral PostgreSQL 16 integration verification**. Not applied to live Ledger Flow project (the linked Supabase account does not expose that project's database).

Working branch: `phase2/postgresql-financial-correctness`, stacked on Phase 1.

## Code delivered

| Path | Scope |
|---|---|
| `0002_document_atomicity_and_permissions.sql` | Remove direct finance writes; atomic draft-save RPC; audit/status and sent-state commands; stricter issued-document guard |
| `0003_payment_integrity_and_public_share.sql` | Mandatory request idempotency; funded allocations; reversed receipt audit; unallocated payment view; minimal public bearer payload |
| `0004_tenant_and_history_guards.sql` | Protect business owner role, last owner, financial-row immutability, and cross-business relationships |
| `0005_currency_and_document_transitions.sql` | Currency-segmented client receivables; unapplied credit view; quote-to-invoice conversion and safe voiding |
| `src/lib/db.ts` and `src/integrations/supabase/types.ts` | Canonical React mutations now call atomic server RPCs; typed function contracts |
| `src/routes/_authenticated/payments.tsx` | Stable retry idempotency key and manual-payment disclosure |
| `src/routes/_authenticated/reports.tsx`, `clients.tsx` | Currency-safe reporting and client balance display |
| `tests/sql/` | Real PostgreSQL 16 integration tests with an ephemeral Supabase Auth-role shim |
| `.github/workflows/phase2-financial-ci.yml` | CI installs the baseline + all new migrations, tests RLS/financial flows, and builds frontend |

## Production/staging gate

**DO NOT blindly run the new SQL against an unknown existing database.**

1. Confirm destination, database owner, restore-point and 0000/0001 migration history. This repo's Drizzle journal currently tracks the two original migrations only. The Phase 2 files are additive raw SQL and are explicitly applied via psql; verify your normal Drizzle migration runner before switching to it.
2. Take a verified **restorable** backup/snapshot.
3. Run `psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f tests/sql/phase2_preflight.sql` on a privileged, read-only test session.
4. Review existing business/client/payment/credit records, duplicate references, historic tax rules and correct any invalid records before applying constraints.
5. On isolated staging with the known baseline, run `CONFIRM_FINANCIAL_MIGRATION=YES DATABASE_URL='...' bash scripts/apply-phase2-sql.sh`. This script acquires an advisory lock and applies the Phase 2 SQL transactionally.
6. Run PostgreSQL integration/security tests and app E2E against staging with actual Supabase JWT/RLS, NOT the CI shim. Validate rollback/restore, concurrent allocations, permission revocations, currency segmentation, provider receipt state, and read-only share projection.
7. Only after evidence and approval consider controlled live activation; do not assume M-Pesa or eTIMS is configured.

## Financial boundaries

- Completed payments entered in the current UI are **manually attested** by an operator, not verified by bank or M-Pesa callbacks. Live provider integration is Phase 4.
- Idempotency is enforced per business UUID and request fingerprint; retries return the existing result.
- Payments cannot be moved between clients; allocation sources must match business, client, currency and invoice.
- Unallocated payment amounts and unapplied credit-note amounts have dedicated reporting views; later phases must reconcile and settle liabilities, refunds and advance payments.
- All issued document numbers and server totals are derived inside PostgreSQL; frontend previews are non-authoritative.
- Browser share tokens expose only allowlisted presentation fields.

## Remaining high-priority gates

- Actual live database mapping and migration application (project not connected).
- Concurrency/load and authenticated JWT+RLS against a real Supabase staging project.
- Backfill/reconciliation of existing operational records, if any.
- Manual payment source attestation, provider webhooks, settlement/refunds and fiscal eTIMS certification.
- Migration system harmonisation, including the existing Drizzle journal.
- CI is evidence for code and ephemeral DB, not a production release certificate.

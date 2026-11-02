# Phase 2.1 — PostgreSQL Staging Activation & Financial Reconciliation

Status as of 2026-11-02: **staging infrastructure code and isolated PostgreSQL checks implemented; real dedicated staging project NOT connected or activated**.

Canonical repository: `Sean-steve/ledger-flow-zen`  
Implementation branch: `phase2.1/staging-activation-and-reconciliation`  
Depends on: Phase 0 PR #1 → Phase 1 PR #2 → Phase 2 PR #3.

## What was executed

- Confirmed connected Supabase projects are HumanKernelOS Production and AGENCY OS v1 only. Neither is the Ledger Flow project configured in GitHub. **No changes were made to either.**
- Created a guarded one-time staging schema activation script (new empty `bootstrap` or preflighted `upgrade`).
- Implemented an environment binding so this database cannot be silently relabelled to another staging project.
- Added 16+ read-only financial consistency and privacy checks covering issued line-item totals, receipt integrity, payment funding, credit liabilities, multi-currency reports, cross-business links, access grants and staging migration metadata.
- Added an isolated PostgreSQL 16 Actions test: actual migrations `0000–0005`, staged activation, a rejected repeat bootstrap, financial regression fixtures inside a rollback, and a clean final reconciliation.
- Added a **manual-only** protected GitHub Actions staging deployment with `preflight`, `activate`, `reconcile`, and `api-check` operations.
- Added a staging Auth/PostgREST endpoint probe that verifies anonymous business records cannot be retrieved.

The CI test uses disposable PostgreSQL with an Auth shim and never constitutes live hosting or live user records.

## Database decisions

Ledger Flow currently uses Supabase Auth, PostgREST and PostgreSQL RLS. **Pointing the browser at a plain PostgreSQL server alone will NOT work.** Choose either:
1. A separately provisioned dedicated Supabase staging project (recommended for current app architecture).
2. A fully provisioned self-hosted Supabase-compatible stack, with TLS, Auth and PostgREST in addition to PostgreSQL.

A connected project must be explicitly matched before executing migrations. Do not reuse an unrelated Supabase database or assume an inactive business app is a safe staging target.

## Activation checklist (blocked until a correct project exists)

1. Create/connect the **correct dedicated** staging project; do not reuse the tracked app `.env` reference or other OS databases.
2. Protect GitHub Environment `fdos-financial-staging` with approved reviewers.
3. Add GitHub Environment **secret** `FDOS_STAGING_DATABASE_URL` (direct TLS Postgres URL; not a pooler or publishable API key).
4. Set variables `FDOS_STAGING_ID` (`fdos-staging-...`) and `FDOS_STAGING_PROJECT_REF` (the exact new project's ref).
5. For API verification, add variable `FDOS_STAGING_API_URL` and secret `FDOS_STAGING_PUBLISHABLE_KEY`. No service_role key may be used by the browser or the probe.
6. Merge or check out the stacked changes before expecting the manual workflow on the default GitHub branch; GitHub does not expose a new `workflow_dispatch` from an unmerged feature branch.
7. Use `preflight`. If a fresh DB, choose `bootstrap` with explicit empty-schema approval. If upgrading a previously used staging DB, first create and **test restoration of a backup**, then choose `upgrade`.
8. Use `activate` (protected, manual). Then `reconcile`, and separately `api-check`.
9. Run browser E2E with real staging Auth users, each business role, quote→invoice→partial payment→receipt→reversal and share-link revocation. The anonymous probe alone does not prove full identity integration.
10. If historical financial records exist, reconcile against an authorized source export before claiming **historical parity**. See [Source reconciliation gate](SOURCE_RECONCILIATION.md).

**No live database credentials, user exports, payment details, or backups should be committed or uploaded as GitHub Actions artifacts.**

## Evidence / exit criteria

| Gate | State | Evidence |
|---|---|---|
| Existing project inventory and isolation | PASS | Connected Supabase account did not match Ledger Flow; other databases untouched |
| Schema package and failure rollback on isolated PostgreSQL | PASS | Phase 2.1 CI run 41500651801 and follow-up runs |
| Financial SQL fixtures with rollback | PASS | GitHub Actions Phase 2.1 staging package job |
| Correct live staging DB connected | **BLOCKED** | No matching project visible |
| Live PostgreSQL migrations applied | **BLOCKED** | Not applied outside disposable CI |
| Auth/PostgREST real API RLS | **BLOCKED** | Project and API credentials not connected |
| Historical source parity | **BLOCKED** | No authorized source export available |
| Real backup restore test and external provider certifications | **BLOCKED** | Not performed |

See [Staging evidence ledger](EVIDENCE.md), [staging scripts](../../scripts/staging/README.md) and the protected Actions workflow.

## Phase acceptance

**Repository staging package: implemented and CI-verifiable.**  
**Live Phase 2.1 certification: pending correct infrastructure and source evidence.**  
Do not promote the work to production or mark Phase 2.1 fully activated based on CI alone.

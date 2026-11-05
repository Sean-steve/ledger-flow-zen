# Phase 2.1 staging activation controls

This folder is for a **dedicated** FDOS staging database only. GitHub never stores live database passwords or production customer exports.

The app uses **Supabase Auth, PostgREST and RLS**, not merely a PostgreSQL socket. A new database must be part of a dedicated managed Supabase project or a separately provisioned, fully self-hosted Supabase-compatible stack. Bare PostgreSQL alone is insufficient to activate authenticated browser workflows.

- `verify-target.mjs` rejects the existing checked-in project ID, missing credentials, insecure remote connections, connection-pooler migrations and non-staging identifiers.
- `activate.sh` requires explicit approval, a tested backup for upgrades (or proof of a new empty schema), and `bootstrap` (brand-new empty schema) or `upgrade` (verified 0000/0001 baseline). Applies 0002–0005, records a bound staging identity, and reconciles inside one transaction.
- `reconcile.sql` is a privacy-safe, read-only financial audit; it fails on monetary/tenant mismatches.
- `verify-staging.sh` runs the same checks on an already activated environment.
- `.github/workflows/phase2_1-staging-activation.yml` is manual-only and requires GitHub environment secrets and approval controls.

**Never connect this workflow to HumanKernelOS Production or AGENCY OS.** The current connected Supabase account does not expose the Ledger Flow project.

### Explicit environment variables (GitHub Environment: `fdos-financial-staging`)

- Secret `FDOS_STAGING_DATABASE_URL`: **direct** TLS Postgres URL for a dedicated staging project.
- Variable `FDOS_STAGING_ID`: e.g. `fdos-staging-ledger-v1`.
- Variable `FDOS_STAGING_PROJECT_REF`: exactly the project's dedicated ref (not the existing `.env` project).
- Input `mode`: `bootstrap` for a new empty project; `upgrade` only after baseline review.
- Input `backup_verified`: true only after a **tested restore** when upgrading; backups must live in separate encrypted storage, never CI artifacts.
- Input `empty_schema_approved`: true only for brand-new schema bootstrap; the SQL itself also refuses existing financial tables.
- Approval: an explicit protected GitHub Environment reviewer before `activate`.

Self-hosted staging additionally requires variable `FDOS_STAGING_PROVIDER=selfhosted` and exact `FDOS_STAGING_SELF_HOSTED_HOST`; TLS still required. These settings do not install GoTrue/PostgREST automatically.

### How to distinguish completion

1. Source branch CI passes Postgres 16 and UI tests — **repository certified**.
2. A connected *dedicated* project is confirmed and activation workflow completes — **staging DB active**.
3. Actual JWT, PostgREST, RLS and E2E browser transactions pass — **frontend staging certified**.
4. Historical source inventory and financial reconciliation are verified — **data gate closed**.
5. Backup restore plus security advisors reviewed — **production candidate**.

Steps 2–5 cannot be claimed from an ephemeral CI service.

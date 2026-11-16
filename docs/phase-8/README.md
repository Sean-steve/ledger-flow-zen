# Phase 8 — Local Production-Readiness Hardening & Full-System Certification

**Outcome: Local certification candidate. PUBLIC PRODUCTION RELEASE REMAINS BLOCKED.**

This work deliberately completes security and recoverability checks in the current local-first FDOS codebase. It does not provision production servers, eTIMS certification, live Safaricom collection, an identity provider, a public customer portal, or verified sender webhooks. A release gate must not be marked green based on passing CI alone.

## Delivered

- **System Readiness** (`/system-status`): authenticated owner/admin report of local PostgreSQL modules, unresolved/unknown provider outcomes, unverified M-Pesa C2B queue, eTIMS-untransmitted invoices, and explicit production blockers. No credentials, customer contact details, or bank references are included.
- **Fail-closed runtime:** Node API cannot start with `NODE_ENV=production`, `FDOS_RELEASE_MODE=production`, a non-loopback listening interface or a non-loopback database. The frontend Origin must be a well-formed loopback HTTP URL with an explicit port. This intentionally prevents accidentally exposing the local financial API.
- **HTTP protections:** exact-Origin check for local POST operations, strict JSON Content-Type, bounded byte-count parsing including Content-Length validation, 400/403/413/415 status codes, no-store responses, no-sniff/frame/cross-origin restrictions, restrictive CSP and per-request random diagnostic ID.
- **Session safety:** HttpOnly + SameSite=Strict + Priority=High session cookies, expired-session housekeeping, bounded in-memory login-attempt tracking with HTTP 429, and an authenticated **Sign out everywhere** endpoint that revokes all local sessions for that account.
- **Backup + recovery:** a non-destructive `pg_dump` custom archive with SHA-256 manifest, secure file permissions, a second script that performs digest verification, a full `pg_restore` into a randomly named disposable database and structural checks. The original `fdos_local` database is not dropped or reset.
- **Dedicated Phase 8 CI:** clean PostgreSQL 16, migrations 0000–0010, frontend build, strict TypeScript, document rendering, real HTTP/PostgreSQL invoicing and payment smoke tests, authorization and data-leak checks, and a disposable database restore drill. Inherited Phase 1–7 checks provide regression coverage when PR is opened.

## Test locally on Ubuntu

```bash
git fetch origin
git switch phase8/security-recovery-certification
git pull origin phase8/security-recovery-certification
bun install --frozen-lockfile
# Terminal 1
bash scripts/local/run-api.sh
# Terminal 2
bun run dev
```

Open **System Readiness** in the sidebar as a business OWNER or ADMIN, then run checks. The report will say **PRODUCTION BLOCKED** even when local tests pass. This is intentional and does not prevent local invoicing, PDF print previews or payment simulations.

The local backend keeps your existing Postgres volume and does not reset prior Phase 0–7 financial records. Prefer a backup before applying any new migrations.

## Backup and verification

```bash
# Writes .backups/fdos-local-TIMESTAMP-RANDOM.dump plus a .sha256 manifest
bash scripts/recovery/backup-local.sh
# Replace with the exact full archive path printed by backup-local.sh
bash scripts/recovery/verify-local-backup.sh /absolute/path/to/fdos-local-TIMESTAMP-RANDOM.dump
```

Backup archives include invoices, transaction records, user password hashes, sessions and possibly sensitive customer information. Keep `.backups/` excluded from version control; files and directories use restrictive permissions. **Archives are not encrypted by these scripts. Encrypt with your approved encryption/key-management procedure before transferring off-host**, and limit file access appropriately. CI tests a separate dump/restore via `pg_dump`, `pg_restore` and `psql`; a local Docker restore drill must also be run and documented before real deployment.

Both commands need Docker Compose and the local `.env.local`; the verifier creates a temporary `fdos_restore_...` database within the local PostgreSQL container and always attempts to delete it afterward. It never accepts a production database name or overwrites `fdos_local`. Manual cleanup is necessary if Docker fails before its cleanup handler can run.

## Production-release blockers (P0)

1. **Production architecture & hosting:** public HTTPS domain, reverse proxy, separation of frontend/API/worker, stateful PostgreSQL storage, secrets manager, private network, ingress policy, WAF/rate limits and a controlled deployment/rollback path. The current Node API hard-refuses public binding and production mode.
2. **Identity:** independent OIDC identity provider with MFA, verified email and reset/recovery flows, robust sessions, account-closure policy and production threat modelling. The local password/session store is for development.
3. **Payments:** Safaricom production onboarding, authorized STK/C2B callback ingress and signatures, payment truth reconciliation against merchant/bank statements, chargeback/refund controls, idempotency and failure evidence. No real M-Pesa settlement is certified.
4. **Tax invoicing:** KRA eTIMS OSCU/VSCU licensing/sandbox test, device activation, receipt/QR/signature verification, rejection and reversal handling, tax mapping and official KRA certification. Deferred as instructed.
5. **Messaging & public shares:** verified sender and domain, Meta-approved utility templates, audited consent/opt-out, signed provider delivery webhooks, bounce suppression, public HTTPS portal and expiring customer links. Local previews are not live deliveries.
6. **Operations:** backup encryption and independently verified off-host restore, SLO/SLI monitoring, alert routing, incident and breach procedures, retention/privacy policy, disaster recovery evidence, database migration rehearsal and multi-worker schedule locks.
7. **Final QA:** release-candidate image, staging with secure non-production data, end-to-end multi-role/browser accessibility/performance tests, resilience load tests, dependency audit/SBOM, penetration assessment, DPIA/legal review, authorized sign-off and production deployment evidence.

Until these gates are proven, **the release status is BLOCKED**, and no customer should be told this software provides KRA-certified tax receipts, real Safaricom settlements, guaranteed external delivery or live production availability.

## Operational recovery and incidents

If external provider results become `UNKNOWN`, do not send the transaction again blindly. Check the outbox/M-Pesa review queue/fiscal evidence for the original idempotency key, reconcile with the provider's authoritative record, and document the resolution. Temporarily disable the business integration switches if necessary. Before database repair, create a fresh backup and verify it in a disposable database. Never restore a backup over the only copy of valuable financial data without a documented recovery and rollback plan.

## CI evidence

Workflow `.github/workflows/phase8-readiness.yml` runs PostgreSQL 16, documents, invoices, payment/receipt workflows, security checks and backup restore. PR workflows for Phases 1–7 verify document design, financial SQL, communications, fiscal (mocked OSCU), M-Pesa (mocked Daraja), automation and business permissions. Tests do not submit to KRA or move customer money.

**Certification scope:** LOCAL APPLICATION ONLY — not externally validated production compliance.
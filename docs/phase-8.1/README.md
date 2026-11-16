# Phase 8.1 — Dedicated Synthetic Staging Activation & Release Evidence

**Outcome:** A deployable, gated staging implementation. **No external VPS, DNS, TLS certificate, production identity or provider account was activated by repository changes.**

## Architecture

- A dedicated staging VPS with ports **80/443** to Caddy only; **22** restricted by the operator.
- Caddy obtains a trusted HTTPS certificate for a dedicated staging DNS name. HTTP Basic authentication is required before the app or API can be viewed.
- Internal Node/TanStack Start frontend, Node/PostgreSQL financial API and isolated PostgreSQL **16** containers share a private Docker network. The database and API have **no published host ports**.
- A distinct Docker volume and database name **fdos_staging** prevent reuse of local or production records. The staging runtime refuses remote/managed DB hostnames, public API binding without its container profile, and plaintext/incorrect frontend origins.
- The app only accepts **synthetic test data**. The backend blocks new public signups after a one-time operator-provisioned reviewer account. KRA, M-Pesa and outbound messaging remain preview-only, including unattended reminders.
- The production release gate remains **BLOCKED** irrespective of successful staging evidence.

## 1. Prerequisites (operator action required)

Provide a **new or separately isolated staging VPS**, DNS subdomain pointing to it, firewall, Docker Engine + Compose v2, a deploy SSH key and an operator GitHub environment. Do NOT deploy beside live customer data or use a production database, passwords or billing provider credentials. Avoid copied real client records in test environments.

Install Git/GitHub credentials for a read-only clone and Docker/Compose on the VPS. In `/opt/fdos/ledger-flow-zen` clone your GitHub repository and check out **phase8.1/staging-release-evidence**. The deploy account should own the checkout and Docker access; do not run this app as root. Preserve the repo's `.env.staging` across Git updates.

## 2. Configure isolated staging secrets

```bash
cd /opt/fdos/ledger-flow-zen
git fetch origin
git switch phase8.1/staging-release-evidence
cp .env.staging.example .env.staging
chmod 600 .env.staging
```

Edit `.env.staging` in a trusted editor. Replace **all** placeholders: `FDOS_STAGE_DOMAIN`, `FDOS_STAGE_ACME_EMAIL`, a Caddy bcrypt hash and username, a unique PostgreSQL password plus its percent-encoded value in `DATABASE_URL`, and `FDOS_STAGE_BOOTSTRAP_EMAIL` for a *synthetic* QA account. The expected DB connection is `postgresql://fdos_stage:<url-encoded-stage-password>@db:5432/fdos_staging`. Do not use any external database hostname. Avoid `$`, whitespace and shell metacharacters in raw shell-sourced values unless properly quoted.

Generate a bcrypt hash using the approved Caddy container:

```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'your-independent-strong-staging-password'
```

Keep the returned hash within **single quotes** in `.env.staging` to avoid shell/Compose interpolation. The cleartext Basic Auth password should never be committed to GitHub. Use a separate credential from the application's reviewer login.

**Never** put Meta/Resend/Daraja/KRA live credentials in `.env.staging`. Compose overrides all customer delivery modes to PREVIEW and refuses public signup.

## 3. Deploy the exact reviewed commit

```bash
bash scripts/staging/preflight.sh
# Replace SHA with a reviewed commit from phase8.1:
bash scripts/staging/deploy.sh <40-character-reviewed-git-sha>
```

The deploy script requires a clean checkout at the exact specified SHA, starts the isolated DB, applies the financial schema transactionally only to an empty DB, builds and starts both private application containers and the HTTPS gateway, then verifies health. If it detects pre-existing unmarked business tables, it **stops** rather than risk touching a production database. It does not run destructive schema resets. For subsequent releases the existing migration marker is checked and schema is preserved.

The final verification requires **real public DNS and a trusted certificate**, and expects anonymous HTTPS requests to receive HTTP **401**. CI validates Caddy configuration and private containers but cannot issue a certificate for your actual hostname.

## 4. One-time synthetic reviewer

The staging API denies browser registration. After deployment, provision exactly one test-only reviewer with the email in `.env.staging`. Enter the password via a private stdin pipe (not a CLI argument or committed file):

```bash
read -rs -p 'Staging reviewer password: ' FDOS_REVIEWER_PW; echo
printf '%s\n' "$FDOS_REVIEWER_PW" | docker compose --env-file .env.staging -f deploy/staging/compose.yml exec -T api node scripts/staging/provision-reviewer.mjs
unset FDOS_REVIEWER_PW
```

The provisioning command refuses to create a second account when user records already exist. Sign in behind HTTPS Basic Auth using the dedicated reviewer identity, create a synthetic business and mock invoices, check the Team & Roles and System Readiness screens, and confirm external providers remain in PREVIEW mode. It does not onboard real customers.

## 5. Staging backup / disaster-recovery exercise

```bash
bash scripts/staging/backup.sh
# Use the exact archive path printed above:
bash scripts/staging/verify-restore.sh /absolute/path/to/fdos-staging-....dump
```

The scripts create a SHA-256 manifest and restore into an automatically named **disposable** DB. They never overwrite `fdos_staging`. All archives contain synthetic accounts and should still be kept private; **encrypt before off-host transfer**. Verify archive retention and cleanup on the real VPS separately. CI also performs this full restore drill in disposable containers.

## 6. GitHub staging deploy (manual only)

Configure a GitHub **Environment named `staging` with required reviewers** and set only its approved staging secrets:

- `FDOS_STAGING_SSH_HOST` — dedicated staging host DNS/IP.
- `FDOS_STAGING_SSH_USER` — non-root deploy account.
- `FDOS_STAGING_SSH_PRIVATE_KEY` — dedicated deployment key.
- `FDOS_STAGING_KNOWN_HOSTS` — **independently fingerprint-verified** SSH host key, not blindly trusted from ssh-keyscan.

The environment requires a pre-cloned working copy at `/opt/fdos/ledger-flow-zen` and an independently prepared private `.env.staging`. Once this workflow is merged into the default branch and the protected Environment has been configured, manually run **Phase 8.1 — Manual Staging Deploy** with confirmation `STAGING_ONLY`. The workflow checks out the reviewed SHA, connects through pinned SSH, verifies the branch tip exactly matches the approved SHA, and runs `scripts/staging/deploy.sh`. It never deploys to production.

**GitHub workflow files alone do not provision your VPS or environment secrets.** A staging Environment with required reviewers and the host configuration must be created before running this job.

## 7. Evidence closure and non-negotiable release gate

After a successful real deployment `scripts/staging/verify.sh` writes a no-secrets JSON file to `.staging-evidence/<sha>.json`, reporting actual private health, trusted TLS, anonymous 401 and disabled provider modes. This evidence is a staging artifact **only**, not a production certification. Independently record: DNS/certificate proof, reviewer sign-in and role separation, synthetic end-to-end payments, full backup restore, monitoring/alert route and incident-response contact. See [Release Evidence Checklist](RELEASE_EVIDENCE.md).

Production remains BLOCKED pending all external approvals and infrastructure: independently verified identity/MFA, risk/penetration assessment, encrypted off-host backup restore, public customer portal, provider webhooks, real payment reconciliation, KRA OSCU/VSCU certification (deferred), and owner sign-off. The local credentials/session store and Caddy Basic Auth are **not** a substitute for production OIDC/MFA.

## Local regression checks (no VPS required)

```bash
node --test tests/phase8.1/staging.test.mjs
NITRO_PRESET=node-server bun run build
bunx tsc --noEmit
```

Dedicated GitHub Actions CI also builds the actual API and SSR frontend images, creates isolated PostgreSQL tables, disables signup and external providers, verifies a Secure staging session cookie and completes a PostgreSQL backup→restore drill in synthetic containers.

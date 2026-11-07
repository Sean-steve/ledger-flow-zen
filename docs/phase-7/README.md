# Phase 7 — Business Configuration, Branding, Templates, Permissions & Integrations

**Local PostgreSQL 16 · Additive schema · No external provider activation by default**

## Delivered

- **Business Setup** (`/configuration`) for company branding, per-document template overrides, and controlled integration preferences.
- **Team & Roles** (`/team`) with member roster, owner/admin/accountant/viewer roles, one-time invitation codes, role changes, and revocation.
- **Branding:** optional header tagline, printable footer note, six-digit accent color and private PNG/JPEG/WebP raster logo (max 256 KiB). Logos are stored in local PostgreSQL and streamed only to authenticated business members. SVG/HTML uploads are rejected.
- **Templates:** the eight preserved Document Studio designs can be assigned per document type (invoice, quotation, pro-forma, credit note, debit note). New drafts use type-specific defaults unless changed manually; existing issued document template references are not rewritten.
- **Integrations:** owner-managed email, WhatsApp, M-Pesa sandbox, and KRA OSCU sandbox permission switches are all disabled by default for existing and new businesses. They gate real outbound operations in addition to provider credentials and independent sandbox/live approval. Turning a switch on does NOT activate a provider, expose API keys, or override KRA approval.
- **Team access:** invitation token is shown one time, SHA-256 stored, expires after seven days, and is accepted only from the matching authenticated email account. No membership is auto-created by untrusted signup. OWNER roles are immutable through this UI. Admins cannot promote themselves or modify owner roles.
- **Auditing:** branding, provider flags, template changes, team invitation issuance, acceptance, revocation, role changes and removals create business-scoped audit records.

## Run locally

```bash
git fetch origin
git switch phase7/business-configuration
git pull origin phase7/business-configuration
bun install --frozen-lockfile
# Terminal 1
bash scripts/local/run-api.sh
# Terminal 2
bun run dev
```

On startup, the local bootstrap applies migration `0010_business_configuration.sql` **without resetting your existing financial tables or Docker volume**. Back up important records before running migrations.

In the sidebar, open **Business Setup**. Edit the accent color, header tagline, footer and optionally upload your logo; press **Save branding**. In **Document-type templates**, choose the preferred template for invoices and quotations, then create new drafts to verify the new defaults. Existing issued documents keep their saved template IDs. The render/export component uses this branding for invoices and receipts.

Open **Team & Roles**. Use an owner's account to create an invitation for an exact email address; copy the one-time token securely to the recipient. The recipient signs up or signs in using the same email address, opens Team & Roles and pastes the code under **Accept invitation**. There is no automatic invitation email yet. When logged into multiple businesses, the app's business selector can switch the context. Owner/admin limitations are enforced server-side, not only in the browser.

## Provider management (not live)

Each business has independent booleans for email, WhatsApp, M-Pesa and eTIMS sandbox. A disabled switch refuses the relevant live/sandbox send. A switch alone is never sufficient: Resend verified sender, Meta approved WhatsApp template and opt-in, Daraja sandbox credentials/HTTPS callbacks, or KRA-approved OSCU sidecar are still required separately. All provider credentials remain in ignored `.env.local` on the server. The UI reports only boolean readiness and preview/sandbox mode; it does not read or save secret values.

Note: KRA activation remains deferred as requested. Production OSCU/VSCU is **not** implemented, and neither is live M-Pesa collection. Do not describe locally generated commercial invoices as KRA-fiscalized.

## Security constraints

- All configuration requests require authenticated session cookies and exact Origin. The document logo GET route checks business membership and returns private, no-sniff raster bytes only.
- Members can view configuration; only OWNER/ADMIN edit brand/template settings; only OWNER can edit integration gates; team role elevation to ADMIN requires OWNER. ACCOUNTANT/VIEWER have no configuration write authority.
- Invitations never grant OWNER; invitation tokens cannot be re-read after creation; the database only holds their hashes. Revoked/expired invitations cannot be accepted.
- Logo input is bounded, verified by MIME and magic bytes, and never interpreted as HTML or SVG. It is streamed only from the app's authenticated route.
- Live/sandbox channel enforcement preserves compatibility with historical Phase 1–6 CI which uses older schemas. On Phase 7-installed databases, disabled/no-profile switches fail closed.
- This stage does not deploy a public API, sender verification, OAuth MFA, SSO, or real external provider testing.

## Verification

`.github/workflows/phase7-config.yml` uses disposable PostgreSQL 16, applies migrations 0000–0010 and local auth schema, builds React and checks strict TypeScript, runs canonical renderer tests, then runs real PostgreSQL tests for branding validation/streaming, type-specific templates, disabled provider gates, invite acceptance/revocation, cross-tenant isolation and team roles. Existing Phase 1–6 CI runs on PR. This verifies local behavior only; no production services contacted.

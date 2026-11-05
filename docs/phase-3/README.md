# Phase 3 — Communication Engine (local-first)

**Implemented on** `phase3/communications-engine`, based on `main`.

## Included

- **Communication Outbox** in the sidebar, recording channel, recipient, request time, preview/provider state, sanitized error code, provider acceptance identifier.
- **Send** on issued documents and active receipts (email or WhatsApp).
- **WhatsApp opt-in / opt-out** and email opt-out management per client, with source evidence and audit trail.
- **Plain PostgreSQL 16** additive migration `0006_communications.sql`. No Supabase.
- Default **local PREVIEW**: persisted preview rows but **zero external messages** and zero new share links.
- **Live provider adapters**: Resend email API, Meta WhatsApp Business Cloud API with approved template, 3 placeholders (customer name, document/receipt number, HTTPS share URL).
- Unique business-level idempotency key, 14-day expiring share links created only for live requests, explicit provider states: `ACCEPTED`, `FAILED`, `UNKNOWN` (uncertain delivery; never auto retry), `PREVIEW`.
- RLS-scoped authorized business and client reads. Writers must have OWNER, ADMIN, or ACCOUNTANT role. WhatsApp permission is required before a live send; email opt-out enforced.
- Local API access remains **127.0.0.1 only** with HttpOnly session cookie and exact-Origin POST check.

## Run locally — **no provider account needed**

```bash
git switch phase3/communications-engine
git pull origin phase3/communications-engine
bun install --frozen-lockfile
bash scripts/local/run-api.sh
# In a second terminal:
bun run dev
```

The startup script applies `0006_communications.sql` automatically to an existing local PostgreSQL database, without resetting it. Existing records and Docker volume are preserved. For a completely new local database, bootstrap applies the initial financial schema, local authentication and the communication migration transactionally.

In a logged-in workspace, open a finalized document or valid receipt and select **Send by Email / WhatsApp**. In default preview mode, clicking **Create preview** records an outbox row **without contacting any third party**. View it in **Outbox**. For WhatsApp live sending, open **Clients → Messaging preferences** to record customer consent, including source.

## Live activation (NOT currently done)

Copy these **server-only** values into your existing ignored `.env.local`. Do not put credentials in `VITE_` variables or commit them.

```dotenv
FDOS_COMM_MODE=live
FDOS_PUBLIC_APP_URL=https://documents.yourdomain.com
RESEND_API_KEY=your_resend_key
FDOS_EMAIL_FROM="Your Company <invoices@your-verified-domain.com>"
META_WA_TOKEN=your_meta_whatsapp_token
META_WA_PHONE_NUMBER_ID=your_meta_phone_number_id
META_WA_GRAPH_VERSION=v23.0
FDOS_WA_TEMPLATE_DOCUMENT=fdos_document_notice
FDOS_WA_TEMPLATE_RECEIPT=fdos_receipt_notice
FDOS_WA_LANGUAGE=en_US
```

**Requirements before live messages can actually be received by customers:**

1. A public **HTTPS application AND share/document API** serving `/share/:token` and honoring expiry/revocation (not GitHub Pages alone; your local API is only available on your laptop).
2. Verify sender domain and correct SPF/DKIM/DMARC with Resend.
3. Connect Meta Business and approve matching templates **before** initiating WhatsApp messages. Each template above must include exactly three **body** text variables, in this order: **customer name, document/receipt number, secure link**. Record client opt-in and respect opt-out. Templates and API calls may incur charges.
4. Test with controlled addresses/numbers and check delivered/failed events in the provider dashboards.
5. Review hosting, authentication, transport/TLS, backups, operational secrets, rate limiting, inbound webhooks and access controls **before production exposure**.

Changing `FDOS_COMM_MODE` to live by itself does **not** deploy the customer portal or verify provider credentials. A valid public URL and provider APIs must exist for real customer delivery. A live send creates an expiring share link and sends the link, **not a PDF attachment**. The email/WhatsApp provider returning an ID means **request accepted**—not delivered or read. Do **not** treat KRA eTIMS as configured; documents remain un-fiscalized.

**Safety:** The code never auto-sends on invoice issuance, never auto-retries uncertain provider states, and never sends with preview mode. The application currently has no webhook-based delivered/read tracking, no PDF attachment generation, and no production mail deliverability certification.

## Automated certification

`.github/workflows/phase3-communications.yml` uses a disposable plain PostgreSQL 16 instance, runs the authoritative SQL migrations and local auth schema, builds and typechecks React, runs existing document renderer tests and `tests/phase3/communications.test.mjs`.

The 7 HTTP/provider tests cover local signup, tenant isolation, client consent evidence/opt-out, safe URL validation, preview without link/network, duplicate idempotency, provider payload escaping/template parameters and mocked live acceptance. **No real provider is contacted.**

## Follow-on Phase 3.1 before live activation

- Deploy a secured public document portal and API, or send server-generated authenticated PDF attachments instead.
- Add verified Resend/Meta webhooks with signature validation, deduplication and delivered/read/rejected states.
- Add rate limiting, audit monitoring, recovery/retry policy and provider credential rotation.
- Certify cross-business segregation and customer communication permissions in a production-like staging deployment.

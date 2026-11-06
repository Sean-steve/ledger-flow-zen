# Phase 5 — M-Pesa Payment Requests & Financial Reconciliation

**Local PostgreSQL 16 | PREVIEW by default | Safaricom LIVE disabled**

Phase 3 (communications) and Phase 4 (KRA OSCU foundation) are already merged into `main`. Phase 5 builds on them without overwriting any historic financial records.

## Capabilities

- `/mpesa` payment workspace with business Paybill/Till, issued KES invoice selection, phone, partial amount and provider-state history.
- `0008_mpesa_payment_reconciliation.sql` creates RLS-protected M-Pesa profile, STK requests, provider-event ledger and quarantine queue for unverified C2B notifications.
- Safaricom **Daraja sandbox** OAuth, STK Push, callback parsing and STK Query adapters; network calls only when explicitly activated in `FDOS_MPESA_MODE=sandbox`.
- Local **PREVIEW** mode simulates payment confirmation with a conspicuous **TEST receipt**. No real Safaricom funds are moved; no customer phone prompt is initiated.
- STK payment is **never posted from request acknowledgment**. For test sandbox posting, require a matching checkout and merchant request ID, confirmed amount, phone, M-Pesa reference and successful independent STK Query.
- Uses existing PostgreSQL `record_payment_v2` to atomically allocate verified/attested funds to one issued invoice, update balance and generate a receipt. Duplicate request IDs and M-Pesa receipts are locked and constrained.
- Safaricom **C2B Paybill/Till callbacks** enter an *unverified review inbox only*. They never create a payment until an authenticated owner/admin/accountant independently checks a merchant statement, selects an issued KES invoice and records explicit manual attestation with evidence reference. Amount above the invoice's due balance remains unapplied customer credit, not revenue.
- Test and sandbox receipts cannot be sent through live email or WhatsApp. Manual communications remain available via Phase 3 only for genuine, non-test documents and receipts.
- Unknown/rejected/mismatched provider responses remain **UNKNOWN**, **FAILED** or **REVIEW_REQUIRED**. No blind automatic retries or phantom receipts.
- A bookkeeping reversal voids the app's receipt but **does not refund money in M-Pesa**. Safaricom B2C/reversal/refund operations are intentionally not enabled.

## How to run locally

Update from the Phase 5 branch (it is not merged into main yet):

```bash
git fetch origin
git switch phase5/mpesa-payment-reconciliation
git pull origin phase5/mpesa-payment-reconciliation
bun install --frozen-lockfile
# Terminal 1:
bash scripts/local/run-api.sh
# Terminal 2:
bun run dev
```

The startup script applies **0008** additively to an existing local database, or applies 0000–0008 for a new database. It does **not** reset any existing financial records. Back up meaningful financial records before installing migrations.

Open **M-Pesa** in the sidebar. Save a test shortcode (e.g. `174379`) for the business. Issue a KES invoice and select it in the STK form. Choose a whole KES amount not greater than the outstanding invoice balance. In PREVIEW, click **Create local STK test request**, then **Simulate successful payment (TEST ONLY)**. Verify a partial allocation, ledger balance, TEST receipt and the transaction status. No provider credentials are required.

## Daraja sandbox configuration (optional, NOT live)

Safaricom official developer portal: https://developer.safaricom.co.ke/apis

To test real Daraja **sandbox** requests, register a developer app and obtain its sandbox Consumer Key / Consumer Secret, sandbox Paybill/Till shortcode and Lipa na M-Pesa passkey. Set these in your ignored server-only `.env.local`:

```dotenv
FDOS_MPESA_MODE=sandbox
FDOS_MPESA_SANDBOX_APPROVED=YES
FDOS_MPESA_SHORTCODE=174379
FDOS_MPESA_SHORTCODE_TYPE=PAYBILL
FDOS_MPESA_CONSUMER_KEY=from-daraja-sandbox
FDOS_MPESA_CONSUMER_SECRET=from-daraja-sandbox
FDOS_MPESA_PASSKEY=from-daraja-sandbox
FDOS_MPESA_PUBLIC_BASE=https://your-reachable-https-host.example
FDOS_MPESA_CALLBACK_TOKEN=at-least-32-random-characters-no-spaces
```

**A public HTTPS callback deployment is mandatory.** The local API intentionally binds to loopback `127.0.0.1:5012` and is therefore not reachable directly by Safaricom. A properly secured public relay or staging deployment must be configured separately. No such deployment is included. Never expose this development server directly to the internet. Secrets must remain server-side and must never use a `VITE_` prefix.

The local backend contract expects sandbox:
- `POST /api/provider/mpesa/stk/<FDOS_MPESA_CALLBACK_TOKEN>`
- `POST /api/provider/mpesa/c2b/<FDOS_MPESA_CALLBACK_TOKEN>`

Treat callback URLs with embedded bearer secrets as sensitive. Daraja callback messages do not provide a cryptographic authenticity guarantee equivalent to a signed financial statement, so the C2B path quarantines notifications. In the STK path, a matching successful checkout is additionally queried through authenticated Daraja STK Query before posting test money. Real production still needs secure public hosting, endpoint hardening, independent settlement evidence, rate limits and operational certification.

## Reconciliation rules

**STK test flow:** issued KES invoice → sandbox STK request → asynchronous callback → match IDs/phone/amount → authenticated STK Query → `record_payment_v2` → allocations and receipt. `PENDING` is NOT paid. `UNKNOWN` is not retried automatically.

**C2B flow:** callback → `REVIEW_REQUIRED` → operator checks M-Pesa merchant statement independently → explicit evidence and invoice match → `record_payment_v2` → receipt and unapplied credit (if needed). This is **manual attestation**, not automated provider verification.

**Overpayments:** direct STK requests exceeding a due invoice are rejected. A verified-manual C2B payment may exceed the due amount; only the due portion is allocated, the rest is a customer liability/unapplied credit. Existing manual payment and reversal features remain available.

**Reversals:** the current app's **Reverse payment** is a ledger action, not an M-Pesa refund. Use Safaricom's authorized reversal/refund process separately, then reconcile the resulting evidence.

**Communication:** the Phase 3 receipt Send action still requires a user; no automatic live email/WhatsApp delivery is triggered by a simulated or sandbox payment. Protecting against sending test receipts live is enforced server-side.

## Certification and deployment

CI `.github/workflows/phase5-mpesa.yml` creates a disposable PostgreSQL 16 instance and applies schema 0000–0008 + local identity, runs React build and strict types, document renderer tests, Phase 5 real DB/HTTP + mocked Daraja tests, and Phase 1–4 payment, auth, communication and fiscal regressions.

No production OAuth credential, live Safaricom Paybill, real callback, real funds, or KRA OSCU transmission is activated by this phase.

### Remaining live-activation blockers

Provision and verify a business M-Pesa shortcode and Daraja access; deploy a public authenticated HTTPS backend; secure callbacks and secrets; complete real sandbox STK + C2B verification; independently reconcile Safaricom merchant statements; implement webhook delivery/retry monitoring, statement imports, bank statement ingestion, payment refund integration, settlement accounting and production load/privacy/security controls.

**Production switch is NOT implemented.** Do not use the preview or sandbox receipt as proof of real payment.

Sources: [Safaricom Developers Portal](https://developer.safaricom.co.ke/apis) and [Safaricom Transaction Status API](https://developer.safaricom.co.ke/apis/TransactionStatus).

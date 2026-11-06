# Phase 4 — KRA eTIMS OSCU Fiscal Integration Foundation

Status: **implemented and locally testable; NOT transmitted to KRA and NOT certified for production**.

This phase adds a trustworthy application boundary for **Online Sales Control Unit (OSCU)**. The Node API uses **plain local PostgreSQL 16**. No Supabase, KRA keys, or other cloud services are necessary for the default PREVIEW mode.

## KRA standards and design rationale

Kenya Revenue Authority publishes:
- [eTIMS system-to-system integration](https://www.kra.go.ke/business/etims-electronic-tax-invoice-management-system/learn-about-etims/etims-system-to-system-integration)
- [OSCU specification v2.0](https://www.kra.go.ke/images/publications/OSCU_Specification_Document_v2.0.pdf)
- [Technical specification for a Trader Invoicing System](https://www.kra.go.ke/images/publications/TIS-for-OSCU--VSCU-Technical-Specifications-v2.0.pdf)
- [KRA OSCU/VSCU sandbox registration and activation guide](https://www.kra.go.ke/images/publications/OSCU_VSCU_Step-by-Step_Guide-on-how-to-sign-up.pdf)

The KRA OSCU solution requires approval and activation with an OSCU library/device that manages communication, integrity, signing and device keys. The KRA sandbox and production environments are distinct. Never implement the OSCU signature scheme yourself or treat an ordinary POST to a guessed endpoint as fiscalization.

This project defines **its own** `fdos-oscu-sandbox-v1` JSON contract to an **external, authorized OSCU sidecar**. That sidecar is **NOT bundled** with the repository and the contract is **NOT a KRA OSCU endpoint**. An approved OSCU integrator must implement and certify the sidecar boundary before sandbox testing against KRA is real.

## Included features

- `/fiscal` Fiscal Center: business KRA PIN display, branch/device information, user-entered official tax-code mapping, submission ledger and status.
- Per-issued-invoice and credit-note action to **Prepare fiscal preview** or (only when fully authorized) **Submit to approved OSCU sandbox**.
- Server-authoritative snapshot from immutable issued invoice items: business/buyer PIN, receipt type/number, line items, tax categories, money, original credit-note reference, and SHA-256 fingerprint.
- Strict tenant scope, owner/admin profile updates, authorized fiscal actions, owner controls, immutable event evidence, business-and-document idempotency.
- Credit notes in sandbox require prior sandbox-acknowledged parent invoice under the **same taxpayer, branch and device**. Credit amount and tax breakdown are signed negative in the canonical snapshot.
- Sandbox response states `SANDBOX_ACKNOWLEDGED`, `REJECTED`, `UNKNOWN`; no automatic retries of uncertain or rejected requests.
- No fake control code, QR, SCU signature, production confirmation, or fiscalized status is written to `documents`.
- A visible **NOT KRA FISCALIZED** disclaimer on printable documents while this implementation is not certified.

## Local run / preview testing

```bash
git fetch origin
git switch phase4/etims-fiscal-integration
bun install --frozen-lockfile
# Terminal 1:
bash scripts/local/run-api.sh
# Terminal 2:
bun run dev
```

The backend runs the additive migration `0007_fiscal_etims.sql` against existing local PostgreSQL data on startup **without resetting the database**. Make a database backup before applying migrations to valuable records.

Workflow:
1. **Settings:** enter your actual business KRA PIN. The app validates format only; it cannot establish registration with KRA.
2. **Documents:** create, finalize and issue an invoice.
3. **KRA eTIMS** in the sidebar: optionally save branch/device information and verified tax-code mappings.
4. Open the issued invoice: under **KRA eTIMS · fiscal evidence**, select **Prepare fiscal preview**.
5. Return to **Fiscal Center** to inspect the snapshot SHA-256, PREVIEW status and ledger history.

PREVIEW does **not** contact KRA or the approved OSCU. It does not create a valid eTIMS tax invoice, control number, signature or QR code.

## OSCU sandbox activation — NOT completed

The following are **server-side** variables in the ignored `.env.local`, never a `VITE_` value:

```dotenv
FDOS_ETIMS_MODE=sandbox
FDOS_ETIMS_APPROVED_SANDBOX=YES
FDOS_ETIMS_BRIDGE_URL=http://127.0.0.1:5056
FDOS_ETIMS_BRIDGE_TOKEN=an-actual-high-entropy-credential-from-authorized-sidecar
FDOS_ETIMS_KRA_CERTIFIED=NO
```

Only enable those settings **after** KRA sandbox onboarding, an OSCU test library/device, authorized device serial + branch, valid tax mapping and a real sidecar have been provisioned. **Nothing in the repository starts a sidecar.** The local loopback address is an example, not a hosted KRA endpoint.

FDOS sends a JSON request to the sidecar's locally defined `POST /v1/fiscalize` contract:
- `contract` = `fdos-oscu-sandbox-v1`; `environment` = `SANDBOX`; `solution` = `OSCU`.
- `idempotencyKey` = client-generated UUID; `fiscalSnapshot` = server-validated immutable document.
- A valid sandbox response must explicitly identify `SANDBOX`, the contract and OSCU; contain a sandbox SCU ID, sandbox receipt number and signature.

An acceptance from the *test sidecar* means **sandbox evidence**, not a certified or production KRA receipt. HTTP 4xx is recorded as rejected; HTTP 5xx, timeout, missing or unverified response is UNKNOWN and is not automatically retried. Operators must reconcile unknown outcomes with the sidecar and KRA sandbox before further action.

## Gaps before actual KRA certification / live use

**The production gate is deliberately locked.** Required future work includes:

1. KRA eTIMS OSCU application, sandbox access and device activation; self-integrator approval or verified certified provider.
2. Approved OSCU Java library/device sidecar implementation; key management, registration and all KRA-defined API methods and response checks.
3. KRA item/service classification, tax category mapping, item registration, stock/purchase requirements where applicable, payment method mapping, verified invoice numbering, integrity journals and X/Z daily reports according to the applicable KRA specifications.
4. Actual sandbox end-to-end acceptance proof, signature/SCU ID/receipt counters/internal data, QR verification with KRA, and correct official invoice rendering.
5. Credit notes tied to the fiscal original issued using the same KRA solution, including KRA-approved reason codes and fiscal returns.
6. KRA technical and administrative review, certification and operational approval. Security/privacy, backup recovery, error reconciliation, observability and production deployment evidence.
7. A release gate for **real** tax invoices: no fiscal invoice may be represented as issued without OSCU/VSCU acknowledgment and required original receipt metadata.

Until then, the ordinary Financial Document OS invoice and payment receipt are **commercial documents only**, not verified eTIMS tax receipts. This is especially important when using the Phase 3 email/WhatsApp features.

## Certification evidence

CI workflow `.github/workflows/phase4-etims.yml` provisions disposable PostgreSQL 16, applies 0000–0007 and local auth, builds + typechecks React, runs document renderer tests and `tests/phase4/fiscal.test.mjs`.

**11/11 fiscal tests passed** at commit `344248060bc1d13318628f74ea83d2f370fb6908` against **mocked** (not real KRA) OSCU responses. Tests cover non-production guards, KRA PIN format, tenant isolation, ID collision, preview totals, no false KRA code, consent-like configuration authorization, sandbox gate, genuine test-envelope validation, credit-note parent matching and negative amounts, and UNKNOWN state.

Actual KRA access and certification are **blocked until the user supplies authorized sandbox/onboarding details**.

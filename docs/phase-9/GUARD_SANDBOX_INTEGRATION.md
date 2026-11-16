# Nflake Guard ↔ Financial Document OS — Phase 2 Sandbox Integration

**Repository:** Financial Document OS - ledger-flow-zen
**Dependency:** Nflake Guard independent repository theGuard, branch feat/guard-mvp
**Baseline:** Phase 8 security / recovery draft branch, not merged to main.
**Release status:** SANDBOX TESTING ONLY. Finance production remains blocked. No real money, customer messages, or website restrictions.

## What is integrated

The existing Financial Document OS remains the authoritative invoicing/payment application. Its PostgreSQL view public.invoice_ledger derives the balance from existing allocations, credit notes and reversals. Guard receives snapshots of that ledger for invoice IDs explicitly linked by the **owning business user**. No browser supplies balances or an invoice state.

The connector has its own private fdos_local.guard_links and fdos_local.guard_outbox tables (migration 0011). They are separate from canonical financial tables and are not accessible directly to ordinary authenticated database roles. Guard runs in its own separate service/database and never gains direct FDOS database credentials.

### Link and sync

1. In the standalone Guard console, register a **fictional** hosted project, setting external_invoice_id to the *exact FDOS invoice UUID* (the database document ID, not a display number like INV-0001). Save Guard's project UUID. The private Guard backend project key stays in Guard-hosted apps only and is not used in the invoice connector.
2. In FDOS, sign in as the business OWNER. Use its authenticated local POST API to call:
   - /api/local/guard/config - confirms PREVIEW or SANDBOX mode.
   - /api/local/guard/link - JSON { "businessId":"<FDOS business UUID>", "invoiceId":"<issued invoice UUID>", "guardProjectId":"<Guard project UUID>" }.
   - /api/local/guard/queue - { "businessId":"...", "invoiceId":"..." }. Produces one pending, signed later, deterministic sandbox snapshot only when the derived ledger state changes.
   - /api/local/guard/outbox - { "businessId":"..." }. Review delivery status, event ID and attempts. No customer data or webhook secret appears in this response.
   - /api/local/guard/dispatch - { "businessId":"...", "invoiceId":"..." }. Attempts local signed delivery of this business's pending events. Requires explicit SANDBOX configuration.
3. Optional scheduled local poll: bash scripts/local/run-guard-tick.sh (one-shot). It queues current-state snapshots for each linked invoice and sends the ordered outbox with retry/backoff. It never starts background work itself; cron/systemd scheduling is an operator choice.

All FDOS browser API actions require a logged-in session + exact frontend Origin + OWNER membership. The worker has no public HTTP interface. Client project keys and connector HMAC secrets are never sent to the browser.

### Financial event mapping (always SANDBOX source)

| Canonical invoice_ledger state | Guard event |
| --- | --- |
| Issued with positive balance, due date passed | invoice.overdue |
| Issued with positive balance, not yet overdue (including partial balances) | invoice.balance_updated |
| Issued with zero derived balance | invoice.settled |
| A reversed payment increases the derived balance again | The newly derived overdue/balance_updated snapshot |

All amounts are converted exactly from numeric decimal KES to integer minor units using BigInt arithmetic, without binary floats. Credited-to-zero balances also produce invoice.settled to mean the *amount due is zero*, NOT that a bank transaction cleared. This integration only produces source=sandbox, and Guard never promotes such events to independently verified settlement.

### Delivery and resilience

- HMAC SHA-256 signature over unix timestamp + dot + exact JSON body; event UUID is stable across retries.
- Guard checks signature, timestamp, mapped project/invoice and duplicate event ID.
- Failed or unavailable Guard delivery never fails a financial transaction; a durable outbox row remains pending. Retry uses the SAME event ID and body, with a fresh timestamp, and exponential backoff. After eight failures an operator must review the HELD row. Later events for that link cannot overtake an unresolved earlier event.
- Never queue fake zero balances. If invoice is VOID/CANCELLED or non-KES, it is not linked or synced; operator review is required.
- A financial balance change is picked up on a manual /queue call or a subsequent opted-in local worker tick; it does not block or alter payment postings. It is NOT instantaneous and no external financial webhook is configured.
- Guard keeps global DRY_RUN=YES and verified event gate OFF for these tests. There is no production Guard deployment and no customer restriction automation.

## Local setup

1. Keep Phase 8 Financial Document OS branch locally and check out the Phase 2 connector branch. Run its local PostgreSQL bootstrap as usual. It installs migration 0011 **additively** after Phase 7 and never resets existing invoices.
2. Run the separate Guard service from theGuard feat/guard-mvp on its own PostgreSQL database; run Guard migrations once. Guard must use GUARD_DRY_RUN=YES and GUARD_VERIFIED_EVENTS_ENABLED=NO.
3. Set the following private FDOS settings in .env.local (never commit secrets):

    FDOS_GUARD_MODE=sandbox
    FDOS_GUARD_BASE_URL=http://127.0.0.1:4080/
    FDOS_GUARD_CONNECTOR_SECRET=<identical-private-32-plus-character-secret-as-GUARD_CONNECTOR_SECRET>

4. Set GUARD_CONNECTOR_SECRET to the identical value in the Guard service's private .env. Guard's GUARD_ADMIN_TOKEN must be a different secret.
5. Start the Financial Document OS local backend, log in as owner, link an issued fictional KES invoice, record payment/reversal cases using the app as normal and run a Guard tick after each change. Guard's license decision should reflect the sandbox balance while always having restrict=false.
6. Check FDOS outbox, Guard licensing history, and the two applications' independent /healthz endpoints.

### Automated integration tests

The new GitHub Actions workflow phase9-guard-integration.yml:
- Uses disposable PostgreSQL 16 for FDOS and a separate Guard database.
- Applies canonical FDOS migrations 0000-0011.
- Checks out the *independent* public Guard draft branch (no production secrets), starts real Guard locally with DRY RUN ON.
- Signs in an FDOS owner, creates a **real test invoice via existing domain RPCs**, registers its Guard counterpart, links and dispatches it.
- Verifies overdue → partial → settled → reversed, true invoice ledger values, failed delivery retry, deduped scans, cross-tenant denial and absolutely no restrictive licence decisions.
- Runs Guard's own unit tests as an additional assertion.

## Required before production

- Merge/review Phase 8 after security signoff.
- Finalize the Guard MVP PR, strong production identity/MFA and a hardened public HTTPS deployment.
- Source financial truth from independent merchant/bank settlement rather than local/manual ledger flags; implement verified event sequence and guardrails for delayed/missed feeds.
- Introduce safe automatic queueing with transactional event capture if real-time fidelity is required, billing/accounting dispute handling and formal project SLA.
- Map invoices to appropriate licences/contracts and verify customer notice delivery/appeals.
- Review software licensing and data protection obligations with Kenyan counsel.
- Test reconciliation, DR, monitoring, replay, access controls, service outages, role revocation and key rotation.
- Never enable a hidden kill switch, restrict client-owned sources or hold client data hostage.

**Production payment-based restrictions stay disabled.**

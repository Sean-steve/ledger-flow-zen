# Merger architecture decisions

**ADR-001: Canonical app** — Keep `ledger-flow-zen` as the sole runnable application. The preserved Stage 4 folder is read-only; do not replace existing routes with the source single-page `App.tsx`.

**ADR-002: Persistence** — PostgreSQL holds customers, invoices, payments, allocations, receipts, versions and audit logs. Existing Supabase Auth/RLS may remain during development; isolate providers to allow later standalone PostgreSQL hosting. LocalStorage is never a financial authority.

**ADR-003: Write authority** — All finalization, numbering, allocations, reversals, credit/debit notes and audit mutations occur in atomic authenticated server transactions. Browser screens submit requests but do not directly rewrite settled balances.

**ADR-004: Document studio** — Preserve all eight reference templates, editor UX and export features. A single canonical rendering view-model supplies preview, print, PDF, PNG and JPG. Avoid duplicate tax calculations and mismatched formats.

**ADR-005: Receipts** — Derive receipts from payments. Reversed payments must retain a visibly voided receipt and audit event. Invoice balances derive only from non-reversed allocations and recognized adjustments.

**ADR-006: Integrations** — M-Pesa, eTIMS, email/WhatsApp automation and provider status remain unconfigured until actual credentials, verified callbacks and certification exist. A manual payment record is not provider confirmation.

**ADR-007: Access** — Validate tenant membership plus client/invoice/payment relationships in every backend command, including privileged SQL functions. Token-based public document APIs must return minimal allowlisted fields.

**ADR-008: Release** — Merge via reviewed phase branches and automated checks. Original repositories remain available for full source provenance; production data requires a separate approved migration.

# Source audit: blockers and acceptance gates

This is a static repository inspection, not a live exploit assessment or successful staging certification.

| ID | Priority | Finding | Completion criterion |
|---|---|---|---|
| FD-001 | P0 | `0000_core_financial_schema.sql` grants broad authenticated write access to payments/allocations; business writer policy allows direct UPDATE | Restrict posted money mutations to vetted commands; negative RLS tests |
| FD-002 | P0 | `0001_financial_derivation_layer.sql` declares a local `_currency` named identically to record_payment parameter; likely shadowing issue | Correct and test KES, foreign currency, default and mismatched values |
| FD-003 | P0 | `get_shared_document` returns complete business/payment/document JSON with only owner_id removed from business | Allowlist public fields and test token expiry/revocation |
| FD-004 | P0 | Payment and allocation commands require cross-tenant, cross-client and concurrency proof | Database negative tests, row locks and least-privilege audits |
| FD-005 | P1 | Client-side creation/replacement in `src/lib/db.ts` spans multiple database operations | Atomic save-document command with idempotency and rollback |
| FD-006 | P1 | Issued-document update guard protects selected fields, while other lifecycle fields need audited transition rules | Explicit allowed field/state matrix and test suite |
| FD-007 | P1 | Stage 4 reference financial data is browser localStorage; optional sample records remain in reference | Never use localStorage as canonical store or auto-seed live records |
| FD-008 | P1 | Stage 4 PDF export rasterizes a document onto a single A4 page | Test long multi-page invoices, formatting and print/export parity |
| FD-009 | P1 | `.env` is tracked in canonical repo and contains project identifiers/publishable Supabase keys | Move deployment config to environment management; audit for actual privileged secrets |
| FD-010 | P1 | Live database migration state, payment provider callbacks and KRA eTIMS transmission not verified | Explicit staging/provider certification; keep unconfigured state honest |
| FD-011 | P1 | Duplicate payment callbacks and refund/unallocated-credit semantics not fully verified | Idempotency, refunds, concurrency, liability and reconciliation E2E |
| FD-012 | P1 | Seven Stage 4 local tests do not certify canonical database/server workflows | Port tests; add integration, isolation and browser E2E suites |

## Phase 0 gate
Completed on branch:
- [x] Select canonical Ledger Flow and source Receipts Stage 4.
- [x] Preserve the full latest Stage 4 text source without changing active UI/backend code.
- [x] Verify 57/57 original Git blob hashes match copied files.
- [x] Record feature matrix, domain mapping, architecture and high-risk issues.

Pending verification/release:
- [ ] Run automated source manifest check on committed branch / CI.
- [ ] Verify canonical build, lint and tests in a provisioned environment.
- [ ] Confirm any live database state and migration applicability.
- [ ] Review PR before merging; no automatic main-branch update.

**Result:** Foundation assembled. Not ready for real-money production use.

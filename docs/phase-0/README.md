# Phase 0 — Repository reconciliation and merger foundation

Date: 2026-11-02. Canonical repository: `Sean-steve/ledger-flow-zen`. Source: `Sean-steve/Receipts`, Stage 4 at `0d4294e83ab6b2352a3b999ac62632663c31b062`.

## Confirmed
- 57 Stage 4 files preserved at `reference/receipts-stage4/`, unchanged and outside the active application.
- Source and destination Git blob hashes match 57/57.
- Stage 1–3 and ZIP files remain in the original Receipts repository.
- The existing Ledger Flow application, migrations and live integrations have not been modified.
- One canonical PostgreSQL-backed financial authority will handle invoices, payments, allocations, receipts and audit.
- The reference copy is not a second runtime or production data source.

## Deliverables
See `FEATURE_MATRIX.md`, `ARCHITECTURE.md`, `MIGRATION.md`, `BLOCKERS.md`, and `EXECUTION.md`.

## Certification limits
Code presence is not live availability. No production database or payment gateway was provisioned or tested in this phase. Do not treat the preserved reference's browser localStorage data or its optional demo fixtures as real customer records. Keep M-Pesa and KRA eTIMS integrations disabled until real provider evidence is obtained.

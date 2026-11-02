# Phase 1 — Unified UI/UX and Premium Document Studio

Working branch: `phase1/premium-document-studio`, stacked on Phase 0.

## Implemented
- Ported all eight designs from the preserved Stage 4 source into the active `src/lib/document-templates.ts` registry.
- Styled the existing canonical `DocumentSheet` and `ReceiptSheet` with template-specific colors and typography, keeping data and KRA status unchanged.
- New authenticated Document Studio gallery (`/studio`) with real-document preview and explicit per-business default selection.
- DocumentBuilder supports per-draft template selection, persisted on save, plus an optional live document preview from unsaved editor values.
- Existing document routes, public shares and receipt views reuse the same branded `DocumentSheet`/`ReceiptSheet`; no second financial renderer or data store.
- Source template registry smoke tests and a branch CI build/typecheck.
- Dedicated PDF generation remains browser-native Print → Save as PDF; image exports use the same sheet DOM.

## Unchanged financial authority
No migration, finance SQL, payment state or business ledger logic is modified in Phase 1. The editor's unsaved calculations are explicitly previews; PostgreSQL remains authoritative after save.

## Sign-off gates
- [ ] Build/typecheck and registry tests pass on Phase 1 CI.
- [ ] Verify print/PDF pagination in real browsers on short and long documents.
- [ ] Verify eight visual templates in screenshots against reference source (no screenshot baseline exists yet).
- [ ] Verify UX on desktop, mobile and all supported browsers.
- [ ] Confirm live authenticated DB and end-to-end workflows in staging (Phase 2).
- [ ] Security and financial correctness blockers from Phase 0 remain open.

**Do not merge directly to main before stacked Phase 0 approval and certification.**

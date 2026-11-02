# Phase 1 — Unified UI/UX and Premium Document Studio

Working branch: `phase1/premium-document-studio`, stacked on Phase 0.

## Implemented
- Ported all eight designs from the preserved Stage 4 source into the active `src/lib/document-templates.ts` registry.
- Styled the existing canonical `DocumentSheet` and `ReceiptSheet` with template-specific colors and typography, keeping data and KRA status unchanged.
- New authenticated Document Studio gallery (`/studio`) with real-document preview and explicit per-business default selection.
- DocumentBuilder supports per-draft template selection, persisted on save, plus an optional live document preview from unsaved editor values.
- Existing document routes, public shares and receipt views reuse the same branded `DocumentSheet`/`ReceiptSheet`; no second financial renderer or data store.
- Source template registry smoke tests, renderer/receipt integration tests and a branch CI build/typecheck.
- Dedicated PDF generation remains browser-native Print → Save as PDF; image exports use the same sheet DOM.

## Unchanged financial authority
No migration, finance SQL, payment state or business ledger logic is modified in Phase 1. The editor's unsaved calculations are explicitly previews; PostgreSQL remains authoritative after save.

## Sign-off gates
- [x] Build, strict TypeScript and 13 registry/renderer/receipt tests PASS on GitHub Actions (run 41490818055, commit b2105a96).
- [ ] Verify browser Print → Save PDF pagination in real browsers on short and long documents.
- [ ] Verify eight visual templates in screenshots against reference source (no screenshot baseline exists yet).
- [ ] Verify UX on desktop, mobile and all supported browsers.
- [ ] Confirm live authenticated DB and end-to-end workflows in staging (Phase 2).
- [ ] Security and financial correctness blockers from Phase 0 remain open.

**Do not merge directly to main before stacked Phase 0 approval and certification.**

## Document safety
Document Studio previews another design using a *visual override* only. It cannot print/export a hypothetical issued document with a template different from the persisted one. Official downloads are accessible from the saved document detail page, which uses `documents.template_id`. Unsaved builder previews are estimates and explicitly remain subordinate to the database on save and issue.

## Verification evidence
- 8/8 named template identifiers preserved from Receipts Stage 4.
- 13/13 automated tests green: three template registry tests and ten canonical DocumentSheet/ReceiptSheet render tests.
- Vite/TanStack production build and strict TypeScript validation green.
- No live database, real customer payment, external provider, visual screenshot or mobile browser certification claimed.
- A separate reviewed pull request is required because this branch is stacked on Phase 0.

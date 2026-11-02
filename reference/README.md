# Read-only merger source

Source repository: https://github.com/Sean-steve/Receipts
Source ref: `main` at commit `0d4294e83ab6b2352a3b999ac62632663c31b062` (2026-11-02).

This `reference/receipts-stage4/` folder is an unmodified reference copy of the latest Stage 4 text source (57 files) and is NOT imported by the active app. Stage 1-3 and original ZIP files remain in the original repository; no source history is deleted.

**Migration guardrails:** No live production data comes from this folder. In particular, do not ship its browser `localStorage` implementation or opt-in demo fixtures as the live payments database. Do not claim eTIMS integration or M-Pesa collection is active. Adapt the templates, preview, export, tax/math tests and workflow UX to canonical PostgreSQL-backed domain services. See `docs/phase-0/`.

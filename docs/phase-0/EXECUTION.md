# Ordered implementation after Phase 0

| Phase | Deliverables | Exit gate |
|---|---|---|
| 1 — Unified UI/UX and Document Studio | Eight templates, canonical renderer, invoice/quote editor, print/PDF/PNG/JPG, responsive UX | Same document totals and styling across preview/print/download; multi-page tests |
| 2 — Financial correctness and PostgreSQL | Restrict mutable financial tables, single atomic server commands, money/tax rules, RLS, idempotency, reconciliation | Database integration, security and concurrency suite PASS |
| 3 — Document lifecycle | Quotation approval/expiry/conversion, pro-forma, invoice, credit/debit notes, client statements | Draft->issue->view->correct->reconcile E2E PASS |
| 4 — Payments and reconciliation | Manual payments, verified M-Pesa callbacks, partial/overpayment, reversal, credit/refund, matching | Duplicate callback, reversal, multi-currency, settlement tests PASS |
| 5 — Client portal and automation | Secure sharing, quote acceptance, customer invoices/receipts, reminders, configured email/WhatsApp | Portal authorization, delivery and privacy tests PASS |
| 6 — Reports, governance and optional compliance | Revenue, receivable ageing, payment-channel and tax reporting, RBAC and eTIMS integration boundary | Currency-aware totals, tenant separation and approved compliance claims |
| 7 — Production certification and launch | CI/CD, live staging, monitoring, recovery, full E2E, documented deployment | Security + financial correctness + provider evidence PASS |

Develop in reviewed branches. Keep both original repositories and the frozen Stage 4 reference. Avoid a wholesale code merge or a second store of financial truth.

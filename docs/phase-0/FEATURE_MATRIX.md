# Feature reconciliation — implemented code, not production certification

| Feature | Ledger Flow | Receipts Stage 4 | Target |
|---|---|---|---|
| App navigation and dashboard | TanStack Router and dashboard | Dashboard, single-page shell | Ledger Flow shell, selected Receipts presentation |
| Business and permissions | Supabase Auth, PostgreSQL RLS | Browser settings | Ledger Flow |
| Client registry | PostgreSQL clients/balances | Browser client views | Ledger Flow data, combined UX |
| Quotation and pro-forma | Document types, conversion RPC | Quotation editor | Server workflow + enhanced editor |
| Invoice editor | Draft builder, item calculation | Rich editor and live preview | Canonical model + enhanced UI |
| Credit/debit notes | Document types and credit RPC | Dedicated views and services | Unified server-backed actions |
| Payments and allocations | SQL record/reverse commands, derived balances | Local service with tests | Ledger Flow, hardened |
| Automatic receipts | Database receipts from payments | Receipt UI and export | DB lifecycle + enhanced UI |
| Multi-currency, VAT/WHT | Database fields and calculations | Decimal.js and unit tests | Single authoritative policy |
| Eight design templates | Template ID and sheet | Eight branded configurations | Port all 8 into shared renderer |
| PDF/PNG/JPG | Print-to-PDF and image export | jsPDF and image export | One canonical renderer |
| Customer access and sharing | Revocable bearer link route | Email/WhatsApp message builders | Both, after privacy review |
| Financial reports | Derived invoice ledger, ageing | Dashboard/analysis | Database calculations + UI |
| Audit | PostgreSQL audit | LocalStorage audit | Server audit only |
| eTIMS/M-Pesa | Not verified live | eTIMS disabled contract | Provider boundary remains disabled |
| Tests | No source tests in inspected tree | Seven Vitest test files | Port and expand |

### Stage 4 source of reusable features
- `reference/receipts-stage4/src/application/templateService.ts` defines eight templates: executive-atelier, modern-minimal, midnight-ledger, linear-mono, editorial-classic, nordic-studio, swiss-grid, compact-ledger.
- `src/presentation/components/InvoiceEditorView.tsx`, `QuotationEditorView.tsx`, `LiveDocumentPreview.tsx`, `TemplatesView.tsx`, `ExportMenu.tsx` and `ShareMenu.tsx` within the reference contain UX to adapt.
- `src/domain/*.test.ts` and `src/application/*.test.ts` within the reference contain seven test suites to port.
- **Do not copy** `src/infrastructure/storage.ts` into active `src`. It relies on localStorage and includes opt-in sample fixtures.

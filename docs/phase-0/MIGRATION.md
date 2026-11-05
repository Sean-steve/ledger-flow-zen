# Data model crosswalk and migration protocol

## Source-to-canonical mapping

| Receipts Stage 4 entity | Canonical Ledger Flow entity | Authority |
|---|---|---|
| BusinessEntity | businesses, business_members | Authenticated server and RLS |
| ClientEntity | clients | PostgreSQL |
| InvoiceEntity | documents(type=INVOICE), document_items, document_versions | PostgreSQL |
| QuotationEntity | documents(type=QUOTATION), document_items | PostgreSQL |
| CreditNoteEntity / DebitNoteEntity | documents, allocations and approved adjustment actions | PostgreSQL |
| PaymentRecord | payments, allocations | Transactional server command |
| ReceiptEntity | receipts, linked to payment_id | Transactional server command |
| AuditLogEntry | audit_logs | Authenticated server |
| TemplateId | documents.template_id and businesses.default_template | One template registry |
| Cached invoice/client totals | invoice_ledger, client_balances | Derived SQL, not copied cache |

Existing schema: `drizzle/migrations/0000_core_financial_schema.sql` and `0001_financial_derivation_layer.sql`. Current UI API calls live in `src/lib/db.ts`.

## Migration decisions
- Copying the source Stage 4 files did **not** copy users' localStorage data, operational financial records, or a database.
- Any actual browser data must be exported explicitly by its owner; GitHub cannot access users' browser storage. Do not import Stage 4 sample/demo fixtures.
- Prepare an idempotent per-business import: client IDs -> UUIDs, invoice/quotation snapshots, immutable issued dates, payment references, receipt IDs, currency and tax integrity.
- Dry-run before committing: check duplicate document numbers, invalid dates, orphaned clients, overpayments, reversals and historical balances.
- Reconcile totals by customer and currency. Record unallocated funds independently. Do not fabricate provider-confirmed transactions.
- Preserve original source IDs and batch checksums in an import mapping. Use transactional rollback before commit, and compensating corrections after posting.
- Back up and restore the destination database, verify RLS and tenant isolation, then approve a real-data migration separately.

## Financial invariants for Phase 2
- Invoice collectible balance = issued amount less approved withholding and adjustments, payment allocations and applied credits.
- No payment allocation over its value, no invoice over-allocation, no cross-client or cross-business allocations.
- No final issued document amount mutation. All corrections are explicit and auditable.
- Status derives from allocations; no parallel mutable browser ledger.
- Use decimal/minor-unit monetary arithmetic with documented rounding and FX policy.

# Historical data reconciliation gate (not yet executed)

Ledger Flow's current database is not accessible through the connected Supabase account. Receipts Stage 4 stores any user-entered records in local browser storage; copying the Stage 4 source repository does **not** copy those records. No operator-authorized source export was supplied.

## When real financial records exist

An authorized data custodian should export a frozen snapshot from the actual legacy financial system or local Receipts browser profile. Store this export in an encrypted, access-controlled location **outside GitHub**. Preserve source timestamps, business identity, invoice/credit/payment references, partial allocations, reversals, settlement sources and currency. Never import opt-in demo fixtures as real transactions.

Before staging import, produce a documented crosswalk from legacy IDs to new document/customer/payment IDs and review status, numbering, timezone, VAT/WHT treatment, exchange rates and duplicate provider references. Import with per-business idempotency and transaction rollback, then compare the **original and destination** at both document and business-currency levels:

- Document counts: draft, issued, voided, converted, credited.
- Gross, discounts, taxable base, tax, withholding, invoice amount and outstanding balances by **same currency**.
- Original payments (manual/provider-verified distinctly), receipt counts, active/reversed allocations and unapplied client funds.
- Credit and debit notes, unapplied credit liabilities, orphaned links and bad reversals.
- Full transaction linkage and audit traceability per invoice/payment/receipt.
- A source-export checksum, import batch identifier, error queue and signed custodian approval.

**Do not aggregate KES and USD amounts without an explicit historical FX rate and policy.** Never claim historical parity just because the internal destination ledger adds up, or because the destination is empty.

The SQL in `scripts/staging/reconcile.sql` certifies **internal** consistency only. Historical source-to-target parity is **BLOCKED** until the correct database and authorized source exports are available.

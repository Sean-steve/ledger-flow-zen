import type { Business, DocumentItem, DocumentRow, InvoiceLedger } from "@/lib/db";
import { DOC_TYPE_LABEL, money, num, shortDate, TAX_LABEL } from "@/lib/format";
import type { DocType, TaxCategory } from "@/lib/format";

/**
 * The single rendering system. Live preview, print, PDF (via print) and
 * PNG/JPG (via html-to-image) all render this exact component — there is no
 * second layout anywhere in the app.
 */
export function DocumentSheet({
  business,
  document,
  items,
  ledger,
}: {
  business: Business;
  document: DocumentRow;
  items: DocumentItem[];
  ledger?: InvoiceLedger | null;
}) {
  const currency = document.currency;
  const isInvoice = document.type === "INVOICE";
  const paid = Number(ledger?.paid_amount ?? 0) + Number(ledger?.credited_amount ?? 0);
  const balance = Number(ledger?.balance ?? 0);
  const breakdown = Array.isArray(document.tax_breakdown)
    ? (document.tax_breakdown as Array<{ category: string; rate: number; taxable: number; tax: number }>)
    : [];

  return (
    <article className="doc-sheet" data-doc-sheet>
      <header className="flex items-start justify-between gap-8 border-b border-[color:var(--paper-border)] pb-6">
        <div>
          <h1 className="font-display text-3xl leading-tight">{business.name}</h1>
          {business.trading_name ? (
            <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--paper-muted)]">
              {business.trading_name}
            </p>
          ) : null}
          <div className="mt-3 space-y-0.5 text-[11px] leading-relaxed text-[color:var(--paper-muted)]">
            {business.physical_address ? <p>{business.physical_address}</p> : null}
            {business.postal_address ? <p>{business.postal_address}</p> : null}
            <p>{[business.city, business.country].filter(Boolean).join(", ")}</p>
            {business.email ? <p>{business.email}</p> : null}
            {business.phone ? <p>{business.phone}</p> : null}
            {business.kra_pin ? <p>KRA PIN: {business.kra_pin}</p> : null}
            {business.vat_number ? <p>VAT no: {business.vat_number}</p> : null}
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl">{DOC_TYPE_LABEL[document.type as DocType]}</p>
          <p className="mt-1 text-sm font-semibold tracking-wide">
            {document.doc_number ?? "DRAFT — not yet issued"}
          </p>
          <dl className="mt-4 space-y-1 text-[11px] text-[color:var(--paper-muted)]">
            <div className="flex justify-between gap-6">
              <dt>Issue date</dt>
              <dd className="text-[color:var(--paper-foreground)]">{shortDate(document.issue_date)}</dd>
            </div>
            {document.due_date ? (
              <div className="flex justify-between gap-6">
                <dt>Due date</dt>
                <dd className="text-[color:var(--paper-foreground)]">{shortDate(document.due_date)}</dd>
              </div>
            ) : null}
            {document.valid_until ? (
              <div className="flex justify-between gap-6">
                <dt>Valid until</dt>
                <dd className="text-[color:var(--paper-foreground)]">{shortDate(document.valid_until)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-6">
              <dt>Currency</dt>
              <dd className="text-[color:var(--paper-foreground)]">{currency}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="mt-6 flex flex-wrap justify-between gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--paper-muted)]">Billed to</p>
          <p className="mt-1 font-semibold">{document.client_name}</p>
          <div className="mt-1 space-y-0.5 text-[11px] text-[color:var(--paper-muted)]">
            {document.client_address ? <p>{document.client_address}</p> : null}
            {document.client_email ? <p>{document.client_email}</p> : null}
            {document.client_kra_pin ? <p>KRA PIN: {document.client_kra_pin}</p> : null}
          </div>
        </div>
        {isInvoice && ledger ? (
          <div className="rounded border border-[color:var(--paper-border)] px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--paper-muted)]">
              Balance due
            </p>
            <p className="font-display text-2xl">{money(balance, currency)}</p>
            {paid > 0 ? (
              <p className="text-[11px] text-[color:var(--paper-muted)]">
                {money(paid, currency)} settled to date
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <table className="mt-6 w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-y border-[color:var(--paper-border)] text-left uppercase tracking-[0.14em]">
            <th className="py-2 pr-2 font-medium">#</th>
            <th className="py-2 pr-2 font-medium">Description</th>
            <th className="py-2 pr-2 text-right font-medium">Qty</th>
            <th className="py-2 pr-2 text-right font-medium">Unit price</th>
            <th className="py-2 pr-2 text-right font-medium">Disc %</th>
            <th className="py-2 pr-2 font-medium">Tax</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-6 text-center text-[color:var(--paper-muted)]">
                No line items yet.
              </td>
            </tr>
          ) : (
            items.map((item, index) => (
              <tr key={item.id} className="border-b border-[color:var(--paper-border)]/70 align-top">
                <td className="py-2 pr-2 text-[color:var(--paper-muted)]">{index + 1}</td>
                <td className="py-2 pr-2">
                  {item.description}
                  {item.unit ? (
                    <span className="text-[color:var(--paper-muted)]"> · {item.unit}</span>
                  ) : null}
                </td>
                <td className="py-2 pr-2 text-right">{num(item.quantity, 2)}</td>
                <td className="py-2 pr-2 text-right">{num(item.unit_price)}</td>
                <td className="py-2 pr-2 text-right">{num(item.discount_pct, 2)}</td>
                <td className="py-2 pr-2">{TAX_LABEL[item.tax_category as TaxCategory]}</td>
                <td className="py-2 text-right">{num(item.taxable_amount)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <section className="mt-5 flex flex-wrap justify-between gap-6">
        <div className="max-w-[95mm] space-y-3 text-[10px] text-[color:var(--paper-muted)]">
          {breakdown.length ? (
            <div>
              <p className="uppercase tracking-[0.18em]">Tax breakdown</p>
              <table className="mt-1 w-full">
                <tbody>
                  {breakdown.map((row) => (
                    <tr key={`${row.category}-${row.rate}`}>
                      <td>{TAX_LABEL[row.category as TaxCategory] ?? row.category}</td>
                      <td className="text-right">{num(row.taxable)}</td>
                      <td className="text-right">{num(row.tax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {Number(document.exchange_rate) !== 1 ? (
            <p>
              Exchange rate: 1 {currency} = {num(document.exchange_rate, 4)} {business.base_currency}
            </p>
          ) : null}
          {document.notes ? (
            <div>
              <p className="uppercase tracking-[0.18em]">Notes</p>
              <p className="whitespace-pre-line">{document.notes}</p>
            </div>
          ) : null}
          {isInvoice && (business.mpesa_paybill || business.bank_account_number) ? (
            <div>
              <p className="uppercase tracking-[0.18em]">How to pay</p>
              {business.mpesa_paybill ? (
                <p>
                  M-Pesa paybill {business.mpesa_paybill}
                  {business.mpesa_account_format ? ` · account ${business.mpesa_account_format}` : ""}
                </p>
              ) : null}
              {business.bank_account_number ? (
                <p>
                  {[business.bank_name, business.bank_branch].filter(Boolean).join(" — ")}{" "}
                  {business.bank_account_name} · {business.bank_account_number}
                  {business.bank_swift ? ` · SWIFT ${business.bank_swift}` : ""}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="min-w-[70mm] text-[11px]">
          <Row label="Subtotal" value={num(document.subtotal)} />
          {Number(document.discount_total) > 0 ? (
            <Row label="Discount" value={`(${num(document.discount_total)})`} />
          ) : null}
          <Row label="Taxable" value={num(document.taxable_total)} />
          <Row label="Tax" value={num(document.tax_total)} />
          <div className="mt-1 border-t border-[color:var(--paper-border)] pt-2">
            <Row label={`Total (${currency})`} value={num(document.total_amount)} strong />
          </div>
          {document.wht_applicable ? (
            <>
              <Row
                label={`Withholding tax ${num(Number(document.wht_rate) * 100, 1)}%`}
                value={`(${num(document.wht_amount)})`}
              />
              <Row
                label="Net payable"
                value={num(Number(document.total_amount) - Number(document.wht_amount))}
                strong
              />
            </>
          ) : null}
          {isInvoice && ledger ? (
            <>
              <Row label="Settled" value={`(${num(paid)})`} />
              <div className="mt-1 border-t border-[color:var(--paper-border)] pt-2">
                <Row label="Balance due" value={num(balance)} strong />
              </div>
            </>
          ) : null}
        </div>
      </section>

      <footer className="mt-8 flex items-end justify-between gap-8 border-t border-[color:var(--paper-border)] pt-5 text-[10px] text-[color:var(--paper-muted)]">
        <div className="max-w-[110mm] whitespace-pre-line">
          {document.legal_terms ?? business.default_legal_terms ?? ""}
        </div>
        <div className="text-right">
          <div className="h-8 border-b border-[color:var(--paper-border)]" />
          <p className="mt-1 text-[color:var(--paper-foreground)]">
            {business.signatory_name ?? "Authorised signatory"}
          </p>
          {business.signatory_title ? <p>{business.signatory_title}</p> : null}
        </div>
      </footer>

      <p className="mt-4 text-center text-[9px] uppercase tracking-[0.2em] text-[color:var(--paper-muted)]">
        {document.kra_status === "TRANSMITTED"
          ? `eTIMS control code ${document.kra_control_code ?? ""}`
          : "Not transmitted to KRA eTIMS"}
      </p>
    </article>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-8 py-0.5 ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-[color:var(--paper-muted)]"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function ReceiptSheet({
  business,
  receipt,
  payment,
}: {
  business: Business;
  receipt: { receipt_number: string; created_at: string; received_by: string | null; notes: string | null; voided_at: string | null };
  payment: {
    amount: number | string;
    currency: string;
    channel: string;
    reference: string | null;
    channel_txn_id: string | null;
    payment_date: string;
    payer_name: string | null;
  };
}) {
  return (
    <article className="doc-sheet" data-doc-sheet>
      <header className="flex items-start justify-between border-b border-[color:var(--paper-border)] pb-6">
        <div>
          <h1 className="font-display text-3xl">{business.name}</h1>
          <div className="mt-2 space-y-0.5 text-[11px] text-[color:var(--paper-muted)]">
            {business.email ? <p>{business.email}</p> : null}
            {business.phone ? <p>{business.phone}</p> : null}
            {business.kra_pin ? <p>KRA PIN: {business.kra_pin}</p> : null}
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl">Official receipt</p>
          <p className="mt-1 text-sm font-semibold">{receipt.receipt_number}</p>
          <p className="text-[11px] text-[color:var(--paper-muted)]">{shortDate(receipt.created_at)}</p>
          {receipt.voided_at ? (
            <p className="mt-1 text-[11px] font-semibold text-red-700">VOIDED</p>
          ) : null}
        </div>
      </header>

      <section className="mt-8 space-y-2 text-[12px]">
        <p>
          Received from <span className="font-semibold">{payment.payer_name ?? receipt.received_by ?? "—"}</span>
        </p>
        <p className="font-display text-4xl">{money(payment.amount, payment.currency)}</p>
        <dl className="mt-4 grid grid-cols-2 gap-y-1 text-[11px]">
          <dt className="text-[color:var(--paper-muted)]">Payment date</dt>
          <dd>{shortDate(payment.payment_date)}</dd>
          <dt className="text-[color:var(--paper-muted)]">Channel</dt>
          <dd>{payment.channel.replace(/_/g, " ")}</dd>
          <dt className="text-[color:var(--paper-muted)]">Reference</dt>
          <dd>{payment.reference ?? payment.channel_txn_id ?? "—"}</dd>
        </dl>
        {receipt.notes ? (
          <p className="mt-4 whitespace-pre-line text-[11px] text-[color:var(--paper-muted)]">
            {receipt.notes}
          </p>
        ) : null}
      </section>

      <footer className="mt-16 flex items-end justify-end border-t border-[color:var(--paper-border)] pt-5 text-[10px] text-[color:var(--paper-muted)]">
        <div className="text-right">
          <div className="h-8 w-[60mm] border-b border-[color:var(--paper-border)]" />
          <p className="mt-1 text-[color:var(--paper-foreground)]">
            {business.signatory_name ?? "Authorised signatory"}
          </p>
        </div>
      </footer>
    </article>
  );
}

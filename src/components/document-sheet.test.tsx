import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentSheet, ReceiptSheet } from "./document-sheet";
import { DOCUMENT_TEMPLATES } from "@/lib/document-templates";
import type { Business, DocumentRow, DocumentItem, InvoiceLedger } from "@/lib/db";

const business = {
  name: "Certification Business",
  base_currency: "KES",
  default_template: "executive-atelier",
  country: "Kenya",
} as Business;

const invoice = {
  id: "fixture-invoice",
  type: "INVOICE",
  status: "ISSUED",
  doc_number: "INV-CERT-001",
  client_name: "Certification Client",
  currency: "KES",
  issue_date: "2026-11-02",
  due_date: "2026-11-30",
  subtotal: 1000,
  discount_total: 0,
  taxable_total: 1000,
  tax_total: 160,
  total_amount: 1160,
  tax_breakdown: [{ category: "VAT_16", rate: 0.16, taxable: 1000, tax: 160 }],
  exchange_rate: 1,
  wht_applicable: false,
  kra_status: "NOT_CONFIGURED",
  template_id: "executive-atelier",
} as DocumentRow;

const items = [{
  id: "fixture-item",
  description: "Certification service",
  quantity: 1,
  unit_price: 1000,
  discount_pct: 0,
  tax_category: "VAT_16",
  taxable_amount: 1000,
  unit: "service",
}] as DocumentItem[];

const ledger = { paid_amount: 400, credited_amount: 0, balance: 760 } as InvoiceLedger;

describe("single canonical document rendering contract", () => {
  it.each(DOCUMENT_TEMPLATES.map(template => [template.id]))(
    "renders a real-format invoice consistently using %s",
    (templateId) => {
      const markup = renderToStaticMarkup(
        <DocumentSheet business={business} document={{ ...invoice, template_id: templateId }}
          items={items} ledger={ledger} />,
      );
      expect(markup).toContain(`data-template="${templateId}"`);
      expect(markup).toContain("Certification Business");
      expect(markup).toContain("Certification Client");
      expect(markup).toContain("INV-CERT-001");
      expect(markup).toContain("Certification service");
      expect(markup).toContain("Balance due");
      expect(markup).toContain("Not transmitted to KRA eTIMS");
    },
  );

  it("renders a same-layout design preview without changing stored document template", () => {
    const preview = renderToStaticMarkup(
      <DocumentSheet business={business} document={invoice} items={items}
        ledger={ledger} templateId="swiss-grid" />,
    );
    expect(preview).toContain('data-template="swiss-grid"');
    expect(invoice.template_id).toBe("executive-atelier");
  });

  it("renders a receipt using its persisted template and void status", () => {
    const markup = renderToStaticMarkup(
      <ReceiptSheet
        business={business}
        receipt={{
          receipt_number: "RCT-CERT-001", created_at: "2026-11-02",
          received_by: null, notes: null, voided_at: "2026-11-03",
          template_id: "midnight-ledger",
        }}
        payment={{
          amount: 400, currency: "KES", channel: "MPESA_C2B", reference: "CERT-PAY",
          channel_txn_id: null, payment_date: "2026-11-02", payer_name: "Certification Client",
        }}
      />,
    );
    expect(markup).toContain('data-template="midnight-ledger"');
    expect(markup).toContain("RCT-CERT-001");
    expect(markup).toContain("VOIDED");
    expect(markup).toContain("Certification Client");
  });
});

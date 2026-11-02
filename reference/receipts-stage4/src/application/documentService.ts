/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Decimal from 'decimal.js';
import { InvoiceEntity, QuotationEntity, LineItem, TemplateId } from '../types';
import { DocumentNumberingEngine } from '../domain/numbering';
import { DocumentStateMachine } from '../domain/stateMachines';
import { calculateDocumentTotals } from '../domain/math';
import { StorageService } from '../infrastructure/storage';

/** A genuinely blank line item — no fabricated description, price, or quantity. */
function blankLineItem(): LineItem {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    description: '',
    quantity: '1',
    unit: 'Unit',
    unitPrice: '0.00',
    discountPercentage: '0',
    taxCategory: 'VAT_16',
    taxRate: '0.16',
    grossAmount: '0.00',
    taxAmount: '0.00',
    netAmount: '0.00',
  };
}

export class DocumentService {
  public static createDraftInvoice(clientId: string, templateId?: TemplateId): InvoiceEntity {
    const clients = StorageService.getClients();
    const client = clients.find((c) => c.id === clientId) || clients[0];
    if (!client) {
      throw new Error('At least one client must exist before an invoice can be created.');
    }
    const biz = StorageService.getBusiness();
    const activeTemplate = templateId || StorageService.getActiveTemplate();

    const initialItem = blankLineItem();
    const totals = calculateDocumentTotals([initialItem], false);
    const today = new Date().toISOString().split('T')[0];
    const due = new Date(Date.now() + (client.paymentTermsDays || 30) * 86400000).toISOString().split('T')[0];

    const draft: InvoiceEntity = {
      id: `inv-${Date.now()}`,
      businessId: biz.id,
      // No number is reserved for a draft — it is only assigned, atomically,
      // at finalize time. Showing a pre-allocated "next" number here would
      // be misleading: two concurrently-open drafts would both preview the
      // same number, and only one could actually receive it.
      documentNumber: 'DRAFT',
      type: 'INVOICE',
      status: 'DRAFT',
      clientId: client.id,
      clientName: client.name,
      clientEmail: client.email,
      clientKraPin: client.kraPin,
      clientAddress: client.address,
      currency: client.currency,
      exchangeRate: '1.00',
      issueDate: today,
      dueDate: due,
      items: [initialItem],
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      taxBreakdowns: totals.taxBreakdowns,
      withholdingTaxDeductible: false,
      withholdingTaxRate: '0.05',
      withholdingTaxAmount: totals.withholdingTaxAmount,
      totalAmount: totals.totalAmount,
      amountPaid: '0.00',
      balanceDue: totals.totalAmount,
      paymentTermsDays: client.paymentTermsDays || 30,
      notes: '',
      legalTerms: '',
      templateId: activeTemplate,
      kraFiscalStatus: 'NOT_CONFIGURED',
      mpesaInstruction: undefined,
      bankInstruction: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return draft;
  }

  /**
   * Persists changes to a DRAFT invoice. This is the only sanctioned write
   * path for the invoice editor — it refuses to save over an invoice that
   * has already been finalized, so an ISSUED/PAID/PARTIALLY_PAID/OVERDUE
   * invoice can never be silently rewritten from the UI (which previously
   * allowed editing totals after payments had already been recorded
   * against the original amount, corrupting balanceDue).
   */
  public static saveDraftInvoice(invoice: InvoiceEntity): InvoiceEntity {
    const invoices = StorageService.getInvoices();
    const existingIndex = invoices.findIndex((i) => i.id === invoice.id);
    const existing = existingIndex >= 0 ? invoices[existingIndex] : undefined;

    if (existing && existing.status !== 'DRAFT') {
      throw new Error(`Cannot modify ${existing.documentNumber} — it has already been issued and is immutable.`);
    }
    if (invoice.status !== 'DRAFT') {
      throw new Error('Only draft invoices can be saved through the editor.');
    }

    const updated: InvoiceEntity = { ...invoice, updatedAt: new Date().toISOString() };
    if (existingIndex >= 0) {
      invoices[existingIndex] = updated;
    } else {
      invoices.unshift(updated);
    }
    StorageService.saveInvoices(invoices);
    return updated;
  }

  public static finalizeInvoice(invoice: InvoiceEntity): InvoiceEntity {
    if (!StorageService.isBusinessConfigured()) {
      throw new Error('Complete Organization Settings (company name and KRA PIN) before issuing invoices.');
    }
    DocumentStateMachine.assertCanTransition(invoice.status, 'ISSUED');
    if (!invoice.items.length || invoice.items.every((i) => !i.description.trim())) {
      throw new Error('Add at least one line item with a description before issuing.');
    }

    const biz = StorageService.getBusiness();
    // Number is assigned atomically here, only once the transition has been
    // validated — never reserved ahead of time (see createDraftInvoice).
    const assignedNumber = DocumentNumberingEngine.getNextNumber('INV');

    const updated: InvoiceEntity = {
      ...invoice,
      documentNumber: assignedNumber,
      status: 'ISSUED',
      mpesaInstruction: biz.mpesaPaybill
        ? `Paybill: ${biz.mpesaPaybill.businessNumber} | Account: ${assignedNumber}`
        : undefined,
      bankInstruction: biz.bankDetails ? `${biz.bankDetails.bankName} | Acc: ${biz.bankDetails.accountNumber}` : undefined,
      updatedAt: new Date().toISOString(),
    };

    const invoices = StorageService.getInvoices();
    const existingIndex = invoices.findIndex((i) => i.id === updated.id);
    if (existingIndex >= 0) {
      invoices[existingIndex] = updated;
    } else {
      invoices.unshift(updated);
    }
    StorageService.saveInvoices(invoices);

    const clients = StorageService.getClients();
    const client = clients.find((c) => c.id === updated.clientId);
    if (client) {
      const curInvoiced = new Decimal(client.totalInvoiced || 0);
      const curOutstanding = new Decimal(client.outstandingBalance || 0);
      client.totalInvoiced = curInvoiced.add(new Decimal(updated.totalAmount)).toFixed(2);
      client.outstandingBalance = curOutstanding.add(new Decimal(updated.balanceDue)).toFixed(2);
      StorageService.saveClients(clients);
    }

    StorageService.logAction(
      StorageService.getCurrentActor(),
      'FINALIZE_DOCUMENT',
      'INVOICE',
      updated.id,
      `Issued official invoice ${updated.documentNumber} for ${updated.clientName} (${updated.currency} ${updated.totalAmount}).`
    );

    return updated;
  }

  /**
   * Voids an issued invoice. Voiding does not delete or alter the original
   * issued document (it remains fully readable/printable for audit
   * purposes) — it only flips status via the state machine and reverses
   * the client's totalInvoiced/outstanding exposure for the unpaid portion.
   * Already-collected amounts are left untouched; if money was actually
   * received against a voided invoice it should be handled with a
   * reversal/credit note, not silently erased by voiding.
   */
  public static voidInvoice(invoiceId: string, reason: string): InvoiceEntity {
    if (!reason?.trim()) throw new Error('A reason is required to void an invoice');

    const invoices = StorageService.getInvoices();
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (!invoice) throw new Error('Invoice not found');

    DocumentStateMachine.assertCanTransition(invoice.status, 'VOID');

    const clients = StorageService.getClients();
    const client = clients.find((c) => c.id === invoice.clientId);
    if (client && invoice.status !== 'DRAFT') {
      // Remove the unpaid remainder from the client's outstanding exposure;
      // amounts already collected stay reflected in totalPaid.
      const outstanding = new Decimal(client.outstandingBalance || 0);
      const balance = new Decimal(invoice.balanceDue || 0);
      client.outstandingBalance = Decimal.max(0, outstanding.sub(balance)).toFixed(2);
      StorageService.saveClients(clients);
    }

    invoice.status = 'VOID';
    invoice.balanceDue = '0.00';
    invoice.updatedAt = new Date().toISOString();
    StorageService.saveInvoices(invoices);

    StorageService.logAction(
      StorageService.getCurrentActor(),
      'VOID_DOCUMENT',
      'INVOICE',
      invoice.id,
      `Voided invoice ${invoice.documentNumber}. Reason: ${reason.trim()}`
    );

    return invoice;
  }

  public static convertQuotationToInvoice(quotationId: string): InvoiceEntity {
    if (!StorageService.isBusinessConfigured()) {
      throw new Error('Complete Organization Settings (company name and KRA PIN) before issuing invoices.');
    }

    const quotes = StorageService.getQuotations();
    const quote = quotes.find((q) => q.id === quotationId);
    if (!quote) throw new Error(`Quotation ${quotationId} not found`);

    if (quote.status === 'CONVERTED') {
      throw new Error('Quotation already converted to an invoice.');
    }
    if (quote.status !== 'ACCEPTED') {
      throw new Error('Only accepted quotations can be converted to an invoice.');
    }

    const clients = StorageService.getClients();
    const client = clients.find((c) => c.id === quote.clientId);
    if (!client) {
      throw new Error('The client on this quotation no longer exists — cannot determine billing address.');
    }

    const nextInvNum = DocumentNumberingEngine.getNextNumber('INV');
    const biz = StorageService.getBusiness();

    // Recompute totals from the quotation's actual line items rather than
    // trusting cached totals or fabricating a single-category breakdown —
    // this is the same calculation engine used everywhere else, so a
    // quotation with mixed VAT/zero-rated/exempt items converts correctly.
    const totals = calculateDocumentTotals(quote.items, false);

    const invoice: InvoiceEntity = {
      id: `inv-${Date.now()}`,
      businessId: biz.id,
      documentNumber: nextInvNum,
      type: 'INVOICE',
      status: 'ISSUED',
      clientId: client.id,
      clientName: client.name,
      clientEmail: client.email,
      clientKraPin: client.kraPin,
      clientAddress: client.address,
      currency: quote.currency,
      exchangeRate: '1.00',
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + (client.paymentTermsDays || 30) * 86400000).toISOString().split('T')[0],
      items: quote.items,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      taxBreakdowns: totals.taxBreakdowns,
      withholdingTaxDeductible: false,
      withholdingTaxRate: '0.05',
      withholdingTaxAmount: totals.withholdingTaxAmount,
      totalAmount: totals.totalAmount,
      amountPaid: '0.00',
      balanceDue: totals.totalAmount,
      paymentTermsDays: client.paymentTermsDays || 30,
      notes: `Generated from Quotation ${quote.quotationNumber}. ${quote.notes || ''}`.trim(),
      legalTerms: 'All deliveries covered by quotation terms and service SLA.',
      templateId: quote.templateId,
      kraFiscalStatus: 'NOT_CONFIGURED',
      mpesaInstruction: biz.mpesaPaybill ? `Paybill: ${biz.mpesaPaybill.businessNumber} | Account: ${nextInvNum}` : undefined,
      bankInstruction: biz.bankDetails ? `${biz.bankDetails.bankName} | Acc: ${biz.bankDetails.accountNumber}` : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    quote.status = 'CONVERTED';
    quote.convertedToInvoiceId = invoice.id;
    StorageService.saveQuotations(quotes);

    const invoices = StorageService.getInvoices();
    invoices.unshift(invoice);
    StorageService.saveInvoices(invoices);

    const curInvoiced = new Decimal(client.totalInvoiced || 0);
    const curOutstanding = new Decimal(client.outstandingBalance || 0);
    client.totalInvoiced = curInvoiced.add(new Decimal(invoice.totalAmount)).toFixed(2);
    client.outstandingBalance = curOutstanding.add(new Decimal(invoice.balanceDue)).toFixed(2);
    StorageService.saveClients(clients);

    StorageService.logAction(
      StorageService.getCurrentActor(),
      'CONVERT_QUOTATION',
      'INVOICE',
      invoice.id,
      `Converted quotation ${quote.quotationNumber} into invoice ${invoice.documentNumber}.`
    );

    return invoice;
  }
}

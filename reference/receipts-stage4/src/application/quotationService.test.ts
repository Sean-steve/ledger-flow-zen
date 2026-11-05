import { describe, it, expect, beforeEach } from 'vitest';
import { QuotationService } from './quotationService';
import { DocumentService } from './documentService';
import { StorageService } from '../infrastructure/storage';
import { calculateLineItem, calculateDocumentTotals } from '../domain/math';
import { seedBusiness, seedClient, resetWorkspace } from './testFixtures';

function priceItem(items: any[], index: number, unitPrice: string) {
  const calc = calculateLineItem('1', unitPrice, '0', items[index].taxCategory);
  items[index] = { ...items[index], unitPrice, ...calc };
  const totals = calculateDocumentTotals(items, false);
  return totals;
}

describe('QuotationService.createDraftQuotation', () => {
  beforeEach(resetWorkspace);

  it('creates a blank draft with no fabricated content', () => {
    seedBusiness();
    const client = seedClient();
    const draft = QuotationService.createDraftQuotation(client.id);
    expect(draft.quotationNumber).toBe('DRAFT');
    expect(draft.items[0].description).toBe('');
    expect(draft.totalAmount).toBe('0.00');
  });
});

describe('QuotationService.saveDraftQuotation (immutability guard)', () => {
  beforeEach(resetWorkspace);

  it('refuses to save over an already-issued quotation', () => {
    seedBusiness();
    const client = seedClient();
    const draft = QuotationService.createDraftQuotation(client.id);
    draft.items[0].description = 'Website redesign';
    const totals1 = priceItem(draft.items, 0, '50000.00');
    draft.subtotal = totals1.subtotal;
    draft.taxTotal = totals1.taxTotal;
    draft.totalAmount = totals1.totalAmount;
    const saved = QuotationService.saveDraftQuotation(draft);
    const issued = QuotationService.issueQuotation(saved);

    expect(() => QuotationService.saveDraftQuotation({ ...issued, totalAmount: '1.00' })).toThrow(/already been sent/);
  });
});

describe('QuotationService.issueQuotation', () => {
  beforeEach(resetWorkspace);

  it('refuses to issue with no real line items', () => {
    seedBusiness();
    const client = seedClient();
    const draft = QuotationService.createDraftQuotation(client.id);
    expect(() => QuotationService.issueQuotation(draft)).toThrow(/line item/);
  });

  it('refuses to issue when organization settings are incomplete', () => {
    const client = seedClient();
    const draft = QuotationService.createDraftQuotation(client.id);
    draft.items[0].description = 'Something';
    priceItem(draft.items, 0, '100.00');
    expect(() => QuotationService.issueQuotation(draft)).toThrow(/Organization Settings/);
  });

  it('assigns a real quotation number on issue', () => {
    seedBusiness();
    const client = seedClient();
    const draft = QuotationService.createDraftQuotation(client.id);
    draft.items[0].description = 'Something';
    priceItem(draft.items, 0, '100.00');
    const issued = QuotationService.issueQuotation(draft);
    expect(issued.quotationNumber).not.toBe('DRAFT');
    expect(issued.status).toBe('ISSUED');
  });
});

describe('QuotationService status transitions', () => {
  beforeEach(resetWorkspace);

  function issuedQuote() {
    seedBusiness();
    const client = seedClient();
    const draft = QuotationService.createDraftQuotation(client.id);
    draft.items[0].description = 'Something';
    priceItem(draft.items, 0, '100.00');
    return QuotationService.issueQuotation(draft);
  }

  it('can be marked accepted from ISSUED', () => {
    const issued = issuedQuote();
    const accepted = QuotationService.markAccepted(issued.id);
    expect(accepted.status).toBe('ACCEPTED');
  });

  it('can be marked rejected from ISSUED', () => {
    const issued = issuedQuote();
    const rejected = QuotationService.markRejected(issued.id);
    expect(rejected.status).toBe('REJECTED');
  });

  it('cannot be converted to an invoice before being accepted', () => {
    const issued = issuedQuote();
    expect(() => DocumentService.convertQuotationToInvoice(issued.id)).toThrow(/accepted/);
  });

  it('can be converted to an invoice once accepted, and updates client ledger', () => {
    const issued = issuedQuote();
    const client = StorageService.getClients().find((c) => c.id === issued.clientId)!;
    QuotationService.markAccepted(issued.id);

    const invoice = DocumentService.convertQuotationToInvoice(issued.id);
    expect(invoice.status).toBe('ISSUED');
    expect(invoice.clientId).toBe(client.id);

    const updatedQuote = StorageService.getQuotations().find((q) => q.id === issued.id)!;
    expect(updatedQuote.status).toBe('CONVERTED');

    const updatedClient = StorageService.getClients().find((c) => c.id === client.id)!;
    expect(Number(updatedClient.totalInvoiced)).toBeGreaterThan(0);
  });
});

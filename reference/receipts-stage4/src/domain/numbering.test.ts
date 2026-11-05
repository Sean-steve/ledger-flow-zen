import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentNumberingEngine } from './numbering';
import { StorageService } from '../infrastructure/storage';
import { InvoiceEntity } from '../types';

function makeInvoice(documentNumber: string): InvoiceEntity {
  return {
    id: `inv-${documentNumber}`,
    businessId: 'biz-1',
    documentNumber,
    type: 'INVOICE',
    status: 'ISSUED',
    clientId: 'client-1',
    clientName: 'Test Client',
    clientEmail: 'test@example.com',
    clientKraPin: undefined,
    clientAddress: 'Somewhere',
    currency: 'KES',
    exchangeRate: '1.00',
    issueDate: '2026-01-01',
    dueDate: '2026-02-01',
    items: [],
    subtotal: '0.00',
    taxTotal: '0.00',
    taxBreakdowns: [],
    withholdingTaxDeductible: false,
    withholdingTaxRate: '0.05',
    withholdingTaxAmount: '0.00',
    totalAmount: '0.00',
    amountPaid: '0.00',
    balanceDue: '0.00',
    paymentTermsDays: 30,
    notes: '',
    legalTerms: '',
    templateId: 'executive-atelier',
    kraFiscalStatus: 'NOT_CONFIGURED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('DocumentNumberingEngine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts at 0001 for a currency/year with no existing documents', () => {
    const year = 2031; // a year guaranteed not to collide with any other test's fixtures
    expect(DocumentNumberingEngine.getNextNumber('INV', year)).toBe(`INV-${year}-0001`);
  });

  it('increments based on the highest existing document number, not a counter', () => {
    const year = 2032;
    StorageService.saveInvoices([makeInvoice(`INV-${year}-0007`)]);
    expect(DocumentNumberingEngine.getNextNumber('INV', year)).toBe(`INV-${year}-0008`);
  });

  it('does not collide after a simulated reload (no in-memory state to lose)', () => {
    const year = 2033;
    // Simulate: engine issues a number, it gets persisted, "page reloads"
    // (nothing here holds any in-memory counter state to reset).
    const first = DocumentNumberingEngine.getNextNumber('INV', year);
    StorageService.saveInvoices([makeInvoice(first)]);

    // A prior in-memory-counter implementation would now reissue the same
    // number after a reload, because its counter would reset to a seed
    // value with no knowledge of `first` having been persisted.
    const second = DocumentNumberingEngine.getNextNumber('INV', year);
    expect(second).not.toBe(first);
    expect(second).toBe(`INV-${year}-0002`);
  });

  it('keeps separate sequences per document prefix', () => {
    const year = 2034;
    StorageService.saveInvoices([makeInvoice(`INV-${year}-0005`)]);
    // A receipt sequence for the same year should be unaffected by the invoice sequence.
    expect(DocumentNumberingEngine.getNextNumber('RCT', year)).toBe(`RCT-${year}-0001`);
  });

  it('getNextNumberAgainst derives from an explicit list (used for credit/debit notes)', () => {
    const year = 2035;
    const existing = [`CRN-${year}-0001`, `CRN-${year}-0002`];
    expect(DocumentNumberingEngine.getNextNumberAgainst('CRN', existing, year)).toBe(`CRN-${year}-0003`);
  });
});

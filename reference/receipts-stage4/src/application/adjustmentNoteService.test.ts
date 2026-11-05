import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentService } from './documentService';
import { AdjustmentNoteService } from './adjustmentNoteService';
import { StorageService } from '../infrastructure/storage';
import { seedBusiness, seedClient, resetWorkspace } from './testFixtures';

function issueTestInvoice(clientId: string, unitPrice: string) {
  const draft = DocumentService.createDraftInvoice(clientId);
  draft.items[0].description = 'Consulting services';
  draft.items[0].unitPrice = unitPrice;
  draft.subtotal = unitPrice;
  const tax = (Number(unitPrice) * 0.16).toFixed(2);
  const total = (Number(unitPrice) + Number(tax)).toFixed(2);
  draft.taxTotal = tax;
  draft.totalAmount = total;
  draft.balanceDue = total;
  return DocumentService.finalizeInvoice(draft);
}

describe('AdjustmentNoteService.issueCreditNote', () => {
  beforeEach(resetWorkspace);

  it('reduces the invoice balance, total, and client outstanding by the credited amount', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00'); // total 1160.00

    const note = AdjustmentNoteService.issueCreditNote({
      invoiceId: invoice.id,
      amount: '116.00', // 10% of the total
      reason: 'Billing correction',
    });

    expect(note.status).toBe('ISSUED');

    const updatedInvoice = StorageService.getInvoices().find((i) => i.id === invoice.id)!;
    expect(updatedInvoice.totalAmount).toBe('1044.00');
    expect(updatedInvoice.balanceDue).toBe('1044.00');

    const updatedClient = StorageService.getClients().find((c) => c.id === client.id)!;
    expect(updatedClient.totalInvoiced).toBe('1044.00');
    expect(updatedClient.outstandingBalance).toBe('1044.00');
  });

  it('apportions tax/net from the invoice tax ratio', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00'); // subtotal 1000, tax 160, total 1160 -> ratio 160/1160

    const note = AdjustmentNoteService.issueCreditNote({
      invoiceId: invoice.id,
      amount: '580.00', // half the invoice
      reason: 'Partial return',
    });

    // tax ratio = 160/1160 ≈ 0.137931; 580 * ratio ≈ 80.00
    expect(note.taxAmount).toBe('80.00');
    expect(note.netAmount).toBe('500.00');
  });

  it('refuses to credit more than the invoice balance due', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00'); // balance 1160.00

    expect(() =>
      AdjustmentNoteService.issueCreditNote({
        invoiceId: invoice.id,
        amount: '2000.00',
        reason: 'Too much',
      })
    ).toThrow(/exceeds the invoice's outstanding balance/);
  });

  it('requires a reason', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00');
    expect(() =>
      AdjustmentNoteService.issueCreditNote({ invoiceId: invoice.id, amount: '10.00', reason: '' })
    ).toThrow(/reason/);
  });
});

describe('AdjustmentNoteService.issueDebitNote', () => {
  beforeEach(resetWorkspace);

  it('increases the invoice balance, total, and client outstanding', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00'); // total 1160.00

    AdjustmentNoteService.issueDebitNote({
      invoiceId: invoice.id,
      amount: '116.00',
      reason: 'Additional freight charge',
    });

    const updatedInvoice = StorageService.getInvoices().find((i) => i.id === invoice.id)!;
    expect(updatedInvoice.totalAmount).toBe('1276.00');
    expect(updatedInvoice.balanceDue).toBe('1276.00');

    const updatedClient = StorageService.getClients().find((c) => c.id === client.id)!;
    expect(updatedClient.totalInvoiced).toBe('1276.00');
    expect(updatedClient.outstandingBalance).toBe('1276.00');
  });
});

describe('AdjustmentNoteService void operations', () => {
  beforeEach(resetWorkspace);

  it('voiding a credit note restores the credited amount', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00'); // total 1160.00
    const note = AdjustmentNoteService.issueCreditNote({ invoiceId: invoice.id, amount: '160.00', reason: 'Correction' });

    AdjustmentNoteService.voidCreditNote(note.id, 'Issued in error');

    const updatedInvoice = StorageService.getInvoices().find((i) => i.id === invoice.id)!;
    expect(updatedInvoice.totalAmount).toBe('1160.00');
    expect(updatedInvoice.balanceDue).toBe('1160.00');

    const voidedNote = StorageService.getCreditNotes().find((n) => n.id === note.id)!;
    expect(voidedNote.status).toBe('VOID');
  });

  it('voiding a debit note removes the additional charge', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00'); // total 1160.00
    const note = AdjustmentNoteService.issueDebitNote({ invoiceId: invoice.id, amount: '200.00', reason: 'Extra charge' });

    AdjustmentNoteService.voidDebitNote(note.id, 'Charged in error');

    const updatedInvoice = StorageService.getInvoices().find((i) => i.id === invoice.id)!;
    expect(updatedInvoice.totalAmount).toBe('1160.00');
    expect(updatedInvoice.balanceDue).toBe('1160.00');
  });

  it('will not void an already-voided note', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00');
    const note = AdjustmentNoteService.issueCreditNote({ invoiceId: invoice.id, amount: '50.00', reason: 'Test' });
    AdjustmentNoteService.voidCreditNote(note.id, 'First void');
    expect(() => AdjustmentNoteService.voidCreditNote(note.id, 'Second void')).toThrow();
  });
});

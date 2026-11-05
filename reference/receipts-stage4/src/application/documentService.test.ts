import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentService } from './documentService';
import { StorageService } from '../infrastructure/storage';
import { seedBusiness, seedClient, resetWorkspace } from './testFixtures';

describe('DocumentService.createDraftInvoice', () => {
  beforeEach(resetWorkspace);

  it('throws when there is no client to bill', () => {
    seedBusiness();
    expect(() => DocumentService.createDraftInvoice('missing-client')).toThrow();
  });

  it('creates a blank starter line item with zero price — no fabricated content', () => {
    seedBusiness();
    const client = seedClient();
    const draft = DocumentService.createDraftInvoice(client.id);
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0].description).toBe('');
    expect(draft.items[0].unitPrice).toBe('0.00');
    expect(draft.totalAmount).toBe('0.00');
  });

  it('does not reserve a document number for a draft', () => {
    seedBusiness();
    const client = seedClient();
    const draft = DocumentService.createDraftInvoice(client.id);
    expect(draft.documentNumber).toBe('DRAFT');
  });
});

describe('DocumentService.saveDraftInvoice (immutability guard)', () => {
  beforeEach(resetWorkspace);

  it('allows saving a genuine draft', () => {
    seedBusiness();
    const client = seedClient();
    const draft = DocumentService.createDraftInvoice(client.id);
    draft.items[0].description = 'Consulting services';
    expect(() => DocumentService.saveDraftInvoice(draft)).not.toThrow();
  });

  it('refuses to save over an already-issued invoice', () => {
    seedBusiness();
    const client = seedClient();
    const draft = DocumentService.createDraftInvoice(client.id);
    draft.items[0].description = 'Consulting services';
    draft.items[0].unitPrice = '1000.00';
    const saved = DocumentService.saveDraftInvoice(draft);
    const finalized = DocumentService.finalizeInvoice(saved);

    // Attempting to "edit" the now-issued invoice must be rejected —
    // this is the immutability bug that let a PAID invoice be silently rewritten.
    const tampered = { ...finalized, totalAmount: '1.00' };
    expect(() => DocumentService.saveDraftInvoice(tampered)).toThrow(/immutable/);
  });
});

describe('DocumentService.finalizeInvoice', () => {
  beforeEach(resetWorkspace);

  it('refuses to issue when organization settings are incomplete', () => {
    // No business configured (no name/KRA PIN)
    const client = seedClient();
    const draft = DocumentService.createDraftInvoice(client.id);
    draft.items[0].description = 'Consulting';
    draft.items[0].unitPrice = '500.00';
    expect(() => DocumentService.finalizeInvoice(draft)).toThrow(/Organization Settings/);
  });

  it('refuses to issue with no real line items', () => {
    seedBusiness();
    const client = seedClient();
    const draft = DocumentService.createDraftInvoice(client.id);
    expect(() => DocumentService.finalizeInvoice(draft)).toThrow(/line item/);
  });

  it('assigns a real document number and updates the client ledger', () => {
    seedBusiness();
    const client = seedClient();
    const draft = DocumentService.createDraftInvoice(client.id);
    draft.items[0].description = 'Consulting services';
    draft.items[0].unitPrice = '1000.00';
    draft.items[0].quantity = '1';
    // Recompute totals the way the editor would
    draft.subtotal = '1000.00';
    draft.taxTotal = '160.00';
    draft.totalAmount = '1160.00';
    draft.balanceDue = '1160.00';

    const finalized = DocumentService.finalizeInvoice(draft);
    expect(finalized.documentNumber).not.toBe('DRAFT');
    expect(finalized.status).toBe('ISSUED');

    const updatedClient = StorageService.getClients().find((c) => c.id === client.id)!;
    expect(updatedClient.totalInvoiced).toBe('1160.00');
    expect(updatedClient.outstandingBalance).toBe('1160.00');
  });
});

describe('DocumentService.voidInvoice', () => {
  beforeEach(resetWorkspace);

  it('removes the unpaid balance from client exposure without touching amounts already paid', () => {
    seedBusiness();
    const client = seedClient();
    const draft = DocumentService.createDraftInvoice(client.id);
    draft.items[0].description = 'Consulting';
    draft.items[0].unitPrice = '1000.00';
    draft.subtotal = '1000.00';
    draft.taxTotal = '160.00';
    draft.totalAmount = '1160.00';
    draft.balanceDue = '1160.00';
    const finalized = DocumentService.finalizeInvoice(draft);

    const voided = DocumentService.voidInvoice(finalized.id, 'Client cancelled order');
    expect(voided.status).toBe('VOID');
    expect(voided.balanceDue).toBe('0.00');

    const updatedClient = StorageService.getClients().find((c) => c.id === client.id)!;
    expect(updatedClient.outstandingBalance).toBe('0.00');
  });

  it('requires a reason', () => {
    seedBusiness();
    const client = seedClient();
    const draft = DocumentService.createDraftInvoice(client.id);
    draft.items[0].description = 'X';
    draft.items[0].unitPrice = '10.00';
    const finalized = DocumentService.finalizeInvoice(draft);
    expect(() => DocumentService.voidInvoice(finalized.id, '')).toThrow(/reason/);
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuotationEntity, LineItem } from '../types';
import { DocumentNumberingEngine } from '../domain/numbering';
import { QuotationStateMachine } from '../domain/stateMachines';
import { calculateDocumentTotals } from '../domain/math';
import { StorageService } from '../infrastructure/storage';

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

export class QuotationService {
  public static createDraftQuotation(clientId: string): QuotationEntity {
    const clients = StorageService.getClients();
    const client = clients.find((c) => c.id === clientId) || clients[0];
    if (!client) {
      throw new Error('At least one client must exist before a quotation can be created.');
    }
    const biz = StorageService.getBusiness();
    const initialItem = blankLineItem();
    const totals = calculateDocumentTotals([initialItem], false);
    const today = new Date().toISOString().split('T')[0];
    const validUntil = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    return {
      id: `quo-${Date.now()}`,
      businessId: biz.id,
      // No number reserved for a draft — assigned atomically at issue time, mirroring invoices.
      quotationNumber: 'DRAFT',
      status: 'DRAFT',
      clientId: client.id,
      clientName: client.name,
      clientEmail: client.email,
      currency: client.currency,
      issueDate: today,
      validUntil,
      items: [initialItem],
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      taxBreakdowns: totals.taxBreakdowns,
      totalAmount: totals.totalAmount,
      templateId: StorageService.getActiveTemplate(),
      notes: '',
      createdAt: new Date().toISOString(),
    };
  }

  /** Only DRAFT quotations can be saved through the editor — mirrors the invoice immutability guard. */
  public static saveDraftQuotation(quote: QuotationEntity): QuotationEntity {
    const quotes = StorageService.getQuotations();
    const existingIndex = quotes.findIndex((q) => q.id === quote.id);
    const existing = existingIndex >= 0 ? quotes[existingIndex] : undefined;

    if (existing && existing.status !== 'DRAFT') {
      throw new Error(`Cannot modify ${existing.quotationNumber} — it has already been sent to the client.`);
    }
    if (quote.status !== 'DRAFT') {
      throw new Error('Only draft quotations can be saved through the editor.');
    }

    if (existingIndex >= 0) {
      quotes[existingIndex] = quote;
    } else {
      quotes.unshift(quote);
    }
    StorageService.saveQuotations(quotes);
    return quote;
  }

  public static issueQuotation(quote: QuotationEntity): QuotationEntity {
    QuotationStateMachine.canTransition(quote.status, 'ISSUED');
    if (!QuotationStateMachine.canTransition(quote.status, 'ISSUED')) {
      throw new Error(`Cannot issue a quotation from ${quote.status} status`);
    }
    if (!quote.items.length || quote.items.every((i) => !i.description.trim())) {
      throw new Error('Add at least one line item with a description before sending.');
    }
    if (!StorageService.isBusinessConfigured()) {
      throw new Error('Complete Organization Settings (company name and KRA PIN) before issuing quotations.');
    }

    const assignedNumber = DocumentNumberingEngine.getNextNumber('QTN');
    const updated: QuotationEntity = { ...quote, quotationNumber: assignedNumber, status: 'ISSUED' };

    const quotes = StorageService.getQuotations();
    const existingIndex = quotes.findIndex((q) => q.id === updated.id);
    if (existingIndex >= 0) quotes[existingIndex] = updated;
    else quotes.unshift(updated);
    StorageService.saveQuotations(quotes);

    StorageService.logAction(
      StorageService.getCurrentActor(),
      'ISSUE_QUOTATION',
      'QUOTATION',
      updated.id,
      `Issued quotation ${updated.quotationNumber} for ${updated.clientName} (${updated.currency} ${updated.totalAmount}).`
    );

    return updated;
  }

  private static transitionStatus(quoteId: string, next: 'ACCEPTED' | 'REJECTED' | 'EXPIRED'): QuotationEntity {
    const quotes = StorageService.getQuotations();
    const quote = quotes.find((q) => q.id === quoteId);
    if (!quote) throw new Error('Quotation not found');
    if (!QuotationStateMachine.canTransition(quote.status, next)) {
      throw new Error(`Cannot mark ${quote.status} quotation as ${next}`);
    }
    quote.status = next;
    StorageService.saveQuotations(quotes);
    StorageService.logAction(
      StorageService.getCurrentActor(),
      `QUOTATION_${next}`,
      'QUOTATION',
      quote.id,
      `Marked quotation ${quote.quotationNumber} as ${next}.`
    );
    return quote;
  }

  public static markAccepted(quoteId: string): QuotationEntity {
    return this.transitionStatus(quoteId, 'ACCEPTED');
  }

  public static markRejected(quoteId: string): QuotationEntity {
    return this.transitionStatus(quoteId, 'REJECTED');
  }
}

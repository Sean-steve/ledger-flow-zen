/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Decimal from 'decimal.js';
import { CreditNoteEntity, DebitNoteEntity } from '../types';
import { DocumentNumberingEngine } from '../domain/numbering';
import { AdjustmentNoteStateMachine } from '../domain/stateMachines';
import { calculateAmountBasedStatus } from '../domain/math';
import { StorageService } from '../infrastructure/storage';

export interface IssueAdjustmentNoteDTO {
  invoiceId: string;
  amount: string;
  reason: string;
}

/**
 * Apportions a gross adjustment amount into tax/net components using the
 * original invoice's own overall tax ratio (taxTotal / totalAmount). This
 * keeps a credit/debit note's printed tax breakdown internally consistent
 * with the invoice it adjusts, without requiring the operator to re-enter
 * or re-select line items and tax categories for what is usually a single
 * corrective amount.
 */
function apportionTax(amount: Decimal, invoiceTotal: Decimal, invoiceTax: Decimal): { tax: Decimal; net: Decimal } {
  if (invoiceTotal.lte(0)) return { tax: new Decimal(0), net: amount };
  const ratio = invoiceTax.div(invoiceTotal);
  const tax = amount.mul(ratio).toDecimalPlaces(2);
  return { tax, net: amount.sub(tax) };
}

export class AdjustmentNoteService {
  /**
   * Issues a credit note against an invoice, reducing what the client owes.
   * Deliberately restricted to `amount <= invoice.balanceDue`: crediting
   * beyond the currently outstanding balance would mean the business owes
   * the client a refund/credit that isn't owed on THIS invoice — this
   * workspace has no general client credit-balance ledger to track that
   * safely, so it is refused rather than silently producing a number that
   * doesn't reconcile to anything.
   */
  public static issueCreditNote(dto: IssueAdjustmentNoteDTO): CreditNoteEntity {
    const amount = new Decimal(dto.amount || 0);
    if (amount.lte(0)) throw new Error('Credit amount must be greater than zero');
    if (!dto.reason?.trim()) throw new Error('A reason is required to issue a credit note');

    const invoices = StorageService.getInvoices();
    const invoice = invoices.find((i) => i.id === dto.invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status === 'DRAFT' || invoice.status === 'VOID' || invoice.status === 'CANCELLED') {
      throw new Error(`Cannot issue a credit note against a ${invoice.status.toLowerCase()} invoice`);
    }

    const balance = new Decimal(invoice.balanceDue || 0);
    if (amount.gt(balance)) {
      throw new Error(
        `Credit amount (${amount.toFixed(2)}) exceeds the invoice's outstanding balance (${balance.toFixed(2)}). ` +
          `This workspace does not track a general client credit ledger, so a credit note cannot exceed what is still owed on this invoice.`
      );
    }

    const clients = StorageService.getClients();
    const client = clients.find((c) => c.id === invoice.clientId);
    if (!client) throw new Error('Client record for this invoice no longer exists');

    const invoiceTotal = new Decimal(invoice.totalAmount || 0);
    const invoiceTax = new Decimal(invoice.taxTotal || 0);
    const { tax, net } = apportionTax(amount, invoiceTotal, invoiceTax);

    // Reduce the invoice's total and balance by the credited amount.
    invoice.totalAmount = invoiceTotal.sub(amount).toFixed(2);
    invoice.balanceDue = Decimal.max(0, new Decimal(invoice.totalAmount).sub(new Decimal(invoice.amountPaid || 0))).toFixed(2);
    invoice.status = calculateAmountBasedStatus(invoice.totalAmount, invoice.amountPaid);
    invoice.updatedAt = new Date().toISOString();
    StorageService.saveInvoices(invoices);

    client.totalInvoiced = Decimal.max(0, new Decimal(client.totalInvoiced || 0).sub(amount)).toFixed(2);
    client.outstandingBalance = Decimal.max(0, new Decimal(client.outstandingBalance || 0).sub(amount)).toFixed(2);
    StorageService.saveClients(clients);

    const existingNumbers = StorageService.getCreditNotes().map((n) => n.creditNoteNumber);
    const biz = StorageService.getBusiness();

    const note: CreditNoteEntity = {
      id: `crn-${Date.now()}`,
      businessId: biz.id,
      creditNoteNumber: DocumentNumberingEngine.getNextNumberAgainst('CRN', existingNumbers),
      status: 'ISSUED',
      invoiceId: invoice.id,
      invoiceNumber: invoice.documentNumber,
      clientId: client.id,
      clientName: client.name,
      clientKraPin: client.kraPin,
      clientAddress: client.address,
      currency: invoice.currency,
      issueDate: new Date().toISOString().split('T')[0],
      amount: amount.toFixed(2),
      taxAmount: tax.toFixed(2),
      netAmount: net.toFixed(2),
      reason: dto.reason.trim(),
      templateId: invoice.templateId,
      createdAt: new Date().toISOString(),
    };

    const notes = StorageService.getCreditNotes();
    notes.unshift(note);
    StorageService.saveCreditNotes(notes);

    StorageService.logAction(
      StorageService.getCurrentActor(),
      'ISSUE_CREDIT_NOTE',
      'INVOICE',
      invoice.id,
      `Issued credit note ${note.creditNoteNumber} for ${invoice.currency} ${note.amount} against ${invoice.documentNumber}. Reason: ${note.reason}`
    );

    return note;
  }

  /** Issues a debit note against an invoice, increasing what the client owes (e.g. an additional charge or correction). */
  public static issueDebitNote(dto: IssueAdjustmentNoteDTO): DebitNoteEntity {
    const amount = new Decimal(dto.amount || 0);
    if (amount.lte(0)) throw new Error('Debit amount must be greater than zero');
    if (!dto.reason?.trim()) throw new Error('A reason is required to issue a debit note');

    const invoices = StorageService.getInvoices();
    const invoice = invoices.find((i) => i.id === dto.invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status === 'DRAFT' || invoice.status === 'VOID' || invoice.status === 'CANCELLED') {
      throw new Error(`Cannot issue a debit note against a ${invoice.status.toLowerCase()} invoice`);
    }

    const clients = StorageService.getClients();
    const client = clients.find((c) => c.id === invoice.clientId);
    if (!client) throw new Error('Client record for this invoice no longer exists');

    const invoiceTotal = new Decimal(invoice.totalAmount || 0);
    const invoiceTax = new Decimal(invoice.taxTotal || 0);
    // Assumes the additional charge carries the same overall tax ratio as
    // the rest of the invoice — a reasonable default for a same-invoice
    // correction; genuinely different tax treatment should be issued as a
    // new invoice instead.
    const { tax, net } = apportionTax(amount, invoiceTotal, invoiceTax);

    invoice.totalAmount = invoiceTotal.add(amount).toFixed(2);
    invoice.balanceDue = Decimal.max(0, new Decimal(invoice.totalAmount).sub(new Decimal(invoice.amountPaid || 0))).toFixed(2);
    invoice.status = calculateAmountBasedStatus(invoice.totalAmount, invoice.amountPaid);
    invoice.updatedAt = new Date().toISOString();
    StorageService.saveInvoices(invoices);

    client.totalInvoiced = new Decimal(client.totalInvoiced || 0).add(amount).toFixed(2);
    client.outstandingBalance = new Decimal(client.outstandingBalance || 0).add(amount).toFixed(2);
    StorageService.saveClients(clients);

    const existingNumbers = StorageService.getDebitNotes().map((n) => n.debitNoteNumber);
    const biz = StorageService.getBusiness();

    const note: DebitNoteEntity = {
      id: `dbn-${Date.now()}`,
      businessId: biz.id,
      debitNoteNumber: DocumentNumberingEngine.getNextNumberAgainst('DBN', existingNumbers),
      status: 'ISSUED',
      invoiceId: invoice.id,
      invoiceNumber: invoice.documentNumber,
      clientId: client.id,
      clientName: client.name,
      clientKraPin: client.kraPin,
      clientAddress: client.address,
      currency: invoice.currency,
      issueDate: new Date().toISOString().split('T')[0],
      amount: amount.toFixed(2),
      taxAmount: tax.toFixed(2),
      netAmount: net.toFixed(2),
      reason: dto.reason.trim(),
      templateId: invoice.templateId,
      createdAt: new Date().toISOString(),
    };

    const notes = StorageService.getDebitNotes();
    notes.unshift(note);
    StorageService.saveDebitNotes(notes);

    StorageService.logAction(
      StorageService.getCurrentActor(),
      'ISSUE_DEBIT_NOTE',
      'INVOICE',
      invoice.id,
      `Issued debit note ${note.debitNoteNumber} for ${invoice.currency} ${note.amount} against ${invoice.documentNumber}. Reason: ${note.reason}`
    );

    return note;
  }

  public static voidCreditNote(id: string, reason: string): CreditNoteEntity {
    if (!reason?.trim()) throw new Error('A reason is required to void a credit note');
    const notes = StorageService.getCreditNotes();
    const note = notes.find((n) => n.id === id);
    if (!note) throw new Error('Credit note not found');
    AdjustmentNoteStateMachine.assertCanTransition(note.status, 'VOID');

    // Reverse the effect: restore the credited amount back onto the invoice/client.
    const invoices = StorageService.getInvoices();
    const invoice = invoices.find((i) => i.id === note.invoiceId);
    if (invoice) {
      const amount = new Decimal(note.amount);
      invoice.totalAmount = new Decimal(invoice.totalAmount).add(amount).toFixed(2);
      invoice.balanceDue = Decimal.max(0, new Decimal(invoice.totalAmount).sub(new Decimal(invoice.amountPaid || 0))).toFixed(2);
      if (invoice.status !== 'VOID' && invoice.status !== 'CANCELLED') {
        invoice.status = calculateAmountBasedStatus(invoice.totalAmount, invoice.amountPaid);
      }
      StorageService.saveInvoices(invoices);

      const clients = StorageService.getClients();
      const client = clients.find((c) => c.id === invoice.clientId);
      if (client) {
        client.totalInvoiced = new Decimal(client.totalInvoiced || 0).add(amount).toFixed(2);
        client.outstandingBalance = new Decimal(client.outstandingBalance || 0).add(amount).toFixed(2);
        StorageService.saveClients(clients);
      }
    }

    note.status = 'VOID';
    note.reason = `${note.reason} | VOIDED: ${reason.trim()}`;
    StorageService.saveCreditNotes(notes);

    StorageService.logAction(
      StorageService.getCurrentActor(),
      'VOID_CREDIT_NOTE',
      'INVOICE',
      note.invoiceId,
      `Voided credit note ${note.creditNoteNumber}. Reason: ${reason.trim()}`
    );

    return note;
  }

  public static voidDebitNote(id: string, reason: string): DebitNoteEntity {
    if (!reason?.trim()) throw new Error('A reason is required to void a debit note');
    const notes = StorageService.getDebitNotes();
    const note = notes.find((n) => n.id === id);
    if (!note) throw new Error('Debit note not found');
    AdjustmentNoteStateMachine.assertCanTransition(note.status, 'VOID');

    const invoices = StorageService.getInvoices();
    const invoice = invoices.find((i) => i.id === note.invoiceId);
    if (invoice) {
      const amount = new Decimal(note.amount);
      invoice.totalAmount = Decimal.max(0, new Decimal(invoice.totalAmount).sub(amount)).toFixed(2);
      invoice.balanceDue = Decimal.max(0, new Decimal(invoice.totalAmount).sub(new Decimal(invoice.amountPaid || 0))).toFixed(2);
      if (invoice.status !== 'VOID' && invoice.status !== 'CANCELLED') {
        invoice.status = calculateAmountBasedStatus(invoice.totalAmount, invoice.amountPaid);
      }
      StorageService.saveInvoices(invoices);

      const clients = StorageService.getClients();
      const client = clients.find((c) => c.id === invoice.clientId);
      if (client) {
        client.totalInvoiced = Decimal.max(0, new Decimal(client.totalInvoiced || 0).sub(amount)).toFixed(2);
        client.outstandingBalance = Decimal.max(0, new Decimal(client.outstandingBalance || 0).sub(amount)).toFixed(2);
        StorageService.saveClients(clients);
      }
    }

    note.status = 'VOID';
    note.reason = `${note.reason} | VOIDED: ${reason.trim()}`;
    StorageService.saveDebitNotes(notes);

    StorageService.logAction(
      StorageService.getCurrentActor(),
      'VOID_DEBIT_NOTE',
      'INVOICE',
      note.invoiceId,
      `Voided debit note ${note.debitNoteNumber}. Reason: ${reason.trim()}`
    );

    return note;
  }
}

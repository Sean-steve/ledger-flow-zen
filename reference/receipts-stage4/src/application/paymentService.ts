/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Decimal from 'decimal.js';
import { PaymentRecord, ReceiptEntity, PaymentChannel, CurrencyCode, InvoiceEntity, ClientEntity } from '../types';
import { DocumentNumberingEngine } from '../domain/numbering';
import { PaymentStateMachine } from '../domain/stateMachines';
import { calculateAmountBasedStatus } from '../domain/math';
import { StorageService } from '../infrastructure/storage';

export interface RecordPaymentDTO {
  clientId: string;
  invoiceId?: string;
  amount: string;
  currency?: CurrencyCode;
  channel: PaymentChannel;
  channelTransactionId: string;
  payerName?: string;
  payerPhone?: string;
  paymentDate?: string;
  notes?: string;
  autoGenerateReceipt: boolean;
}

/**
 * Applies a signed delta (positive to record a payment, negative to reverse
 * one) to an invoice's amountPaid/balanceDue/status and to the owning
 * client's totalPaid/outstandingBalance. This is the ONLY place either of
 * those mutations should happen — `recordPayment` and `reversePayment` both
 * route through it so the two code paths can never compute status or
 * balance differently from each other.
 */
function applyPaymentDelta(invoice: InvoiceEntity | undefined, client: ClientEntity, delta: Decimal): void {
  if (invoice) {
    const newPaid = Decimal.max(0, new Decimal(invoice.amountPaid || 0).add(delta));
    const invoiceTotal = new Decimal(invoice.totalAmount || 0);
    invoice.amountPaid = newPaid.toFixed(2);
    invoice.balanceDue = Decimal.max(0, invoiceTotal.sub(newPaid)).toFixed(2);

    // Only amount-derivable states are recomputed here; a VOID/CANCELLED
    // invoice keeps its terminal status regardless of payment activity.
    if (invoice.status !== 'VOID' && invoice.status !== 'CANCELLED') {
      invoice.status = calculateAmountBasedStatus(invoice.totalAmount, newPaid.toFixed(2));
    }
    invoice.updatedAt = new Date().toISOString();
  }

  const clientNewPaid = Decimal.max(0, new Decimal(client.totalPaid || 0).add(delta));
  client.totalPaid = clientNewPaid.toFixed(2);
  client.outstandingBalance = Decimal.max(0, new Decimal(client.totalInvoiced || 0).sub(clientNewPaid)).toFixed(2);
}

export class PaymentService {
  public static recordPayment(dto: RecordPaymentDTO): { payment: PaymentRecord; receipt?: ReceiptEntity } {
    const clients = StorageService.getClients();
    const client = clients.find((c) => c.id === dto.clientId);
    if (!client) throw new Error('Client record not found');

    const biz = StorageService.getBusiness();
    const paymentAmount = new Decimal(dto.amount || 0);

    if (paymentAmount.lte(0)) {
      throw new Error('Payment amount must be greater than zero');
    }
    if (!dto.channelTransactionId?.trim()) {
      throw new Error('A payment channel reference is required to record a settlement');
    }

    const payDate = dto.paymentDate || new Date().toISOString();

    let invoiceNumber: string | undefined;
    const invoices = StorageService.getInvoices();
    let targetInvoice = dto.invoiceId ? invoices.find((i) => i.id === dto.invoiceId) : undefined;

    if (dto.invoiceId && !targetInvoice) {
      throw new Error('Target invoice not found');
    }
    if (targetInvoice && (targetInvoice.status === 'VOID' || targetInvoice.status === 'CANCELLED')) {
      throw new Error(`Cannot record a payment against a ${targetInvoice.status.toLowerCase()} invoice`);
    }
    if (targetInvoice) {
      const currentBalance = new Decimal(targetInvoice.balanceDue || 0);
      if (paymentAmount.gt(currentBalance)) {
        throw new Error(
          `Settlement amount (${paymentAmount.toFixed(2)}) exceeds the outstanding balance (${currentBalance.toFixed(
            2
          )}) on ${targetInvoice.documentNumber}. Record the excess as an unallocated payment, or issue a credit note instead of overpaying.`
        );
      }
    }

    const paymentNumber = DocumentNumberingEngine.getNextNumber('PAY');

    if (targetInvoice) {
      invoiceNumber = targetInvoice.documentNumber;
      applyPaymentDelta(targetInvoice, client, paymentAmount);
      StorageService.saveInvoices(invoices);
    } else {
      applyPaymentDelta(undefined, client, paymentAmount);
    }
    StorageService.saveClients(clients);

    const paymentRecord: PaymentRecord = {
      id: `pay-${Date.now()}`,
      businessId: biz.id,
      paymentReference: paymentNumber,
      channel: dto.channel,
      channelTransactionId: dto.channelTransactionId,
      clientId: client.id,
      clientName: client.name,
      invoiceId: targetInvoice?.id,
      invoiceNumber: invoiceNumber,
      amount: paymentAmount.toFixed(2),
      currency: dto.currency || client.currency,
      exchangeRate: '1.00',
      paymentDate: payDate,
      status: 'COMPLETED',
      payerName: dto.payerName || client.name,
      payerPhone: dto.payerPhone,
      notes: dto.notes,
      createdAt: new Date().toISOString(),
    };

    let receipt: ReceiptEntity | undefined;

    if (dto.autoGenerateReceipt) {
      const receiptNumber = DocumentNumberingEngine.getNextNumber('RCT');
      receipt = {
        id: `rct-${Date.now()}`,
        businessId: biz.id,
        receiptNumber: receiptNumber,
        invoiceId: targetInvoice?.id,
        invoiceNumber: invoiceNumber,
        paymentId: paymentRecord.id,
        clientId: client.id,
        clientName: client.name,
        clientKraPin: client.kraPin,
        amountPaid: paymentAmount.toFixed(2),
        currency: dto.currency || client.currency,
        paymentChannel: dto.channel,
        channelReference: dto.channelTransactionId,
        paymentDate: payDate,
        receivedBy: StorageService.getCurrentActor(),
        notes: dto.notes || `Settlement for ${client.name}`,
        templateId: targetInvoice?.templateId || StorageService.getActiveTemplate(),
        createdAt: new Date().toISOString(),
      };

      paymentRecord.receiptId = receipt.id;
      paymentRecord.receiptNumber = receipt.receiptNumber;

      const receipts = StorageService.getReceipts();
      receipts.unshift(receipt);
      StorageService.saveReceipts(receipts);

      StorageService.logAction(
        StorageService.getCurrentActor(),
        'ISSUE_RECEIPT',
        'RECEIPT',
        receipt.id,
        `Generated Official Receipt ${receipt.receiptNumber} for payment ${paymentRecord.paymentReference}.`
      );
    }

    const payments = StorageService.getPayments();
    payments.unshift(paymentRecord);
    StorageService.savePayments(payments);

    StorageService.logAction(
      StorageService.getCurrentActor(),
      'RECORD_PAYMENT',
      'PAYMENT',
      paymentRecord.id,
      `Recorded ${dto.channel} settlement of ${paymentRecord.currency} ${paymentRecord.amount} (Ref: ${dto.channelTransactionId}).`
    );

    return { payment: paymentRecord, receipt };
  }

  /**
   * Reverses a completed/reconciled payment: rolls back the exact amount
   * from the linked invoice's amountPaid/balanceDue/status and from the
   * client's totalPaid/outstandingBalance, marks the payment REVERSED, and
   * records the reason in the audit log.
   *
   * The receipt (if one was issued) is NOT deleted or mutated — a receipt
   * is proof that a payment was received and receipted at the time it
   * happened, and stays on record for audit purposes. Its continued
   * existence alongside a reversed payment is intentional and is visible
   * to the operator, not concealed.
   */
  public static reversePayment(paymentId: string, reason: string): PaymentRecord {
    if (!reason?.trim()) {
      throw new Error('A reason is required to reverse a payment');
    }

    const payments = StorageService.getPayments();
    const payment = payments.find((p) => p.id === paymentId);
    if (!payment) throw new Error('Payment record not found');

    if (!PaymentStateMachine.canTransition(payment.status, 'REVERSED')) {
      throw new Error(`Cannot reverse a payment in ${payment.status} status`);
    }

    const clients = StorageService.getClients();
    const client = clients.find((c) => c.id === payment.clientId);
    if (!client) throw new Error('Client record for this payment no longer exists');

    const invoices = StorageService.getInvoices();
    const invoice = payment.invoiceId ? invoices.find((i) => i.id === payment.invoiceId) : undefined;

    const amount = new Decimal(payment.amount || 0);
    applyPaymentDelta(invoice, client, amount.negated());

    if (invoice) StorageService.saveInvoices(invoices);
    StorageService.saveClients(clients);

    payment.status = 'REVERSED';
    payment.notes = [payment.notes, `REVERSED: ${reason.trim()}`].filter(Boolean).join(' | ');
    StorageService.savePayments(payments);

    StorageService.logAction(
      StorageService.getCurrentActor(),
      'REVERSE_PAYMENT',
      'PAYMENT',
      payment.id,
      `Reversed ${payment.currency} ${payment.amount} settlement (Ref: ${payment.channelTransactionId}). Reason: ${reason.trim()}`
    );

    return payment;
  }
}

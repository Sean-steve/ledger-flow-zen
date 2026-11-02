import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentService } from './documentService';
import { PaymentService } from './paymentService';
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

describe('PaymentService.recordPayment', () => {
  beforeEach(resetWorkspace);

  it('requires a channel transaction reference', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00');
    expect(() =>
      PaymentService.recordPayment({
        clientId: client.id,
        invoiceId: invoice.id,
        amount: '500',
        channel: 'MPESA_C2B',
        channelTransactionId: '',
        autoGenerateReceipt: false,
      })
    ).toThrow(/reference/);
  });

  it('refuses a payment that exceeds the invoice balance (overpayment guard)', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00'); // balance = 1160.00
    expect(() =>
      PaymentService.recordPayment({
        clientId: client.id,
        invoiceId: invoice.id,
        amount: '2000.00',
        channel: 'MPESA_C2B',
        channelTransactionId: 'QDF1234XY',
        autoGenerateReceipt: false,
      })
    ).toThrow(/exceeds the outstanding balance/);
  });

  it('applies a partial payment and moves the invoice to PARTIALLY_PAID', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00'); // total 1160.00

    const { payment, receipt } = PaymentService.recordPayment({
      clientId: client.id,
      invoiceId: invoice.id,
      amount: '500.00',
      channel: 'MPESA_C2B',
      channelTransactionId: 'QDF1234XY',
      autoGenerateReceipt: true,
    });

    expect(payment.amount).toBe('500.00');
    expect(receipt).toBeDefined();
    expect(receipt!.amountPaid).toBe('500.00');

    const updatedInvoice = StorageService.getInvoices().find((i) => i.id === invoice.id)!;
    expect(updatedInvoice.amountPaid).toBe('500.00');
    expect(updatedInvoice.balanceDue).toBe('660.00');
    expect(updatedInvoice.status).toBe('PARTIALLY_PAID');

    const updatedClient = StorageService.getClients().find((c) => c.id === client.id)!;
    expect(updatedClient.totalPaid).toBe('500.00');
    expect(updatedClient.outstandingBalance).toBe('660.00');
  });

  it('moves the invoice to PAID once the full balance is settled', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00'); // total 1160.00

    PaymentService.recordPayment({
      clientId: client.id,
      invoiceId: invoice.id,
      amount: '1160.00',
      channel: 'BANK_TRANSFER',
      channelTransactionId: 'TXN-998877',
      autoGenerateReceipt: false,
    });

    const updatedInvoice = StorageService.getInvoices().find((i) => i.id === invoice.id)!;
    expect(updatedInvoice.status).toBe('PAID');
    expect(updatedInvoice.balanceDue).toBe('0.00');
  });
});

describe('PaymentService.reversePayment', () => {
  beforeEach(resetWorkspace);

  it('rolls back the invoice and client balances to their pre-payment state', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00'); // total 1160.00

    const { payment } = PaymentService.recordPayment({
      clientId: client.id,
      invoiceId: invoice.id,
      amount: '1160.00',
      channel: 'MPESA_C2B',
      channelTransactionId: 'QDF9999ZZ',
      autoGenerateReceipt: true,
    });

    // Sanity check the payment actually applied
    let updatedInvoice = StorageService.getInvoices().find((i) => i.id === invoice.id)!;
    expect(updatedInvoice.status).toBe('PAID');

    PaymentService.reversePayment(payment.id, 'Duplicate M-Pesa confirmation');

    updatedInvoice = StorageService.getInvoices().find((i) => i.id === invoice.id)!;
    expect(updatedInvoice.amountPaid).toBe('0.00');
    expect(updatedInvoice.balanceDue).toBe('1160.00');
    expect(updatedInvoice.status).toBe('ISSUED');

    const updatedClient = StorageService.getClients().find((c) => c.id === client.id)!;
    expect(updatedClient.totalPaid).toBe('0.00');
    expect(updatedClient.outstandingBalance).toBe('1160.00');

    const reversedPayment = StorageService.getPayments().find((p) => p.id === payment.id)!;
    expect(reversedPayment.status).toBe('REVERSED');
  });

  it('keeps the original receipt on record after a reversal (audit trail, not deleted)', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00');

    const { payment, receipt } = PaymentService.recordPayment({
      clientId: client.id,
      invoiceId: invoice.id,
      amount: '1160.00',
      channel: 'MPESA_C2B',
      channelTransactionId: 'QDF1122AA',
      autoGenerateReceipt: true,
    });

    PaymentService.reversePayment(payment.id, 'Chargeback');

    const receipts = StorageService.getReceipts();
    expect(receipts.find((r) => r.id === receipt!.id)).toBeDefined();
  });

  it('will not reverse an already-reversed payment', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00');
    const { payment } = PaymentService.recordPayment({
      clientId: client.id,
      invoiceId: invoice.id,
      amount: '500.00',
      channel: 'CASH',
      channelTransactionId: 'CASH-0001',
      autoGenerateReceipt: false,
    });

    PaymentService.reversePayment(payment.id, 'First reversal');
    expect(() => PaymentService.reversePayment(payment.id, 'Second attempt')).toThrow();
  });

  it('requires a reason to reverse', () => {
    seedBusiness();
    const client = seedClient();
    const invoice = issueTestInvoice(client.id, '1000.00');
    const { payment } = PaymentService.recordPayment({
      clientId: client.id,
      invoiceId: invoice.id,
      amount: '500.00',
      channel: 'CASH',
      channelTransactionId: 'CASH-0002',
      autoGenerateReceipt: false,
    });
    expect(() => PaymentService.reversePayment(payment.id, '')).toThrow(/reason/);
  });
});

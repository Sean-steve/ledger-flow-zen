/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Decimal from 'decimal.js';
import { StorageService } from '../infrastructure/storage';
import { CurrencyCode } from '../types';

export interface DashboardMetrics {
  totalInvoiced: string;
  moneyCollected: string;
  outstanding: string;
  overdueAction: string;
  netCashPosition: string;
  /** Signed percentage vs. the prior 30-day window, or null when there isn't enough history to compare. */
  totalInvoicedDeltaPct: number | null;
  moneyCollectedDeltaPct: number | null;
  outstandingDeltaPct: number | null;
  /** Currencies with real invoice/payment activity that are NOT included in these totals, because they don't
   *  match the selected currency and this workspace does not fabricate a cross-currency conversion rate. */
  otherCurrenciesWithActivity: CurrencyCode[];
}

export interface DebtorSummary {
  clientId: string;
  clientName: string;
  outstanding: string;
  currency: CurrencyCode;
  oldestDueDate: string;
  daysOverdue: number;
  riskCategory: 'LOW' | 'MEDIUM' | 'HIGH';
}

function pctChange(current: Decimal, prior: Decimal): number | null {
  if (prior.eq(0)) return null; // no baseline to compare against — don't fabricate a percentage
  return current.sub(prior).div(prior).mul(100).toDecimalPlaces(1).toNumber();
}

export class ReportingService {
  /**
   * All totals are computed from invoices/payments whose currency matches
   * `selectedCurrency` ONLY. Previously this summed every invoice
   * regardless of currency and labeled the blended total with whatever
   * currency happened to be selected — silently mixing KES, USD, EUR, GBP
   * amounts together. Rather than fabricate an exchange rate, activity in
   * other currencies is surfaced separately via `otherCurrenciesWithActivity`
   * so the operator can see it isn't being ignored, just not blended.
   */
  public static getDashboardMetrics(selectedCurrency: CurrencyCode = 'KES'): DashboardMetrics {
    const allInvoices = StorageService.getInvoices();
    const allPayments = StorageService.getPayments();

    const invoices = allInvoices.filter((i) => i.currency === selectedCurrency);
    const payments = allPayments.filter((p) => p.currency === selectedCurrency);

    const otherCurrencies = new Set<CurrencyCode>();
    for (const i of allInvoices) if (i.currency !== selectedCurrency) otherCurrencies.add(i.currency);
    for (const p of allPayments) if (p.currency !== selectedCurrency) otherCurrencies.add(p.currency);

    let invoicedDec = new Decimal(0);
    let collectedDec = new Decimal(0);
    let outstandingDec = new Decimal(0);
    let overdueDec = new Decimal(0);

    const now = new Date();

    for (const inv of invoices) {
      if (inv.status === 'VOID' || inv.status === 'CANCELLED') continue;

      const invTotal = new Decimal(inv.totalAmount || 0);
      const invBal = new Decimal(inv.balanceDue || 0);
      const invPaid = new Decimal(inv.amountPaid || 0);

      invoicedDec = invoicedDec.add(invTotal);
      collectedDec = collectedDec.add(invPaid);
      outstandingDec = outstandingDec.add(invBal);

      const dueDate = new Date(inv.dueDate);
      if (invBal.gt(0) && dueDate < now) {
        overdueDec = overdueDec.add(invBal);
      }
    }

    let totalPaymentsReceived = new Decimal(0);
    for (const pay of payments) {
      if (pay.status === 'COMPLETED' || pay.status === 'RECONCILED') {
        totalPaymentsReceived = totalPaymentsReceived.add(new Decimal(pay.amount || 0));
      }
    }

    // Real period-over-period comparison: current 30-day window vs. the 30
    // days before that, based on actual issueDate/paymentDate — not a
    // hardcoded percentage.
    const windowMs = 30 * 24 * 60 * 60 * 1000;
    const currentStart = new Date(now.getTime() - windowMs);
    const priorStart = new Date(now.getTime() - windowMs * 2);

    let invoicedCurrent = new Decimal(0);
    let invoicedPrior = new Decimal(0);
    for (const inv of invoices) {
      if (inv.status === 'VOID' || inv.status === 'CANCELLED') continue;
      const issued = new Date(inv.issueDate);
      const amt = new Decimal(inv.totalAmount || 0);
      if (issued >= currentStart && issued <= now) invoicedCurrent = invoicedCurrent.add(amt);
      else if (issued >= priorStart && issued < currentStart) invoicedPrior = invoicedPrior.add(amt);
    }

    let collectedCurrent = new Decimal(0);
    let collectedPrior = new Decimal(0);
    for (const pay of payments) {
      if (pay.status !== 'COMPLETED' && pay.status !== 'RECONCILED') continue;
      const paidOn = new Date(pay.paymentDate);
      const amt = new Decimal(pay.amount || 0);
      if (paidOn >= currentStart && paidOn <= now) collectedCurrent = collectedCurrent.add(amt);
      else if (paidOn >= priorStart && paidOn < currentStart) collectedPrior = collectedPrior.add(amt);
    }

    return {
      totalInvoiced: invoicedDec.toFixed(2),
      moneyCollected: collectedDec.toFixed(2),
      outstanding: outstandingDec.toFixed(2),
      overdueAction: overdueDec.toFixed(2),
      netCashPosition: totalPaymentsReceived.toFixed(2),
      totalInvoicedDeltaPct: pctChange(invoicedCurrent, invoicedPrior),
      moneyCollectedDeltaPct: pctChange(collectedCurrent, collectedPrior),
      outstandingDeltaPct: null, // outstanding is a point-in-time balance, not a period flow — no meaningful "delta" without a snapshot history we don't keep
      otherCurrenciesWithActivity: Array.from(otherCurrencies),
    };
  }

  public static getTopDebtors(selectedCurrency: CurrencyCode = 'KES'): DebtorSummary[] {
    const clients = StorageService.getClients().filter((c) => c.currency === selectedCurrency);
    const invoices = StorageService.getInvoices();
    const now = new Date();

    const debtors: DebtorSummary[] = [];

    for (const client of clients) {
      const clientInvoices = invoices.filter(
        (i) => i.clientId === client.id && i.status !== 'VOID' && i.status !== 'CANCELLED' && new Decimal(i.balanceDue || 0).gt(0)
      );
      if (clientInvoices.length === 0) continue;

      let totalOutstanding = new Decimal(0);
      let oldestDue = new Date(clientInvoices[0].dueDate);

      for (const inv of clientInvoices) {
        totalOutstanding = totalOutstanding.add(new Decimal(inv.balanceDue || 0));
        const d = new Date(inv.dueDate);
        if (d < oldestDue) oldestDue = d;
      }

      const diffTime = now.getTime() - oldestDue.getTime();
      const daysOverdue = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

      let riskCategory: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      if (daysOverdue > 30) riskCategory = 'HIGH';
      else if (daysOverdue > 0) riskCategory = 'MEDIUM';

      debtors.push({
        clientId: client.id,
        clientName: client.name,
        outstanding: totalOutstanding.toFixed(2),
        currency: client.currency,
        oldestDueDate: oldestDue.toISOString().split('T')[0],
        daysOverdue,
        riskCategory,
      });
    }

    return debtors.sort((a, b) => new Decimal(b.outstanding).sub(new Decimal(a.outstanding)).toNumber());
  }
}

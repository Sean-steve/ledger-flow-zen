/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Decimal from 'decimal.js';
import { LineItem, TaxCategory, DocumentTaxBreakdown, CurrencyCode } from '../types';

// Configure Decimal precision and rounding mode according to standard banking principles
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

/**
 * Calculates financial amounts for a single line item without floating-point errors.
 */
export function calculateLineItem(
  quantityInput: string | number,
  unitPriceInput: string | number,
  discountPercentageInput: string | number = 0,
  taxCategory: TaxCategory = 'VAT_16',
  customTaxRate?: string | number
): {
  grossAmount: string;
  discountAmount: string;
  taxableAmount: string;
  taxAmount: string;
  netAmount: string;
  taxRate: string;
} {
  const qty = new Decimal(quantityInput || 0);
  const price = new Decimal(unitPriceInput || 0);
  const discountPct = new Decimal(discountPercentageInput || 0);

  const gross = qty.mul(price);
  const discountAmount = gross.mul(discountPct.div(100));
  const taxable = Decimal.max(0, gross.sub(discountAmount));

  let taxRateDecimal = new Decimal(0.16);
  if (taxCategory === 'ZERO_RATED' || taxCategory === 'EXEMPT') {
    taxRateDecimal = new Decimal(0);
  } else if (customTaxRate !== undefined) {
    taxRateDecimal = new Decimal(customTaxRate);
  }

  const taxAmount = taxable.mul(taxRateDecimal);
  const netAmount = taxable.add(taxAmount);

  return {
    grossAmount: gross.toFixed(2),
    discountAmount: discountAmount.toFixed(2),
    taxableAmount: taxable.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    netAmount: netAmount.toFixed(2),
    taxRate: taxRateDecimal.toFixed(4),
  };
}

/**
 * Calculates complete document totals, multi-tax breakdowns, and optional Withholding Tax (WHT).
 */
export function calculateDocumentTotals(
  items: LineItem[],
  withholdingTaxDeductible: boolean = false,
  withholdingTaxRate: string | number = '0.05'
): {
  subtotal: string;
  taxTotal: string;
  taxBreakdowns: DocumentTaxBreakdown[];
  withholdingTaxAmount: string;
  totalAmount: string;
} {
  let subtotalDec = new Decimal(0);
  let taxTotalDec = new Decimal(0);

  const breakdownMap = new Map<TaxCategory, { taxable: Decimal; tax: Decimal; rate: Decimal }>();

  for (const item of items) {
    const itemSubtotal = new Decimal(item.grossAmount || 0);
    const itemTax = new Decimal(item.taxAmount || 0);

    subtotalDec = subtotalDec.add(itemSubtotal);
    taxTotalDec = taxTotalDec.add(itemTax);

    const current = breakdownMap.get(item.taxCategory) || {
      taxable: new Decimal(0),
      tax: new Decimal(0),
      rate: new Decimal(item.taxRate || (item.taxCategory === 'VAT_16' ? 0.16 : 0)),
    };
    current.taxable = current.taxable.add(new Decimal(item.grossAmount || 0));
    current.tax = current.tax.add(itemTax);
    breakdownMap.set(item.taxCategory, current);
  }

  const taxBreakdowns: DocumentTaxBreakdown[] = Array.from(breakdownMap.entries()).map(([cat, val]) => ({
    category: cat,
    rate: val.rate.toFixed(2),
    taxableAmount: val.taxable.toFixed(2),
    taxAmount: val.tax.toFixed(2),
  }));

  const grossTotal = subtotalDec.add(taxTotalDec);
  let whtAmountDec = new Decimal(0);

  if (withholdingTaxDeductible) {
    const whtRateDec = new Decimal(withholdingTaxRate || 0.05);
    // In Kenyan jurisdiction, WHT (typically 5% on professional services) is levied on the taxable base (exclusive of VAT)
    whtAmountDec = subtotalDec.mul(whtRateDec);
  }

  const netPayable = Decimal.max(0, grossTotal.sub(whtAmountDec));

  return {
    subtotal: subtotalDec.toFixed(2),
    taxTotal: taxTotalDec.toFixed(2),
    taxBreakdowns,
    withholdingTaxAmount: whtAmountDec.toFixed(2),
    totalAmount: netPayable.toFixed(2),
  };
}

/**
 * Calculates remaining balance after a payment is applied. Never negative —
 * an amountPaid greater than totalAmount represents a credit/overpayment
 * that is tracked on amountPaid itself, not reflected as a negative balance.
 */
export function calculateBalanceDue(totalAmount: string | number, amountPaid: string | number): string {
  const total = new Decimal(totalAmount || 0);
  const paid = new Decimal(amountPaid || 0);
  return Decimal.max(0, total.sub(paid)).toFixed(2);
}

/**
 * Derives an invoice's payment-related status purely from its totals and
 * amount paid. Centralized so PaymentService's "record payment" and
 * "reverse payment" paths (and anywhere else that mutates amountPaid)
 * compute status identically instead of duplicating this branch — a prior
 * source of drift where a reversal could leave status and balance
 * inconsistent with each other.
 *
 * Only returns one of the three states derivable from amounts alone.
 * Callers are responsible for preserving states this function has no basis
 * to infer (VOID, CANCELLED, OVERDUE, VIEWED).
 */
export function calculateAmountBasedStatus(
  totalAmount: string | number,
  amountPaid: string | number
): 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' {
  const total = new Decimal(totalAmount || 0);
  const paid = new Decimal(amountPaid || 0);
  if (paid.lte(0)) return 'ISSUED';
  if (paid.gte(total)) return 'PAID';
  return 'PARTIALLY_PAID';
}

/**
 * Safe formatting helper for financial displays with currency symbol.
 */
export function formatCurrency(amount: string | number, currency: CurrencyCode = 'KES'): string {
  try {
    const dec = new Decimal(amount || 0);
    const formatted = dec.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${currency} ${formatted}`;
  } catch {
    return `${currency} 0.00`;
  }
}

/**
 * Safe currency conversion with exchange rate.
 */
export function convertCurrency(
  amount: string | number,
  exchangeRateToBase: string | number,
  targetExchangeRate: string | number
): string {
  const decAmount = new Decimal(amount || 0);
  const toBase = decAmount.mul(new Decimal(exchangeRateToBase || 1));
  const toTarget = toBase.div(new Decimal(targetExchangeRate || 1));
  return toTarget.toFixed(2);
}

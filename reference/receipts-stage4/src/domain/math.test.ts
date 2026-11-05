import { describe, it, expect } from 'vitest';
import {
  calculateLineItem,
  calculateDocumentTotals,
  calculateBalanceDue,
  calculateAmountBasedStatus,
} from './math';
import { LineItem } from '../types';

describe('calculateLineItem', () => {
  it('computes VAT at 16% correctly with no discount', () => {
    const result = calculateLineItem(2, 1000, 0, 'VAT_16');
    expect(result.grossAmount).toBe('2000.00');
    expect(result.taxableAmount).toBe('2000.00');
    expect(result.taxAmount).toBe('320.00');
    expect(result.netAmount).toBe('2320.00');
  });

  it('applies a percentage discount before computing tax', () => {
    const result = calculateLineItem(1, 1000, 10, 'VAT_16');
    // 1000 - 10% = 900 taxable, VAT 16% of 900 = 144
    expect(result.taxableAmount).toBe('900.00');
    expect(result.taxAmount).toBe('144.00');
    expect(result.netAmount).toBe('1044.00');
  });

  it('charges zero tax for zero-rated and exempt categories', () => {
    const zeroRated = calculateLineItem(1, 500, 0, 'ZERO_RATED');
    const exempt = calculateLineItem(1, 500, 0, 'EXEMPT');
    expect(zeroRated.taxAmount).toBe('0.00');
    expect(exempt.taxAmount).toBe('0.00');
    expect(zeroRated.netAmount).toBe('500.00');
  });

  it('never produces a negative taxable amount even with a >100% discount input', () => {
    const result = calculateLineItem(1, 100, 150, 'VAT_16');
    expect(Number(result.taxableAmount)).toBeGreaterThanOrEqual(0);
  });

  it('avoids floating point drift across many fractional line items', () => {
    // 0.1 + 0.2 famously != 0.3 in IEEE754 floats — Decimal.js should not have this problem.
    const a = calculateLineItem('1', '0.10', 0, 'ZERO_RATED');
    const b = calculateLineItem('1', '0.20', 0, 'ZERO_RATED');
    const sum = (Number(a.netAmount) + Number(b.netAmount)).toFixed(2);
    expect(sum).toBe('0.30');
  });
});

interface ItemOverrides {
  id?: string;
  quantity?: number;
  unitPrice?: number;
  taxCategory?: LineItem['taxCategory'];
}

function makeItem(overrides: ItemOverrides = {}): LineItem {
  const base = calculateLineItem(overrides.quantity || 1, overrides.unitPrice || 1000, 0, overrides.taxCategory || 'VAT_16');
  return {
    id: overrides.id || 'item-1',
    description: 'Test item',
    quantity: String(overrides.quantity || 1),
    unit: 'Unit',
    unitPrice: String(overrides.unitPrice || 1000),
    discountPercentage: '0',
    taxCategory: overrides.taxCategory || 'VAT_16',
    taxRate: base.taxRate,
    grossAmount: base.grossAmount,
    taxAmount: base.taxAmount,
    netAmount: base.netAmount,
  };
}

describe('calculateDocumentTotals', () => {
  it('sums multiple line items into a single subtotal/tax/total', () => {
    const items = [makeItem({ unitPrice: 1000 }), makeItem({ unitPrice: 2000 })];
    const totals = calculateDocumentTotals(items, false);
    expect(totals.subtotal).toBe('3000.00');
    expect(totals.taxTotal).toBe('480.00');
    expect(totals.totalAmount).toBe('3480.00');
  });

  it('produces a separate tax breakdown bucket per tax category', () => {
    const items = [makeItem({ unitPrice: 1000, taxCategory: 'VAT_16' }), makeItem({ unitPrice: 500, taxCategory: 'ZERO_RATED' })];
    const totals = calculateDocumentTotals(items, false);
    const categories = totals.taxBreakdowns.map((b) => b.category).sort();
    expect(categories).toEqual(['VAT_16', 'ZERO_RATED']);
    const vatBucket = totals.taxBreakdowns.find((b) => b.category === 'VAT_16')!;
    expect(vatBucket.taxAmount).toBe('160.00');
  });

  it('deducts withholding tax from the payable total when enabled', () => {
    const items = [makeItem({ unitPrice: 1000, taxCategory: 'ZERO_RATED' })];
    const totals = calculateDocumentTotals(items, true, '0.05');
    expect(totals.withholdingTaxAmount).toBe('50.00');
    // Net payable should be subtotal + tax - WHT
    expect(totals.totalAmount).toBe('950.00');
  });
});

describe('calculateBalanceDue', () => {
  it('subtracts amount paid from total', () => {
    expect(calculateBalanceDue('1000.00', '400.00')).toBe('600.00');
  });

  it('never goes negative on an overpayment', () => {
    expect(calculateBalanceDue('1000.00', '1500.00')).toBe('0.00');
  });
});

describe('calculateAmountBasedStatus', () => {
  it('returns ISSUED when nothing has been paid', () => {
    expect(calculateAmountBasedStatus('1000.00', '0.00')).toBe('ISSUED');
  });

  it('returns PARTIALLY_PAID for a partial payment', () => {
    expect(calculateAmountBasedStatus('1000.00', '400.00')).toBe('PARTIALLY_PAID');
  });

  it('returns PAID once amount paid meets or exceeds the total', () => {
    expect(calculateAmountBasedStatus('1000.00', '1000.00')).toBe('PAID');
    expect(calculateAmountBasedStatus('1000.00', '1200.00')).toBe('PAID');
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { StorageService } from '../../infrastructure/storage';
import { formatCurrency } from '../../domain/math';
import { CurrencyCode } from '../../types';
import { ShieldCheck, Printer, Download, Info } from 'lucide-react';

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const ReportsView: React.FC = () => {
  const [currency, setCurrency] = useState<CurrencyCode>('KES');
  const allInvoices = StorageService.getInvoices();
  const biz = StorageService.getBusiness();

  // Only invoices in the selected currency are aggregated — previously this
  // summed every invoice regardless of currency into one total labeled
  // "KES", silently blending KES/USD/EUR/GBP amounts together.
  const invoices = allInvoices.filter((i) => i.currency === currency);
  const otherCurrencies = Array.from(new Set(allInvoices.filter((i) => i.currency !== currency).map((i) => i.currency)));

  let totalNetSales = new Decimal(0);
  let totalVatOutput = new Decimal(0);
  let totalWhtDeducted = new Decimal(0);

  for (const inv of invoices) {
    if (inv.status === 'VOID' || inv.status === 'CANCELLED') continue;
    totalNetSales = totalNetSales.add(new Decimal(inv.subtotal || 0));
    totalVatOutput = totalVatOutput.add(new Decimal(inv.taxTotal || 0));
    totalWhtDeducted = totalWhtDeducted.add(new Decimal(inv.withholdingTaxAmount || 0));
  }

  const now = new Date().getTime();
  let current030 = new Decimal(0);
  let overdue130 = new Decimal(0);
  let overdue3160 = new Decimal(0);
  let overdue60Plus = new Decimal(0);

  const agingRows: (string | number)[][] = [['Invoice', 'Client', 'Due Date', 'Days Overdue', 'Balance Due', 'Currency']];

  for (const inv of invoices) {
    if (inv.status === 'VOID' || inv.status === 'CANCELLED') continue;
    const bal = new Decimal(inv.balanceDue || 0);
    if (bal.lte(0)) continue;

    const due = new Date(inv.dueDate).getTime();
    const diffDays = Math.floor((now - due) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) current030 = current030.add(bal);
    else if (diffDays <= 30) overdue130 = overdue130.add(bal);
    else if (diffDays <= 60) overdue3160 = overdue3160.add(bal);
    else overdue60Plus = overdue60Plus.add(bal);

    agingRows.push([inv.documentNumber, inv.clientName, inv.dueDate, Math.max(0, diffDays), bal.toFixed(2), inv.currency]);
  }

  const vatRows: (string | number)[][] = [
    ['Invoice', 'Client', 'Issue Date', 'Subtotal', 'VAT/Tax', 'WHT Deducted', 'Currency'],
    ...invoices
      .filter((i) => i.status !== 'VOID' && i.status !== 'CANCELLED')
      .map((i) => [i.documentNumber, i.clientName, i.issueDate, i.subtotal, i.taxTotal, i.withholdingTaxAmount, i.currency]),
  ];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto text-slate-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Treasury & Tax Analytics</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Internal working schedules for VAT exposure, aged receivables, and cash movement — not a filed return.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs">
            {(['KES', 'USD', 'EUR', 'GBP'] as CurrencyCode[]).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                  currency === c ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-slate-700 transition self-start sm:self-auto"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {otherCurrencies.length > 0 && (
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
          <Info className="w-3.5 h-3.5 shrink-0 text-slate-500" />
          <span>
            Showing {currency} only. This workspace also has invoices in {otherCurrencies.join(', ')} — switch
            currency above to view them (amounts are never converted or blended together).
          </span>
        </div>
      )}

      {/* VAT Working Schedule */}
      <div className="p-6 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-bold text-white">VAT Exposure Working Schedule ({currency})</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-400">PIN: {biz.kraPin || 'Not configured'}</span>
            <button
              onClick={() => downloadCsv(`vat-schedule-${currency}.csv`, vatRows)}
              className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
        </div>

        <p className="text-[10px] text-slate-500 -mt-2">
          Computed directly from issued invoices in this workspace. This is a working figure for internal review — it
          is not a filed KRA return and no live eTIMS/iTax transmission is performed.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-slate-400">Total Taxable Sales (Net Excl. Tax)</span>
            <p className="text-xl font-bold text-white font-mono-nums mt-1">
              {formatCurrency(totalNetSales.toFixed(2), currency)}
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-slate-400">Output VAT / Tax</span>
            <p className="text-xl font-bold text-indigo-400 font-mono-nums mt-1">
              {formatCurrency(totalVatOutput.toFixed(2), currency)}
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-slate-400">Withholding Tax Deducted</span>
            <p className="text-xl font-bold text-amber-400 font-mono-nums mt-1">
              {formatCurrency(totalWhtDeducted.toFixed(2), currency)}
            </p>
          </div>
        </div>
      </div>

      {/* Aged Receivables Schedule */}
      <div className="p-6 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold text-white tracking-tight">Aged Receivables Portfolio ({currency})</h2>
          <button
            onClick={() => downloadCsv(`aging-schedule-${currency}.csv`, agingRows)}
            className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-emerald-400 font-semibold">Current (Within Terms)</span>
            <p className="text-lg font-bold text-white font-mono-nums mt-1">
              {formatCurrency(current030.toFixed(2), currency)}
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-amber-400 font-semibold">1 – 30 Days Overdue</span>
            <p className="text-lg font-bold text-white font-mono-nums mt-1">
              {formatCurrency(overdue130.toFixed(2), currency)}
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-orange-400 font-semibold">31 – 60 Days Overdue</span>
            <p className="text-lg font-bold text-white font-mono-nums mt-1">
              {formatCurrency(overdue3160.toFixed(2), currency)}
            </p>
          </div>

          <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800">
            <span className="text-rose-400 font-semibold">60+ Days Critical</span>
            <p className="text-lg font-bold text-rose-400 font-mono-nums mt-1">
              {formatCurrency(overdue60Plus.toFixed(2), currency)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

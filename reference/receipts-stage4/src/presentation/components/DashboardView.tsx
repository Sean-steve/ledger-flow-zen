/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CurrencyCode, InvoiceEntity, PaymentRecord } from '../../types';
import { ReportingService } from '../../application/reportingService';
import { StorageService } from '../../infrastructure/storage';
import { formatCurrency } from '../../domain/math';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  FilePlus,
  CreditCard,
  Receipt,
  FileSpreadsheet,
  UserPlus,
  ArrowUpRight,
  ArrowDownRight,
  Building,
  Smartphone,
  CheckCircle2,
  Info,
} from 'lucide-react';

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="inline-flex items-center text-[11px] font-semibold text-slate-500 gap-0.5">
        <Minus className="w-3 h-3" />
        No baseline
      </span>
    );
  }
  const isUp = pct >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold gap-0.5 ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
      <Icon className="w-3 h-3" />
      {isUp ? '+' : ''}
      {pct}%
    </span>
  );
}

interface DashboardViewProps {
  selectedCurrency: CurrencyCode;
  invoices: InvoiceEntity[];
  payments: PaymentRecord[];
  onOpenCreateInvoice: () => void;
  onOpenRecordPayment: (invoiceId?: string) => void;
  onOpenCreateQuote: () => void;
  onNavigate: (view: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  selectedCurrency,
  invoices,
  payments,
  onOpenCreateInvoice,
  onOpenRecordPayment,
  onOpenCreateQuote,
  onNavigate,
}) => {
  const metrics = ReportingService.getDashboardMetrics(selectedCurrency);
  const topDebtors = ReportingService.getTopDebtors(selectedCurrency);
  const biz = StorageService.getBusiness();
  const signatoryFirstName = biz.authorizedSignatoryName?.trim().split(/\s+/)[0];
  const workspaceName = biz.tradingName || biz.name;
  const hasAnyData = invoices.length > 0 || payments.length > 0;

  const criticalInvoices = invoices.filter(
    (i) => (i.status === 'OVERDUE' || i.status === 'PARTIALLY_PAID' || i.status === 'ISSUED') && Number(i.balanceDue) > 0
  ).slice(0, 4);

  const recentSettlements = payments.slice(0, 5);

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Executive Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {signatoryFirstName ? `Welcome back, ${signatoryFirstName}` : 'Welcome back'}
            </h1>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {workspaceName || 'Financial Document OS'} • Consolidated treasury and settlement state for today.
          </p>
        </div>

        {/* Quick Action Ledger Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenCreateInvoice}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition"
          >
            <FilePlus className="w-3.5 h-3.5" />
            <span>+ Create Invoice</span>
          </button>
          <button
            onClick={() => onOpenRecordPayment()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
            <span>Record Payment</span>
          </button>
          <button
            onClick={() => onNavigate('receipts')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <Receipt className="w-3.5 h-3.5 text-indigo-400" />
            <span>Quick Receipt</span>
          </button>
          <button
            onClick={onOpenCreateQuote}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
            <span>New Quote</span>
          </button>
          <button
            onClick={() => onNavigate('clients')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <UserPlus className="w-3.5 h-3.5 text-blue-400" />
            <span>Add Client</span>
          </button>
        </div>
      </div>

      {/* Receivables Concentration Insight — genuinely computed from this
          workspace's own data, not a fabricated narrative. Only shown when
          there is enough real data to say something meaningful. */}
      {(() => {
        const totalOutstanding = topDebtors.reduce((sum, d) => sum + Number(d.outstanding), 0);
        const topDebtor = topDebtors[0];
        if (!topDebtor || totalOutstanding <= 0) return null;
        const concentrationPct = Math.round((Number(topDebtor.outstanding) / totalOutstanding) * 100);
        const mostRecentPayment = payments[0];
        return (
          <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-800/40 flex items-start gap-3.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0 mt-0.5">
              <Info className="w-4 h-4" />
            </div>
            <div className="flex-1 text-xs">
              <p className="font-semibold text-indigo-200">Receivables Concentration ({selectedCurrency})</p>
              <p className="text-slate-400 mt-0.5 leading-relaxed">
                {concentrationPct}% of outstanding {selectedCurrency} receivables is concentrated with{' '}
                <span className="text-white font-medium">{topDebtor.clientName}</span> (
                {formatCurrency(topDebtor.outstanding, selectedCurrency)}).
                {mostRecentPayment && (
                  <>
                    {' '}
                    Most recent settlement: {mostRecentPayment.channel} from {mostRecentPayment.clientName} (
                    {mostRecentPayment.paymentReference}).
                  </>
                )}
                {topDebtor.riskCategory === 'HIGH' && ' This account is significantly overdue and may need direct follow-up.'}
              </p>
            </div>
          </div>
        );
      })()}

      {metrics.otherCurrenciesWithActivity.length > 0 && (
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
          <Info className="w-3.5 h-3.5 shrink-0 text-slate-500" />
          <span>
            Figures below are for {selectedCurrency} only. This workspace also has activity in{' '}
            {metrics.otherCurrenciesWithActivity.join(', ')} — switch currency above to view it (amounts are not
            converted or blended together).
          </span>
        </div>
      )}

      {!hasAnyData && (
        <div className="p-6 rounded-xl bg-slate-900/90 border border-slate-800/80 border-dashed text-center">
          <p className="text-sm font-semibold text-white">No records yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Add a client and create your first invoice to start seeing real treasury figures here. Sample data for
            evaluation purposes is also available from Settings.
          </p>
        </div>
      )}

      {/* 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Invoiced */}
        <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800/80">
          <div className="flex justify-between items-start">
            <span className="text-xs font-medium text-slate-400">Total Invoiced</span>
            <DeltaBadge pct={metrics.totalInvoicedDeltaPct} />
          </div>
          <p className="text-2xl font-bold text-white font-mono-nums mt-3 tracking-tight">
            {formatCurrency(metrics.totalInvoiced, selectedCurrency)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Gross commercial billing</p>
        </div>

        {/* Money Collected */}
        <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800/80">
          <div className="flex justify-between items-start">
            <span className="text-xs font-medium text-slate-400">Money Collected</span>
            <DeltaBadge pct={metrics.moneyCollectedDeltaPct} />
          </div>
          <p className="text-2xl font-bold text-emerald-400 font-mono-nums mt-3 tracking-tight">
            {formatCurrency(metrics.moneyCollected, selectedCurrency)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Realized liquid collections</p>
        </div>

        {/* Outstanding */}
        <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800/80">
          <div className="flex justify-between items-start">
            <span className="text-xs font-medium text-slate-400">Outstanding Receivables</span>
            <span className="text-[11px] font-semibold text-slate-500">Point-in-time</span>
          </div>
          <p className="text-2xl font-bold text-amber-400 font-mono-nums mt-3 tracking-tight">
            {formatCurrency(metrics.outstanding, selectedCurrency)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Pending client settlements</p>
        </div>

        {/* Overdue Action */}
        <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800/80">
          <div className="flex justify-between items-start">
            <span className="text-xs font-medium text-slate-400">Overdue Action</span>
            <span className="text-[11px] font-semibold text-slate-500">Point-in-time</span>
          </div>
          <p className="text-2xl font-bold text-rose-400 font-mono-nums mt-3 tracking-tight">
            {formatCurrency(metrics.overdueAction, selectedCurrency)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Requires immediate follow-up</p>
        </div>
      </div>

      {/* Middle Section: Revenue Movement Chart & Liquidity Position */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue vs Collections Movement */}
        <div className="lg:col-span-2 p-6 rounded-xl bg-slate-900/90 border border-slate-800/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">Revenue vs Collections Movement</h3>
                <p className="text-xs text-slate-400">Invoiced trajectory versus realized cash inflows</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-indigo-500"></span>
                  <span className="text-slate-300">Invoiced</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-emerald-500"></span>
                  <span className="text-slate-300">Collected</span>
                </div>
              </div>
            </div>

            {/* Real 6-month bar comparison, computed from this workspace's
                own invoices/payments (filtered to the selected currency) —
                not placeholder figures. */}
            {(() => {
              const months: { label: string; invoiced: number; collected: number }[] = [];
              const now = new Date();
              for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push({ label: d.toLocaleString('en', { month: 'short' }), invoiced: 0, collected: 0 });
              }
              const monthIndex = (dateStr: string) => {
                const d = new Date(dateStr);
                const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
                return diff >= 0 && diff <= 5 ? 5 - diff : -1;
              };
              for (const inv of invoices) {
                if (inv.currency !== selectedCurrency || inv.status === 'VOID' || inv.status === 'CANCELLED') continue;
                const idx = monthIndex(inv.issueDate);
                if (idx >= 0) months[idx].invoiced += Number(inv.totalAmount || 0);
              }
              for (const pay of payments) {
                if (pay.currency !== selectedCurrency || pay.status === 'REVERSED' || pay.status === 'FAILED') continue;
                const idx = monthIndex(pay.paymentDate);
                if (idx >= 0) months[idx].collected += Number(pay.amount || 0);
              }
              const max = Math.max(1, ...months.map((m) => Math.max(m.invoiced, m.collected)));
              const hasChartData = months.some((m) => m.invoiced > 0 || m.collected > 0);

              if (!hasChartData) {
                return (
                  <div className="h-48 flex items-center justify-center text-xs text-slate-500 border-b border-slate-800/60">
                    No invoice or payment activity yet in {selectedCurrency}.
                  </div>
                );
              }

              return (
                <div className="h-48 flex items-end justify-between gap-4 pt-6 border-b border-slate-800/60 pb-2">
                  {months.map((bar) => (
                    <div key={bar.label} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                      <div className="w-full flex items-end justify-center gap-1.5 h-36">
                        <div
                          className="w-4 sm:w-6 bg-indigo-500/80 hover:bg-indigo-400 rounded-t transition-all"
                          style={{ height: `${(bar.invoiced / max) * 100}%` }}
                          title={`Invoiced: ${formatCurrency(bar.invoiced, selectedCurrency)}`}
                        ></div>
                        <div
                          className="w-4 sm:w-6 bg-emerald-500/80 hover:bg-emerald-400 rounded-t transition-all"
                          style={{ height: `${(bar.collected / max) * 100}%` }}
                          title={`Collected: ${formatCurrency(bar.collected, selectedCurrency)}`}
                        ></div>
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">{bar.label}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="flex justify-between items-center pt-3 text-xs text-slate-400">
            <span>Based on recorded invoices &amp; payments in this workspace</span>
            <button
              onClick={() => onNavigate('reports')}
              className="text-indigo-400 hover:text-indigo-300 font-semibold inline-flex items-center gap-1"
            >
              <span>View Full Analytics</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Liquidity & Position Box */}
        <div className="p-6 rounded-xl bg-slate-900/90 border border-slate-800/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white tracking-tight">Liquidity & Position</h3>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-400">Total Collected ({selectedCurrency})</span>
                <p className="text-2xl font-bold text-white font-mono-nums mt-1">
                  {formatCurrency(metrics.netCashPosition, selectedCurrency)}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Sum of recorded completed/reconciled payments — no bank feed is connected</span>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <ArrowDownRight className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Total Collected</span>
                  </div>
                  <span className="font-mono-nums font-semibold text-emerald-400">
                    {formatCurrency(metrics.moneyCollected, selectedCurrency)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />
                    <span>Reversed Payments</span>
                  </div>
                  <span className="font-mono-nums font-semibold text-rose-400">
                    {formatCurrency(
                      payments
                        .filter((p) => p.currency === selectedCurrency && p.status === 'REVERSED')
                        .reduce((sum, p) => sum + Number(p.amount || 0), 0),
                      selectedCurrency
                    )}
                  </span>
                </div>
              </div>

              <p className="text-[10px] text-slate-600 leading-relaxed pt-1 border-t border-slate-800/60">
                Expense/outflow tracking is not part of this workspace — this panel reflects receivables collection
                only, not a general ledger.
              </p>
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-slate-800">
            <button
              onClick={() => onNavigate('payments')}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition text-center"
            >
              Open Settlement Ledger
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Critical Invoices, Settlement Feed, Top Debtors */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Critical Invoices */}
        <div className="p-6 rounded-xl bg-slate-900/90 border border-slate-800/80">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-white tracking-tight">Critical Invoices</h3>
            <button
              onClick={() => onNavigate('invoices')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              View All ({invoices.length})
            </button>
          </div>

          <div className="space-y-3 text-xs">
            {criticalInvoices.map((inv) => (
              <div
                key={inv.id}
                className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-bold text-white font-mono">{inv.documentNumber}</span>
                    <p className="text-slate-400 mt-0.5 truncate max-w-[180px]">{inv.clientName}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      inv.status === 'OVERDUE'
                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        : inv.status === 'PARTIALLY_PAID'
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                    }`}
                  >
                    {inv.status}
                  </span>
                </div>

                <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-800/60">
                  <span className="text-[11px] text-slate-500 font-mono">Due: {inv.dueDate}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono-nums font-bold text-white">
                      {formatCurrency(inv.balanceDue, inv.currency)}
                    </span>
                    <button
                      onClick={() => onOpenRecordPayment(inv.id)}
                      className="px-2 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[10px] font-semibold transition"
                    >
                      Settle
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Real-time Settlement Feed */}
        <div className="p-6 rounded-xl bg-slate-900/90 border border-slate-800/80">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-white tracking-tight">Settlement Feed</h3>
            <button
              onClick={() => onNavigate('payments')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              Full Ledger
            </button>
          </div>

          <div className="space-y-3 text-xs">
            {recentSettlements.map((pay) => (
              <div
                key={pay.id}
                className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 flex justify-between items-center"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                    {pay.channel === 'MPESA_C2B' ? (
                      <Smartphone className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Building className="w-4 h-4 text-blue-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-white">{pay.clientName}</span>
                      <span className="text-[10px] font-mono text-slate-500">{pay.channelTransactionId}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {pay.channel} • {pay.paymentReference}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-bold text-emerald-400 font-mono-nums">
                    +{formatCurrency(pay.amount, pay.currency)}
                  </p>
                  <span className="text-[10px] text-slate-500">
                    {pay.paymentDate.split('T')[0]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Debtors Aging */}
        <div className="p-6 rounded-xl bg-slate-900/90 border border-slate-800/80">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-white tracking-tight">Top Debtors & Aging</h3>
            <span className="text-xs text-slate-500">Exposure</span>
          </div>

          <div className="space-y-3 text-xs">
            {topDebtors.map((deb) => (
              <div
                key={deb.clientId}
                className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 flex justify-between items-center"
              >
                <div>
                  <p className="font-semibold text-white">{deb.clientName}</p>
                  <p className="text-[10px] text-slate-500">
                    Oldest due: <span className="font-mono">{deb.oldestDueDate}</span>
                    {deb.daysOverdue > 0 && ` (${deb.daysOverdue}d overdue)`}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-bold text-amber-400 font-mono-nums">
                    {formatCurrency(deb.outstanding, selectedCurrency)}
                  </p>
                  <span
                    className={`text-[10px] font-bold ${
                      deb.riskCategory === 'HIGH'
                        ? 'text-rose-400'
                        : deb.riskCategory === 'MEDIUM'
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {deb.riskCategory} RISK
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

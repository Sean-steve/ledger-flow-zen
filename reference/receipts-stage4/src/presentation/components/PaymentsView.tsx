/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { PaymentRecord, CurrencyCode } from '../../types';
import { formatCurrency } from '../../domain/math';
import { PaymentService } from '../../application/paymentService';
import {
  Plus,
  Search,
  Smartphone,
  Building,
  Banknote,
  CreditCard as CardIcon,
  Receipt,
  Undo2,
  X,
} from 'lucide-react';

interface PaymentsViewProps {
  payments: PaymentRecord[];
  onOpenRecordPayment: () => void;
  onViewReceipt: (receiptId: string) => void;
  onPaymentReversed?: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  RECONCILED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  INITIATED: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  FAILED: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  REVERSED: 'bg-slate-700/40 text-slate-400 border-slate-600/40 line-through decoration-slate-500',
};

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  payments,
  onOpenRecordPayment,
  onViewReceipt,
  onPaymentReversed,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [reversingPayment, setReversingPayment] = useState<PaymentRecord | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>('KES');

  const filtered = payments.filter((p) => {
    if (channelFilter !== 'ALL' && p.channel !== channelFilter) return false;
    if (
      searchTerm &&
      !p.paymentReference.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !p.clientName.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !p.channelTransactionId.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  // --- All metrics below are computed from the actual payment records for
  // the selected currency — none are hardcoded placeholders.
  const currencyPayments = payments.filter((p) => p.currency === currency);
  const activePayments = currencyPayments.filter((p) => p.status === 'COMPLETED' || p.status === 'RECONCILED');
  const totalReceived = activePayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const unallocated = activePayments.filter((p) => !p.invoiceId).reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const channelCounts: Record<string, number> = {};
  activePayments.forEach((p) => {
    channelCounts[p.channel] = (channelCounts[p.channel] || 0) + 1;
  });
  const topChannelEntry = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0];
  const topChannelPct = topChannelEntry ? Math.round((topChannelEntry[1] / activePayments.length) * 100) : null;

  const handleReverse = () => {
    if (!reversingPayment) return;
    setReverseError(null);
    try {
      PaymentService.reversePayment(reversingPayment.id, reverseReason);
      setReversingPayment(null);
      setReverseReason('');
      onPaymentReversed?.();
    } catch (err: any) {
      setReverseError(err.message || 'Failed to reverse payment');
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto text-slate-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Treasury Operations</span>
            <span className="text-slate-600">•</span>
            <span className="text-xs text-slate-400">Settlement Ledger</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-0.5">
            Payments & Settlement Records
          </h1>
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
            onClick={onOpenRecordPayment}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm transition self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Record Incoming Payment</span>
          </button>
        </div>
      </div>

      {/* Treasury Metrics — computed from real records for the selected currency */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800/80">
          <span className="text-xs text-slate-400">Total Received ({currency})</span>
          <p className="text-xl font-bold text-emerald-400 font-mono-nums mt-1">
            {formatCurrency(totalReceived, currency)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">{activePayments.length} completed/reconciled payment(s)</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800/80">
          <span className="text-xs text-slate-400">Unallocated Settlement</span>
          <p className="text-xl font-bold text-white font-mono-nums mt-1">
            {formatCurrency(unallocated, currency)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Received but not applied to an invoice</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800/80">
          <span className="text-xs text-slate-400">Primary Channel</span>
          <p className="text-xl font-bold text-amber-400 font-mono-nums mt-1">
            {topChannelEntry ? `${topChannelEntry[0].replace('_', ' ')} ${topChannelPct}%` : '—'}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">By count of settlements this currency</p>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {['ALL', 'MPESA_C2B', 'BANK_TRANSFER', 'RTGS', 'CASH'].map((ch) => (
            <button
              key={ch}
              onClick={() => setChannelFilter(ch)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                channelFilter === ch
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {ch.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search payment or ref..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Payments Table */}
      <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-900/80 shadow-sm">
        <table className="w-full text-left text-xs border-collapse min-w-[900px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
              <th className="py-3 px-4">Settlement Ref</th>
              <th className="py-3 px-4">Channel</th>
              <th className="py-3 px-4">Transaction Code</th>
              <th className="py-3 px-4">Payer / Account</th>
              <th className="py-3 px-4">Target Invoice</th>
              <th className="py-3 px-4 text-right">Amount</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Official Receipt</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500 text-xs">
                  No payment records match the active criteria.
                </td>
              </tr>
            ) : (
              filtered.map((pay) => (
                <tr key={pay.id} className={`hover:bg-slate-800/40 transition ${pay.status === 'REVERSED' ? 'opacity-60' : ''}`}>
                  <td className="py-3.5 px-4 font-mono font-bold text-white">{pay.paymentReference}</td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5">
                      {pay.channel === 'MPESA_C2B' || pay.channel === 'MPESA_TILL' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                          <Smartphone className="w-3.5 h-3.5" />
                          M-Pesa
                        </span>
                      ) : pay.channel === 'CASH' ? (
                        <span className="inline-flex items-center gap-1 text-amber-400 font-semibold text-[11px]">
                          <Banknote className="w-3.5 h-3.5" />
                          Cash
                        </span>
                      ) : pay.channel === 'CARD' ? (
                        <span className="inline-flex items-center gap-1 text-purple-400 font-semibold text-[11px]">
                          <CardIcon className="w-3.5 h-3.5" />
                          Card
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-blue-400 font-semibold text-[11px]">
                          <Building className="w-3.5 h-3.5" />
                          {pay.channel.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-semibold text-slate-300">{pay.channelTransactionId}</td>
                  <td className="py-3.5 px-4">
                    <p className="font-semibold text-slate-200">{pay.clientName}</p>
                    {pay.payerPhone && <p className="text-[10px] text-slate-500 font-mono">{pay.payerPhone}</p>}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-300">{pay.invoiceNumber || '—'}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                    {formatCurrency(pay.amount, pay.currency)}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        STATUS_STYLES[pay.status] || 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {pay.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {pay.receiptId ? (
                      <button
                        onClick={() => onViewReceipt(pay.receiptId!)}
                        className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-mono font-semibold hover:underline"
                      >
                        <Receipt className="w-3 h-3" />
                        <span>{pay.receiptNumber}</span>
                      </button>
                    ) : (
                      <span className="text-slate-500 text-[10px]">Unissued</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {(pay.status === 'COMPLETED' || pay.status === 'RECONCILED') && (
                      <button
                        onClick={() => {
                          setReversingPayment(pay);
                          setReverseReason('');
                          setReverseError(null);
                        }}
                        title="Reverse this payment"
                        className="inline-flex items-center gap-1 px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded text-[10px] font-semibold transition"
                      >
                        <Undo2 className="w-3 h-3" />
                        <span>Reverse</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Reverse Payment Confirmation */}
      {reversingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full text-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="text-sm font-bold text-white">Reverse Payment {reversingPayment.paymentReference}</h3>
              <button onClick={() => setReversingPayment(null)} className="p-1 rounded-lg text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-xs">
              <p className="text-slate-400">
                This will roll back {formatCurrency(reversingPayment.amount, reversingPayment.currency)} from
                {reversingPayment.invoiceNumber ? ` invoice ${reversingPayment.invoiceNumber} and` : ''} the client's
                balance. The original receipt (if any) is kept on record for audit purposes and is not deleted.
              </p>
              {reverseError && (
                <div className="p-2.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300">{reverseError}</div>
              )}
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Reason for reversal (required)</label>
                <textarea
                  rows={3}
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="e.g. Duplicate M-Pesa confirmation, payer disputed charge, bounced cheque..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex justify-end gap-3">
              <button onClick={() => setReversingPayment(null)} className="px-4 py-2 text-xs text-slate-400 hover:text-white">
                Cancel
              </button>
              <button
                onClick={handleReverse}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-sm"
              >
                Confirm Reversal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { InvoiceEntity, DocumentStatus } from '../../types';
import { formatCurrency } from '../../domain/math';
import { Plus, Search, Filter, Eye, CreditCard, Printer, CheckCircle2 } from 'lucide-react';

interface InvoicesListViewProps {
  invoices: InvoiceEntity[];
  onCreateInvoice: () => void;
  onEditInvoice: (invoice: InvoiceEntity) => void;
  onRecordPayment: (invoiceId: string) => void;
  onPrintInvoice: (invoice: InvoiceEntity) => void;
}

export const InvoicesListView: React.FC<InvoicesListViewProps> = ({
  invoices,
  onCreateInvoice,
  onEditInvoice,
  onRecordPayment,
  onPrintInvoice,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filterTabs = ['ALL', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'DRAFT'];

  const filtered = invoices.filter((inv) => {
    if (statusFilter !== 'ALL' && inv.status !== statusFilter) return false;
    if (
      searchTerm &&
      !inv.documentNumber.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !inv.clientName.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto text-slate-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Commercial Invoices</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable accounts receivable register and billing documents
          </p>
        </div>
        <button
          onClick={onCreateInvoice}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Commercial Invoice</span>
        </button>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {filterTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === tab
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {tab.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search invoice or client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Invoices Table */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/80 shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
              <th className="py-3 px-4">Document #</th>
              <th className="py-3 px-4">Client</th>
              <th className="py-3 px-4">Issue Date</th>
              <th className="py-3 px-4">Due Date</th>
              <th className="py-3 px-4 text-right">Total Amount</th>
              <th className="py-3 px-4 text-right">Balance Due</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                  No invoice records match the active criteria.
                </td>
              </tr>
            ) : (
              filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-3.5 px-4 font-mono font-bold text-white">
                    {inv.documentNumber}
                  </td>
                  <td className="py-3.5 px-4">
                    <p className="font-semibold text-slate-200">{inv.clientName}</p>
                    {inv.clientKraPin && (
                      <span className="text-[10px] text-slate-500 font-mono">PIN: {inv.clientKraPin}</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 font-mono">{inv.issueDate}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-400">{inv.dueDate}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-semibold text-white">
                    {formatCurrency(inv.totalAmount, inv.currency)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-400">
                    {formatCurrency(inv.balanceDue, inv.currency)}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        inv.status === 'PAID'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : inv.status === 'PARTIALLY_PAID'
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : inv.status === 'OVERDUE'
                          ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          : inv.status === 'ISSUED'
                          ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onEditInvoice(inv)}
                        className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition"
                        title="View / Edit Invoice"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onPrintInvoice(inv)}
                        className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition"
                        title="Print A4 Document"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      {Number(inv.balanceDue) > 0 && (
                        <button
                          onClick={() => onRecordPayment(inv.id)}
                          className="px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded text-[10px] font-semibold transition"
                        >
                          Settle
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

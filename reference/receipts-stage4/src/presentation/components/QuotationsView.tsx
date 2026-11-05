/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { QuotationEntity } from '../../types';
import { formatCurrency } from '../../domain/math';
import { DocumentService } from '../../application/documentService';
import { QuotationService } from '../../application/quotationService';
import { FileSpreadsheet, Plus, ArrowRight, CheckCircle2, Search, Eye, XCircle } from 'lucide-react';

interface QuotationsViewProps {
  quotations: QuotationEntity[];
  onQuotationConverted: () => void;
  onOpenCreateQuote: () => void;
  onEditQuotation: (quote: QuotationEntity) => void;
  onPreview: (quote: QuotationEntity) => void;
}

export const QuotationsView: React.FC<QuotationsViewProps> = ({
  quotations,
  onQuotationConverted,
  onOpenCreateQuote,
  onEditQuotation,
  onPreview,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const handleConvert = (quoteId: string) => {
    try {
      const inv = DocumentService.convertQuotationToInvoice(quoteId);
      setMessage(`Successfully converted to commercial invoice ${inv.documentNumber}!`);
      onQuotationConverted();
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage(err.message || 'Conversion failed');
    }
  };

  const handleAccept = (quoteId: string) => {
    try {
      QuotationService.markAccepted(quoteId);
      onQuotationConverted();
    } catch (err: any) {
      setMessage(err.message || 'Failed to update status');
    }
  };

  const handleReject = (quoteId: string) => {
    try {
      QuotationService.markRejected(quoteId);
      onQuotationConverted();
    } catch (err: any) {
      setMessage(err.message || 'Failed to update status');
    }
  };

  const filtered = quotations.filter((q) => {
    if (
      searchTerm &&
      !q.quotationNumber.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !q.clientName.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto text-slate-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Quotations & Estimates</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Commercial estimates, proposals, and pipeline to billing conversion
          </p>
        </div>

        <button
          onClick={onOpenCreateQuote}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Quotation</span>
        </button>
      </div>

      {message && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{message}</span>
        </div>
      )}

      {/* Filter and Search */}
      <div className="flex justify-end">
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search quotations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/80 shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
              <th className="py-3 px-4">Quote #</th>
              <th className="py-3 px-4">Client</th>
              <th className="py-3 px-4">Issue Date</th>
              <th className="py-3 px-4">Valid Until</th>
              <th className="py-3 px-4 text-right">Estimated Total</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filtered.map((q) => (
              <tr key={q.id} className="hover:bg-slate-800/40 transition">
                <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                  <button onClick={() => (q.status === 'DRAFT' ? onEditQuotation(q) : onPreview(q))} className="hover:underline">
                    {q.quotationNumber}
                  </button>
                </td>
                <td className="py-3.5 px-4">
                  <p className="font-semibold text-slate-200">{q.clientName}</p>
                  <span className="text-[10px] text-slate-500">{q.clientEmail}</span>
                </td>
                <td className="py-3.5 px-4 font-mono text-slate-400">{q.issueDate}</td>
                <td className="py-3.5 px-4 font-mono text-slate-400">{q.validUntil}</td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                  {formatCurrency(q.totalAmount, q.currency)}
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      q.status === 'ACCEPTED'
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : q.status === 'CONVERTED'
                        ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                        : q.status === 'REJECTED' || q.status === 'EXPIRED'
                        ? 'bg-slate-700/40 text-slate-400 border border-slate-600/40'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {q.status}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-right">
                  <div className="flex justify-end items-center gap-1.5">
                    {q.status !== 'DRAFT' && (
                      <button
                        onClick={() => onPreview(q)}
                        title="Preview / Print"
                        className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {q.status === 'DRAFT' && (
                      <span className="text-[11px] text-slate-500">Not yet sent</span>
                    )}
                    {q.status === 'ISSUED' && (
                      <>
                        <button
                          onClick={() => handleAccept(q.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded text-[11px] font-semibold"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Mark Accepted
                        </button>
                        <button
                          onClick={() => handleReject(q.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded text-[11px] font-semibold"
                        >
                          <XCircle className="w-3 h-3" />
                          Mark Rejected
                        </button>
                      </>
                    )}
                    {q.status === 'ACCEPTED' && (
                      <button
                        onClick={() => handleConvert(q.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold shadow-xs transition"
                      >
                        <span>Convert to Invoice</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {q.status === 'CONVERTED' && (
                      <span className="text-[11px] text-indigo-300 font-mono">Billed to Invoice</span>
                    )}
                    {q.status === 'REJECTED' && (
                      <span className="text-[11px] text-rose-400">Rejected by client</span>
                    )}
                    {q.status === 'EXPIRED' && (
                      <span className="text-[11px] text-slate-500">Expired</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

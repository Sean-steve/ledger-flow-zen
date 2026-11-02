/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ReceiptEntity } from '../../types';
import { formatCurrency } from '../../domain/math';
import { LiveDocumentPreview } from './LiveDocumentPreview';
import { ExportMenu } from './ExportMenu';
import { ShareMenu } from './ShareMenu';
import { Receipt, Search, Eye, Printer, X, ShieldCheck } from 'lucide-react';

interface ReceiptsViewProps {
  receipts: ReceiptEntity[];
  selectedReceiptId?: string | null;
  onClearSelectedReceipt?: () => void;
}

export const ReceiptsView: React.FC<ReceiptsViewProps> = ({
  receipts,
  selectedReceiptId,
  onClearSelectedReceipt,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeReceipt, setActiveReceipt] = useState<ReceiptEntity | null>(() => {
    if (selectedReceiptId) {
      return receipts.find((r) => r.id === selectedReceiptId) || null;
    }
    return null;
  });

  const filtered = receipts.filter((r) => {
    if (
      searchTerm &&
      !r.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !r.clientName.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !r.channelReference.toLowerCase().includes(searchTerm.toLowerCase())
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
          <h1 className="text-xl font-bold text-white tracking-tight">Official Receipts</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable settlement attestations and proof of payment documents
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search receipts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Receipts Table */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/80 shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
              <th className="py-3 px-4">Receipt #</th>
              <th className="py-3 px-4">Settlement Date</th>
              <th className="py-3 px-4">Received From</th>
              <th className="py-3 px-4">Channel & Reference</th>
              <th className="py-3 px-4">Target Invoice</th>
              <th className="py-3 px-4 text-right">Amount Paid</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filtered.map((rct) => (
              <tr key={rct.id} className="hover:bg-slate-800/40 transition">
                <td className="py-3.5 px-4 font-mono font-bold text-indigo-400">
                  {rct.receiptNumber}
                </td>
                <td className="py-3.5 px-4 font-mono text-slate-400">
                  {rct.paymentDate.split('T')[0]}
                </td>
                <td className="py-3.5 px-4">
                  <p className="font-semibold text-slate-200">{rct.clientName}</p>
                  {rct.clientKraPin && (
                    <span className="text-[10px] text-slate-500 font-mono">PIN: {rct.clientKraPin}</span>
                  )}
                </td>
                <td className="py-3.5 px-4">
                  <span className="font-semibold text-white">{rct.paymentChannel}</span>
                  <p className="text-[10px] text-slate-500 font-mono">{rct.channelReference}</p>
                </td>
                <td className="py-3.5 px-4 font-mono text-slate-300">
                  {rct.invoiceNumber || 'Account Credit'}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                  {formatCurrency(rct.amountPaid, rct.currency)}
                </td>
                <td className="py-3.5 px-4 text-right">
                  <button
                    onClick={() => setActiveReceipt(rct)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold transition"
                  >
                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                    <span>View A4</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal A4 Preview */}
      {activeReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-4xl w-full text-slate-200 overflow-hidden my-6">
            <div className="px-6 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-bold text-white">Official Receipt Preview ({activeReceipt.receiptNumber})</span>
              </div>
              <div className="flex items-center gap-2">
                <ExportMenu filename={activeReceipt.receiptNumber} />
                <ShareMenu document={activeReceipt} type="RECEIPT" filename={activeReceipt.receiptNumber} />
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-slate-700 transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Document</span>
                </button>
                <button
                  onClick={() => {
                    setActiveReceipt(null);
                    if (onClearSelectedReceipt) onClearSelectedReceipt();
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 bg-slate-950/50 flex justify-center max-h-[80vh] overflow-y-auto">
              <LiveDocumentPreview
                document={activeReceipt}
                type="RECEIPT"
                templateId={activeReceipt.templateId}
                zoomScale={0.8}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

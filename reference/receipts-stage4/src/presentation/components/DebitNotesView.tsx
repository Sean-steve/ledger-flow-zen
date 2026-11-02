/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { DebitNoteEntity } from '../../types';
import { formatCurrency } from '../../domain/math';
import { AdjustmentNoteService } from '../../application/adjustmentNoteService';
import { Search, FilePlus2, Eye, Undo2, X } from 'lucide-react';

interface DebitNotesViewProps {
  debitNotes: DebitNoteEntity[];
  onPreview: (note: DebitNoteEntity) => void;
  onVoided: () => void;
}

export const DebitNotesView: React.FC<DebitNotesViewProps> = ({ debitNotes, onPreview, onVoided }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [voidingNote, setVoidingNote] = useState<DebitNoteEntity | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const filtered = debitNotes.filter(
    (n) =>
      !searchTerm ||
      n.debitNoteNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleVoid = () => {
    if (!voidingNote) return;
    setError(null);
    try {
      AdjustmentNoteService.voidDebitNote(voidingNote.id, voidReason);
      setVoidingNote(null);
      setVoidReason('');
      onVoided();
    } catch (err: any) {
      setError(err.message || 'Failed to void credit note');
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto text-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Debit Notes</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Adjustments increasing amounts owed on previously issued invoices
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search debit notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-900/80 shadow-sm">
        <table className="w-full text-left text-xs border-collapse min-w-[800px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
              <th className="py-3 px-4">Debit Note #</th>
              <th className="py-3 px-4">Client</th>
              <th className="py-3 px-4">Reference Invoice</th>
              <th className="py-3 px-4">Issue Date</th>
              <th className="py-3 px-4 text-right">Amount</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-500 text-xs">
                  <FilePlus2 className="w-6 h-6 mx-auto mb-2 text-slate-700" />
                  No debit notes issued yet.
                </td>
              </tr>
            ) : (
              filtered.map((n) => (
                <tr key={n.id} className={`hover:bg-slate-800/40 transition ${n.status === 'VOID' ? 'opacity-60' : ''}`}>
                  <td className="py-3.5 px-4 font-mono font-bold text-amber-400">{n.debitNoteNumber}</td>
                  <td className="py-3.5 px-4 font-semibold text-slate-200">{n.clientName}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-400">{n.invoiceNumber}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-400">{n.issueDate}</td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                    {formatCurrency(n.amount, n.currency)}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        n.status === 'VOID'
                          ? 'bg-slate-700/40 text-slate-400 border-slate-600/40 line-through'
                          : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      {n.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => onPreview(n)}
                        title="Preview / Print"
                        className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {n.status === 'ISSUED' && (
                        <button
                          onClick={() => {
                            setVoidingNote(n);
                            setVoidReason('');
                            setError(null);
                          }}
                          title="Void"
                          className="p-1.5 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-300"
                        >
                          <Undo2 className="w-3.5 h-3.5" />
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

      {voidingNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full text-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h3 className="text-sm font-bold text-white">Void {voidingNote.debitNoteNumber}</h3>
              <button onClick={() => setVoidingNote(null)} className="p-1 rounded-lg text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-xs">
              <p className="text-slate-400">
                This restores {formatCurrency(voidingNote.amount, voidingNote.currency)} back onto invoice{' '}
                {voidingNote.invoiceNumber} and the client's balance.
              </p>
              {error && <div className="p-2.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300">{error}</div>}
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Reason (required)</label>
                <textarea
                  rows={3}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex justify-end gap-3">
              <button onClick={() => setVoidingNote(null)} className="px-4 py-2 text-xs text-slate-400 hover:text-white">
                Cancel
              </button>
              <button
                onClick={handleVoid}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-sm"
              >
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

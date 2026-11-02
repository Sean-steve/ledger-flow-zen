/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { InvoiceEntity } from '../../types';
import { formatCurrency } from '../../domain/math';
import { AdjustmentNoteService } from '../../application/adjustmentNoteService';
import { X } from 'lucide-react';

interface IssueAdjustmentNoteModalProps {
  kind: 'CREDIT' | 'DEBIT';
  invoice: InvoiceEntity;
  onClose: () => void;
  onIssued: () => void;
}

export const IssueAdjustmentNoteModal: React.FC<IssueAdjustmentNoteModalProps> = ({
  kind,
  invoice,
  onClose,
  onIssued,
}) => {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isCredit = kind === 'CREDIT';

  const handleSubmit = () => {
    setError(null);
    try {
      if (isCredit) {
        AdjustmentNoteService.issueCreditNote({ invoiceId: invoice.id, amount, reason });
      } else {
        AdjustmentNoteService.issueDebitNote({ invoiceId: invoice.id, amount, reason });
      }
      onIssued();
      onClose();
    } catch (err: any) {
      setError(err.message || `Failed to issue ${isCredit ? 'credit' : 'debit'} note`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full text-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <h3 className="text-sm font-bold text-white">
            Issue {isCredit ? 'Credit' : 'Debit'} Note — {invoice.documentNumber}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex justify-between">
            <span className="text-slate-400">Current Balance Due</span>
            <span className="font-mono font-bold text-white">{formatCurrency(invoice.balanceDue, invoice.currency)}</span>
          </div>

          {isCredit ? (
            <p className="text-slate-500">
              Reduces what {invoice.clientName} owes on this invoice. Capped at the current balance due — this
              workspace does not track a general client credit ledger.
            </p>
          ) : (
            <p className="text-slate-500">
              Adds an additional charge or correction to what {invoice.clientName} owes on this invoice.
            </p>
          )}

          {error && (
            <div className="p-2.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-300">{error}</div>
          )}

          <div>
            <label className="text-slate-400 block mb-1 font-semibold">
              Amount ({invoice.currency}, tax-inclusive)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-semibold">Reason (required)</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isCredit ? 'e.g. Returned goods, billing error, agreed discount...' : 'e.g. Additional freight charge, correction of undercharge...'}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-xs text-slate-400 hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className={`px-4 py-2 text-white text-xs font-semibold rounded-lg shadow-sm ${
              isCredit ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'
            }`}
          >
            Issue {isCredit ? 'Credit' : 'Debit'} Note
          </button>
        </div>
      </div>
    </div>
  );
};

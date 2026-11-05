/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { InvoiceEntity, ReceiptEntity, QuotationEntity, CreditNoteEntity, DebitNoteEntity } from '../../types';
import { buildShareInfo, buildEmailShareUrl, buildWhatsAppShareUrl } from '../../infrastructure/shareLinks';
import { exportDocumentAsPdf } from '../../infrastructure/documentExport';
import { Share2, ChevronDown, Loader2, Mail, MessageCircle } from 'lucide-react';

interface ShareMenuProps {
  document: InvoiceEntity | ReceiptEntity | QuotationEntity | CreditNoteEntity | DebitNoteEntity;
  type: 'INVOICE' | 'RECEIPT' | 'QUOTATION' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  filename: string;
}

export const ShareMenu: React.FC<ShareMenuProps> = ({ document, type, filename }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const info = buildShareInfo(document, type);

  const handleShare = async (channel: 'EMAIL' | 'WHATSAPP') => {
    setOpen(false);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // Browsers cannot attach a file to a mailto: or wa.me link — there is
      // no API for it. Rather than pretend the document was sent, this
      // downloads the file first and then tells the operator to attach it
      // themselves in the email/WhatsApp window that opens.
      await exportDocumentAsPdf(filename);

      if (channel === 'EMAIL') {
        window.location.href = buildEmailShareUrl(info);
        setNotice(
          info.clientEmail
            ? `PDF downloaded. Attach it in the email draft that just opened for ${info.clientEmail}.`
            : 'PDF downloaded. Attach it in the email draft that just opened — no email is on file for this client, so the "To:" field is blank.'
        );
      } else {
        window.open(buildWhatsAppShareUrl(info), '_blank', 'noopener,noreferrer');
        setNotice(
          info.clientPhone
            ? 'PDF downloaded. Attach it in the WhatsApp chat that just opened.'
            : 'PDF downloaded. Attach it in WhatsApp — no phone number is on file for this client, so pick the recipient manually.'
        );
      }
    } catch (err: any) {
      setError(err.message || 'Failed to prepare document for sharing');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative no-print">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
        <span>Share</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-48 bg-slate-900 border border-slate-800 rounded-lg shadow-xl py-1 z-50 text-xs">
          <button
            onClick={() => handleShare('EMAIL')}
            className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <Mail className="w-3.5 h-3.5" />
            Email
          </button>
          <button
            onClick={() => handleShare('WHATSAPP')}
            className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            WhatsApp
          </button>
        </div>
      )}

      {notice && (
        <div className="absolute right-0 mt-1.5 w-64 p-2 bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 text-[11px] rounded-lg z-50">
          {notice}
        </div>
      )}
      {error && (
        <div className="absolute right-0 mt-1.5 w-64 p-2 bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] rounded-lg z-50">
          {error}
        </div>
      )}
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { exportDocumentAsPdf, exportDocumentAsPng, exportDocumentAsJpg } from '../../infrastructure/documentExport';
import { Download, ChevronDown, Loader2 } from 'lucide-react';

interface ExportMenuProps {
  /** Base filename without extension, e.g. the document number. */
  filename: string;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({ filename }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: (filename: string) => Promise<void>) => {
    setOpen(false);
    setBusy(true);
    setError(null);
    try {
      await fn(filename);
    } catch (err: any) {
      setError(err.message || 'Export failed');
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
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        <span>Export</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-36 bg-slate-900 border border-slate-800 rounded-lg shadow-xl py-1 z-50 text-xs">
          <button onClick={() => run(exportDocumentAsPdf)} className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">
            Download PDF
          </button>
          <button onClick={() => run(exportDocumentAsPng)} className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">
            Download PNG
          </button>
          <button onClick={() => run(exportDocumentAsJpg)} className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">
            Download JPG
          </button>
        </div>
      )}

      {error && (
        <div className="absolute right-0 mt-1.5 w-56 p-2 bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] rounded-lg z-50">
          {error}
        </div>
      )}
    </div>
  );
};

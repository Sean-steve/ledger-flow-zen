/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { QuotationEntity, ClientEntity, LineItem, TemplateId } from '../../types';
import { StorageService } from '../../infrastructure/storage';
import { QuotationService } from '../../application/quotationService';
import { calculateLineItem, calculateDocumentTotals, formatCurrency } from '../../domain/math';
import { DOCUMENT_TEMPLATES } from '../../application/templateService';
import { LiveDocumentPreview } from './LiveDocumentPreview';
import { ExportMenu } from './ExportMenu';
import { ShareMenu } from './ShareMenu';
import { ArrowLeft, Plus, Trash2, ZoomIn, ZoomOut, Printer, Send, ShieldCheck } from 'lucide-react';

interface QuotationEditorViewProps {
  initialQuotation?: QuotationEntity;
  onBack: () => void;
  onSaved: (quote: QuotationEntity) => void;
}

export const QuotationEditorView: React.FC<QuotationEditorViewProps> = ({
  initialQuotation,
  onBack,
  onSaved,
}) => {
  const clients = StorageService.getClients();
  const [quote, setQuote] = useState<QuotationEntity | null>(() => {
    if (initialQuotation) return initialQuotation;
    if (clients.length === 0) return null;
    try {
      return QuotationService.createDraftQuotation(clients[0].id);
    } catch {
      return null;
    }
  });
  const [zoomScale, setZoomScale] = useState(0.85);
  const [error, setError] = useState<string | null>(null);

  const isReadOnly = quote ? quote.status !== 'DRAFT' : false;

  if (!quote) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] text-slate-400 gap-3 px-6 text-center">
        <p className="text-sm font-semibold text-white">Cannot create a quotation yet</p>
        <p className="text-xs max-w-sm">Add at least one client before creating a quotation.</p>
        <button onClick={onBack} className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-slate-700">
          Go Back
        </button>
      </div>
    );
  }

  const updateItems = (items: LineItem[]) => {
    const totals = calculateDocumentTotals(items, false);
    setQuote((prev) =>
      prev
        ? {
            ...prev,
            items,
            subtotal: totals.subtotal,
            taxTotal: totals.taxTotal,
            taxBreakdowns: totals.taxBreakdowns,
            totalAmount: totals.totalAmount,
          }
        : prev
    );
  };

  const handleItemChange = (index: number, field: keyof LineItem, value: any) => {
    if (isReadOnly) return;
    const updated = [...quote.items];
    const item = { ...updated[index], [field]: value };
    const calc = calculateLineItem(item.quantity, item.unitPrice, item.discountPercentage, item.taxCategory);
    updated[index] = { ...item, ...calc };
    updateItems(updated);
  };

  const handleAddItem = () => {
    if (isReadOnly) return;
    const newItem: LineItem = {
      id: `item-${Date.now()}`,
      description: '',
      quantity: '1',
      unit: 'Unit',
      unitPrice: '0.00',
      discountPercentage: '0',
      taxCategory: 'VAT_16',
      taxRate: '0.16',
      grossAmount: '0.00',
      taxAmount: '0.00',
      netAmount: '0.00',
    };
    updateItems([...quote.items, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    if (isReadOnly || quote.items.length <= 1) return;
    updateItems(quote.items.filter((_, i) => i !== index));
  };

  const handleClientChange = (clientId: string) => {
    if (isReadOnly) return;
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    setQuote((prev) => (prev ? { ...prev, clientId: client.id, clientName: client.name, clientEmail: client.email, currency: client.currency } : prev));
  };

  const handleSaveDraft = () => {
    setError(null);
    try {
      const saved = QuotationService.saveDraftQuotation(quote);
      onSaved(saved);
    } catch (err: any) {
      setError(err.message || 'Failed to save draft');
    }
  };

  const handleIssue = () => {
    setError(null);
    try {
      const issued = QuotationService.issueQuotation(quote);
      onSaved(issued);
    } catch (err: any) {
      setError(err.message || 'Failed to issue quotation');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-950 text-slate-200">
      <div className="h-14 border-b border-slate-800 bg-slate-900/90 px-6 flex items-center justify-between no-print">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white">Quotation Editor</span>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-amber-500/20 text-amber-300">{quote.quotationNumber}</span>
            <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-800 text-slate-300">{quote.status}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={quote.templateId}
            onChange={(e) => setQuote({ ...quote, templateId: e.target.value as TemplateId })}
            className="bg-slate-800 border border-slate-700 text-white rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500"
          >
            {DOCUMENT_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-md p-0.5">
            <button onClick={() => setZoomScale((z) => Math.max(0.5, z - 0.1))} className="p-1 text-slate-400 hover:text-white">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-slate-300 px-1 font-mono">{Math.round(zoomScale * 100)}%</span>
            <button onClick={() => setZoomScale((z) => Math.min(1.2, z + 0.1))} className="p-1 text-slate-400 hover:text-white">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ExportMenu filename={quote.quotationNumber} />
          {isReadOnly && <ShareMenu document={quote} type="QUOTATION" filename={quote.quotationNumber} />}
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition">
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
          {!isReadOnly && (
            <>
              <button onClick={handleSaveDraft} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition">
                Save Draft
              </button>
              <button onClick={handleIssue} className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm transition">
                <Send className="w-3.5 h-3.5" />
                <span>Send to Client</span>
              </button>
            </>
          )}
        </div>
      </div>

      {isReadOnly && (
        <div className="p-3 bg-indigo-500/10 border-b border-indigo-500/30 text-indigo-300 text-xs font-medium px-6 flex items-center gap-2 no-print">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span>This quotation has been sent and is now read-only. Manage its status from the Quotations list.</span>
        </div>
      )}

      {error && <div className="p-3 bg-rose-500/15 border-b border-rose-500/30 text-rose-300 text-xs font-medium px-6">{error}</div>}

      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        <fieldset disabled={isReadOnly} className="w-full lg:w-1/2 border-b lg:border-b-0 lg:border-r border-slate-800 lg:overflow-y-auto p-6 space-y-6 no-print disabled:opacity-70">
          <div>
            <label className="text-xs text-slate-400 font-semibold block mb-1.5">Client</label>
            <select
              value={quote.clientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
            >
              {clients.map((c: ClientEntity) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 font-semibold block mb-1.5">Issue Date</label>
              <input
                type="date"
                value={quote.issueDate}
                onChange={(e) => setQuote({ ...quote, issueDate: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-semibold block mb-1.5">Valid Until</label>
              <input
                type="date"
                value={quote.validUntil}
                onChange={(e) => setQuote({ ...quote, validUntil: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-400 font-semibold">Line Items</label>
              <button onClick={handleAddItem} className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold">
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            </div>
            <div className="space-y-3">
              {quote.items.map((item, idx) => (
                <div key={item.id} className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                      className="flex-1 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-xs"
                    />
                    <button onClick={() => handleRemoveItem(idx)} className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)} className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white" />
                    <input type="number" placeholder="Unit Price" value={item.unitPrice} onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)} className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white" />
                    <select value={item.taxCategory} onChange={(e) => handleItemChange(idx, 'taxCategory', e.target.value)} className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white">
                      <option value="VAT_16">VAT 16%</option>
                      <option value="ZERO_RATED">Zero-Rated</option>
                      <option value="EXEMPT">Exempt</option>
                    </select>
                    <div className="px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-300 font-mono text-right">
                      {formatCurrency(item.netAmount, quote.currency)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 font-semibold block mb-1.5">Notes</label>
            <textarea
              rows={3}
              value={quote.notes || ''}
              onChange={(e) => setQuote({ ...quote, notes: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs"
            />
          </div>
        </fieldset>

        <div className="w-full lg:w-1/2 bg-slate-900/50 p-6 overflow-y-auto flex items-start justify-center">
          <LiveDocumentPreview document={quote} type="QUOTATION" templateId={quote.templateId} zoomScale={zoomScale} />
        </div>
      </div>
    </div>
  );
};

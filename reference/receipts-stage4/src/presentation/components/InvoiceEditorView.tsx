/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { InvoiceEntity, ClientEntity, LineItem, TaxCategory, TemplateId, CurrencyCode } from '../../types';
import { StorageService } from '../../infrastructure/storage';
import { DocumentService } from '../../application/documentService';
import { calculateLineItem, calculateDocumentTotals, formatCurrency } from '../../domain/math';
import { DOCUMENT_TEMPLATES } from '../../application/templateService';
import { DocumentStateMachine } from '../../domain/stateMachines';
import { LiveDocumentPreview } from './LiveDocumentPreview';
import { IssueAdjustmentNoteModal } from './IssueAdjustmentNoteModal';
import { ExportMenu } from './ExportMenu';
import { ShareMenu } from './ShareMenu';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Printer,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileCheck,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface InvoiceEditorViewProps {
  initialInvoice?: InvoiceEntity;
  onBack: () => void;
  onSaved: (invoice: InvoiceEntity) => void;
}

export const InvoiceEditorView: React.FC<InvoiceEditorViewProps> = ({
  initialInvoice,
  onBack,
  onSaved,
}) => {
  const clients = StorageService.getClients();
  const [creationError] = useState<string | null>(() => {
    if (!initialInvoice && clients.length === 0) {
      return 'Add at least one client before creating an invoice.';
    }
    return null;
  });
  const [invoice, setInvoice] = useState<InvoiceEntity | null>(() => {
    if (initialInvoice) return initialInvoice;
    if (clients.length === 0) return null;
    try {
      return DocumentService.createDraftInvoice(clients[0].id);
    } catch {
      return null;
    }
  });

  const [zoomScale, setZoomScale] = useState<number>(0.85);
  const [error, setError] = useState<string | null>(null);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [adjustmentModal, setAdjustmentModal] = useState<'CREDIT' | 'DEBIT' | null>(null);

  // Once a document leaves DRAFT it is immutable: no field edits, no save.
  // The editor becomes a read-only viewer (still fully printable/exportable).
  const isReadOnly = invoice ? invoice.status !== 'DRAFT' : false;

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] text-slate-400 gap-3 px-6 text-center">
        <p className="text-sm font-semibold text-white">Cannot create an invoice yet</p>
        <p className="text-xs max-w-sm">{creationError || 'No client record is available for this invoice.'}</p>
        <button
          onClick={onBack}
          className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-slate-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  // Recalculate totals whenever items or WHT settings change
  const updateItemsAndTotals = (newItems: LineItem[], whtEnabled: boolean = invoice.withholdingTaxDeductible) => {
    const totals = calculateDocumentTotals(newItems, whtEnabled, invoice.withholdingTaxRate || '0.05');
    setInvoice((prev) => ({
      ...prev,
      items: newItems,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      taxBreakdowns: totals.taxBreakdowns,
      withholdingTaxDeductible: whtEnabled,
      withholdingTaxAmount: totals.withholdingTaxAmount,
      totalAmount: totals.totalAmount,
      balanceDue: totals.totalAmount,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleClientChange = (clientId: string) => {
    if (isReadOnly) return;
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;

    setInvoice((prev) => (prev ? {
      ...prev,
      clientId: client.id,
      clientName: client.name,
      clientEmail: client.email,
      clientKraPin: client.kraPin,
      clientAddress: client.address,
      currency: client.currency,
      paymentTermsDays: client.paymentTermsDays,
    } : prev));
  };

  const handleItemChange = (index: number, field: keyof LineItem, value: any) => {
    if (isReadOnly) return;
    const updated = [...invoice.items];
    const current = { ...updated[index], [field]: value };

    // Recompute line math using Decimal.js engine
    const mathResult = calculateLineItem(
      current.quantity,
      current.unitPrice,
      current.discountPercentage,
      current.taxCategory
    );

    current.grossAmount = mathResult.grossAmount;
    current.taxAmount = mathResult.taxAmount;
    current.netAmount = mathResult.netAmount;
    current.taxRate = mathResult.taxRate;

    updated[index] = current;
    updateItemsAndTotals(updated);
  };

  const handleAddItem = () => {
    if (isReadOnly) return;
    // Genuinely blank line item — no fabricated price, so a forgotten row
    // can never accidentally bill a client for an amount nobody entered.
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
    updateItemsAndTotals([...invoice.items, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    if (isReadOnly) return;
    if (invoice.items.length <= 1) return;
    const updated = invoice.items.filter((_, idx) => idx !== index);
    updateItemsAndTotals(updated);
  };

  const handleSaveDraft = () => {
    setError(null);
    try {
      const saved = DocumentService.saveDraftInvoice(invoice);
      onSaved(saved);
    } catch (err: any) {
      setError(err.message || 'Failed to save draft');
    }
  };

  const handleFinalize = () => {
    setError(null);
    if (!invoice.clientEmail?.trim() && !invoice.clientAddress?.trim()) {
      setError('Client record is missing contact details — update the client before issuing.');
      return;
    }
    try {
      const finalized = DocumentService.finalizeInvoice(invoice);
      onSaved(finalized);
    } catch (err: any) {
      setError(err.message || 'Failed to finalize invoice');
    }
  };

  const canVoid = invoice.status !== 'DRAFT' && DocumentStateMachine.canTransition(invoice.status, 'VOID');

  const handleVoid = () => {
    if (!voidReason.trim()) {
      setError('A reason is required to void this invoice.');
      return;
    }
    try {
      const voided = DocumentService.voidInvoice(invoice.id, voidReason);
      setShowVoidConfirm(false);
      setVoidReason('');
      onSaved(voided);
    } catch (err: any) {
      setError(err.message || 'Failed to void invoice');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-950 text-slate-200">
      {/* Top Editor Toolbar */}
      <div className="h-14 border-b border-slate-800 bg-slate-900/90 px-6 flex items-center justify-between no-print">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">Invoice Editor</span>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-indigo-500/20 text-indigo-300">
                {invoice.documentNumber}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-slate-800 text-slate-300">
                {invoice.status}
              </span>
            </div>
          </div>
        </div>

        {/* Center Template Picker */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Template:</span>
            <select
              value={invoice.templateId}
              onChange={(e) => setInvoice({ ...invoice, templateId: e.target.value as TemplateId })}
              className="bg-slate-800 border border-slate-700 text-white rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500"
            >
              {DOCUMENT_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.category})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-md p-0.5">
            <button
              onClick={() => setZoomScale((z) => Math.max(0.5, z - 0.1))}
              className="p-1 text-slate-400 hover:text-white"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-slate-300 px-1 font-mono">{Math.round(zoomScale * 100)}%</span>
            <button
              onClick={() => setZoomScale((z) => Math.min(1.2, z + 0.1))}
              className="p-1 text-slate-400 hover:text-white"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <ExportMenu filename={invoice.documentNumber} />
          {isReadOnly && <ShareMenu document={invoice} type="INVOICE" filename={invoice.documentNumber} />}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print A4</span>
          </button>
          {!isReadOnly && (
            <>
              <button
                onClick={handleSaveDraft}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
              >
                Save Draft
              </button>
              <button
                onClick={handleFinalize}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm transition"
              >
                <FileCheck className="w-3.5 h-3.5" />
                <span>Finalize & Issue</span>
              </button>
            </>
          )}
        </div>
      </div>

      {isReadOnly && (
        <div className="p-3 bg-indigo-500/10 border-b border-indigo-500/30 text-indigo-300 text-xs font-medium px-6 flex items-center justify-between gap-2 no-print">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>
              This document has been issued and is immutable — its content can no longer be edited. Amount paid and
              status still update automatically as payments are recorded.
            </span>
          </div>
          {canVoid && (
            <div className="flex items-center gap-2 shrink-0">
              {invoice.status !== 'PAID' && new Decimal(invoice.balanceDue).gt(0) && (
                <button
                  onClick={() => setAdjustmentModal('CREDIT')}
                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded text-[11px] font-semibold border border-emerald-500/20"
                >
                  Issue Credit Note
                </button>
              )}
              <button
                onClick={() => setAdjustmentModal('DEBIT')}
                className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded text-[11px] font-semibold border border-amber-500/20"
              >
                Issue Debit Note
              </button>
              <button
                onClick={() => setShowVoidConfirm(true)}
                className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded text-[11px] font-semibold border border-rose-500/20"
              >
                Void Invoice
              </button>
            </div>
          )}
        </div>
      )}

      {adjustmentModal && (
        <IssueAdjustmentNoteModal
          kind={adjustmentModal}
          invoice={invoice}
          onClose={() => setAdjustmentModal(null)}
          onIssued={() => {
            const refreshed = StorageService.getInvoices().find((i) => i.id === invoice.id);
            if (refreshed) setInvoice(refreshed);
          }}
        />
      )}

      {showVoidConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full text-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-950">
              <h3 className="text-sm font-bold text-white">Void {invoice.documentNumber}</h3>
            </div>
            <div className="p-6 space-y-3 text-xs">
              <p className="text-slate-400">
                Voiding removes the unpaid remainder from the client's outstanding exposure. The original document
                stays fully readable for audit purposes — it is not deleted. Any amount already collected is left
                untouched.
              </p>
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
              <button onClick={() => setShowVoidConfirm(false)} className="px-4 py-2 text-xs text-slate-400 hover:text-white">
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

      {error && (
        <div className="p-3 bg-rose-500/15 border-b border-rose-500/30 text-rose-300 text-xs font-medium px-6">
          {error}
        </div>
      )}

      {/* Main Split-Screen Workspace — stacks vertically below lg to keep both the
          editor and the A4 preview usable on tablet/mobile widths. */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        {/* Left Column: Editor Controls */}
        <fieldset
          disabled={isReadOnly}
          className="w-full lg:w-1/2 border-b lg:border-b-0 lg:border-r border-slate-800 lg:overflow-y-auto p-6 space-y-6 no-print disabled:opacity-70"
        >
          {/* Section 1: Client Selection */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Client Record</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Select Client</label>
                <select
                  value={invoice.clientId}
                  onChange={(e) => handleClientChange(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1">KRA PIN</label>
                <input
                  type="text"
                  value={invoice.clientKraPin || ''}
                  onChange={(e) => setInvoice({ ...invoice, clientKraPin: e.target.value })}
                  placeholder="e.g. P000600000Z"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Document Specs */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Document Specifications</h3>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Issue Date</label>
                <input
                  type="date"
                  value={invoice.issueDate}
                  onChange={(e) => setInvoice({ ...invoice, issueDate: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Due Date</label>
                <input
                  type="date"
                  value={invoice.dueDate}
                  onChange={(e) => setInvoice({ ...invoice, dueDate: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Currency</label>
                <select
                  value={invoice.currency}
                  onChange={(e) => setInvoice({ ...invoice, currency: e.target.value as CurrencyCode })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold"
                >
                  <option value="KES">KES</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Deliverables Builder */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Deliverables & Services Builder</h3>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Deliverable</span>
              </button>
            </div>

            <div className="space-y-3">
              {invoice.items.map((item, idx) => (
                <div key={item.id} className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Service / deliverable description..."
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      disabled={invoice.items.length <= 1}
                      className="p-1.5 text-slate-500 hover:text-rose-400 disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] text-slate-500 block">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block">Unit Type</label>
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block">Rate / Price</label>
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block">Tax Category</label>
                      <select
                        value={item.taxCategory}
                        onChange={(e) => handleItemChange(idx, 'taxCategory', e.target.value as TaxCategory)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-[11px]"
                      >
                        <option value="VAT_16">VAT 16%</option>
                        <option value="ZERO_RATED">Zero Rated 0%</option>
                        <option value="EXEMPT">Exempt</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1 border-t border-slate-900">
                    <span>Tax: {formatCurrency(item.taxAmount, invoice.currency)}</span>
                    <span className="font-bold text-white">Line Total: {formatCurrency(item.netAmount, invoice.currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Totals & Tax Settlement */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Settlement & Tax Deductions</h3>
            <div className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-lg border border-slate-800 text-xs">
              <div>
                <p className="font-semibold text-white">Withholding Tax (WHT 5%) Deductible</p>
                <p className="text-[10px] text-slate-400">Deducted at source by registered withholding tax agents</p>
              </div>
              <input
                type="checkbox"
                checked={invoice.withholdingTaxDeductible}
                onChange={(e) => updateItemsAndTotals(invoice.items, e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            <div className="p-3 bg-slate-950/80 rounded-lg space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal (Net Excl. Tax):</span>
                <span className="font-mono text-white">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Value Added Tax (16%):</span>
                <span className="font-mono text-white">{formatCurrency(invoice.taxTotal, invoice.currency)}</span>
              </div>
              {invoice.withholdingTaxDeductible && (
                <div className="flex justify-between text-amber-400">
                  <span>Less: WHT 5%:</span>
                  <span className="font-mono">- {formatCurrency(invoice.withholdingTaxAmount, invoice.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-white border-t border-slate-800 pt-2 mt-2">
                <span>Net Payable Amount:</span>
                <span className="font-mono text-indigo-400">{formatCurrency(invoice.totalAmount, invoice.currency)}</span>
              </div>
            </div>
          </div>

          {/* Section 5: Terms & Remarks */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3 text-xs">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Terms & Remarks</h3>
            <div>
              <label className="text-slate-400 block mb-1">Client Remarks</label>
              <textarea
                rows={2}
                value={invoice.notes || ''}
                onChange={(e) => setInvoice({ ...invoice, notes: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Legal Attestation & Terms</label>
              <textarea
                rows={2}
                value={invoice.legalTerms || ''}
                onChange={(e) => setInvoice({ ...invoice, legalTerms: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-[11px]"
              />
            </div>
          </div>
        </fieldset>

        {/* Right Column: Live Document Engine A4 Preview */}
        <div className="w-full lg:w-1/2 bg-slate-900/50 p-6 overflow-y-auto flex items-start justify-center">
          <div className="relative">
            <LiveDocumentPreview
              document={invoice}
              type="INVOICE"
              templateId={invoice.templateId}
              zoomScale={zoomScale}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { TemplateId, DocumentTemplateConfig } from '../../types';
import { DOCUMENT_TEMPLATES } from '../../application/templateService';
import { StorageService } from '../../infrastructure/storage';
import { LiveDocumentPreview } from './LiveDocumentPreview';
import {
  Palette,
  CheckCircle2,
  Sliders,
  Eye,
  X,
  Printer,
  ShieldCheck,
  QrCode,
  Smartphone,
} from 'lucide-react';

interface TemplatesViewProps {
  onTemplateChanged: (id: TemplateId) => void;
}

export const TemplatesView: React.FC<TemplatesViewProps> = ({ onTemplateChanged }) => {
  const [activeTemplateId, setActiveTemplateId] = useState<TemplateId>(() => StorageService.getActiveTemplate());
  const [categoryFilter, setCategoryFilter] = useState<string>('All Templates');
  const [previewTemplate, setPreviewTemplate] = useState<DocumentTemplateConfig | null>(null);

  // Customizer Studio states
  const [showKraBreakdown, setShowKraBreakdown] = useState(true);
  const [showVerificationQr, setShowVerificationQr] = useState(true);
  const [showMpesaBox, setShowMpesaBox] = useState(true);
  const [showSeal, setShowSeal] = useState(true);

  const categories = [
    'All Templates',
    'Corporate & Executive',
    'Minimalist & Modern',
    'Creative & Studio',
    'Compact & High-Density',
  ];

  const handleSelectTemplate = (id: TemplateId) => {
    setActiveTemplateId(id);
    StorageService.setActiveTemplate(id);
    onTemplateChanged(id);
    StorageService.logAction(StorageService.getCurrentActor(), 'SET_TEMPLATE', 'INVOICE', id, `Updated default organization document template to ${id}.`);
  };

  const filteredTemplates = DOCUMENT_TEMPLATES.filter((t) => {
    if (categoryFilter === 'All Templates') return true;
    return t.category === categoryFilter;
  });

  const sampleInvoice = StorageService.getInvoices()[0];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto text-slate-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Stationery Atelier</span>
            <span className="text-slate-600">•</span>
            <span className="text-xs text-slate-400">Design System</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-0.5">
            Document Templates & Brand Styling
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Curated financial stationery layouts with bespoke typography, grid geometry, and regulatory stamps
          </p>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              categoryFilter === cat
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Main Grid: Template Cards & Customizer Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Templates Grid (2 cols on large screen) */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {filteredTemplates.map((template) => {
            const isActive = activeTemplateId === template.id;
            return (
              <div
                key={template.id}
                className={`p-5 rounded-xl border transition flex flex-col justify-between ${
                  isActive
                    ? 'bg-slate-900 border-indigo-500 ring-1 ring-indigo-500/50 shadow-lg shadow-indigo-950/40'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  {/* Visual Layout Mock Frame */}
                  <div className="h-36 rounded-lg bg-slate-950 border border-slate-800 p-3 mb-4 flex flex-col justify-between overflow-hidden relative group">
                    <div className="flex justify-between items-start">
                      <div className="w-8 h-2.5 rounded-xs" style={{ backgroundColor: template.primaryColor }}></div>
                      <div className="w-12 h-2 rounded-xs bg-slate-800"></div>
                    </div>

                    <div className="space-y-1.5 my-auto">
                      <div className="w-3/4 h-1.5 rounded-xs bg-slate-800"></div>
                      <div className="w-1/2 h-1.5 rounded-xs bg-slate-800/60"></div>
                      <div className="w-full h-1 rounded-xs bg-slate-900"></div>
                      <div className="w-full h-1 rounded-xs bg-slate-900"></div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-900">
                      <div className="w-14 h-1.5 rounded-xs" style={{ backgroundColor: template.accentColor }}></div>
                      <div className="w-8 h-1.5 rounded-xs bg-slate-800"></div>
                    </div>

                    {/* Hover Overlay with Preview button */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                      <button
                        onClick={() => setPreviewTemplate(template)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold flex items-center gap-1.5 shadow-md"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview A4</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-sm font-bold text-white">{template.name}</h3>
                      <span className="text-[10px] text-indigo-400 font-medium">{template.category}</span>
                    </div>
                    {isActive && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Active Default
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                    {template.description}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-mono truncate max-w-[130px]">
                    {template.fontFamily.split(',')[0].replace(/'/g, '')}
                  </span>
                  {!isActive ? (
                    <button
                      onClick={() => handleSelectTemplate(template.id)}
                      className="px-3 py-1 bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-300 text-xs font-semibold rounded-lg transition"
                    >
                      Set as Default
                    </button>
                  ) : (
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Applied
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Customizer Studio Drawer */}
        <div className="p-6 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-6 text-xs">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-white tracking-tight">Customizer Studio</h2>
          </div>

          {/* Logo & Brand Geometry */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Brand Emblem & Geometry
            </h3>
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-indigo-600 flex items-center justify-center font-bold text-white text-sm">
                AL
              </div>
              <div>
                <p className="font-semibold text-white">Apex Ledger Vector Mark</p>
                <p className="text-[10px] text-slate-500">240 x 240 px SVG Monogram</p>
              </div>
            </div>
          </div>

          {/* Color Anchors */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Color Anchors
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-slate-900 border border-slate-700"></div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Primary</span>
                  <span className="font-mono font-semibold text-white">#0F172A</span>
                </div>
              </div>
              <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-amber-500"></div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Accent</span>
                  <span className="font-mono font-semibold text-white">#D97706</span>
                </div>
              </div>
            </div>
          </div>

          {/* Statutory & Compliance Elements */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Statutory & Verification Elements
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 bg-slate-950/70 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  <span>KRA VAT Breakdown</span>
                </div>
                <input
                  type="checkbox"
                  checked={showKraBreakdown}
                  onChange={(e) => setShowKraBreakdown(e.target.checked)}
                  className="accent-indigo-600"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-950/70 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2">
                  <QrCode className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Document QR Verification Code</span>
                </div>
                <input
                  type="checkbox"
                  checked={showVerificationQr}
                  onChange={(e) => setShowVerificationQr(e.target.checked)}
                  className="accent-indigo-600"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-950/70 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>M-Pesa Paybill Directives</span>
                </div>
                <input
                  type="checkbox"
                  checked={showMpesaBox}
                  onChange={(e) => setShowMpesaBox(e.target.checked)}
                  className="accent-indigo-600"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-950/70 rounded-lg border border-slate-800">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Director Seal & Attestation</span>
                </div>
                <input
                  type="checkbox"
                  checked={showSeal}
                  onChange={(e) => setShowSeal(e.target.checked)}
                  className="accent-indigo-600"
                />
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-800/40 text-[11px] text-slate-400 leading-relaxed">
            Active default template styling is automatically inherited by all newly generated invoices, receipts, and quotations.
          </div>
        </div>
      </div>

      {/* A4 Fullscreen Modal Preview */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-4xl w-full text-slate-200 overflow-hidden my-6">
            <div className="px-6 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <span className="text-sm font-bold text-white">
                Template Preview: {previewTemplate.name}
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    handleSelectTemplate(previewTemplate.id);
                    setPreviewTemplate(null);
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold"
                >
                  Apply as Default
                </button>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 bg-slate-950/50 flex justify-center max-h-[80vh] overflow-y-auto">
              {sampleInvoice && (
                <LiveDocumentPreview
                  document={sampleInvoice}
                  type="INVOICE"
                  templateId={previewTemplate.id}
                  zoomScale={0.8}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

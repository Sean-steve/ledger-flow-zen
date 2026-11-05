/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CurrencyCode, InvoiceEntity, PaymentRecord, ReceiptEntity, QuotationEntity, ClientEntity, CreditNoteEntity, DebitNoteEntity } from './types';
import { StorageService } from './infrastructure/storage';
import { Header } from './presentation/components/Header';
import { Sidebar } from './presentation/components/Sidebar';
import { DashboardView } from './presentation/components/DashboardView';
import { InvoicesListView } from './presentation/components/InvoicesListView';
import { InvoiceEditorView } from './presentation/components/InvoiceEditorView';
import { PaymentsView } from './presentation/components/PaymentsView';
import { ReceiptsView } from './presentation/components/ReceiptsView';
import { QuotationsView } from './presentation/components/QuotationsView';
import { QuotationEditorView } from './presentation/components/QuotationEditorView';
import { CreditNotesView } from './presentation/components/CreditNotesView';
import { DebitNotesView } from './presentation/components/DebitNotesView';
import { ClientsView } from './presentation/components/ClientsView';
import { TemplatesView } from './presentation/components/TemplatesView';
import { ReportsView } from './presentation/components/ReportsView';
import { AuditLogView } from './presentation/components/AuditLogView';
import { SettingsView } from './presentation/components/SettingsView';
import { RecordPaymentModal } from './presentation/components/RecordPaymentModal';
import { LiveDocumentPreview } from './presentation/components/LiveDocumentPreview';
import { ExportMenu } from './presentation/components/ExportMenu';
import { ShareMenu } from './presentation/components/ShareMenu';
import { X, Printer } from 'lucide-react';

type PreviewableDoc =
  | { document: InvoiceEntity; type: 'INVOICE'; templateId: string; label: string }
  | { document: QuotationEntity; type: 'QUOTATION'; templateId: string; label: string }
  | { document: CreditNoteEntity; type: 'CREDIT_NOTE'; templateId: string; label: string }
  | { document: DebitNoteEntity; type: 'DEBIT_NOTE'; templateId: string; label: string };

export default function App() {
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('KES');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Domain state collections
  const [invoices, setInvoices] = useState<InvoiceEntity[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [receipts, setReceipts] = useState<ReceiptEntity[]>([]);
  const [quotations, setQuotations] = useState<QuotationEntity[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNoteEntity[]>([]);
  const [debitNotes, setDebitNotes] = useState<DebitNoteEntity[]>([]);
  const [clients, setClients] = useState<ClientEntity[]>([]);

  // Modals & Active Document Editing State
  const [editingInvoice, setEditingInvoice] = useState<InvoiceEntity | undefined>(undefined);
  const [editingQuotation, setEditingQuotation] = useState<QuotationEntity | undefined>(undefined);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentTargetInvoiceId, setPaymentTargetInvoiceId] = useState<string | undefined>(undefined);
  const [previewingDoc, setPreviewingDoc] = useState<PreviewableDoc | null>(null);
  const [targetedReceiptId, setTargetedReceiptId] = useState<string | null>(null);

  const refreshData = () => {
    setInvoices(StorageService.getInvoices());
    setPayments(StorageService.getPayments());
    setReceipts(StorageService.getReceipts());
    setQuotations(StorageService.getQuotations());
    setCreditNotes(StorageService.getCreditNotes());
    setDebitNotes(StorageService.getDebitNotes());
    setClients(StorageService.getClients());
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleOpenCreateInvoice = () => {
    setEditingInvoice(undefined);
    setCurrentView('invoice-editor');
  };

  const handleEditInvoice = (inv: InvoiceEntity) => {
    setEditingInvoice(inv);
    setCurrentView('invoice-editor');
  };

  const handleOpenRecordPayment = (invoiceId?: string) => {
    setPaymentTargetInvoiceId(invoiceId);
    setIsPaymentModalOpen(true);
  };

  const handleOpenCreateQuote = () => {
    setEditingQuotation(undefined);
    setCurrentView('quotation-editor');
  };

  const handleEditQuotation = (q: QuotationEntity) => {
    setEditingQuotation(q);
    setCurrentView('quotation-editor');
  };

  const handleViewReceiptFromPayment = (receiptId: string) => {
    setTargetedReceiptId(receiptId);
    setCurrentView('receipts');
  };

  const unpaidCount = invoices.filter(
    (i) => i.status !== 'PAID' && i.status !== 'VOID' && i.status !== 'CANCELLED'
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Canonical Top Header */}
      <Header
        selectedCurrency={selectedCurrency}
        onCurrencyChange={setSelectedCurrency}
        onOpenCreateInvoice={handleOpenCreateInvoice}
        onOpenRecordPayment={() => handleOpenRecordPayment()}
        onOpenCreateQuote={handleOpenCreateQuote}
        onNavigate={setCurrentView}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />

      {/* Main Layout Workspace */}
      <div className="flex flex-1">
        {/* Sidebar Navigation */}
        <div className="no-print">
          <Sidebar
            currentView={currentView}
            onNavigate={setCurrentView}
            unpaidCount={unpaidCount}
          />
        </div>

        {/* Dynamic Viewport */}
        <main className="flex-1 overflow-y-auto bg-slate-950/60">
          {currentView === 'dashboard' && (
            <DashboardView
              selectedCurrency={selectedCurrency}
              invoices={invoices}
              payments={payments}
              onOpenCreateInvoice={handleOpenCreateInvoice}
              onOpenRecordPayment={handleOpenRecordPayment}
              onOpenCreateQuote={handleOpenCreateQuote}
              onNavigate={setCurrentView}
            />
          )}

          {currentView === 'invoices' && (
            <InvoicesListView
              invoices={invoices}
              onCreateInvoice={handleOpenCreateInvoice}
              onEditInvoice={handleEditInvoice}
              onRecordPayment={handleOpenRecordPayment}
              onPrintInvoice={(inv) => setPreviewingDoc({ document: inv, type: 'INVOICE', templateId: inv.templateId, label: `${inv.documentNumber} • ${inv.clientName}` })}
            />
          )}

          {currentView === 'invoice-editor' && (
            <InvoiceEditorView
              initialInvoice={editingInvoice}
              onBack={() => {
                refreshData();
                setCurrentView('invoices');
              }}
              onSaved={(savedInv) => {
                refreshData();
                setEditingInvoice(savedInv);
                setCurrentView('invoices');
              }}
            />
          )}

          {currentView === 'payments' && (
            <PaymentsView
              payments={payments}
              onOpenRecordPayment={() => handleOpenRecordPayment()}
              onViewReceipt={handleViewReceiptFromPayment}
              onPaymentReversed={refreshData}
            />
          )}

          {currentView === 'receipts' && (
            <ReceiptsView
              receipts={receipts}
              selectedReceiptId={targetedReceiptId}
              onClearSelectedReceipt={() => setTargetedReceiptId(null)}
            />
          )}

          {currentView === 'quotations' && (
            <QuotationsView
              quotations={quotations}
              onQuotationConverted={refreshData}
              onOpenCreateQuote={handleOpenCreateQuote}
              onEditQuotation={handleEditQuotation}
              onPreview={(q) => setPreviewingDoc({ document: q, type: 'QUOTATION', templateId: q.templateId, label: `${q.quotationNumber} • ${q.clientName}` })}
            />
          )}

          {currentView === 'quotation-editor' && (
            <QuotationEditorView
              initialQuotation={editingQuotation}
              onBack={() => {
                refreshData();
                setCurrentView('quotations');
              }}
              onSaved={(savedQuote) => {
                refreshData();
                setEditingQuotation(savedQuote);
                setCurrentView('quotations');
              }}
            />
          )}

          {currentView === 'credit-notes' && (
            <CreditNotesView
              creditNotes={creditNotes}
              onVoided={refreshData}
              onPreview={(n) => setPreviewingDoc({ document: n, type: 'CREDIT_NOTE', templateId: n.templateId, label: `${n.creditNoteNumber} • ${n.clientName}` })}
            />
          )}

          {currentView === 'debit-notes' && (
            <DebitNotesView
              debitNotes={debitNotes}
              onVoided={refreshData}
              onPreview={(n) => setPreviewingDoc({ document: n, type: 'DEBIT_NOTE', templateId: n.templateId, label: `${n.debitNoteNumber} • ${n.clientName}` })}
            />
          )}

          {currentView === 'clients' && (
            <ClientsView
              clients={clients}
              onClientAdded={refreshData}
            />
          )}

          {currentView === 'reports' && (
            <ReportsView />
          )}

          {currentView === 'templates' && (
            <TemplatesView
              onTemplateChanged={() => {
                refreshData();
              }}
            />
          )}

          {currentView === 'audit-log' && (
            <AuditLogView />
          )}

          {currentView === 'settings' && (
            <SettingsView
              onSettingsUpdated={refreshData}
            />
          )}
        </main>
      </div>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setPaymentTargetInvoiceId(undefined);
        }}
        onPaymentRecorded={refreshData}
        initialInvoiceId={paymentTargetInvoiceId}
      />

      {/* Standalone Printable Document A4 Modal */}
      {previewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-4xl w-full text-slate-200 overflow-hidden my-6">
            <div className="px-6 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-950 no-print">
              <span className="text-sm font-bold text-white font-mono">
                {previewingDoc.label}
              </span>
              <div className="flex items-center gap-2">
                <ExportMenu filename={previewingDoc.label.split(' •')[0]} />
                <ShareMenu document={previewingDoc.document} type={previewingDoc.type} filename={previewingDoc.label.split(' •')[0]} />
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Document</span>
                </button>
                <button
                  onClick={() => setPreviewingDoc(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 bg-slate-950/50 flex justify-center max-h-[85vh] overflow-y-auto">
              <LiveDocumentPreview
                document={previewingDoc.document}
                type={previewingDoc.type}
                templateId={previewingDoc.templateId}
                zoomScale={0.8}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

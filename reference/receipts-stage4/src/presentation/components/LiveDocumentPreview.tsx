/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { InvoiceEntity, ReceiptEntity, QuotationEntity, CreditNoteEntity, DebitNoteEntity, CurrencyCode } from '../../types';
import { getTemplateById } from '../../application/templateService';
import { formatCurrency } from '../../domain/math';
import { StorageService } from '../../infrastructure/storage';
import { ShieldCheck, QrCode } from 'lucide-react';

interface LiveDocumentPreviewProps {
  document: InvoiceEntity | ReceiptEntity | QuotationEntity | CreditNoteEntity | DebitNoteEntity;
  type?: 'INVOICE' | 'RECEIPT' | 'QUOTATION' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  templateId?: string;
  zoomScale?: number;
}

export const LiveDocumentPreview: React.FC<LiveDocumentPreviewProps> = ({
  document,
  type = 'INVOICE',
  templateId,
  zoomScale = 1,
}) => {
  const biz = StorageService.getBusiness();
  const selectedTemplate = getTemplateById((templateId || (document as any).templateId || 'executive-atelier') as any);

  const isInvoice = type === 'INVOICE' || (document as any).type === 'INVOICE';
  const isReceipt = type === 'RECEIPT' || (document as any).receiptNumber !== undefined;
  const isQuotation = type === 'QUOTATION' || (document as any).quotationNumber !== undefined;
  const isCreditNote = type === 'CREDIT_NOTE' || (document as any).creditNoteNumber !== undefined;
  const isDebitNote = type === 'DEBIT_NOTE' || (document as any).debitNoteNumber !== undefined;
  const isAdjustmentNote = isCreditNote || isDebitNote;

  const invoice = isInvoice ? (document as InvoiceEntity) : null;
  const receipt = isReceipt ? (document as ReceiptEntity) : null;
  const quote = isQuotation ? (document as QuotationEntity) : null;
  const adjNote = isAdjustmentNote ? (document as CreditNoteEntity | DebitNoteEntity) : null;

  const docNumber = isInvoice
    ? invoice?.documentNumber
    : isReceipt
    ? receipt?.receiptNumber
    : isCreditNote
    ? (document as CreditNoteEntity).creditNoteNumber
    : isDebitNote
    ? (document as DebitNoteEntity).debitNoteNumber
    : quote?.quotationNumber;

  const docTitle = isInvoice
    ? 'TAX INVOICE'
    : isReceipt
    ? 'OFFICIAL RECEIPT'
    : isCreditNote
    ? 'CREDIT NOTE'
    : isDebitNote
    ? 'DEBIT NOTE'
    : 'QUOTATION';
  const currency: CurrencyCode = (document as any).currency || 'KES';

  return (
    <div
      className="bg-white text-slate-900 shadow-2xl rounded-sm mx-auto transition-transform origin-top flex flex-col justify-between"
      style={{
        width: '210mm',
        minHeight: '297mm',
        transform: `scale(${zoomScale})`,
        fontFamily: selectedTemplate.fontFamily,
        padding: '16mm 18mm',
        boxSizing: 'border-box',
      }}
      id="printable-document"
    >
      {/* Document Top Header */}
      <div>
        <div className="flex justify-between items-start border-b border-slate-200 pb-6 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded flex items-center justify-center font-bold text-white tracking-widest text-sm shadow-sm overflow-hidden"
                style={{ backgroundColor: selectedTemplate.primaryColor }}
              >
                {biz.logoUrl ? (
                  <img src={biz.logoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  (biz.tradingName || biz.name || '??').slice(0, 2).toUpperCase()
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-tight">
                  {biz.tradingName}
                </h1>
                <p className="text-xs text-slate-500">{biz.name}</p>
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-600 space-y-0.5 leading-relaxed">
              <p>{biz.physicalAddress}, {biz.city}</p>
              <p>KRA PIN: <span className="font-semibold text-slate-800">{biz.kraPin}</span> {biz.vatNumber && `• VAT: ${biz.vatNumber}`}</p>
              <p>Email: {biz.email} • Tel: {biz.phone}</p>
            </div>
          </div>

          <div className="text-right">
            <div className="inline-block px-3 py-1 rounded text-xs font-semibold uppercase tracking-wider mb-2"
                 style={{ backgroundColor: `${selectedTemplate.accentColor}18`, color: selectedTemplate.accentColor }}>
              {docTitle}
            </div>
            <div className="text-2xl font-bold tracking-tight text-slate-900 font-mono-nums">
              {docNumber}
            </div>
            <div className="text-xs text-slate-500 mt-1 space-y-0.5">
              <p>Date: <span className="font-semibold text-slate-800 font-mono-nums">
                {isInvoice ? invoice?.issueDate : isReceipt ? receipt?.paymentDate.split('T')[0] : isAdjustmentNote ? adjNote?.issueDate : quote?.issueDate}
              </span></p>
              {isInvoice && (
                <p>Due Date: <span className="font-semibold text-slate-800 font-mono-nums">{invoice?.dueDate}</span></p>
              )}
              {isQuotation && (
                <p>Valid Until: <span className="font-semibold text-slate-800 font-mono-nums">{quote?.validUntil}</span></p>
              )}
              <p>Currency: <span className="font-semibold text-slate-800">{document.currency}</span></p>
            </div>
          </div>
        </div>

        {/* Billed To / Client Section */}
        <div className="grid grid-cols-2 gap-8 mb-8 text-xs bg-slate-50/70 p-4 rounded-md border border-slate-100">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              {isReceipt ? 'Received From:' : isAdjustmentNote ? (isCreditNote ? 'Credit To:' : 'Debit To:') : 'Billed To:'}
            </p>
            <p className="text-sm font-bold text-slate-900">
              {isInvoice ? invoice?.clientName : isReceipt ? receipt?.clientName : isAdjustmentNote ? adjNote?.clientName : quote?.clientName}
            </p>
            {isInvoice && invoice?.clientKraPin && (
              <p className="text-slate-600 mt-1">KRA PIN: <span className="font-semibold">{invoice.clientKraPin}</span></p>
            )}
            {isReceipt && receipt?.clientKraPin && (
              <p className="text-slate-600 mt-1">KRA PIN: <span className="font-semibold">{receipt.clientKraPin}</span></p>
            )}
            {isAdjustmentNote && adjNote?.clientKraPin && (
              <p className="text-slate-600 mt-1">KRA PIN: <span className="font-semibold">{adjNote.clientKraPin}</span></p>
            )}
            <p className="text-slate-600 mt-0.5">
              {isInvoice ? invoice?.clientAddress : isAdjustmentNote ? adjNote?.clientAddress : isReceipt ? 'Registered Client' : 'Corporate Account'}
            </p>
            <p className="text-slate-600">
              {isInvoice ? invoice?.clientEmail : quote?.clientEmail}
            </p>
          </div>

          <div className="border-l border-slate-200 pl-6 space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Document Specifications
            </p>
            {(isInvoice || isReceipt) && (
              <div className="flex justify-between text-slate-600">
                <span>Fiscal Status:</span>
                <span
                  className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                    isInvoice && invoice?.kraFiscalStatus === 'TRANSMITTED'
                      ? 'text-emerald-700 bg-emerald-50'
                      : 'text-amber-700 bg-amber-50'
                  }`}
                >
                  {isInvoice
                    ? (invoice?.kraFiscalStatus || 'NOT_CONFIGURED').replace('_', ' ')
                    : 'N/A — DERIVED FROM PAYMENT'}
                </span>
              </div>
            )}
            {isReceipt && (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>Payment Channel:</span>
                  <span className="font-semibold text-slate-800">{receipt?.paymentChannel}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Channel Reference:</span>
                  <span className="font-semibold text-slate-800 font-mono-nums">{receipt?.channelReference}</span>
                </div>
                {receipt?.invoiceNumber && (
                  <div className="flex justify-between text-slate-600">
                    <span>Target Invoice:</span>
                    <span className="font-semibold text-slate-800 font-mono-nums">{receipt.invoiceNumber}</span>
                  </div>
                )}
              </>
            )}
            {isAdjustmentNote && (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>Reference Invoice:</span>
                  <span className="font-semibold text-slate-800 font-mono-nums">{adjNote?.invoiceNumber}</span>
                </div>
                <div className="text-slate-600">
                  <span className="block mb-0.5">Reason:</span>
                  <span className="font-semibold text-slate-800">{adjNote?.reason}</span>
                </div>
                {adjNote?.status === 'VOID' && (
                  <div className="flex justify-between text-rose-700">
                    <span>Status:</span>
                    <span className="font-bold">VOIDED</span>
                  </div>
                )}
              </>
            )}
            {isInvoice && (
              <div className="flex justify-between text-slate-600">
                <span>Payment Terms:</span>
                <span className="font-semibold text-slate-800">{invoice?.paymentTermsDays} Calendar Days</span>
              </div>
            )}
          </div>
        </div>

        {/* Line Items Table (For Invoice or Quotation) */}
        {(isInvoice || isQuotation) && (
          <div className="mb-8">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-900 text-slate-800 uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-2 font-bold">#</th>
                  <th className="py-2.5 px-2 font-bold w-1/2">Description & Deliverable</th>
                  <th className="py-2.5 px-2 font-bold text-center">Qty</th>
                  <th className="py-2.5 px-2 font-bold text-right">Unit Price</th>
                  <th className="py-2.5 px-2 font-bold text-center">Tax</th>
                  <th className="py-2.5 px-2 font-bold text-right">Total ({document.currency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {((isInvoice ? invoice?.items : quote?.items) || []).map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-slate-50/50">
                    <td className="py-3 px-2 text-slate-500 font-mono-nums align-top">{idx + 1}</td>
                    <td className="py-3 px-2 text-slate-900 font-medium align-top">
                      <p>{item.description}</p>
                      {item.unit && <span className="text-[10px] text-slate-500">Unit: {item.unit}</span>}
                    </td>
                    <td className="py-3 px-2 text-center text-slate-700 font-mono-nums align-top">{item.quantity}</td>
                    <td className="py-3 px-2 text-right text-slate-700 font-mono-nums align-top">
                      {formatCurrency(item.unitPrice, currency)}
                    </td>
                    <td className="py-3 px-2 text-center text-slate-600 align-top text-[10px]">
                      {item.taxCategory === 'VAT_16' ? '16%' : item.taxCategory === 'ZERO_RATED' ? '0%' : 'EX'}
                    </td>
                    <td className="py-3 px-2 text-right font-bold text-slate-900 font-mono-nums align-top">
                      {formatCurrency(item.netAmount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Receipt Specific Hero Payment Amount */}
        {isReceipt && (
          <div className="mb-8 p-6 bg-slate-50 border border-slate-200 rounded-md text-center">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">
              Total Amount Acknowledged & Settled
            </p>
            <p className="text-3xl font-extrabold text-slate-900 font-mono-nums">
              {formatCurrency(receipt?.amountPaid || 0, receipt?.currency)}
            </p>
            <p className="text-xs text-slate-600 mt-2">
              Payment Reference: <span className="font-mono font-semibold">{receipt?.channelReference}</span> via {receipt?.paymentChannel}
            </p>
          </div>
        )}

        {/* Adjustment Note (Credit/Debit) Hero Amount */}
        {isAdjustmentNote && adjNote && (
          <div className={`mb-8 p-6 border rounded-md text-center ${isCreditNote ? 'bg-emerald-50/60 border-emerald-200' : 'bg-rose-50/60 border-rose-200'}`}>
            <p className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">
              {isCreditNote ? 'Total Amount Credited' : 'Total Amount Debited (Additional Charge)'}
            </p>
            <p className={`text-3xl font-extrabold font-mono-nums ${isCreditNote ? 'text-emerald-800' : 'text-rose-800'}`}>
              {isCreditNote ? '− ' : '+ '}
              {formatCurrency(adjNote.amount, adjNote.currency)}
            </p>
            <div className="flex justify-center gap-6 mt-3 text-xs text-slate-600">
              <span>Net: <span className="font-mono font-semibold">{formatCurrency(adjNote.netAmount, adjNote.currency)}</span></span>
              <span>Tax: <span className="font-mono font-semibold">{formatCurrency(adjNote.taxAmount, adjNote.currency)}</span></span>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              {isCreditNote ? 'Reduces' : 'Increases'} the balance owed on invoice{' '}
              <span className="font-mono font-semibold">{adjNote.invoiceNumber}</span>
            </p>
          </div>
        )}

        {/* Calculations / Totals Section */}
        {(isInvoice || isQuotation) && (
          <div className="flex justify-end mb-8">
            <div className="w-80 text-xs space-y-2 border-t border-slate-200 pt-3">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal (Net Excl. Tax):</span>
                <span className="font-mono-nums font-semibold text-slate-900">
                  {formatCurrency((isInvoice ? invoice?.subtotal : quote?.subtotal) || 0, document.currency)}
                </span>
              </div>
              {(() => {
                const breakdowns = (isInvoice ? invoice?.taxBreakdowns : quote?.taxBreakdowns) || [];
                const taxTotal = (isInvoice ? invoice?.taxTotal : quote?.taxTotal) || '0';
                if (breakdowns.length === 0) {
                  return (
                    <div className="flex justify-between text-slate-600">
                      <span>Tax:</span>
                      <span className="font-mono-nums font-semibold text-slate-900">
                        {formatCurrency(taxTotal, document.currency)}
                      </span>
                    </div>
                  );
                }
                const CATEGORY_LABEL: Record<string, string> = {
                  VAT_16: 'Value Added Tax',
                  ZERO_RATED: 'Zero-Rated Supply',
                  EXEMPT: 'VAT-Exempt Supply',
                };
                return breakdowns
                  .filter((b) => Number(b.taxableAmount) > 0 || Number(b.taxAmount) > 0)
                  .map((b, idx) => (
                    <div className="flex justify-between text-slate-600" key={`${b.category}-${idx}`}>
                      <span>
                        {CATEGORY_LABEL[b.category] || b.category}
                        {b.category === 'VAT_16' ? ` (${(Number(b.rate) * 100).toFixed(0)}%)` : ''}:
                      </span>
                      <span className="font-mono-nums font-semibold text-slate-900">
                        {formatCurrency(b.taxAmount, document.currency)}
                      </span>
                    </div>
                  ));
              })()}
              {isInvoice && invoice?.withholdingTaxDeductible && (
                <div className="flex justify-between text-amber-700">
                  <span>Less: Withholding Tax (WHT 5%):</span>
                  <span className="font-mono-nums font-semibold">
                    - {formatCurrency(invoice.withholdingTaxAmount || 0, document.currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-slate-900 border-t-2 border-slate-900 pt-2 mt-2">
                <span>Net Payable Amount:</span>
                <span className="font-mono-nums">
                  {formatCurrency((isInvoice ? invoice?.totalAmount : quote?.totalAmount) || 0, document.currency)}
                </span>
              </div>
              {isInvoice && invoice?.amountPaid && Number(invoice.amountPaid) > 0 && (
                <>
                  <div className="flex justify-between text-emerald-700 pt-1">
                    <span>Amount Received / Settled:</span>
                    <span className="font-mono-nums font-semibold">
                      {formatCurrency(invoice.amountPaid, document.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-rose-700 border-t border-slate-200 pt-1">
                    <span>Balance Due:</span>
                    <span className="font-mono-nums">
                      {formatCurrency(invoice.balanceDue, document.currency)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Settlement Directives (M-Pesa & Bank Wire) */}
        {isInvoice && (
          <div className="grid grid-cols-2 gap-4 text-xs border border-slate-200 rounded-md p-3.5 bg-slate-50/50 mb-6">
            <div>
              <p className="font-bold text-slate-900 flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                M-Pesa C2B Paybill Settlement
              </p>
              <p className="text-slate-600">
                Business Number: <span className="font-mono font-bold text-slate-900">{biz.mpesaPaybill?.businessNumber}</span>
              </p>
              <p className="text-slate-600">
                Account No: <span className="font-mono font-bold text-slate-900">{invoice?.documentNumber}</span>
              </p>
            </div>
            <div>
              <p className="font-bold text-slate-900 flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                Bank Wire / RTGS Settlement
              </p>
              <p className="text-slate-600">
                Bank: <span className="font-semibold text-slate-900">{biz.bankDetails?.bankName}</span>
              </p>
              <p className="text-slate-600">
                A/C: <span className="font-mono font-bold text-slate-900">{biz.bankDetails?.accountNumber}</span> • Swift: <span className="font-mono">{biz.bankDetails?.swiftCode}</span>
              </p>
            </div>
          </div>
        )}

        {/* Notes & Legal Terms */}
        <div className="text-[11px] text-slate-500 space-y-1 mb-6 border-t border-slate-100 pt-3">
          {((isInvoice ? invoice?.notes : quote?.notes) || '') && (
            <p><span className="font-semibold text-slate-700">Remarks:</span> {(isInvoice ? invoice?.notes : quote?.notes)}</p>
          )}
          {((isInvoice ? invoice?.legalTerms : null) || '') && (
            <p><span className="font-semibold text-slate-700">Terms:</span> {invoice?.legalTerms}</p>
          )}
        </div>
      </div>

      {/* Footer & Document Reference */}
      <div className="border-t border-slate-200 pt-4 mt-auto">
        <div className="flex justify-between items-end">
          <div className="flex items-center gap-4">
            {selectedTemplate.showVerificationQr && (
              <div className="p-1.5 bg-white border border-slate-200 rounded shadow-xs" title="Document reference marker (not a scannable verification code)">
                <QrCode className="w-12 h-12 text-slate-800" />
              </div>
            )}
            <div className="text-[10px] text-slate-500 space-y-0.5">
              <p className="font-semibold text-slate-700">{biz.tradingName || biz.name || 'Financial Document OS'}</p>
              <p className="font-mono">Document Ref: {docNumber}</p>
            </div>
          </div>

          <div className="text-right">
            {selectedTemplate.showSeal && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200/80 rounded text-amber-800 text-[10px] font-semibold mb-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                COMPANY SEAL
              </div>
            )}
            <p className="text-xs font-bold text-slate-900">
              {biz.authorizedSignatoryName?.trim() || '—'}
            </p>
            <p className="text-[10px] text-slate-500">{biz.authorizedSignatoryTitle?.trim() || 'Authorized Signatory'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

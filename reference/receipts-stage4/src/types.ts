/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DocumentType = 'INVOICE' | 'RECEIPT' | 'QUOTATION' | 'PRO_FORMA' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'STATEMENT';

export type DocumentStatus = 
  | 'DRAFT' 
  | 'ISSUED' 
  | 'VIEWED' 
  | 'PARTIALLY_PAID' 
  | 'PAID' 
  | 'OVERDUE' 
  | 'VOID' 
  | 'CANCELLED';

export type QuotationStatus = 'DRAFT' | 'ISSUED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED';

export type PaymentStatus = 'INITIATED' | 'COMPLETED' | 'RECONCILED' | 'FAILED' | 'REVERSED';

export type PaymentChannel = 'MPESA_C2B' | 'MPESA_TILL' | 'BANK_TRANSFER' | 'RTGS' | 'CASH' | 'CHEQUE' | 'CARD';

export type CurrencyCode = 'KES' | 'USD' | 'EUR' | 'GBP';

export type TaxCategory = 'VAT_16' | 'ZERO_RATED' | 'EXEMPT';

export type TemplateId = 
  | 'executive-atelier'
  | 'modern-minimal'
  | 'midnight-ledger'
  | 'linear-mono'
  | 'editorial-classic'
  | 'nordic-studio'
  | 'swiss-grid'
  | 'compact-ledger';

export interface BusinessEntity {
  id: string;
  name: string;
  tradingName: string;
  kraPin: string;
  vatNumber?: string;
  email: string;
  phone: string;
  physicalAddress: string;
  postalAddress?: string;
  city: string;
  country: string;
  currency: CurrencyCode;
  mpesaPaybill?: {
    businessNumber: string;
    accountReferenceFormat: string;
  };
  bankDetails?: {
    bankName: string;
    branchName: string;
    accountName: string;
    accountNumber: string;
    swiftCode: string;
  };
  logoUrl?: string;
  signatureUrl?: string;
  sealUrl?: string;
  /** Name of the person who will appear as "Authorized Signatory" on issued documents and as the actor in the audit log. */
  authorizedSignatoryName?: string;
  authorizedSignatoryTitle?: string;
}

export interface ClientEntity {
  id: string;
  businessId: string;
  name: string;
  contactPerson?: string;
  email: string;
  phone: string;
  kraPin?: string;
  address: string;
  city: string;
  country: string;
  currency: CurrencyCode;
  paymentTermsDays: number;
  creditLimit?: number;
  totalInvoiced: string;
  totalPaid: string;
  outstandingBalance: string;
  status: 'ACTIVE' | 'ON_HOLD' | 'INACTIVE';
  createdAt: string;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountPercentage: string;
  taxCategory: TaxCategory;
  taxRate: string; // e.g. '0.16'
  grossAmount: string;
  taxAmount: string;
  netAmount: string;
}

export interface DocumentTaxBreakdown {
  category: TaxCategory;
  rate: string;
  taxableAmount: string;
  taxAmount: string;
}

export interface InvoiceEntity {
  id: string;
  businessId: string;
  documentNumber: string;
  type: 'INVOICE';
  status: DocumentStatus;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientKraPin?: string;
  clientAddress: string;
  currency: CurrencyCode;
  exchangeRate: string; // to base KES
  issueDate: string;
  dueDate: string;
  items: LineItem[];
  subtotal: string;
  taxTotal: string;
  taxBreakdowns: DocumentTaxBreakdown[];
  withholdingTaxDeductible: boolean;
  withholdingTaxRate: string; // e.g. '0.05' for 5%
  withholdingTaxAmount: string;
  totalAmount: string;
  amountPaid: string;
  balanceDue: string;
  paymentTermsDays: number;
  notes?: string;
  legalTerms?: string;
  templateId: TemplateId;
  kraFiscalStatus: 'NOT_CONFIGURED' | 'PENDING' | 'TRANSMITTED' | 'FAILED';
  kraQrCodeUrl?: string;
  kraControlUnitCode?: string;
  mpesaInstruction?: string;
  bankInstruction?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptEntity {
  id: string;
  businessId: string;
  receiptNumber: string;
  invoiceId?: string;
  invoiceNumber?: string;
  paymentId: string;
  clientId: string;
  clientName: string;
  clientKraPin?: string;
  amountPaid: string;
  currency: CurrencyCode;
  paymentChannel: PaymentChannel;
  channelReference: string; // e.g. M-Pesa Transaction Code "QDF8723KL"
  paymentDate: string;
  receivedBy: string;
  notes?: string;
  templateId: TemplateId;
  createdAt: string;
}

export type AdjustmentNoteStatus = 'ISSUED' | 'VOID';

/**
 * Credit and debit notes are modeled as amount-based adjustments against a
 * specific already-issued invoice, rather than as fully itemized documents.
 * `amount` is the gross (tax-inclusive) adjustment; `taxAmount`/`netAmount`
 * are apportioned from the original invoice's own tax ratio at the moment
 * the note is issued, so the note's own tax figures are internally
 * consistent even though no new line items are being entered.
 */
export interface CreditNoteEntity {
  id: string;
  businessId: string;
  creditNoteNumber: string;
  status: AdjustmentNoteStatus;
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  clientKraPin?: string;
  clientAddress?: string;
  currency: CurrencyCode;
  issueDate: string;
  amount: string;
  taxAmount: string;
  netAmount: string;
  reason: string;
  templateId: TemplateId;
  createdAt: string;
}

export interface DebitNoteEntity {
  id: string;
  businessId: string;
  debitNoteNumber: string;
  status: AdjustmentNoteStatus;
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  clientKraPin?: string;
  clientAddress?: string;
  currency: CurrencyCode;
  issueDate: string;
  amount: string;
  taxAmount: string;
  netAmount: string;
  reason: string;
  templateId: TemplateId;
  createdAt: string;
}

export interface QuotationEntity {
  id: string;
  businessId: string;
  quotationNumber: string;
  status: QuotationStatus;
  clientId: string;
  clientName: string;
  clientEmail: string;
  currency: CurrencyCode;
  issueDate: string;
  validUntil: string;
  items: LineItem[];
  subtotal: string;
  taxTotal: string;
  taxBreakdowns?: DocumentTaxBreakdown[];
  totalAmount: string;
  templateId: TemplateId;
  notes?: string;
  convertedToInvoiceId?: string;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  businessId: string;
  paymentReference: string; // PAY-2026-0038
  channel: PaymentChannel;
  channelTransactionId: string; // e.g. M-Pesa Ref QDF8723KL
  clientId: string;
  clientName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amount: string;
  currency: CurrencyCode;
  exchangeRate: string;
  paymentDate: string;
  status: PaymentStatus;
  payerName?: string;
  payerPhone?: string; // MSISDN
  receiptId?: string;
  receiptNumber?: string;
  notes?: string;
  createdAt: string;
}

export interface DocumentTemplateConfig {
  id: TemplateId;
  name: string;
  category: 'Corporate & Executive' | 'Minimalist & Modern' | 'Creative & Studio' | 'Compact & High-Density';
  description: string;
  thumbnailColor: string;
  fontFamily: string;
  primaryColor: string;
  accentColor: string;
  showKraBreakdown: boolean;
  showVerificationQr: boolean;
  showMpesaBox: boolean;
  showSeal: boolean;
  watermarkText?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  entityType: 'INVOICE' | 'PAYMENT' | 'RECEIPT' | 'QUOTATION' | 'CLIENT';
  entityId: string;
  details: string;
}

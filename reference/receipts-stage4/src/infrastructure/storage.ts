/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BusinessEntity,
  ClientEntity,
  InvoiceEntity,
  PaymentRecord,
  ReceiptEntity,
  QuotationEntity,
  CreditNoteEntity,
  DebitNoteEntity,
  AuditLogEntry,
  TemplateId,
} from '../types';

const STORAGE_KEYS = {
  BUSINESS: 'fin_os_business_v1',
  CLIENTS: 'fin_os_clients_v1',
  INVOICES: 'fin_os_invoices_v1',
  PAYMENTS: 'fin_os_payments_v1',
  RECEIPTS: 'fin_os_receipts_v1',
  QUOTATIONS: 'fin_os_quotations_v1',
  CREDIT_NOTES: 'fin_os_credit_notes_v1',
  DEBIT_NOTES: 'fin_os_debit_notes_v1',
  AUDIT_LOGS: 'fin_os_audit_logs_v1',
  ACTIVE_TEMPLATE: 'fin_os_active_template_v1',
};

/**
 * Blank business record used the very first time the app runs, before the
 * operator has completed Organization Settings. Deliberately contains no
 * fabricated company identity — every field is empty/neutral so the UI can
 * render honest empty states instead of a fake company.
 */
export const EMPTY_BUSINESS: BusinessEntity = {
  id: 'biz-local-01',
  name: '',
  tradingName: '',
  kraPin: '',
  vatNumber: '',
  email: '',
  phone: '',
  physicalAddress: '',
  city: '',
  country: '',
  currency: 'KES',
  authorizedSignatoryName: '',
  authorizedSignatoryTitle: '',
};

export const DEMO_BUSINESS: BusinessEntity = {
  id: 'biz-apex-01',
  name: 'Apex Ledger Financial Technologies Ltd',
  tradingName: 'Apex Ledger',
  kraPin: 'P051894291B',
  vatNumber: 'VAT-051894291',
  email: 'treasury@apexledger.co.ke',
  phone: '+254 712 345 678',
  physicalAddress: 'Level 14, Delta Corner Annex, Chiromo Road, Westlands',
  city: 'Nairobi',
  country: 'Kenya',
  currency: 'KES',
  mpesaPaybill: {
    businessNumber: '408221',
    accountReferenceFormat: 'INV-{DOCUMENT_NO}',
  },
  bankDetails: {
    bankName: 'NCBA Bank Kenya PLC',
    branchName: 'Upper Hill Headquarters',
    accountName: 'Apex Ledger Financial Tech Ltd',
    accountNumber: '1002938491',
    swiftCode: 'CBAFKENX',
  },
  logoUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=240&auto=format&fit=crop&q=80',
};

export const DEMO_CLIENTS: ClientEntity[] = [
  {
    id: 'client-001',
    businessId: 'biz-apex-01',
    name: 'Safaricom Alpha Enterprise',
    contactPerson: 'Dennis Omondi',
    email: 'enterprise-billing@safaricom.co.ke',
    phone: '+254 722 000 111',
    kraPin: 'P000600000Z',
    address: 'Safaricom HQ, Waiyaki Way',
    city: 'Nairobi',
    country: 'Kenya',
    currency: 'KES',
    paymentTermsDays: 30,
    creditLimit: 10000000,
    totalInvoiced: '4250000.00',
    totalPaid: '2800000.00',
    outstandingBalance: '1450000.00',
    status: 'ACTIVE',
    createdAt: '2026-01-10T08:00:00Z',
  },
  {
    id: 'client-002',
    businessId: 'biz-apex-01',
    name: 'Apex Capital Partners Ltd',
    contactPerson: 'Wanjiku Kamau',
    email: 'finance@apexcapital.africa',
    phone: '+254 720 334 455',
    kraPin: 'P051283941M',
    address: '10th Floor, I&M Bank Tower, Kenyatta Ave',
    city: 'Nairobi',
    country: 'Kenya',
    currency: 'KES',
    paymentTermsDays: 14,
    creditLimit: 5000000,
    totalInvoiced: '2650000.00',
    totalPaid: '2650000.00',
    outstandingBalance: '0.00',
    status: 'ACTIVE',
    createdAt: '2026-01-15T09:30:00Z',
  },
  {
    id: 'client-003',
    businessId: 'biz-apex-01',
    name: 'Rift Media Group',
    contactPerson: 'Kevin Kiprono',
    email: 'accounts@riftmedia.co.ke',
    phone: '+254 733 998 877',
    kraPin: 'P051992019K',
    address: 'The Promenade, General Mathenge Drive',
    city: 'Nairobi',
    country: 'Kenya',
    currency: 'KES',
    paymentTermsDays: 15,
    creditLimit: 2000000,
    totalInvoiced: '1520000.00',
    totalPaid: '900000.00',
    outstandingBalance: '620000.00',
    status: 'ACTIVE',
    createdAt: '2026-01-20T11:00:00Z',
  },
  {
    id: 'client-004',
    businessId: 'biz-apex-01',
    name: 'Kilima Agro Enterprises',
    contactPerson: 'Grace Njeri',
    email: 'procurement@kilimaagro.com',
    phone: '+254 711 556 677',
    kraPin: 'P051448821R',
    address: 'Industrial Area, Commercial Street',
    city: 'Nairobi',
    country: 'Kenya',
    currency: 'KES',
    paymentTermsDays: 30,
    creditLimit: 3000000,
    totalInvoiced: '1200000.00',
    totalPaid: '800000.00',
    outstandingBalance: '400000.00',
    status: 'ACTIVE',
    createdAt: '2026-02-01T10:00:00Z',
  },
  {
    id: 'client-005',
    businessId: 'biz-apex-01',
    name: 'Serena Hospitality Ltd',
    contactPerson: 'Tariq Al-Mansoor',
    email: 'corporate.pay@serenahotels.com',
    phone: '+254 721 889 900',
    kraPin: 'P051772910J',
    address: 'Kenyatta Avenue, City Centre',
    city: 'Nairobi',
    country: 'Kenya',
    currency: 'KES',
    paymentTermsDays: 30,
    creditLimit: 4000000,
    totalInvoiced: '1930000.00',
    totalPaid: '1930000.00',
    outstandingBalance: '0.00',
    status: 'ACTIVE',
    createdAt: '2026-02-05T14:20:00Z',
  },
];

export const DEMO_INVOICES: InvoiceEntity[] = [
  {
    id: 'inv-045',
    businessId: 'biz-apex-01',
    documentNumber: 'INV-2026-0045',
    type: 'INVOICE',
    status: 'ISSUED',
    clientId: 'client-001',
    clientName: 'Safaricom Alpha Enterprise',
    clientEmail: 'enterprise-billing@safaricom.co.ke',
    clientKraPin: 'P000600000Z',
    clientAddress: 'Safaricom HQ, Waiyaki Way, Nairobi',
    currency: 'KES',
    exchangeRate: '1.00',
    issueDate: '2026-03-01',
    dueDate: '2026-03-31',
    items: [
      {
        id: 'item-1',
        description: 'Core Banking API Middleware Integration & Cloud Infrastructure Setup',
        quantity: '1',
        unit: 'Milestone',
        unitPrice: '1000000.00',
        discountPercentage: '0',
        taxCategory: 'VAT_16',
        taxRate: '0.16',
        grossAmount: '1000000.00',
        taxAmount: '160000.00',
        netAmount: '1160000.00',
      },
      {
        id: 'item-2',
        description: 'ISO-20022 Financial Telemetry Audit & Compliance Verification',
        quantity: '1',
        unit: 'Audit',
        unitPrice: '250000.00',
        discountPercentage: '0',
        taxCategory: 'VAT_16',
        taxRate: '0.16',
        grossAmount: '250000.00',
        taxAmount: '40000.00',
        netAmount: '290000.00',
      },
    ],
    subtotal: '1250000.00',
    taxTotal: '200000.00',
    taxBreakdowns: [
      {
        category: 'VAT_16',
        rate: '0.16',
        taxableAmount: '1250000.00',
        taxAmount: '200000.00',
      },
    ],
    withholdingTaxDeductible: false,
    withholdingTaxRate: '0.05',
    withholdingTaxAmount: '0.00',
    totalAmount: '1450000.00',
    amountPaid: '0.00',
    balanceDue: '1450000.00',
    paymentTermsDays: 30,
    notes: 'Please quote invoice number INV-2026-0045 on bank remittance advice.',
    legalTerms: 'All services rendered under MSA Ref: SAF-ENG-2026-B. Statutory interest applies at 2% monthly on overdue balances past 30 days.',
    templateId: 'executive-atelier',
    kraFiscalStatus: 'NOT_CONFIGURED',
    mpesaInstruction: 'Paybill: 408221 | Account: INV-0045',
    bankInstruction: 'NCBA Bank Kenya PLC | Acc: 1002938491 | Swift: CBAFKENX',
    createdAt: '2026-03-01T09:00:00Z',
    updatedAt: '2026-03-01T09:00:00Z',
  },
  {
    id: 'inv-044',
    businessId: 'biz-apex-01',
    documentNumber: 'INV-2026-0044',
    type: 'INVOICE',
    status: 'PAID',
    clientId: 'client-002',
    clientName: 'Apex Capital Partners Ltd',
    clientEmail: 'finance@apexcapital.africa',
    clientKraPin: 'P051283941M',
    clientAddress: '10th Floor, I&M Bank Tower, Kenyatta Ave, Nairobi',
    currency: 'KES',
    exchangeRate: '1.00',
    issueDate: '2026-02-15',
    dueDate: '2026-03-01',
    items: [
      {
        id: 'item-3',
        description: 'Algorithmic Liquidity Optimization Engine & Real-Time Position Dashboard',
        quantity: '1',
        unit: 'Release',
        unitPrice: '732758.62',
        discountPercentage: '0',
        taxCategory: 'VAT_16',
        taxRate: '0.16',
        grossAmount: '732758.62',
        taxAmount: '117241.38',
        netAmount: '850000.00',
      },
    ],
    subtotal: '732758.62',
    taxTotal: '117241.38',
    taxBreakdowns: [
      {
        category: 'VAT_16',
        rate: '0.16',
        taxableAmount: '732758.62',
        taxAmount: '117241.38',
      },
    ],
    withholdingTaxDeductible: false,
    withholdingTaxRate: '0.05',
    withholdingTaxAmount: '0.00',
    totalAmount: '850000.00',
    amountPaid: '850000.00',
    balanceDue: '0.00',
    paymentTermsDays: 14,
    notes: 'Settled in full via NCBA Bank Wire transfer on Feb 28, 2026.',
    legalTerms: 'Intellectual property rights transfer executed upon settlement of full fees.',
    templateId: 'modern-minimal',
    kraFiscalStatus: 'NOT_CONFIGURED',
    createdAt: '2026-02-15T10:15:00Z',
    updatedAt: '2026-02-28T16:30:00Z',
  },
  {
    id: 'inv-043',
    businessId: 'biz-apex-01',
    documentNumber: 'INV-2026-0043',
    type: 'INVOICE',
    status: 'OVERDUE',
    clientId: 'client-003',
    clientName: 'Rift Media Group',
    clientEmail: 'accounts@riftmedia.co.ke',
    clientKraPin: 'P051992019K',
    clientAddress: 'The Promenade, General Mathenge Drive, Nairobi',
    currency: 'KES',
    exchangeRate: '1.00',
    issueDate: '2026-02-01',
    dueDate: '2026-02-16',
    items: [
      {
        id: 'item-4',
        description: 'Ad Exchange Real-Time Bidding Pipeline & Data Aggregation Cluster',
        quantity: '1',
        unit: 'Sprint',
        unitPrice: '534482.76',
        discountPercentage: '0',
        taxCategory: 'VAT_16',
        taxRate: '0.16',
        grossAmount: '534482.76',
        taxAmount: '85517.24',
        netAmount: '620000.00',
      },
    ],
    subtotal: '534482.76',
    taxTotal: '85517.24',
    taxBreakdowns: [
      {
        category: 'VAT_16',
        rate: '0.16',
        taxableAmount: '534482.76',
        taxAmount: '85517.24',
      },
    ],
    withholdingTaxDeductible: false,
    withholdingTaxRate: '0.05',
    withholdingTaxAmount: '0.00',
    totalAmount: '620000.00',
    amountPaid: '0.00',
    balanceDue: '620000.00',
    paymentTermsDays: 15,
    notes: 'FIRST OVERDUE NOTICE: Payment is past due since Feb 16, 2026.',
    legalTerms: 'Standard commercial invoice subject to Late Payment of Commercial Debts Act.',
    templateId: 'midnight-ledger',
    kraFiscalStatus: 'NOT_CONFIGURED',
    createdAt: '2026-02-01T08:30:00Z',
    updatedAt: '2026-02-17T09:00:00Z',
  },
  {
    id: 'inv-042',
    businessId: 'biz-apex-01',
    documentNumber: 'INV-2026-0042',
    type: 'INVOICE',
    status: 'PARTIALLY_PAID',
    clientId: 'client-004',
    clientName: 'Kilima Agro Enterprises',
    clientEmail: 'procurement@kilimaagro.com',
    clientKraPin: 'P051448821R',
    clientAddress: 'Industrial Area, Commercial Street, Nairobi',
    currency: 'KES',
    exchangeRate: '1.00',
    issueDate: '2026-02-10',
    dueDate: '2026-03-12',
    items: [
      {
        id: 'item-5',
        description: 'Agritech Supply Chain Traceability Architecture & IoT Telemetry',
        quantity: '1',
        unit: 'Project',
        unitPrice: '1034482.76',
        discountPercentage: '0',
        taxCategory: 'VAT_16',
        taxRate: '0.16',
        grossAmount: '1034482.76',
        taxAmount: '165517.24',
        netAmount: '1200000.00',
      },
    ],
    subtotal: '1034482.76',
    taxTotal: '165517.24',
    taxBreakdowns: [
      {
        category: 'VAT_16',
        rate: '0.16',
        taxableAmount: '1034482.76',
        taxAmount: '165517.24',
      },
    ],
    withholdingTaxDeductible: false,
    withholdingTaxRate: '0.05',
    withholdingTaxAmount: '0.00',
    totalAmount: '1200000.00',
    amountPaid: '800000.00',
    balanceDue: '400000.00',
    paymentTermsDays: 30,
    notes: 'Tranche 1 (KES 800,000) received on Feb 25, 2026. Tranche 2 due upon final acceptance.',
    templateId: 'editorial-classic',
    kraFiscalStatus: 'NOT_CONFIGURED',
    createdAt: '2026-02-10T12:00:00Z',
    updatedAt: '2026-02-25T14:00:00Z',
  },
  {
    id: 'inv-041',
    businessId: 'biz-apex-01',
    documentNumber: 'INV-2026-0041',
    type: 'INVOICE',
    status: 'PAID',
    clientId: 'client-005',
    clientName: 'Serena Hospitality Ltd',
    clientEmail: 'corporate.pay@serenahotels.com',
    clientKraPin: 'P051772910J',
    clientAddress: 'Kenyatta Avenue, City Centre, Nairobi',
    currency: 'KES',
    exchangeRate: '1.00',
    issueDate: '2026-02-05',
    dueDate: '2026-03-07',
    items: [
      {
        id: 'item-6',
        description: 'Guest Loyalty Ledger & Point-of-Sale Integration',
        quantity: '1',
        unit: 'Release',
        unitPrice: '629310.34',
        discountPercentage: '0',
        taxCategory: 'VAT_16',
        taxRate: '0.16',
        grossAmount: '629310.34',
        taxAmount: '100689.66',
        netAmount: '730000.00',
      },
    ],
    subtotal: '629310.34',
    taxTotal: '100689.66',
    taxBreakdowns: [
      {
        category: 'VAT_16',
        rate: '0.16',
        taxableAmount: '629310.34',
        taxAmount: '100689.66',
      },
    ],
    withholdingTaxDeductible: false,
    withholdingTaxRate: '0.05',
    withholdingTaxAmount: '0.00',
    totalAmount: '730000.00',
    amountPaid: '730000.00',
    balanceDue: '0.00',
    paymentTermsDays: 30,
    notes: 'Paid in full on Feb 22, 2026.',
    templateId: 'linear-mono',
    kraFiscalStatus: 'NOT_CONFIGURED',
    createdAt: '2026-02-05T11:00:00Z',
    updatedAt: '2026-02-22T17:00:00Z',
  },
];

export const DEMO_PAYMENTS: PaymentRecord[] = [
  {
    id: 'pay-038',
    businessId: 'biz-apex-01',
    paymentReference: 'PAY-2026-0038',
    channel: 'MPESA_C2B',
    channelTransactionId: 'QDF8723KL',
    clientId: 'client-001',
    clientName: 'Safaricom Alpha Enterprise',
    invoiceId: 'inv-045',
    invoiceNumber: 'INV-2026-0045',
    amount: '180000.00',
    currency: 'KES',
    exchangeRate: '1.00',
    paymentDate: '2026-03-08T14:32:00Z',
    status: 'COMPLETED',
    payerName: 'Dennis Omondi',
    payerPhone: '+254722000111',
    receiptId: 'rct-032',
    receiptNumber: 'RCT-2026-0032',
    notes: 'C2B Paybill settlement verified against Safaricom Daraja API feed.',
    createdAt: '2026-03-08T14:32:00Z',
  },
  {
    id: 'pay-037',
    businessId: 'biz-apex-01',
    paymentReference: 'PAY-2026-0037',
    channel: 'BANK_TRANSFER',
    channelTransactionId: 'NCBA-TX-991204',
    clientId: 'client-002',
    clientName: 'Apex Capital Partners Ltd',
    invoiceId: 'inv-044',
    invoiceNumber: 'INV-2026-0044',
    amount: '850000.00',
    currency: 'KES',
    exchangeRate: '1.00',
    paymentDate: '2026-02-28T16:30:00Z',
    status: 'RECONCILED',
    payerName: 'Apex Capital Corporate Treasury',
    receiptId: 'rct-031',
    receiptNumber: 'RCT-2026-0031',
    notes: 'Direct NCBA RTGS clearing. Match with account statement.',
    createdAt: '2026-02-28T16:30:00Z',
  },
  {
    id: 'pay-036',
    businessId: 'biz-apex-01',
    paymentReference: 'PAY-2026-0036',
    channel: 'RTGS',
    channelTransactionId: 'CBK-RTGS-481923',
    clientId: 'client-004',
    clientName: 'Kilima Agro Enterprises',
    invoiceId: 'inv-042',
    invoiceNumber: 'INV-2026-0042',
    amount: '800000.00',
    currency: 'KES',
    exchangeRate: '1.00',
    paymentDate: '2026-02-25T14:00:00Z',
    status: 'RECONCILED',
    payerName: 'Kilima Agro Procurement Escrow',
    receiptId: 'rct-030',
    receiptNumber: 'RCT-2026-0030',
    notes: 'Milestone 1 advance settlement.',
    createdAt: '2026-02-25T14:00:00Z',
  },
  {
    id: 'pay-035',
    businessId: 'biz-apex-01',
    paymentReference: 'PAY-2026-0035',
    channel: 'BANK_TRANSFER',
    channelTransactionId: 'SCB-8831920',
    clientId: 'client-005',
    clientName: 'Serena Hospitality Ltd',
    invoiceId: 'inv-041',
    invoiceNumber: 'INV-2026-0041',
    amount: '730000.00',
    currency: 'KES',
    exchangeRate: '1.00',
    paymentDate: '2026-02-22T17:00:00Z',
    status: 'RECONCILED',
    payerName: 'Serena Corporate Services',
    receiptId: 'rct-029',
    receiptNumber: 'RCT-2026-0029',
    notes: 'Standard wire remittance.',
    createdAt: '2026-02-22T17:00:00Z',
  },
];

export const DEMO_RECEIPTS: ReceiptEntity[] = [
  {
    id: 'rct-032',
    businessId: 'biz-apex-01',
    receiptNumber: 'RCT-2026-0032',
    invoiceId: 'inv-045',
    invoiceNumber: 'INV-2026-0045',
    paymentId: 'pay-038',
    clientId: 'client-001',
    clientName: 'Safaricom Alpha Enterprise',
    clientKraPin: 'P000600000Z',
    amountPaid: '180000.00',
    currency: 'KES',
    paymentChannel: 'MPESA_C2B',
    channelReference: 'QDF8723KL',
    paymentDate: '2026-03-08T14:32:00Z',
    receivedBy: 'David Mwangi',
    notes: 'Partial settlement against Core Banking API Middleware (INV-2026-0045).',
    templateId: 'executive-atelier',
    createdAt: '2026-03-08T14:32:00Z',
  },
  {
    id: 'rct-031',
    businessId: 'biz-apex-01',
    receiptNumber: 'RCT-2026-0031',
    invoiceId: 'inv-044',
    invoiceNumber: 'INV-2026-0044',
    paymentId: 'pay-037',
    clientId: 'client-002',
    clientName: 'Apex Capital Partners Ltd',
    clientKraPin: 'P051283941M',
    amountPaid: '850000.00',
    currency: 'KES',
    paymentChannel: 'BANK_TRANSFER',
    channelReference: 'NCBA-TX-991204',
    paymentDate: '2026-02-28T16:30:00Z',
    receivedBy: 'David Mwangi',
    notes: 'Full settlement of INV-2026-0044.',
    templateId: 'modern-minimal',
    createdAt: '2026-02-28T16:30:00Z',
  },
  {
    id: 'rct-030',
    businessId: 'biz-apex-01',
    receiptNumber: 'RCT-2026-0030',
    invoiceId: 'inv-042',
    invoiceNumber: 'INV-2026-0042',
    paymentId: 'pay-036',
    clientId: 'client-004',
    clientName: 'Kilima Agro Enterprises',
    clientKraPin: 'P051448821R',
    amountPaid: '800000.00',
    currency: 'KES',
    paymentChannel: 'RTGS',
    channelReference: 'CBK-RTGS-481923',
    paymentDate: '2026-02-25T14:00:00Z',
    receivedBy: 'David Mwangi',
    notes: 'First milestone tranche.',
    templateId: 'editorial-classic',
    createdAt: '2026-02-25T14:00:00Z',
  },
  {
    id: 'rct-029',
    businessId: 'biz-apex-01',
    receiptNumber: 'RCT-2026-0029',
    invoiceId: 'inv-041',
    invoiceNumber: 'INV-2026-0041',
    paymentId: 'pay-035',
    clientId: 'client-005',
    clientName: 'Serena Hospitality Ltd',
    clientKraPin: 'P051772910J',
    amountPaid: '730000.00',
    currency: 'KES',
    paymentChannel: 'BANK_TRANSFER',
    channelReference: 'SCB-8831920',
    paymentDate: '2026-02-22T17:00:00Z',
    receivedBy: 'David Mwangi',
    notes: 'Full settlement of INV-2026-0041.',
    templateId: 'linear-mono',
    createdAt: '2026-02-22T17:00:00Z',
  },
];

export const DEMO_QUOTATIONS: QuotationEntity[] = [
  {
    id: 'qtn-018',
    businessId: 'biz-apex-01',
    quotationNumber: 'QTN-2026-0018',
    status: 'ACCEPTED',
    clientId: 'client-001',
    clientName: 'Safaricom Alpha Enterprise',
    clientEmail: 'enterprise-billing@safaricom.co.ke',
    currency: 'KES',
    issueDate: '2026-02-20',
    validUntil: '2026-03-22',
    items: [
      {
        id: 'qitem-1',
        description: 'Microservices Mesh Deployment & Automated High-Availability Cluster',
        quantity: '1',
        unit: 'Solution',
        unitPrice: '1810344.83',
        discountPercentage: '0',
        taxCategory: 'VAT_16',
        taxRate: '0.16',
        grossAmount: '1810344.83',
        taxAmount: '289655.17',
        netAmount: '2100000.00',
      },
    ],
    subtotal: '1810344.83',
    taxTotal: '289655.17',
    totalAmount: '2100000.00',
    templateId: 'executive-atelier',
    notes: 'Approved by Safaricom Tech Review Board. Ready for invoice generation.',
    createdAt: '2026-02-20T10:00:00Z',
  },
  {
    id: 'qtn-017',
    businessId: 'biz-apex-01',
    quotationNumber: 'QTN-2026-0017',
    status: 'ISSUED',
    clientId: 'client-003',
    clientName: 'Rift Media Group',
    clientEmail: 'accounts@riftmedia.co.ke',
    currency: 'KES',
    issueDate: '2026-03-02',
    validUntil: '2026-04-02',
    items: [
      {
        id: 'qitem-2',
        description: 'Real-Time Audience Telemetry Pipeline Upgrade',
        quantity: '1',
        unit: 'Sprint',
        unitPrice: '387931.03',
        discountPercentage: '0',
        taxCategory: 'VAT_16',
        taxRate: '0.16',
        grossAmount: '387931.03',
        taxAmount: '62068.97',
        netAmount: '450000.00',
      },
    ],
    subtotal: '387931.03',
    taxTotal: '62068.97',
    totalAmount: '450000.00',
    templateId: 'midnight-ledger',
    notes: 'Valid for 30 calendar days from issue date.',
    createdAt: '2026-03-02T15:00:00Z',
  },
];

export const DEMO_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'log-001',
    timestamp: '2026-03-08T14:32:00Z',
    actor: 'David Mwangi',
    action: 'RECORD_PAYMENT',
    entityType: 'PAYMENT',
    entityId: 'pay-038',
    details: 'Recorded M-Pesa C2B payment KES 180,000 for Safaricom Alpha (Ref: QDF8723KL). Auto-issued Receipt RCT-2026-0032.',
  },
  {
    id: 'log-002',
    timestamp: '2026-03-01T09:00:00Z',
    actor: 'David Mwangi',
    action: 'FINALIZE_DOCUMENT',
    entityType: 'INVOICE',
    entityId: 'inv-045',
    details: 'Finalized and issued invoice INV-2026-0045 for Safaricom Alpha (KES 1,450,000).',
  },
  {
    id: 'log-003',
    timestamp: '2026-02-28T16:30:00Z',
    actor: 'David Mwangi',
    action: 'RECONCILE_PAYMENT',
    entityType: 'PAYMENT',
    entityId: 'pay-037',
    details: 'Reconciled Bank Wire payment KES 850,000 against INV-2026-0044.',
  },
];

/**
 * Generic, safe JSON read/write helpers. Centralized so every collection
 * uses the exact same (de)serialization and empty-state behavior — no
 * per-collection copy/paste of localStorage access (previously duplicated
 * seven times with subtly different fallback logic).
 */
function readCollection<T>(key: string): T[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupted entry — fail safe to an empty collection rather than throwing
    // and taking down the whole app.
    return [];
  }
}

function writeCollection<T>(key: string, items: T[]): void {
  localStorage.setItem(key, JSON.stringify(items));
}

export class StorageService {
  /**
   * Returns the operator's business profile. If Settings has never been
   * saved, returns an honest, empty template rather than a fabricated
   * company identity — callers should treat a blank `kraPin`/`name` as an
   * "onboarding not complete" signal, not a real business.
   */
  public static getBusiness(): BusinessEntity {
    const raw = localStorage.getItem(STORAGE_KEYS.BUSINESS);
    return raw ? { ...EMPTY_BUSINESS, ...JSON.parse(raw) } : EMPTY_BUSINESS;
  }

  public static isBusinessConfigured(): boolean {
    const biz = this.getBusiness();
    return Boolean(biz.name.trim() && biz.kraPin.trim());
  }

  public static saveBusiness(biz: BusinessEntity): void {
    localStorage.setItem(STORAGE_KEYS.BUSINESS, JSON.stringify(biz));
  }

  /**
   * Name to attribute actions to in the audit log and on printed documents
   * ("Authorized Signatory"). Falls back to a neutral, honest label instead
   * of a fabricated person's name when Settings hasn't been completed.
   */
  public static getCurrentActor(): string {
    const biz = this.getBusiness();
    return biz.authorizedSignatoryName?.trim() || 'System User';
  }

  public static getClients(): ClientEntity[] {
    return readCollection<ClientEntity>(STORAGE_KEYS.CLIENTS);
  }

  public static saveClients(clients: ClientEntity[]): void {
    writeCollection(STORAGE_KEYS.CLIENTS, clients);
  }

  public static getInvoices(): InvoiceEntity[] {
    return readCollection<InvoiceEntity>(STORAGE_KEYS.INVOICES);
  }

  public static saveInvoices(invoices: InvoiceEntity[]): void {
    writeCollection(STORAGE_KEYS.INVOICES, invoices);
  }

  public static getPayments(): PaymentRecord[] {
    return readCollection<PaymentRecord>(STORAGE_KEYS.PAYMENTS);
  }

  public static savePayments(payments: PaymentRecord[]): void {
    writeCollection(STORAGE_KEYS.PAYMENTS, payments);
  }

  public static getReceipts(): ReceiptEntity[] {
    return readCollection<ReceiptEntity>(STORAGE_KEYS.RECEIPTS);
  }

  public static saveReceipts(receipts: ReceiptEntity[]): void {
    writeCollection(STORAGE_KEYS.RECEIPTS, receipts);
  }

  public static getQuotations(): QuotationEntity[] {
    return readCollection<QuotationEntity>(STORAGE_KEYS.QUOTATIONS);
  }

  public static saveQuotations(quotes: QuotationEntity[]): void {
    writeCollection(STORAGE_KEYS.QUOTATIONS, quotes);
  }

  public static getCreditNotes(): CreditNoteEntity[] {
    return readCollection<CreditNoteEntity>(STORAGE_KEYS.CREDIT_NOTES);
  }

  public static saveCreditNotes(notes: CreditNoteEntity[]): void {
    writeCollection(STORAGE_KEYS.CREDIT_NOTES, notes);
  }

  public static getDebitNotes(): DebitNoteEntity[] {
    return readCollection<DebitNoteEntity>(STORAGE_KEYS.DEBIT_NOTES);
  }

  public static saveDebitNotes(notes: DebitNoteEntity[]): void {
    writeCollection(STORAGE_KEYS.DEBIT_NOTES, notes);
  }

  public static getAuditLogs(): AuditLogEntry[] {
    return readCollection<AuditLogEntry>(STORAGE_KEYS.AUDIT_LOGS);
  }

  public static logAction(
    actor: string,
    action: string,
    entityType: 'INVOICE' | 'PAYMENT' | 'RECEIPT' | 'QUOTATION' | 'CLIENT',
    entityId: string,
    details: string
  ): void {
    const logs = this.getAuditLogs();
    const entry: AuditLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      actor,
      action,
      entityType,
      entityId,
      details,
    };
    logs.unshift(entry);
    writeCollection(STORAGE_KEYS.AUDIT_LOGS, logs.slice(0, 500));
  }

  public static getActiveTemplate(): TemplateId {
    return (localStorage.getItem(STORAGE_KEYS.ACTIVE_TEMPLATE) as TemplateId) || 'executive-atelier';
  }

  public static setActiveTemplate(id: TemplateId): void {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_TEMPLATE, id);
  }

  /**
   * Whether ANY real records exist yet. Used to decide whether to show the
   * "load sample data" prompt (only offered on a genuinely empty workspace,
   * never silently overwriting real records).
   */
  public static isWorkspaceEmpty(): boolean {
    return (
      this.getClients().length === 0 &&
      this.getInvoices().length === 0 &&
      this.getQuotations().length === 0 &&
      this.getPayments().length === 0 &&
      !this.isBusinessConfigured()
    );
  }

  /**
   * Explicitly opt-in: populates the workspace with clearly-labeled sample
   * data for evaluation/demo purposes. Never called automatically — only
   * from a user-initiated action in Settings, and only ever offered when
   * `isWorkspaceEmpty()` is true so it can never clobber real records.
   */
  public static loadSampleData(): void {
    localStorage.setItem(STORAGE_KEYS.BUSINESS, JSON.stringify(DEMO_BUSINESS));
    localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(DEMO_CLIENTS));
    localStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(DEMO_INVOICES));
    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(DEMO_PAYMENTS));
    localStorage.setItem(STORAGE_KEYS.RECEIPTS, JSON.stringify(DEMO_RECEIPTS));
    localStorage.setItem(STORAGE_KEYS.QUOTATIONS, JSON.stringify(DEMO_QUOTATIONS));
    localStorage.setItem(STORAGE_KEYS.CREDIT_NOTES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.DEBIT_NOTES, JSON.stringify([]));
    localStorage.setItem(
      STORAGE_KEYS.AUDIT_LOGS,
      JSON.stringify([
        ...DEMO_AUDIT_LOGS,
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actor: 'System User',
          action: 'LOAD_SAMPLE_DATA',
          entityType: 'CLIENT' as const,
          entityId: 'workspace',
          details: 'Operator explicitly loaded sample/demo records for evaluation.',
        },
      ])
    );
    localStorage.setItem(STORAGE_KEYS.ACTIVE_TEMPLATE, 'executive-atelier');
  }

  /**
   * Irreversibly clears every record in this workspace (business profile,
   * clients, documents, payments, audit log). Distinct from
   * `loadSampleData` — this never re-introduces fabricated records.
   */
  public static clearAllData(): void {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  }
}

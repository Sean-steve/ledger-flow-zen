/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvoiceEntity, ReceiptEntity, QuotationEntity, CreditNoteEntity, DebitNoteEntity, CurrencyCode } from '../types';
import { StorageService } from './storage';
import { formatCurrency } from '../domain/math';

export interface ShareDocInfo {
  docTitle: string;
  docNumber: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  amountLabel?: string;
  bizName: string;
}

type ShareableDocument = InvoiceEntity | ReceiptEntity | QuotationEntity | CreditNoteEntity | DebitNoteEntity;
type ShareableType = 'INVOICE' | 'RECEIPT' | 'QUOTATION' | 'CREDIT_NOTE' | 'DEBIT_NOTE';

const DOC_TITLES: Record<ShareableType, string> = {
  INVOICE: 'Invoice',
  RECEIPT: 'Receipt',
  QUOTATION: 'Quotation',
  CREDIT_NOTE: 'Credit Note',
  DEBIT_NOTE: 'Debit Note',
};

/**
 * Not every document entity stores the client's phone number directly, so
 * this looks the client up from storage by id where needed. If the client
 * record has since been deleted, phone/email are simply omitted rather than
 * throwing — sharing should still work with a blank "To:" field the
 * operator can fill in themselves.
 */
export function buildShareInfo(document: ShareableDocument, type: ShareableType): ShareDocInfo {
  const biz = StorageService.getBusiness();
  const bizName = biz.tradingName || biz.name || 'Our business';

  let clientId: string;
  let clientName: string;
  let docNumber: string;
  let amount: string;
  let currency: CurrencyCode;
  let clientEmail: string | undefined;

  switch (type) {
    case 'INVOICE': {
      const d = document as InvoiceEntity;
      clientId = d.clientId;
      clientName = d.clientName;
      docNumber = d.documentNumber;
      amount = d.totalAmount;
      currency = d.currency;
      clientEmail = d.clientEmail;
      break;
    }
    case 'RECEIPT': {
      const d = document as ReceiptEntity;
      clientId = d.clientId;
      clientName = d.clientName;
      docNumber = d.receiptNumber;
      amount = d.amountPaid;
      currency = d.currency;
      break;
    }
    case 'QUOTATION': {
      const d = document as QuotationEntity;
      clientId = d.clientId;
      clientName = d.clientName;
      docNumber = d.quotationNumber;
      amount = d.totalAmount;
      currency = d.currency;
      clientEmail = d.clientEmail;
      break;
    }
    case 'CREDIT_NOTE': {
      const d = document as CreditNoteEntity;
      clientId = d.clientId;
      clientName = d.clientName;
      docNumber = d.creditNoteNumber;
      amount = d.amount;
      currency = d.currency;
      break;
    }
    case 'DEBIT_NOTE': {
      const d = document as DebitNoteEntity;
      clientId = d.clientId;
      clientName = d.clientName;
      docNumber = d.debitNoteNumber;
      amount = d.amount;
      currency = d.currency;
      break;
    }
  }

  const client = StorageService.getClients().find((c) => c.id === clientId);

  return {
    docTitle: DOC_TITLES[type],
    docNumber,
    clientName,
    clientEmail: clientEmail || client?.email,
    clientPhone: client?.phone,
    amountLabel: formatCurrency(amount, currency),
    bizName,
  };
}

export function buildEmailShareUrl(info: ShareDocInfo): string {
  const subject = `${info.docTitle} ${info.docNumber} from ${info.bizName}`;
  const body = [
    `Hi ${info.clientName || 'there'},`,
    '',
    `Please find attached ${info.docTitle.toLowerCase()} ${info.docNumber}${info.amountLabel ? ` for ${info.amountLabel}` : ''}.`,
    '',
    `Kind regards,`,
    info.bizName,
  ].join('\n');

  const to = info.clientEmail ? encodeURIComponent(info.clientEmail) : '';
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildWhatsAppShareUrl(info: ShareDocInfo): string {
  const text = [
    `Hi ${info.clientName || 'there'}, `,
    `please find ${info.docTitle.toLowerCase()} ${info.docNumber}`,
    info.amountLabel ? ` for ${info.amountLabel}` : '',
    ` from ${info.bizName}.`,
  ].join('');

  // wa.me only accepts digits (with country code, no + or leading zeros
  // handling attempted here — that normalization varies by locale and is
  // left to the operator to verify rather than guessed at).
  const digitsOnly = (info.clientPhone || '').replace(/[^\d]/g, '');
  const base = digitsOnly ? `https://wa.me/${digitsOnly}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

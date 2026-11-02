/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvoiceEntity } from '../types';

export interface KraFiscalResult {
  status: 'NOT_CONFIGURED' | 'TRANSMITTED' | 'FAILED';
  controlUnitCode?: string;
  qrCodeData?: string;
  signature?: string;
  message: string;
}

export interface IKraEtimsProvider {
  transmitInvoice(invoice: InvoiceEntity): Promise<KraFiscalResult>;
  verifyInvoice(controlUnitCode: string): Promise<boolean>;
}

/**
 * Compliant KRA eTIMS provider for internal release.
 * Strictly returns NOT_CONFIGURED to ensure no false compliance claims are made to tax authorities.
 */
export class DisabledKraEtimsProvider implements IKraEtimsProvider {
  public async transmitInvoice(invoice: InvoiceEntity): Promise<KraFiscalResult> {
    return {
      status: 'NOT_CONFIGURED',
      message: 'KRA eTIMS OSCU/VSCU integration is in standby mode. Document fiscalization provider is NOT_CONFIGURED.',
      controlUnitCode: undefined,
      qrCodeData: `https://itax.kra.go.ke/KRA-Portal/invoiceVerification?inv=${encodeURIComponent(invoice.documentNumber)}&status=UNFISCALIZED`,
    };
  }

  public async verifyInvoice(_controlUnitCode: string): Promise<boolean> {
    return false;
  }
}

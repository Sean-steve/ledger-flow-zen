/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StorageService } from '../infrastructure/storage';

export type DocumentPrefix = 'INV' | 'RCT' | 'QTN' | 'PAY' | 'CRN' | 'DBN';

/**
 * Assigns sequential, collision-free document numbers.
 *
 * Previously this held an in-memory `Map` seeded with hardcoded counts
 * (INV-2026: 45, RCT-2026: 32, ...). That state lived only in JS memory, so
 * every page reload reset the counters back to the seed values — while the
 * actual documents already issued remained in localStorage. The next
 * invoice issued after any reload would silently reuse an already-assigned
 * document number.
 *
 * This version has no mutable state at all: the "next number" is always
 * derived by scanning the actual persisted collection for the highest
 * existing sequence in the given prefix+year, so it can never drift out of
 * sync with what has actually been issued, regardless of reloads, multiple
 * tabs, or a workspace reset.
 */
export class DocumentNumberingEngine {
  private static extractSequence(documentNumber: string, prefix: string, year: number): number | null {
    const match = documentNumber.match(new RegExp(`^${prefix}-${year}-(\\d+)$`));
    return match ? parseInt(match[1], 10) : null;
  }

  private static highestExistingSequence(prefix: DocumentPrefix, year: number): number {
    let numbers: string[] = [];

    switch (prefix) {
      case 'INV':
        numbers = StorageService.getInvoices().map((i) => i.documentNumber);
        break;
      case 'RCT':
        numbers = StorageService.getReceipts().map((r) => r.receiptNumber);
        break;
      case 'QTN':
        numbers = StorageService.getQuotations().map((q) => q.quotationNumber);
        break;
      case 'PAY':
        numbers = StorageService.getPayments().map((p) => p.paymentReference);
        break;
      case 'CRN':
      case 'DBN':
        // Credit/debit notes are scanned via getNextNumberAgainst() instead,
        // to avoid a circular import with their storage accessors.
        numbers = [];
        break;
    }

    let highest = 0;
    for (const num of numbers) {
      const seq = this.extractSequence(num, prefix, year);
      if (seq !== null && seq > highest) highest = seq;
    }
    return highest;
  }

  /**
   * Always computed fresh from the source of truth (persisted documents)
   * rather than a counter that can drift. In a genuinely concurrent
   * multi-writer environment this would still need a server-side
   * transaction; for this single-writer local workspace, deriving from
   * storage at assignment time removes the reload-collision bug entirely.
   */
  public static getNextNumber(prefix: DocumentPrefix, year: number = new Date().getFullYear()): string {
    const next = this.highestExistingSequence(prefix, year) + 1;
    return `${prefix}-${year}-${String(next).padStart(4, '0')}`;
  }

  /** Preview only — does not reserve the number. The number is only real once the document is actually persisted. */
  public static peekNextNumber(prefix: DocumentPrefix, year: number = new Date().getFullYear()): string {
    return this.getNextNumber(prefix, year);
  }

  /**
   * Same as getNextNumber, but scans an explicitly-supplied list of already
   * issued document numbers. Used for collections (credit notes, debit
   * notes) whose storage accessor would otherwise create a circular import.
   */
  public static getNextNumberAgainst(
    prefix: DocumentPrefix,
    existingNumbers: string[],
    year: number = new Date().getFullYear()
  ): string {
    let highest = 0;
    for (const num of existingNumbers) {
      const seq = this.extractSequence(num, prefix, year);
      if (seq !== null && seq > highest) highest = seq;
    }
    return `${prefix}-${year}-${String(highest + 1).padStart(4, '0')}`;
  }
}

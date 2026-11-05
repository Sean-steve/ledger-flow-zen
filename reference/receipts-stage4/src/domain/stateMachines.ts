/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DocumentStatus, QuotationStatus, PaymentStatus, AdjustmentNoteStatus } from '../types';

export class DocumentStateMachine {
  private static validTransitions: Record<DocumentStatus, DocumentStatus[]> = {
    DRAFT: ['ISSUED', 'VOID', 'CANCELLED'],
    ISSUED: ['VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID'],
    VIEWED: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID'],
    PARTIALLY_PAID: ['PAID', 'OVERDUE', 'VOID'],
    PAID: ['VOID'],
    OVERDUE: ['PARTIALLY_PAID', 'PAID', 'VOID'],
    VOID: [],
    CANCELLED: [],
  };

  public static canTransition(current: DocumentStatus, next: DocumentStatus): boolean {
    return this.validTransitions[current]?.includes(next) ?? false;
  }

  public static assertCanTransition(current: DocumentStatus, next: DocumentStatus): void {
    if (!this.canTransition(current, next)) {
      throw new Error(`Illegal document state transition from ${current} to ${next}`);
    }
  }
}

export class QuotationStateMachine {
  private static validTransitions: Record<QuotationStatus, QuotationStatus[]> = {
    DRAFT: ['ISSUED', 'REJECTED'],
    ISSUED: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
    ACCEPTED: ['CONVERTED'],
    REJECTED: ['DRAFT'],
    EXPIRED: ['DRAFT'],
    CONVERTED: [],
  };

  public static canTransition(current: QuotationStatus, next: QuotationStatus): boolean {
    return this.validTransitions[current]?.includes(next) ?? false;
  }
}

export class PaymentStateMachine {
  private static validTransitions: Record<PaymentStatus, PaymentStatus[]> = {
    INITIATED: ['COMPLETED', 'FAILED'],
    COMPLETED: ['RECONCILED', 'REVERSED'],
    RECONCILED: ['REVERSED'],
    FAILED: ['INITIATED'],
    REVERSED: [],
  };

  public static canTransition(current: PaymentStatus, next: PaymentStatus): boolean {
    return this.validTransitions[current]?.includes(next) ?? false;
  }
}

/** Shared by CreditNoteEntity and DebitNoteEntity — both are issued atomically and can only be voided afterward. */
export class AdjustmentNoteStateMachine {
  private static validTransitions: Record<AdjustmentNoteStatus, AdjustmentNoteStatus[]> = {
    ISSUED: ['VOID'],
    VOID: [],
  };

  public static canTransition(current: AdjustmentNoteStatus, next: AdjustmentNoteStatus): boolean {
    return this.validTransitions[current]?.includes(next) ?? false;
  }

  public static assertCanTransition(current: AdjustmentNoteStatus, next: AdjustmentNoteStatus): void {
    if (!this.canTransition(current, next)) {
      throw new Error(`Illegal adjustment note state transition from ${current} to ${next}`);
    }
  }
}

import { describe, it, expect } from 'vitest';
import {
  DocumentStateMachine,
  QuotationStateMachine,
  PaymentStateMachine,
  AdjustmentNoteStateMachine,
} from './stateMachines';

describe('DocumentStateMachine (invoice lifecycle)', () => {
  it('allows DRAFT to move to ISSUED', () => {
    expect(DocumentStateMachine.canTransition('DRAFT', 'ISSUED')).toBe(true);
  });

  it('never allows skipping backward from PAID to DRAFT', () => {
    expect(DocumentStateMachine.canTransition('PAID', 'DRAFT')).toBe(false);
  });

  it('treats VOID and CANCELLED as terminal — no transitions out', () => {
    expect(DocumentStateMachine.canTransition('VOID', 'ISSUED')).toBe(false);
    expect(DocumentStateMachine.canTransition('CANCELLED', 'PAID')).toBe(false);
  });

  it('assertCanTransition throws with a descriptive message on an illegal transition', () => {
    expect(() => DocumentStateMachine.assertCanTransition('PAID', 'DRAFT')).toThrow(/Illegal document state transition/);
  });

  it('assertCanTransition does not throw on a legal transition', () => {
    expect(() => DocumentStateMachine.assertCanTransition('ISSUED', 'PAID')).not.toThrow();
  });
});

describe('QuotationStateMachine', () => {
  it('allows a full happy path: DRAFT -> ISSUED -> ACCEPTED -> CONVERTED', () => {
    expect(QuotationStateMachine.canTransition('DRAFT', 'ISSUED')).toBe(true);
    expect(QuotationStateMachine.canTransition('ISSUED', 'ACCEPTED')).toBe(true);
    expect(QuotationStateMachine.canTransition('ACCEPTED', 'CONVERTED')).toBe(true);
  });

  it('does not allow converting a quotation that was never accepted', () => {
    expect(QuotationStateMachine.canTransition('ISSUED', 'CONVERTED')).toBe(false);
    expect(QuotationStateMachine.canTransition('DRAFT', 'CONVERTED')).toBe(false);
  });

  it('CONVERTED is terminal', () => {
    expect(QuotationStateMachine.canTransition('CONVERTED', 'DRAFT')).toBe(false);
  });
});

describe('PaymentStateMachine', () => {
  it('allows a completed payment to be reversed', () => {
    expect(PaymentStateMachine.canTransition('COMPLETED', 'REVERSED')).toBe(true);
  });

  it('allows a reconciled payment to be reversed', () => {
    expect(PaymentStateMachine.canTransition('RECONCILED', 'REVERSED')).toBe(true);
  });

  it('does not allow reversing an already-reversed payment', () => {
    expect(PaymentStateMachine.canTransition('REVERSED', 'REVERSED')).toBe(false);
  });

  it('does not allow reversing a payment that was never completed', () => {
    expect(PaymentStateMachine.canTransition('INITIATED', 'REVERSED')).toBe(false);
    expect(PaymentStateMachine.canTransition('FAILED', 'REVERSED')).toBe(false);
  });
});

describe('AdjustmentNoteStateMachine (credit/debit notes)', () => {
  it('allows an issued note to be voided', () => {
    expect(AdjustmentNoteStateMachine.canTransition('ISSUED', 'VOID')).toBe(true);
  });

  it('does not allow voiding an already-voided note', () => {
    expect(AdjustmentNoteStateMachine.canTransition('VOID', 'VOID')).toBe(false);
  });

  it('assertCanTransition throws on an illegal transition', () => {
    expect(() => AdjustmentNoteStateMachine.assertCanTransition('VOID', 'ISSUED')).toThrow();
  });
});

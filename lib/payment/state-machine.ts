/**
 * BankVerse — Dual-Dimension Payment State Machine
 *
 * PaymentState tracks the provider outcome (CREATED → PROCESSING → SUCCESS/FAILED/UNKNOWN).
 * SettlementState tracks the financial resolution (NOT_REQUIRED → PENDING_RECONCILIATION → ... → RESOLVED/REFUNDED/ESCALATED).
 *
 * These are independent dimensions — a payment can be SUCCESS but still PENDING_RECONCILIATION.
 */

import type { PaymentState, SettlementState } from "@/lib/ledger/types";

// ─── Valid Transitions ──────────────────────────────────────────

const PAYMENT_STATE_TRANSITIONS: Record<PaymentState, PaymentState[]> = {
  CREATED: ["PROCESSING"],
  PROCESSING: ["SUCCESS", "FAILED", "UNKNOWN"],
  SUCCESS: ["FAILED"], // chargeback
  FAILED: ["PROCESSING"], // retry
  UNKNOWN: ["SUCCESS", "FAILED", "PROCESSING"], // resolved after investigation
};

const SETTLEMENT_STATE_TRANSITIONS: Record<SettlementState, SettlementState[]> =
  {
    NOT_REQUIRED: ["PENDING_RECONCILIATION"],
    PENDING_RECONCILIATION: ["RECONCILING", "REFUND_PENDING", "NOT_REQUIRED"],
    RECONCILING: ["RESOLVED", "REFUND_PENDING", "ESCALATED"],
    REFUND_PENDING: ["REFUNDED", "ESCALATED"],
    REFUNDED: ["RESOLVED"],
    RESOLVED: [],
    ESCALATED: ["RECONCILING", "RESOLVED"],
  };

// ─── State Machine ──────────────────────────────────────────────

export interface StateTransition {
  from: PaymentState | SettlementState;
  to: PaymentState | SettlementState;
  dimension: "payment" | "settlement";
  allowed: boolean;
  reason?: string;
}

export class PaymentStateMachine {
  /**
   * Check if a payment state transition is valid.
   */
  static canTransitionPayment(
    from: PaymentState,
    to: PaymentState,
  ): StateTransition {
    const allowed = PAYMENT_STATE_TRANSITIONS[from]?.includes(to) ?? false;
    return {
      from,
      to,
      dimension: "payment",
      allowed,
      reason: allowed
        ? undefined
        : `Invalid payment state transition: ${from} → ${to}. Valid: ${PAYMENT_STATE_TRANSITIONS[from]?.join(", ") || "none"}`,
    };
  }

  /**
   * Check if a settlement state transition is valid.
   */
  static canTransitionSettlement(
    from: SettlementState,
    to: SettlementState,
  ): StateTransition {
    const allowed = SETTLEMENT_STATE_TRANSITIONS[from]?.includes(to) ?? false;
    return {
      from,
      to,
      dimension: "settlement",
      allowed,
      reason: allowed
        ? undefined
        : `Invalid settlement state transition: ${from} → ${to}. Valid: ${SETTLEMENT_STATE_TRANSITIONS[from]?.join(", ") || "none"}`,
    };
  }

  /**
   * Transition payment state. Throws if invalid.
   */
  static transitionPayment(from: PaymentState, to: PaymentState): PaymentState {
    const check = this.canTransitionPayment(from, to);
    if (!check.allowed) throw new Error(check.reason);
    return to;
  }

  /**
   * Transition settlement state. Throws if invalid.
   */
  static transitionSettlement(
    from: SettlementState,
    to: SettlementState,
  ): SettlementState {
    const check = this.canTransitionSettlement(from, to);
    if (!check.allowed) throw new Error(check.reason);
    return to;
  }

  /**
   * Get all valid next payment states.
   */
  static getValidPaymentTransitions(from: PaymentState): PaymentState[] {
    return PAYMENT_STATE_TRANSITIONS[from] || [];
  }

  /**
   * Get all valid next settlement states.
   */
  static getValidSettlementTransitions(
    from: SettlementState,
  ): SettlementState[] {
    return SETTLEMENT_STATE_TRANSITIONS[from] || [];
  }

  /**
   * Check if a payment is in a terminal state.
   */
  static isTerminalPayment(state: PaymentState): boolean {
    return state === "SUCCESS" || state === "FAILED";
  }

  /**
   * Check if a settlement is in a terminal state.
   */
  static isTerminalSettlement(state: SettlementState): boolean {
    return state === "RESOLVED" || state === "REFUNDED";
  }
}

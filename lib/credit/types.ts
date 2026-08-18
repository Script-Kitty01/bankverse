/**
 * BankVerse — Credit Line Engine Types
 *
 * Models a UPI-linked credit line (like Slice's core product):
 * - Credit limit with utilization tracking
 * - Daily compound interest accrual
 * - EMI conversion with principal + interest splits
 * - Repayment allocation (FIFO against oldest outstanding)
 * - Delinquency tracking (current, 30/60/90 DPD)
 */

// ─── Credit Line ────────────────────────────────────────────────

export type CreditLineStatus = "ACTIVE" | "FROZEN" | "CLOSED" | "DEFAULT";

export type DelinquencyBucket = "CURRENT" | "DPD_30" | "DPD_60" | "DPD_90_PLUS";

export interface CreditLine {
  id: string;
  customerId: string;
  /** Total sanctioned credit limit (in smallest currency unit, e.g., paise) */
  creditLimit: number;
  /** Annual Percentage Rate (e.g., 18.0 = 18% APR) */
  apr: number;
  /** Current outstanding principal */
  outstandingPrincipal: number;
  /** Accrued but unpaid interest */
  accruedInterest: number;
  /** Total amount drawn (lifetime) */
  totalDrawn: number;
  /** Total amount repaid (lifetime) */
  totalRepaid: number;
  /** Current status */
  status: CreditLineStatus;
  /** Days past due (0 = current) */
  daysPastDue: number;
  /** Delinquency bucket */
  delinquencyBucket: DelinquencyBucket;
  /** Date of last interest accrual */
  lastInterestAccrualDate: string;
  /** Date of last payment */
  lastPaymentDate?: string;
  /** Date credit line was opened */
  openedAt: string;
  /** Date credit line was closed (if applicable) */
  closedAt?: string;
  /** Entity version for OCC */
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Draw (Transaction) ─────────────────────────────────────────

export type DrawStatus = "PENDING" | "SETTLED" | "REVERSED";

export interface CreditDraw {
  id: string;
  creditLineId: string;
  customerId: string;
  /** Amount drawn (principal only) */
  amount: number;
  /** Description / merchant name */
  description: string;
  /** UPI transaction reference */
  upiRef?: string;
  /** NPCI settlement reference */
  npciSettlementRef?: string;
  /** Status */
  status: DrawStatus;
  /** Date of draw */
  drawnAt: string;
  /** Date settled by NPCI */
  settledAt?: string;
  createdAt: string;
}

// ─── EMI Plan ───────────────────────────────────────────────────

export type EmiStatus = "ACTIVE" | "PAID" | "DEFAULTED";

export interface EmiPlan {
  id: string;
  creditLineId: string;
  customerId: string;
  /** Original principal amount being converted to EMI */
  principalAmount: number;
  /** Total interest over the EMI tenure */
  totalInterest: number;
  /** Total amount (principal + interest) */
  totalAmount: number;
  /** Number of months */
  tenureMonths: number;
  /** Monthly installment amount */
  monthlyInstallment: number;
  /** Number of installments paid */
  installmentsPaid: number;
  /** Number of installments remaining */
  installmentsRemaining: number;
  /** Next installment due date */
  nextDueDate: string;
  /** Status */
  status: EmiStatus;
  createdAt: string;
  updatedAt: string;
}

// ─── Repayment ──────────────────────────────────────────────────

export type RepaymentMethod = "UPI" | "NEFT" | "IMPS" | "AUTO_DEBIT";

export interface Repayment {
  id: string;
  creditLineId: string;
  customerId: string;
  /** Total amount paid */
  amount: number;
  /** Amount applied to interest */
  interestComponent: number;
  /** Amount applied to principal */
  principalComponent: number;
  /** Any late fee applied */
  lateFee: number;
  /** Payment method */
  method: RepaymentMethod;
  /** UPI / NEFT reference */
  reference: string;
  /** Date of repayment */
  paidAt: string;
  createdAt: string;
}

// ─── Interest Accrual Event ─────────────────────────────────────

export interface InterestAccrual {
  id: string;
  creditLineId: string;
  /** Principal balance at time of accrual */
  principalBalance: number;
  /** Daily interest rate applied */
  dailyRate: number;
  /** Interest accrued in this event */
  interestAmount: number;
  /** Running total of accrued interest */
  accruedInterestTotal: number;
  /** Date of accrual */
  accrualDate: string;
  createdAt: string;
}

// ─── Credit Line Summary (for dashboard) ────────────────────────

export interface CreditLineSummary {
  creditLine: CreditLine;
  activeEmiPlans: EmiPlan[];
  recentDraws: CreditDraw[];
  recentRepayments: Repayment[];
  /** Available credit = creditLimit - outstandingPrincipal */
  availableCredit: number;
  /** Utilization percentage (0-100) */
  utilizationPercent: number;
  /** Total minimum payment due across all active EMIs */
  totalMinPaymentDue: number;
  /** Next payment due date (earliest across all EMIs) */
  nextPaymentDueDate?: string;
}

// ─── Engine Config ──────────────────────────────────────────────

export interface CreditEngineConfig {
  /** Default APR for new credit lines */
  defaultApr: number;
  /** Maximum credit limit */
  maxCreditLimit: number;
  /** Minimum credit limit */
  minCreditLimit: number;
  /** EMI tenure options (months) */
  emiTenureOptions: number[];
  /** Late payment fee (flat) */
  latePaymentFee: number;
  /** Days after due date before late fee applies */
  lateFeeGraceDays: number;
  /** Days before delinquency bucket escalation */
  delinquencyThresholds: {
    dpd30: number;
    dpd60: number;
    dpd90: number;
  };
}

/**
 * BankVerse — Credit Line Engine
 *
 * Core business logic for UPI-linked credit lines. This is the engine
 * that powers Slice's primary product: instant UPI credit with EMI conversion.
 *
 * Key capabilities:
 * - Credit line origination with limit assignment
 * - Draw (spend) against available credit
 * - Daily compound interest accrual
 * - EMI plan conversion (3/6/9/12 month tenures)
 * - Repayment allocation (interest-first, then principal, FIFO)
 * - Delinquency tracking (CURRENT → DPD_30 → DPD_60 → DPD_90_PLUS)
 * - Late fee assessment
 * - Credit line freeze on default
 */

import type {
  CreditLine,
  CreditDraw,
  EmiPlan,
  Repayment,
  InterestAccrual,
  CreditLineSummary,
  CreditEngineConfig,
  CreditLineStatus,
  DelinquencyBucket,
} from "./types";

// ─── In-memory store (demo mode) ────────────────────────────────

const creditLineStore = new Map<string, CreditLine>();
const drawStore = new Map<string, CreditDraw[]>();
const emiPlanStore = new Map<string, EmiPlan[]>();
const repaymentStore = new Map<string, Repayment[]>();
const interestAccrualStore = new Map<string, InterestAccrual[]>();

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Default Config ─────────────────────────────────────────────

const DEFAULT_CONFIG: CreditEngineConfig = {
  defaultApr: 18.0,
  maxCreditLimit: 10_00_000, // ₹10,00,000 (in paise: 10 lakh)
  minCreditLimit: 10_000, // ₹10,000
  emiTenureOptions: [3, 6, 9, 12],
  latePaymentFee: 500, // ₹500 flat late fee
  lateFeeGraceDays: 3,
  delinquencyThresholds: {
    dpd30: 30,
    dpd60: 60,
    dpd90: 90,
  },
};

// ─── Helpers ────────────────────────────────────────────────────

function computeDailyRate(apr: number): number {
  // Daily compound rate: (1 + APR)^(1/365) - 1
  return Math.pow(1 + apr / 100, 1 / 365) - 1;
}

function computeEmi(
  principal: number,
  apr: number,
  tenureMonths: number,
): { monthlyInstallment: number; totalInterest: number; totalAmount: number } {
  const monthlyRate = apr / 100 / 12;
  const n = tenureMonths;

  if (monthlyRate === 0) {
    return {
      monthlyInstallment: Math.round(principal / n),
      totalInterest: 0,
      totalAmount: principal,
    };
  }

  // EMI = P × r × (1+r)^n / ((1+r)^n - 1)
  const emi =
    (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) /
    (Math.pow(1 + monthlyRate, n) - 1);

  const totalAmount = Math.round(emi * n);
  const totalInterest = totalAmount - principal;

  return {
    monthlyInstallment: Math.round(emi),
    totalInterest,
    totalAmount,
  };
}

function computeDelinquencyBucket(daysPastDue: number): DelinquencyBucket {
  if (daysPastDue <= 0) return "CURRENT";
  if (daysPastDue < 30) return "CURRENT"; // Grace period
  if (daysPastDue < 60) return "DPD_30";
  if (daysPastDue < 90) return "DPD_90_PLUS";
  return "DPD_90_PLUS";
}

function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Credit Engine ──────────────────────────────────────────────

export class CreditEngine {
  private config: CreditEngineConfig;

  constructor(config?: Partial<CreditEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Credit Line Origination ──────────────────────────────────

  /**
   * Open a new credit line for a customer.
   * Validates limit is within configured bounds.
   */
  originateCreditLine(
    customerId: string,
    creditLimit: number,
    apr?: number,
  ): CreditLine {
    if (creditLimit < this.config.minCreditLimit) {
      throw new Error(
        `Credit limit ₹${(creditLimit / 100).toFixed(2)} below minimum ₹${(this.config.minCreditLimit / 100).toFixed(2)}`,
      );
    }
    if (creditLimit > this.config.maxCreditLimit) {
      throw new Error(
        `Credit limit ₹${(creditLimit / 100).toFixed(2)} exceeds maximum ₹${(this.config.maxCreditLimit / 100).toFixed(2)}`,
      );
    }

    const now = new Date().toISOString();
    const line: CreditLine = {
      id: generateId("cl"),
      customerId,
      creditLimit,
      apr: apr ?? this.config.defaultApr,
      outstandingPrincipal: 0,
      accruedInterest: 0,
      totalDrawn: 0,
      totalRepaid: 0,
      status: "ACTIVE",
      daysPastDue: 0,
      delinquencyBucket: "CURRENT",
      lastInterestAccrualDate: now,
      openedAt: now,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    creditLineStore.set(line.id, line);
    drawStore.set(line.id, []);
    emiPlanStore.set(line.id, []);
    repaymentStore.set(line.id, []);
    interestAccrualStore.set(line.id, []);

    return line;
  }

  // ── Draw (Spend) ─────────────────────────────────────────────

  /**
   * Draw against available credit. Fails if insufficient available credit
   * or credit line is not ACTIVE.
   */
  draw(
    creditLineId: string,
    amount: number,
    description: string,
    upiRef?: string,
  ): { creditLine: CreditLine; draw: CreditDraw } {
    const line = this.getCreditLine(creditLineId);

    if (line.status !== "ACTIVE") {
      throw new Error(`Credit line ${creditLineId} is ${line.status}`);
    }

    const availableCredit = line.creditLimit - line.outstandingPrincipal;
    if (amount > availableCredit) {
      throw new Error(
        `Insufficient credit: requested ₹${(amount / 100).toFixed(2)}, available ₹${(availableCredit / 100).toFixed(2)}`,
      );
    }

    const now = new Date().toISOString();
    const draw: CreditDraw = {
      id: generateId("draw"),
      creditLineId,
      customerId: line.customerId,
      amount,
      description,
      upiRef,
      status: "PENDING",
      drawnAt: now,
      createdAt: now,
    };

    const draws = drawStore.get(creditLineId) || [];
    draws.push(draw);
    drawStore.set(creditLineId, draws);

    // Update credit line
    line.outstandingPrincipal += amount;
    line.totalDrawn += amount;
    line.version += 1;
    line.updatedAt = now;
    creditLineStore.set(creditLineId, line);

    return { creditLine: { ...line }, draw: { ...draw } };
  }

  /**
   * Mark a draw as settled (e.g., after NPCI settlement confirmation).
   */
  settleDraw(
    creditLineId: string,
    drawId: string,
    npciSettlementRef?: string,
  ): CreditDraw {
    const draws = drawStore.get(creditLineId) || [];
    const draw = draws.find((d) => d.id === drawId);
    if (!draw) throw new Error(`Draw ${drawId} not found`);

    const now = new Date().toISOString();
    draw.status = "SETTLED";
    draw.settledAt = now;
    if (npciSettlementRef) draw.npciSettlementRef = npciSettlementRef;

    return { ...draw };
  }

  // ── Interest Accrual ─────────────────────────────────────────

  /**
   * Accrue daily interest on outstanding principal.
   * Uses compound daily rate: (1 + APR)^(1/365) - 1
   */
  accrueInterest(creditLineId: string, asOfDate?: string): InterestAccrual {
    const line = this.getCreditLine(creditLineId);
    const now = asOfDate || new Date().toISOString();

    if (line.outstandingPrincipal <= 0) {
      // No outstanding balance, no interest
      const accrual: InterestAccrual = {
        id: generateId("int"),
        creditLineId,
        principalBalance: 0,
        dailyRate: 0,
        interestAmount: 0,
        accruedInterestTotal: line.accruedInterest,
        accrualDate: now,
        createdAt: now,
      };
      const accruals = interestAccrualStore.get(creditLineId) || [];
      accruals.push(accrual);
      interestAccrualStore.set(creditLineId, accruals);
      return accrual;
    }

    const dailyRate = computeDailyRate(line.apr);
    const interestAmount = Math.round(line.outstandingPrincipal * dailyRate);

    line.accruedInterest += interestAmount;
    line.lastInterestAccrualDate = now;
    line.version += 1;
    line.updatedAt = now;
    creditLineStore.set(creditLineId, line);

    const accrual: InterestAccrual = {
      id: generateId("int"),
      creditLineId,
      principalBalance: line.outstandingPrincipal,
      dailyRate,
      interestAmount,
      accruedInterestTotal: line.accruedInterest,
      accrualDate: now,
      createdAt: now,
    };

    const accruals = interestAccrualStore.get(creditLineId) || [];
    accruals.push(accrual);
    interestAccrualStore.set(creditLineId, accruals);

    return accrual;
  }

  /**
   * Accrue interest for multiple days (e.g., catch-up after weekend).
   */
  accrueInterestForDays(creditLineId: string, days: number): InterestAccrual[] {
    const accruals: InterestAccrual[] = [];
    for (let i = 0; i < days; i++) {
      accruals.push(this.accrueInterest(creditLineId));
    }
    return accruals;
  }

  // ── EMI Conversion ───────────────────────────────────────────

  /**
   * Convert outstanding balance (or a portion) into an EMI plan.
   * Validates tenure is in configured options.
   */
  convertToEmi(
    creditLineId: string,
    principalAmount: number,
    tenureMonths: number,
  ): EmiPlan {
    const line = this.getCreditLine(creditLineId);

    if (!this.config.emiTenureOptions.includes(tenureMonths)) {
      throw new Error(
        `Invalid tenure ${tenureMonths} months. Options: ${this.config.emiTenureOptions.join(", ")}`,
      );
    }

    if (principalAmount > line.outstandingPrincipal) {
      throw new Error(
        `Cannot convert ₹${(principalAmount / 100).toFixed(2)} to EMI — outstanding is only ₹${(line.outstandingPrincipal / 100).toFixed(2)}`,
      );
    }

    if (principalAmount <= 0) {
      throw new Error("EMI principal must be positive");
    }

    const { monthlyInstallment, totalInterest, totalAmount } = computeEmi(
      principalAmount,
      line.apr,
      tenureMonths,
    );

    const now = new Date().toISOString();
    const nextDueDate = new Date();
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    // If today is Aug 18, next due is Sep 18
    // But if today is Jan 31, next due should be Feb 28
    // Simple approach: add 30 days
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 30);

    const plan: EmiPlan = {
      id: generateId("emi"),
      creditLineId,
      customerId: line.customerId,
      principalAmount,
      totalInterest,
      totalAmount,
      tenureMonths,
      monthlyInstallment,
      installmentsPaid: 0,
      installmentsRemaining: tenureMonths,
      nextDueDate: dueDate.toISOString(),
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    const plans = emiPlanStore.get(creditLineId) || [];
    plans.push(plan);
    emiPlanStore.set(creditLineId, plans);

    return plan;
  }

  // ── Repayment ────────────────────────────────────────────────

  /**
   * Allocate a repayment against outstanding balance.
   *
   * Allocation order (standard lending practice):
   * 1. Late fees first
   * 2. Accrued interest second
   * 3. Principal last (FIFO against oldest EMI plans)
   */
  makeRepayment(
    creditLineId: string,
    amount: number,
    method: "UPI" | "NEFT" | "IMPS" | "AUTO_DEBIT",
    reference: string,
  ): Repayment {
    const line = this.getCreditLine(creditLineId);

    if (amount <= 0) throw new Error("Repayment amount must be positive");

    let remaining = amount;
    let interestPaid = 0;
    let principalPaid = 0;
    let lateFeePaid = 0;

    // 1. Pay late fees first (if any)
    // Late fees are assessed separately; for now, check if any EMI is past due
    const plans = emiPlanStore.get(creditLineId) || [];
    const now = new Date().toISOString();
    const overduePlans = plans.filter(
      (p) => p.status === "ACTIVE" && p.nextDueDate < now,
    );

    // 2. Pay accrued interest
    if (remaining > 0 && line.accruedInterest > 0) {
      const interestToPay = Math.min(remaining, line.accruedInterest);
      interestPaid = interestToPay;
      remaining -= interestToPay;
      line.accruedInterest -= interestToPay;
    }

    // 3. Pay principal (FIFO against EMI plans)
    if (remaining > 0 && line.outstandingPrincipal > 0) {
      const principalToPay = Math.min(remaining, line.outstandingPrincipal);
      principalPaid = principalToPay;
      remaining -= principalToPay;
      line.outstandingPrincipal -= principalToPay;
      line.totalRepaid += principalToPay;

      // Apply to EMI plans in FIFO order
      let remainingPrincipal = principalPaid;
      for (const plan of plans) {
        if (remainingPrincipal <= 0) break;
        if (plan.status !== "ACTIVE") continue;

        const planRemaining =
          plan.totalAmount - plan.installmentsPaid * plan.monthlyInstallment;
        if (planRemaining <= 0) continue;

        const applied = Math.min(remainingPrincipal, planRemaining);
        const installmentsCovered = Math.floor(
          applied / plan.monthlyInstallment,
        );

        plan.installmentsPaid += installmentsCovered;
        plan.installmentsRemaining = plan.tenureMonths - plan.installmentsPaid;

        if (plan.installmentsRemaining <= 0) {
          plan.status = "PAID";
        } else {
          // Advance next due date
          const nextDue = new Date(plan.nextDueDate);
          nextDue.setDate(nextDue.getDate() + 30 * installmentsCovered);
          plan.nextDueDate = nextDue.toISOString();
        }

        plan.updatedAt = now;
        remainingPrincipal -= applied;
      }
    }

    // Update delinquency
    const activePlans = plans.filter((p) => p.status === "ACTIVE");
    if (activePlans.length > 0) {
      const earliestDue = activePlans.reduce(
        (earliest, p) => (p.nextDueDate < earliest ? p.nextDueDate : earliest),
        activePlans[0].nextDueDate,
      );
      line.daysPastDue = Math.max(0, daysBetween(earliestDue, now));
    } else if (line.outstandingPrincipal === 0) {
      line.daysPastDue = 0;
    }

    line.delinquencyBucket = computeDelinquencyBucket(line.daysPastDue);
    line.lastPaymentDate = now;
    line.version += 1;
    line.updatedAt = now;

    // Auto-freeze if 90+ DPD
    if (line.delinquencyBucket === "DPD_90_PLUS" && line.status === "ACTIVE") {
      line.status = "DEFAULT";
    }

    creditLineStore.set(creditLineId, line);

    const repayment: Repayment = {
      id: generateId("repay"),
      creditLineId,
      customerId: line.customerId,
      amount,
      interestComponent: interestPaid,
      principalComponent: principalPaid,
      lateFee: lateFeePaid,
      method,
      reference,
      paidAt: now,
      createdAt: now,
    };

    const repayments = repaymentStore.get(creditLineId) || [];
    repayments.push(repayment);
    repaymentStore.set(creditLineId, repayments);

    return repayment;
  }

  // ── Delinquency Check ────────────────────────────────────────

  /**
   * Run delinquency assessment: update DPD, escalate buckets, assess late fees.
   * Call this daily (or on payment due dates).
   */
  assessDelinquency(creditLineId: string): CreditLine {
    const line = this.getCreditLine(creditLineId);
    const plans = emiPlanStore.get(creditLineId) || [];
    const now = new Date().toISOString();

    const activePlans = plans.filter((p) => p.status === "ACTIVE");
    if (activePlans.length === 0 && line.outstandingPrincipal === 0) {
      line.daysPastDue = 0;
      line.delinquencyBucket = "CURRENT";
      line.updatedAt = now;
      creditLineStore.set(creditLineId, line);
      return { ...line };
    }

    // Find earliest overdue EMI
    let maxDaysPastDue = 0;
    for (const plan of activePlans) {
      if (plan.nextDueDate < now) {
        const dpd = daysBetween(plan.nextDueDate, now);
        if (dpd > maxDaysPastDue) maxDaysPastDue = dpd;
      }
    }

    line.daysPastDue = maxDaysPastDue;
    const newBucket = computeDelinquencyBucket(maxDaysPastDue);

    // Escalation: can only go up, never down without full catch-up
    const bucketOrder: DelinquencyBucket[] = [
      "CURRENT",
      "DPD_30",
      "DPD_60",
      "DPD_90_PLUS",
    ];
    const currentIdx = bucketOrder.indexOf(line.delinquencyBucket);
    const newIdx = bucketOrder.indexOf(newBucket);
    if (newIdx > currentIdx) {
      line.delinquencyBucket = newBucket;
    }

    // Auto-freeze at 90+ DPD
    if (line.delinquencyBucket === "DPD_90_PLUS" && line.status === "ACTIVE") {
      line.status = "DEFAULT";
    }

    line.version += 1;
    line.updatedAt = now;
    creditLineStore.set(creditLineId, line);

    return { ...line };
  }

  // ── Late Fee Assessment ──────────────────────────────────────

  /**
   * Assess late fee on overdue EMI plans.
   * Only applies if past grace period.
   */
  assessLateFee(creditLineId: string): number {
    const line = this.getCreditLine(creditLineId);
    const plans = emiPlanStore.get(creditLineId) || [];
    const now = new Date().toISOString();

    let totalLateFee = 0;
    for (const plan of plans) {
      if (plan.status !== "ACTIVE") continue;
      const dpd = daysBetween(plan.nextDueDate, now);
      if (dpd > this.config.lateFeeGraceDays) {
        totalLateFee += this.config.latePaymentFee;
      }
    }

    if (totalLateFee > 0) {
      line.accruedInterest += totalLateFee; // Late fees added to outstanding
      line.version += 1;
      line.updatedAt = now;
      creditLineStore.set(creditLineId, line);
    }

    return totalLateFee;
  }

  // ── Queries ──────────────────────────────────────────────────

  getCreditLine(creditLineId: string): CreditLine {
    const line = creditLineStore.get(creditLineId);
    if (!line) throw new Error(`Credit line ${creditLineId} not found`);
    return line;
  }

  getCreditLineByCustomer(customerId: string): CreditLine | undefined {
    for (const line of creditLineStore.values()) {
      if (line.customerId === customerId) return line;
    }
    return undefined;
  }

  getDraws(creditLineId: string): CreditDraw[] {
    return drawStore.get(creditLineId) || [];
  }

  getEmiPlans(creditLineId: string): EmiPlan[] {
    return emiPlanStore.get(creditLineId) || [];
  }

  getRepayments(creditLineId: string): Repayment[] {
    return repaymentStore.get(creditLineId) || [];
  }

  getInterestAccruals(creditLineId: string): InterestAccrual[] {
    return interestAccrualStore.get(creditLineId) || [];
  }

  /**
   * Get full credit line summary for dashboard display.
   */
  getSummary(creditLineId: string): CreditLineSummary {
    const line = this.getCreditLine(creditLineId);
    const activeEmiPlans = (emiPlanStore.get(creditLineId) || []).filter(
      (p) => p.status === "ACTIVE",
    );
    const recentDraws = (drawStore.get(creditLineId) || []).slice(-10);
    const recentRepayments = (repaymentStore.get(creditLineId) || []).slice(
      -10,
    );

    const availableCredit = line.creditLimit - line.outstandingPrincipal;
    const utilizationPercent =
      line.creditLimit > 0
        ? Math.round((line.outstandingPrincipal / line.creditLimit) * 10000) /
          100
        : 0;

    const totalMinPaymentDue = activeEmiPlans.reduce(
      (sum, p) => sum + p.monthlyInstallment,
      0,
    );

    const nextPaymentDueDate =
      activeEmiPlans.length > 0
        ? activeEmiPlans.reduce(
            (earliest, p) =>
              p.nextDueDate < earliest ? p.nextDueDate : earliest,
            activeEmiPlans[0].nextDueDate,
          )
        : undefined;

    return {
      creditLine: { ...line },
      activeEmiPlans,
      recentDraws,
      recentRepayments,
      availableCredit,
      utilizationPercent,
      totalMinPaymentDue,
      nextPaymentDueDate,
    };
  }

  // ── Admin ────────────────────────────────────────────────────

  /**
   * Freeze a credit line (prevents new draws).
   */
  freezeCreditLine(creditLineId: string): CreditLine {
    const line = this.getCreditLine(creditLineId);
    if (line.status !== "ACTIVE") {
      throw new Error(`Cannot freeze credit line in ${line.status} status`);
    }
    line.status = "FROZEN";
    line.version += 1;
    line.updatedAt = new Date().toISOString();
    creditLineStore.set(creditLineId, line);
    return { ...line };
  }

  /**
   * Unfreeze a credit line.
   */
  unfreezeCreditLine(creditLineId: string): CreditLine {
    const line = this.getCreditLine(creditLineId);
    if (line.status !== "FROZEN") {
      throw new Error(`Cannot unfreeze credit line in ${line.status} status`);
    }
    line.status = "ACTIVE";
    line.version += 1;
    line.updatedAt = new Date().toISOString();
    creditLineStore.set(creditLineId, line);
    return { ...line };
  }

  /**
   * Close a credit line (must have zero balance).
   */
  closeCreditLine(creditLineId: string): CreditLine {
    const line = this.getCreditLine(creditLineId);
    if (line.outstandingPrincipal > 0 || line.accruedInterest > 0) {
      throw new Error(
        `Cannot close credit line with outstanding balance: principal ₹${(line.outstandingPrincipal / 100).toFixed(2)}, interest ₹${(line.accruedInterest / 100).toFixed(2)}`,
      );
    }
    line.status = "CLOSED";
    line.closedAt = new Date().toISOString();
    line.version += 1;
    line.updatedAt = new Date().toISOString();
    creditLineStore.set(creditLineId, line);
    return { ...line };
  }

  /**
   * Clear all in-memory state (for testing).
   */
  static reset(): void {
    creditLineStore.clear();
    drawStore.clear();
    emiPlanStore.clear();
    repaymentStore.clear();
    interestAccrualStore.clear();
  }
}

/**
 * BankVerse — Auto-Solve Policy Store
 *
 * Manages the 9 policy toggles governing whether logs in each chaos category
 * are automatically remediated or flagged for manual resolution.
 */

import type { AutoSolvePolicy, ChaosCategory } from "./types";

const DEFAULT_POLICIES: AutoSolvePolicy[] = [
  {
    categoryId: "provider-timeout",
    categoryName: "Provider Timeout",
    severity: "HIGH",
    enabled: true,
    description: "Timeout on payment confirmation — trigger reconciliation & state recovery.",
    remediationAction: "Transition payment to UNKNOWN → Trigger orphan reconciliation check.",
  },
  {
    categoryId: "amount-mismatch",
    categoryName: "Amount Mismatch",
    severity: "HIGH",
    enabled: true,
    description: "Ledger vs provider amount discrepancy — quarantine & flag delta.",
    remediationAction: "Flag delta → Place settlement into PENDING_RECONCILIATION → Create audit record.",
  },
  {
    categoryId: "duplicate-charge",
    categoryName: "Duplicate Charge",
    severity: "CRITICAL",
    enabled: true,
    description: "Multiple charges for single transaction — queue duplicate refund.",
    remediationAction: "Keep primary charge → Auto-queue refund (REFUND_PENDING) for duplicate.",
  },
  {
    categoryId: "missing-credit",
    categoryName: "Missing Credit (Ledger Imbalance)",
    severity: "CRITICAL",
    enabled: false, // Default disabled to require manual signoff for ledger imbalances
    description: "Debit created without matching credit — auto-reverse or quarantine.",
    remediationAction: "Auto-generate balancing reversal entry into Clearing Suspense.",
  },
  {
    categoryId: "webhook-out-of-order",
    categoryName: "Webhook Out of Order",
    severity: "MEDIUM",
    enabled: true,
    description: "Out of sequence status updates — state machine rejects invalid jumps.",
    remediationAction: "Reject transition safely → Maintain current terminal/valid state.",
  },
  {
    categoryId: "provider-down",
    categoryName: "Provider Down",
    severity: "HIGH",
    enabled: true,
    description: "Provider API unreachable — fail closed and mark non-settling.",
    remediationAction: "Set paymentState FAILED → settlementState NOT_REQUIRED → Fail closed.",
  },
  {
    categoryId: "slow-reconciliation",
    categoryName: "Slow Reconciliation (Bulk Mismatch)",
    severity: "MEDIUM",
    enabled: true,
    description: "Bulk volume mismatch — run batch classification & group incident.",
    remediationAction: "Auto-batch group mismatches into single correlated incident report.",
  },
  {
    categoryId: "worker-crash-after-commit",
    categoryName: "Worker Crash After DB Commit",
    severity: "CRITICAL",
    enabled: true,
    description: "Worker crash post-commit — idempotency replay without duplicate movement.",
    remediationAction: "Replay outbox event safely using OCC & idempotency lock.",
  },
  {
    categoryId: "refund-race-condition",
    categoryName: "Refund Race Condition",
    severity: "MEDIUM",
    enabled: true,
    description: "Refund attempted before capture — queue refund until settled.",
    remediationAction: "Queue refund task until terminal state SUCCESS is reached.",
  },
];

// In-memory policy store initialized with defaults
let policiesStore: AutoSolvePolicy[] = DEFAULT_POLICIES.map((p) => ({
  ...p,
  updatedAt: new Date().toISOString(),
}));

export function getPolicies(): AutoSolvePolicy[] {
  return [...policiesStore];
}

export function getPolicyForCategory(category: ChaosCategory): AutoSolvePolicy | undefined {
  return policiesStore.find((p) => p.categoryId === category);
}

export function updatePolicy(
  categoryId: ChaosCategory,
  enabled: boolean,
): AutoSolvePolicy | null {
  const policy = policiesStore.find((p) => p.categoryId === categoryId);
  if (!policy) return null;

  policy.enabled = enabled;
  policy.updatedAt = new Date().toISOString();
  return { ...policy };
}

export function resetPolicies(): void {
  policiesStore = DEFAULT_POLICIES.map((p) => ({
    ...p,
    updatedAt: new Date().toISOString(),
  }));
}

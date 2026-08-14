/**
 * BankVerse — Chaos Engineering Scenarios
 *
 * Each scenario follows: INJECT → OBSERVE → VERIFY → PASS/FAIL
 * The Chaos Lab proves the system handles failure modes correctly.
 */

export interface ChaosScenarioDef {
  id: string;
  name: string;
  description: string;
  severity: IncidentSeverity;
  /** What the injection does */
  injectDescription: string;
  /** What the system should do in response */
  expectedBehavior: string;
  /**
   * Financial correctness invariant that must hold regardless of the failure.
   * e.g. "SUM(debits) === SUM(credits) remains true"
   */
  invariant: string;
  failureType?: "TIMEOUT" | "AMOUNT_MISMATCH" | "PROVIDER_DOWN" | "DUPLICATE_CHARGE" | "MISSING_CREDIT";
  latencyMs?: number;
  failureRate?: number;
}

export const CHAOS_SCENARIOS: ChaosScenarioDef[] = [
  {
    id: "provider-timeout",
    name: "Provider Timeout",
    description:
      "Payment provider times out after 30s — orchestrator must detect UNKNOWN state and trigger reconciliation.",
    severity: "HIGH",
    injectDescription:
      "Mock PSP configured to return 504 Gateway Timeout after 30s delay.",
    expectedBehavior:
      "Orchestrator sets paymentState to UNKNOWN → settlementState to PENDING_RECONCILIATION → reconciliation detects orphan transaction.",
    invariant:
      "No money is double-counted: the transaction is either UNKNOWN (pending reconciliation) or FAILED (reversed), never SUCCESS without provider confirmation.",
  },
  {
    id: "amount-mismatch",
    name: "Amount Mismatch",
    description:
      "Provider debits ₹500 but internal ledger records ₹5000 — reconciliation must detect AMOUNT_MISMATCH.",
    severity: "HIGH",
    injectDescription:
      "External record amount differs from internal transaction amount by 10x.",
    expectedBehavior:
      "Reconciliation detects AMOUNT_MISMATCH → evidence shows internal.amount vs provider.amount → settlement enters PENDING_RECONCILIATION.",
    invariant:
      "SUM(debits) === SUM(credits) remains true. The mismatch is detected and quarantined, but the ledger itself stays balanced.",
  },
  {
    id: "duplicate-charge",
    name: "Duplicate Charge",
    description:
      "Same payment processed twice — reconciliation must detect DUPLICATE and flag for refund.",
    severity: "CRITICAL",
    injectDescription:
      "Two external provider records exist for a single internal transaction.",
    expectedBehavior:
      "Reconciliation detects duplicate → one item MATCHED, one UNMATCHED (MISSING_INTERNAL) → settlement enters REFUND_PENDING for duplicate.",
    invariant:
      "The customer is never charged twice for the same transaction. Any duplicate external charge is flagged and refunded before settlement completes.",
  },
  {
    id: "missing-credit",
    name: "Missing Credit (DEBIT_WITHOUT_CREDIT)",
    description:
      "Debit succeeds but credit never arrives — ledger integrity check must detect the imbalance.",
    severity: "CRITICAL",
    injectDescription:
      "Only a DEBIT entry exists in the ledger; the corresponding CREDIT entry is missing.",
    expectedBehavior:
      "Ledger integrity check fails → reconciliation detects DEBIT_WITHOUT_CREDIT → evidence shows ledger.debit > ledger.credit → settlement enters PENDING_RECONCILIATION.",
    invariant:
      "SUM(all ledger entries) === 0 at all times. A debit without a credit is detected and blocked from settlement — money is never created or destroyed.",
  },
  {
    id: "webhook-out-of-order",
    name: "Webhook Out of Order",
    description:
      "SUCCESS webhook arrives after FAILED webhook — state machine must reject invalid transition.",
    severity: "MEDIUM",
    injectDescription:
      "Send webhooks in reverse order: FAILED first, then SUCCESS.",
    expectedBehavior:
      "State machine rejects SUCCESS → PROCESSING transition (payment already FAILED) → payment stays FAILED → reconciliation confirms correct state.",
    invariant:
      "The state machine never accepts an invalid transition. The final state is always reachable through valid transitions only.",
  },
  {
    id: "provider-down",
    name: "Provider Down",
    description:
      "All requests to payment provider fail — orchestrator must fail gracefully without corrupting state.",
    severity: "HIGH",
    injectDescription:
      "Mock PSP configured to reject all requests with connection error.",
    expectedBehavior:
      "Orchestrator sets paymentState to FAILED → settlementState to NOT_REQUIRED → no reconciliation needed → no money moved.",
    invariant:
      "No money moves when the provider is unreachable. All transactions are FAILED with settlement NOT_REQUIRED — the system is fail-closed.",
  },
  {
    id: "slow-reconciliation",
    name: "Slow Reconciliation (Bulk Mismatch)",
    description:
      "1000 transactions with 50 mismatches — reconciliation must complete and classify all mismatches.",
    severity: "MEDIUM",
    injectDescription:
      "Generate 1000 transactions, 50 with intentional amount mismatches.",
    expectedBehavior:
      "Reconciliation completes within reasonable time → all 50 mismatches have structured evidence → incident detection groups by provider.",
    invariant:
      "Every mismatch has structured evidence (internal + external records). No mismatch is silently dropped — 100% of mismatches are accounted for.",
  },
  {
    id: "worker-crash-after-commit",
    name: "Worker Crash After DB Commit",
    description:
      "Database commits transaction + outbox event, then worker process crashes — worker restart recovers event without duplicate ledger movement.",
    severity: "CRITICAL",
    injectDescription:
      "Commit payment, ledger, and outbox event, then kill worker process before event execution.",
    expectedBehavior:
      "Process restarts → outbox event still in PENDING/PROCESSING status → worker retries and processes event without duplicate financial movement.",
    invariant:
      "At-least-once delivery with zero duplicate financial entries. Double-entry ledger balance is preserved across process crashes.",
  },
  {
    id: "refund-race-condition",
    name: "Refund Race Condition",
    description:
      "Refund initiated while payment still PROCESSING — state machine must queue refund until terminal.",
    severity: "MEDIUM",
    injectDescription:
      "Initiate refund immediately after payment creation, before provider responds.",
    expectedBehavior:
      "State machine queues refund until payment reaches terminal state → settlement transitions correctly to REFUNDED → RESOLVED.",
    invariant:
      "The refund is never lost: it either completes after the payment settles, or the payment fails and no refund is needed. The customer's balance is always correct.",
  },
];
export function addCustomScenario(def: ChaosScenarioDef): void {
  const existingIndex = CHAOS_SCENARIOS.findIndex((s) => s.id === def.id);
  if (existingIndex >= 0) {
    CHAOS_SCENARIOS[existingIndex] = def;
  } else {
    CHAOS_SCENARIOS.push(def);
  }
}


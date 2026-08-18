# 🧪 BankVerse — Chaos Engineering & Operations Walkthrough

> **Live demo guide for Slice's engineering team.** Every scenario below is runnable, verifiable, and proves a specific financial correctness invariant.

---

## Quick Start (2 minutes)

```bash
git clone https://github.com/Script-Kitty01/bankverse.git
cd bankverse
npm install
npm run build          # Clean build, zero errors
npm test               # 87/87 tests passing
```

Then open `http://localhost:3000/chaos-lab` in your browser.

---

## What This Proves

In financial infrastructure, the question isn't *if* things fail — it's *what happens to the money* when they do. BankVerse's chaos lab injects real failure modes and verifies that **financial invariants hold** regardless:

| Invariant | What It Means |
|-----------|--------------|
| `SUM(debits) === SUM(credits)` | Money is never created or destroyed |
| `version-locked mutations` | No double-charges under concurrent requests |
| `append-only ledger` | Entries are never modified or deleted |
| `three-legged clearing` | Customer funds stay in suspense until settlement confirmed |

---

## 🎮 Chaos Lab UI (`/chaos-lab`)

The interactive chaos lab lets you:

1. **Run individual scenarios** — Click any scenario to inject the fault and see pass/fail
2. **Run all 9 scenarios** — Full regression in one click
3. **View invariant verification** — Each result shows whether the financial invariant held
4. **See actual vs expected behavior** — Side-by-side comparison of what happened vs what should happen

### Scenario Matrix

| # | Scenario | Severity | What It Injects | Invariant Verified |
|---|----------|----------|----------------|-------------------|
| 1 | **Provider Timeout** | HIGH | PSP returns 504 after 30s | Money stays in CLEARING_SUSPENSE, no double-charge |
| 2 | **Amount Mismatch** | HIGH | Provider debits ₹500, ledger says ₹5000 | Ledger stays balanced; mismatch quarantined |
| 3 | **Duplicate Charge** | CRITICAL | Two external records for one internal txn | Customer never charged twice; duplicate flagged for refund |
| 4 | **Missing Credit** | CRITICAL | Debit exists, credit missing | `SUM(ledger) === 0` detected; settlement blocked |
| 5 | **Webhook Out of Order** | MEDIUM | SUCCESS arrives after REFUNDED | State machine rejects illegal transition |
| 6 | **Provider Down** | HIGH | All PSP endpoints return 503 | Graceful degradation; health check reflects DOWN |
| 7 | **Slow Reconciliation** | MEDIUM | 50+ mismatches in single batch | Bulk detection completes; all mismatches categorized |
| 8 | **Worker Crash After DB Commit** | CRITICAL | Process dies after DB write, before event publish | Outbox recovery replays events without duplicates |
| 9 | **Refund Race Condition** | MEDIUM | Concurrent refund + settlement requests | Settlement state consistency; exactly one winner |

---

## 🔬 Deep Dive: Scenario 4 — Missing Credit

This is the most critical scenario for UPI credit card operations. Here's exactly what happens:

### Injection
```
Only a DEBIT entry exists in the ledger:
  DEBIT  Customer Account    ₹5,000
  (CREDIT Merchant Account   MISSING)
```

### System Response
1. **Ledger integrity check** runs: `SUM(all debits) - SUM(all credits) ≠ 0`
2. **Reconciliation engine** detects `DEBIT_WITHOUT_CREDIT` mismatch type
3. **Settlement** enters `PENDING_RECONCILIATION` — funds are frozen, not lost
4. **Incident detector** creates a CRITICAL incident with full evidence trail
5. **Operations dashboard** surfaces the incident with affected amount and mismatch details

### Why This Matters for Slice
When NPCI confirms a UPI repayment but your internal ledger doesn't record the credit, you have a `DEBIT_WITHOUT_CREDIT`. BankVerse catches this automatically — no manual CSV reconciliation at end of month.

---

## 🔬 Deep Dive: Scenario 8 — Worker Crash After DB Commit

This is the hardest distributed systems problem: the database write succeeded but the process died before publishing the event.

### Injection
```
1. Payment state updated to SUCCESS in DB ✓
2. Ledger entries written ✓
3. Outbox event written in same transaction ✓
4. 💥 Worker crashes before publishing event to message queue
```

### System Response
1. **Outbox poller** discovers unprocessed events (event exists in DB but not acknowledged)
2. **Idempotency guard** checks: has this event already been processed? → No
3. **Event replayed** — downstream systems receive the event they missed
4. **No duplicate processing** — idempotency key prevents double-handling if the event was partially processed

### Why This Matters for Slice
When your Kafka producer crashes mid-publish, you need exactly-once semantics. BankVerse's outbox pattern guarantees it.

---

## 📊 Operations Dashboard (`/operations`)

The operations dashboard provides real-time visibility into system health:

### KPI Cards
- **Success Rate**: % of transactions that completed without incident
- **Total Volume**: Aggregate transaction volume processed
- **Active Incidents**: Currently unresolved incidents by severity
- **Reconciliation Match Rate**: % of internal records matched to external provider records

### Provider Health
Real-time health status for all payment providers:
- **Razorpay** — UPI & Card payments
- **IMPS/NEFT** — Bank transfer network
- **Account Aggregator** — Bank account linking

### Incident Lifecycle
```
DETECTED → INVESTIGATING → ACTION_REQUIRED → RESOLVED
                                            → DISMISSED
```

Each incident includes:
- Affected transaction count and total amount
- Mismatch types (AMOUNT_MISMATCH, MISSING_INTERNAL, etc.)
- Timeline of all state transitions
- Resolution notes and audit trail

### Incident Correlation
The correlator merges related failures within a 5-minute sliding window:
- Same provider + same mismatch type → single incident
- Prevents alert fatigue (50 individual failures → 1 actionable incident)

---

## 🧪 API-Driven Testing

All scenarios are also testable via API:

```bash
# List all scenarios
curl http://localhost:3000/api/chaos?action=scenarios

# Run a single scenario
curl -X POST http://localhost:3000/api/chaos \
  -H "Content-Type: application/json" \
  -d '{"scenarioId": "missing-credit", "action": "run"}'

# Run all 9 scenarios
curl -X POST http://localhost:3000/api/chaos \
  -H "Content-Type: application/json" \
  -d '{"action": "run-all"}'

# Get operations snapshot
curl http://localhost:3000/api/operations

# Automated verification (all 9 scenarios)
curl http://localhost:3000/api/test-chaos
```

---

## 🏆 What This Demonstrates to Slice

1. **I think in invariants, not just features** — Every scenario has a financial correctness invariant that must hold regardless of failure mode.

2. **I test for failure, not just success** — 9 chaos scenarios + 7 incident detection tests + 7 reconciliation tests = 23 tests specifically for failure modes.

3. **I build for operations, not just development** — The operations dashboard isn't an afterthought; it's integrated with the same incident detection engine that runs in production.

4. **I understand distributed systems failure modes** — Worker crashes, network timeouts, out-of-order messages, race conditions — these aren't edge cases, they're baseline execution conditions.

5. **I write code that proves itself correct** — Every chaos scenario has `expectedBehavior`, `actualBehavior`, and `invariantHeld` fields. The system doesn't just "handle errors" — it verifies correctness.

---

## Files Reference

| Component | Path | Purpose |
|-----------|------|---------|
| Chaos Scenarios | `lib/chaos/scenarios.ts` | 9 scenario definitions with invariants |
| Chaos Injector | `lib/chaos/injector.ts` | Fault injection engine |
| Chaos API | `app/api/chaos/route.ts` | REST API for running scenarios |
| Chaos Lab UI | `components/ChaosLab.tsx` | Interactive chaos lab page |
| Incident Detector | `lib/incidents/detector.ts` | Automatic incident detection |
| Incident Correlator | `lib/incidents/correlator.ts` | 5-min sliding window correlation |
| Operations Dashboard | `components/OperationsDashboard.tsx` | Real-time ops visibility |
| Operations API | `app/api/operations/route.ts` | Operations snapshot & incident management |

---

*Built by Aamira • [GitHub](https://github.com/Script-Kitty01) • August 2026*

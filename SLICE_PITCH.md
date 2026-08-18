# BankVerse → Slice: Engineering Pitch

> **Cold outreach to Slice's engineering team — mapping BankVerse's architecture to Slice's real-world payment infrastructure challenges.**

---

## Why This Matters to Slice

Slice operates a UPI-linked credit card — one of the most technically demanding products in Indian fintech. Every day, Slice's systems must:

1. **Ingest NPCI settlement files** from HDFC Bank and reconcile thousands of UPI credit repayments against internal loan ledgers
2. **Manage credit line lifecycles** — origination, draw, interest accrual, EMI conversion, repayment allocation, delinquency tracking
3. **Maintain absolute financial correctness** across distributed systems where payment providers, webhooks, and network retries fail unpredictably
4. **Detect and resolve discrepancies** before they become RBI compliance issues

BankVerse was built to solve exactly these problems. Below is a feature-by-feature mapping.

---

## Feature Map: BankVerse → Slice

### 1. NPCI Settlement Reconciliation → Slice's Daily Settlement Workflow

| Slice's Problem                                                             | BankVerse's Solution                                                                                                         |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Every morning, download NPCI CSV from HDFC SFTP                             | `NpciSettlementParser.parse()` — RFC 4180 compliant CSV parser with NPCI-specific column mapping                             |
| Match thousands of UPI transactions against internal loan repayment records | `ReconciliationEngine.reconcileNormalizedTransactions()` — exact match by UPI reference, fuzzy match by amount + time window |
| Detect amount mismatches (NPCI says ₹1500, internal ledger says ₹1400)      | `AMOUNT_MISMATCH` detection with difference calculation                                                                      |
| Find repayments in NPCI file that never hit internal ledger                 | `MISSING_INTERNAL` flagging                                                                                                  |
| Handle disputed/chargeback transactions                                     | `DISPUTED` settlement flag tracking in batch summary                                                                         |
| Batch-level audit reporting                                                 | `NpciParseResult.summary` — total settled, unsettled, disputed, per-bank breakdown                                           |

**Code**: `lib/ingestion/npci-settlement-parser.ts`, `lib/reconciliation/engine.ts`
**Tests**: 10 verification tests in Phase 9, all passing

---

### 2. Credit Line Engine → Slice's UPI Credit Card Product

| Slice's Product Feature                                        | BankVerse's Implementation                                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Credit line origination with limit assignment                  | `CreditEngine.originateCreditLine()` — configurable limits, APR, bounds validation                   |
| UPI spend (draw against credit)                                | `CreditEngine.draw()` — validates available credit, records UPI reference                            |
| Daily compound interest accrual                                | `CreditEngine.accrueInterest()` — daily rate = (1 + APR)^(1/365) - 1                                 |
| EMI conversion (3/6/9/12 months)                               | `CreditEngine.convertToEmi()` — standard amortization formula, tenure validation                     |
| Repayment allocation (interest-first, then principal, FIFO)    | `CreditEngine.makeRepayment()` — waterfall: late fees → interest → principal (FIFO across EMI plans) |
| Delinquency tracking (CURRENT → DPD_30 → DPD_60 → DPD_90_PLUS) | `CreditEngine.assessDelinquency()` — auto-escalation, auto-freeze at 90+ DPD                         |
| Late fee assessment                                            | `CreditEngine.assessLateFee()` — configurable grace period, flat fee                                 |
| Credit line freeze/unfreeze/close                              | Full lifecycle state machine with invariant checks                                                   |
| Dashboard summary                                              | `CreditEngine.getSummary()` — utilization %, available credit, min payment due, next due date        |

**Code**: `lib/credit/engine.ts`, `lib/credit/types.ts`
**Tests**: 18 verification tests in Phase 10, all passing

---

### 3. Double-Entry Ledger → RBI-Compliant Audit Trail

| Compliance Requirement                                        | BankVerse's Implementation                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Every financial movement must have equal and opposite entries | `SUM(debits) === SUM(credits)` enforced at transaction time              |
| Append-only — entries never modified or deleted               | Immutable ledger entries, reversals create new entries                   |
| Three-legged clearing for UPI settlement                      | Customer → Clearing Suspense → Merchant, prevents `DEBIT_WITHOUT_CREDIT` |
| Derived balances (not stored)                                 | `computeBalance()` — balance = SUM(credits) - SUM(debits)                |
| Full audit trail                                              | Every entry linked to transaction, account, and timestamp                |

**Code**: `lib/ledger/`
**Tests**: 7 verification tests in Phase 1, all passing

---

### 4. Concurrency & Idempotency → No Double Charges on UPI Retries

| Production Scenario                                     | BankVerse's Safeguard                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| User taps "Pay" twice on UPI (network glitch)           | Two-tiered idempotency: Redis cache + DB unique constraint on `idempotencyKey` |
| 100 concurrent repayment webhooks from NPCI             | Optimistic Concurrency Control: `UPDATE ... WHERE version = N`, single-winner  |
| Out-of-order webhooks (SUCCESS arrives after REFUNDED)  | Dual FSM validation — illegal transitions rejected                             |
| Worker crashes after DB commit but before event publish | Transactional Outbox pattern — events atomically persisted with state change   |

**Code**: `lib/ledger/repository.ts` (OCC), `lib/ledger/outbox.ts`
**Tests**: Phases 2 & 4, 24 tests covering OCC races, idempotency, and crash recovery

---

### 5. Chaos Engineering → Proving Correctness Under Failure

Slice's engineering blog emphasizes reliability. BankVerse includes a **9-scenario chaos lab** that injects real faults and verifies system invariants hold:

| Scenario                              | What It Proves                                        |
| ------------------------------------- | ----------------------------------------------------- |
| Provider Timeout                      | Money stays in CLEARING_SUSPENSE, no double charge    |
| Amount Mismatch                       | Reconciliation engine detects and flags               |
| Duplicate Charge                      | Idempotency prevents double debit                     |
| Missing Credit (DEBIT_WITHOUT_CREDIT) | Ledger integrity invariant catches it                 |
| Webhook Out of Order                  | State machine rejects illegal transitions             |
| Provider Down                         | Graceful degradation, health check                    |
| Slow Reconciliation                   | Bulk mismatch detection at scale                      |
| Worker Crash After DB Commit          | Outbox recovery without duplicates                    |
| Refund Race Condition                 | Settlement state consistency during concurrent refund |

**Code**: `lib/chaos/`, `app/api/chaos/`, `components/ChaosLab.tsx`
**Tests**: 9 scenarios in Phase 4, all passing

---

### 6. Incident Detection → Operations Dashboard

When NPCI settlement files have discrepancies, Slice's ops team needs to know immediately:

- **IncidentDetector** — 5-minute sliding window correlation, groups related failures
- **OperationsDashboard** — KPIs, provider health, reconciliation status, incident lifecycle
- **Incident lifecycle** — detect → investigate → resolve/dismiss with audit trail

**Code**: `lib/incidents/`, `components/OperationsDashboard.tsx`
**Tests**: 7 verification tests in Phase 5, all passing

---

## Technical Stack Alignment

| Slice's Stack           | BankVerse's Stack                | Overlap                            |
| ----------------------- | -------------------------------- | ---------------------------------- |
| Kotlin, Java (backend)  | TypeScript 5 (full-stack)        | Different languages, same patterns |
| Kafka                   | Transactional Outbox (DB-native) | Event-driven architecture          |
| Apache Spark            | In-process reconciliation engine | Batch processing mindset           |
| Postgres, Redshift      | Supabase (Postgres)              | Same SQL fundamentals              |
| Docker, AWS, Argo CD    | Docker, Docker Compose           | Containerized deployment           |
| React (web)             | Next.js 16 + React 19            | Same frontend framework            |
| Flutter, Swift (mobile) | N/A (web-only)                   | —                                  |

---

## What BankVerse Demonstrates

1. **I understand NPCI settlement files** — not just theoretically, but I've built a parser that handles the exact 13-column format, malformed rows, disputed flags, and batch-level reconciliation.

2. **I understand credit line math** — compound daily interest, EMI amortization, interest-first repayment waterfalls, delinquency bucketing. These aren't abstract concepts; they're implemented and tested.

3. **I think in invariants** — `SUM(debits) === SUM(credits)`, version-locked mutations, append-only audit trails. This is the mindset needed for financial infrastructure.

4. **I test for failure, not just success** — 87 automated verification tests across 10 phases, including chaos injection, concurrent race conditions, and malformed input handling.

5. **I build for operations, not just development** — Incident detection, reconciliation dashboards, provider health checks. Code that runs in production needs operational visibility.

---

## What I'd Love to Learn at Slice

- How does Slice handle NPCI settlement at scale? (Kafka streams? Spark batch?)
- What's the repayment allocation waterfall? (Any differences from standard interest-first?)
- How does Slice handle the NBFC → Bank migration for UPI credit?
- What monitoring/observability patterns does the team use for payment reliability?

---

## Running It

```bash
git clone https://github.com/Script-Kitty01/bankverse.git
cd bankverse
npm install
npm run build    # Clean build, zero errors
npm test         # 87/87 tests passing
```

---

_Built by Aamira • [GitHub](https://github.com/Script-Kitty01) • August 2026_

# BankVerse — Chaos Engineering & Operations Demo

## Overview

This document describes the Chaos Lab and Operations Dashboard features added in Phases 4 & 5 of the BankVerse Payment Reliability Architecture.

## Phase 4: Chaos Lab

### Purpose

Prove the system handles failure modes correctly through controlled chaos experiments.

### 8 Chaos Scenarios

| #   | Scenario              | Severity | What It Tests                                    |
| --- | --------------------- | -------- | ------------------------------------------------ |
| 1   | Provider Timeout      | HIGH     | Orchestrator handles provider failure gracefully |
| 2   | Amount Mismatch       | HIGH     | Reconciliation detects amount discrepancies      |
| 3   | Duplicate Charge      | CRITICAL | Duplicate detection and refund path              |
| 4   | Missing Credit        | CRITICAL | Ledger integrity (DEBIT_WITHOUT_CREDIT)          |
| 5   | Webhook Out of Order  | MEDIUM   | State machine rejects invalid transitions        |
| 6   | Provider Down         | HIGH     | Health check and graceful degradation            |
| 7   | Slow Reconciliation   | MEDIUM   | Bulk reconciliation performance                  |
| 8   | Refund Race Condition | MEDIUM   | Settlement state transitions during refund       |

### API Endpoints

- `GET /api/chaos?action=scenarios` — List all scenarios
- `GET /api/chaos?action=report` — Get latest test report
- `POST /api/chaos` — Run a scenario (`{ scenarioId, action: "run" }`)
- `POST /api/chaos` — Run all (`{ action: "run-all" }`)
- `GET /api/test-chaos` — Automated verification (all 8 scenarios)

### UI

- `/chaos-lab` — Interactive chaos lab with pass/fail reporting

## Phase 5: Operations Dashboard & Incidents

### Purpose

Provide real-time operational visibility: KPIs, incident detection, provider health, and reconciliation status.

### Features

- **KPI Cards**: Success rate, total volume, active incidents, reconciliation match rate
- **Provider Health**: Real-time health status for Razorpay, Dwolla, Plaid
- **Reconciliation Status**: Last run time, match rate, pending items
- **Incident Detection**: Automatic detection from reconciliation mismatches and failure rate spikes
- **Incident Lifecycle**: DETECTED → INVESTIGATING → ACTION_REQUIRED → RESOLVED/DISMISSED

### Incident Detection Rules

1. **Reconciliation-based**: Groups mismatched items by type (AMOUNT_MISMATCH, MISSING_INTERNAL, etc.)
2. **Failure rate spike**: Alerts when provider failure rate > 20% with ≥3 failures
3. **Severity classification**:
   - CRITICAL: AMOUNT_MISMATCH, MISSING_INTERNAL, DEBIT_WITHOUT_CREDIT
   - HIGH: MISSING_EXTERNAL, DUPLICATE, or ≥10 mismatches
   - MEDIUM: ≥5 mismatches or failure rate 20-35%
   - LOW: Everything else

### API Endpoints

- `GET /api/operations` — Full operations snapshot
- `POST /api/operations` — Resolve/dismiss incidents (`{ action: "resolve-incident", incidentId }`)
- `GET /api/test-operations` — Automated verification (6 tests)

### UI

- `/operations` — Operations dashboard with KPIs, incidents, and provider health

## Navigation

New sidebar links added:

- **Operations** (`/operations`) — Operations dashboard
- **Chaos Lab** (`/chaos-lab`) — Chaos engineering lab

## Testing

All phases tested and passing:

| Phase                   | Tests     | Status |
| ----------------------- | --------- | ------ |
| Phase 1: Ledger         | 7/7       | ✅     |
| Phase 2: Orchestrator   | 9/9       | ✅     |
| Phase 3: Reconciliation | 7/7       | ✅     |
| Phase 4: Chaos Lab      | 8/8       | ✅     |
| Phase 5: Operations     | 6/6       | ✅     |
| **Total**               | **37/37** | **✅** |

## Files Created

### Phase 4

- `lib/chaos/scenarios.ts` — 8 chaos scenario definitions
- `lib/chaos/injector.ts` — Chaos injection engine
- `app/api/chaos/route.ts` — Chaos API
- `app/api/webhooks/razorpay/route.ts` — Razorpay webhook handler
- `components/ChaosLab.tsx` — Chaos lab UI
- `app/(root)/chaos-lab/page.tsx` — Chaos lab page
- `app/(root)/chaos-lab/loading.tsx` — Loading state
- `app/api/test-chaos/route.ts` — Phase 4 verification

### Phase 5

- `lib/incidents/detector.ts` — Incident detection engine
- `components/OperationsDashboard.tsx` — Operations dashboard UI
- `app/api/operations/route.ts` — Operations API
- `app/(root)/operations/page.tsx` — Operations page
- `app/(root)/operations/loading.tsx` — Loading state
- `app/api/test-operations/route.ts` — Phase 5 verification

### Modified

- `lib/payment/orchestrator.ts` — Added optional provider override for chaos testing
- `constants/index.ts` — Added Operations and Chaos Lab sidebar links

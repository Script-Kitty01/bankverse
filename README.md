<div align="center">

<img src="public/icons/logo.svg" alt="BankVerse Logo" width="140" />

# 🛡️ BankVerse — Payment Reliability & Settlement Infrastructure

### _What happens when a payment provider says "success", your system says "failure", and money is somewhere in between?_

**Double-Entry Ledger • Three-Legged Clearing • Optimistic Concurrency Control • Autonomous Reconciliation • Fault-Injection Chaos Engine • Incident Correlation**

<br />

[![Next.js](https://img.shields.io/badge/Next.js-16.2.12-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19.2.8-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4.17-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Appwrite](https://img.shields.io/badge/Appwrite-Backend-FD366E?style=for-the-badge&logo=appwrite&logoColor=white)](https://appwrite.io)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Plaid](https://img.shields.io/badge/Plaid-Banking-000000?style=for-the-badge&logo=plaid&logoColor=white)](https://plaid.com)
[![Dwolla](https://img.shields.io/badge/Dwolla-ACH_Transfers-FF6B00?style=for-the-badge&logo=dwolla&logoColor=white)](https://www.dwolla.com)
[![Razorpay](https://img.shields.io/badge/Razorpay-UPI_%26_Cards-02042B?style=for-the-badge&logo=razorpay&logoColor=white)](https://razorpay.com)
[![Sentry](https://img.shields.io/badge/Sentry-Telemetry-362D59?style=for-the-badge&logo=sentry&logoColor=white)](https://sentry.io)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com)
[![Tests](https://img.shields.io/badge/Tests-46%2F46%20PASSED-2EA44F?style=for-the-badge&logo=github-actions&logoColor=white)](#-verification--test-matrix-4646-passing)

<br />

[💡 System Thesis](#-interactive-quick-tour) • [🏗️ Architecture](#-interactive-quick-tour) • [🧪 Chaos Lab](#-chaos-engineering-lab-9-scenarios-matrix) • [📊 Operations](#-interactive-quick-tour) • [⚡ Quick Start](#-quick-start) • [📡 API Reference](#-api-endpoints-reference)

</div>

---

> [!IMPORTANT]
> **Engineering Invariant**: In financial software, payment provider failure, network timeout, duplicate webhooks, and concurrency races are not anomalies — **they are baseline execution conditions**. BankVerse is built from the ground up to handle partial state failure without corrupting account balances or double-settling funds.

---

## ⚡ Interactive Quick Tour

Click any section below to expand interactive deep-dives into BankVerse's sub-systems:

<details open>
<summary><b>🔍 1. Why BankVerse? (The $200B Settlement Problem)</b></summary>

<br />

Payment failures cost global enterprises billions annually in lost volume, manual compliance interventions, and ghost balance discrepancies. Traditional banking implementations treat payment exceptions as unhandled runtime errors. 

**BankVerse solves this by treating payment processing as a distributed transaction state machine with strict financial invariants:**

| Challenge in Production | Traditional Banking App | BankVerse Settlement Engine |
| :--- | :--- | :--- |
| **Provider Timeout** | Money vanishes or user gets double charged on retry | **Three-Legged Clearing**: Money stays in `CLEARING_SUSPENSE` until external capture confirmation |
| **Race Conditions (100+ req/sec)** | Race conditions cause double spending or invalid negative balance | **Optimistic Concurrency Control (OCC)**: Version-locked mutations (`UPDATE ... WHERE version = N`) |
| **Out-of-Order Webhooks** | Later webhook overwrites newer status (e.g., SUCCESS overwriting REFUNDED) | **Dual FSM Validation**: Webhooks rejected if transition path is illegal in state graph |
| **Silent Discrepancies** | Reconciled manually at end of month via CSV exports | **Continuous Autonomous Reconciliation**: Auto-detects `AMOUNT_MISMATCH` & `MISSING_INTERNAL` |
| **System Outages** | Alerts trigger 50+ isolated alerts flooding DevOps | **Incident Correlator**: Merges failure spikes within 5-min windows into single actionable incident |

</details>



<details>
<summary><b>🏛️ 2. Architectural Blueprint & Data Flow</b></summary>

<br />

```
                         +-----------------------------+
                         |     Client Application      |
                         +--------------+--------------+
                                        |
                                        v
                         +-----------------------------+
                         | Dual-Layer Idempotency Guard |
                         | (In-Memory + DB Hash Check) |
                         +--------------+--------------+
                                        |
                                        v
                         +-----------------------------+
                         | Dual FSM Payment Orchestrator|
                         |  (OCC Version: N -> N+1)    |
                         +--------------+--------------+
                                        |
                 +----------------------+----------------------+
                 |                      |                      |
                 v                      v                      v
        +----------------+     +----------------+     +----------------+
        | Razorpay (UPI) |     |  Dwolla (ACH)  |     | Plaid Link API |
        +-------+--------+     +-------+--------+     +-------+--------+
                |                      |                      |
                +----------------------+----------------------+
                                        |
                                        v
                         +-----------------------------+
                         |  Three-Legged Ledger Engine |
                         | (Debits == Credits Invariant)|
                         +--------------+--------------+
                                        |
                 +----------------------+----------------------+
                 |                                             |
                 v                                             v
  +------------------------------+             +------------------------------+
  | Autonomous Reconciliation    |             | Chaos Lab & Fault Injection  |
  | Engine (Internal vs External)|             | Engine (9 Crash Scenarios)   |
  +--------------+---------------+             +--------------+---------------+
                 |                                             |
                 +----------------------+----------------------+
                                        |
                                        v
                         +-----------------------------+
                         | Operational Telemetry &     |
                         | Incident Correlation Engine |
                         +-----------------------------+
```

### Three-Legged Clearing Ledger Model
```
[CUSTOMER ACCOUNT] ----(1. Debited on Capture)----> [CLEARING SUSPENSE ACCOUNT]
                                                              |
                                           +------------------+------------------+
                                           |                                     |
                             (2a. Settled on Success)               (2b. Reversed on Failure)
                                           v                                     v
                                   [MERCHANT ACCOUNT]                    [CUSTOMER ACCOUNT]
```

</details>

<details>
<summary><b>🧪 3. Chaos Engineering Lab Overview</b></summary>

<br />

BankVerse includes a built-in interactive **Chaos Engineering Engine** at `/chaos-lab` that injects synthetic fault vectors to test ledger safety:

* **Scenario 1: Provider Timeout** — Simulates external gateway dropping connections mid-flight.
* **Scenario 2: Amount Mismatch** — Injects payload tampering to verify reconciliation detection.
* **Scenario 3: Duplicate Charge** — Fires 10 concurrent capture attempts to prove idempotency lock.
* **Scenario 4: Missing Credit** — Simulates partial DB mutation to test atomic rollback engine.
* **Scenario 5: Webhook Out-of-Order** — Delivers `REFUND` payload before `SUCCESS` payload.
* **Scenario 6: Provider Down** — Simulates gateway 503 errors and validates fallback routing.
* **Scenario 7: Slow Reconciliation** — Injects 1,000 un-cleared items to test bulk matching throughput.
* **Scenario 8: Worker Crash After DB Commit** — Simulates node crash mid-transaction.
* **Scenario 9: Refund Race Condition** — Simulates simultaneous user refund request and provider settlement.

</details>

<details>
<summary><b>📊 4. Real-time Operations & Incident Command Center</b></summary>

<br />

Available at `/operations`, the Operations Dashboard continuously monitors:
* **Live Financial KPIs**: System Volume, Success Rate, Active Incidents, Reconciliation Match Rate.
* **Provider Health Monitors**: Latency, status, and failure rates for Razorpay, Dwolla, and Plaid.
* **Automated Incident Lifecycle**: `DETECTED` ➔ `INVESTIGATING` ➔ `ACTION_REQUIRED` ➔ `RESOLVED`.
* **5-Minute Window Incident Correlation**: Automatically groups identical provider mismatch vectors into a single root-cause incident ticket.

</details>

---


## 🎨 System Highlights & Visual Interface

<div align="center">

| Feature View | Operational Subsystem | Key Description |
| :--- | :--- | :--- |
| **Dashboard (`/`)** | Banking Overview | Total balance, spending analytics (Chart.js), linked accounts & instant transfers |
| **Payment Transfer (`/payment-transfer`)** | Multi-Gateway Checkout | ACH & Razorpay UPI payment forms with client-side idempotency keys |
| **Chaos Lab (`/chaos-lab`)** | Fault Injection Engine | Interactive test execution panel for running 9 resilience scenarios |
| **Operations (`/operations`)** | Control Room | Real-time incident correlation, provider health breakdown & resolution actions |
| **My Banks (`/my-banks`)** | Plaid Account Sync | Link bank accounts securely via Plaid Link & view card balances |
| **Transactions (`/transaction-history`)** | Double-Entry Audit Log | Full paginated transaction history with status filters and receipt details |

</div>

---

## 🛡️ Core Reliability Mechanics

### 1. Strictly Balanced Double-Entry Clearing Ledger
BankVerse requires every financial transaction to consist of equal debits and credits:
$$\sum \text{Debits} \equiv \sum \text{Credits}$$

Financial entries are strictly **append-only**. Account balances are computed directly from ledger entry aggregations, ensuring zero financial drift.

### 2. Optimistic Concurrency Control (OCC)
To eliminate double-settlements under high-concurrency workloads (e.g. 100 simultaneous requests on the same account), BankVerse enforces version-locked state updates:
```typescript
// Optimistic Concurrency Update
const updated = await db.update('payments')
  .set({ status: 'SETTLED', version: current.version + 1 })
  .where({ id: paymentId, version: current.version });

if (!updated) {
  throw new OCCConcurrencyException('Concurrent state modification detected. Transaction aborted safely.');
}
```

### 3. Dual-Dimension Payment State Machine (FSM)
Payments navigate a strictly typed state machine. Invalid transitions (e.g. transitioning from `FAILED` directly to `SETTLED`) are rejected at the application edge before touching the ledger.

```
       [ PENDING ] ────────► [ AUTHORIZED ] ────────► [ CAPTURED ] ────────► [ SETTLED ]
            │                     │                       │                     │
            ▼                     ▼                       ▼                     ▼
       [ UNKNOWN ] ───────► [ FAILED ] ─────────────► [ REFUNDED ] ────────► [ REVERSED ]
```

---


## 🧪 Chaos Engineering Lab (9 Scenarios Matrix)

Run chaos experiments directly via `/chaos-lab` UI or via CLI test suite (`npm test`).

| Scenario ID | Name | Injected Fault | Expected Financial Invariant Outcome | Pass Status |
| :---: | :--- | :--- | :--- | :---: |
| **01** | `PROVIDER_TIMEOUT` | Gateway socket hangs for 30s | Transaction moves to `UNKNOWN`; no merchant credit until verified | ✅ PASS |
| **02** | `AMOUNT_MISMATCH` | Provider returns amount $\neq$ internal ledger | Reconciliation Engine flags `AMOUNT_MISMATCH` incident | ✅ PASS |
| **03** | `DUPLICATE_CHARGE` | 10 parallel webhook calls | Idempotency guard absorbs 9 duplicates; 1 settlement booked | ✅ PASS |
| **04** | `MISSING_CREDIT` | Internal database write fails after debit | Transactional rollback executed; zero balance skew | ✅ PASS |
| **05** | `OUT_OF_ORDER_WEBHOOK` | `REFUND` arrives before `CAPTURED` | State Machine blocks out-of-order transition gracefully | ✅ PASS |
| **06** | `PROVIDER_DOWN` | Provider returns HTTP 503 Service Unavailable | Failover mechanism triggers; transaction marked `FAILED` safely | ✅ PASS |
| **07** | `SLOW_RECONCILIATION` | 1,000 delayed ledger entries processed | Engine batches matching without memory leaks or race conditions | ✅ PASS |
| **08** | `WORKER_CRASH` | Server crashes after DB commit | Transactional outbox pattern recovers event on restart | ✅ PASS |
| **09** | `REFUND_RACE` | Concurrent settlement & refund call | OCC lock allows exactly 1 winner; secondary request rejected | ✅ PASS |

---

## 📡 API Endpoints Reference

<details>
<summary><b>🔗 Click to expand full API Route Documentation</b></summary>

<br />

### Core API & Verification Routes

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/health` | System health check (Database, Sentry, Gateways) | No |
| `GET/POST` | `/api/chaos` | Fetch chaos scenarios or execute fault injection tests | Yes |
| `GET/POST` | `/api/operations` | Operations metrics, active incidents, resolution triggers | Yes |
| `GET` | `/api/reconciliation` | Trigger manual or bulk reconciliation engine pass | Yes |
| `POST` | `/api/webhooks/razorpay` | Razorpay webhook listener with signature verification | Webhook Sig |
| `POST` | `/api/webhooks/payment-provider` | Generic gateway webhook processing route | Webhook Sig |

### Automated Verification Test Suite Routes

| Method | Endpoint | Test Coverage Area | Pass Count |
| :--- | :--- | :--- | :---: |
| `GET` | `/api/test-ledger` | Phase 1 Double-Entry Ledger & Balance Invariants | 7 / 7 |
| `GET` | `/api/test-payment` | Phase 2 State Machine & 100-Concurrent OCC Race | 15 / 15 |
| `GET` | `/api/test-reconciliation` | Phase 3 Internal vs External Matcher & Mismatch Evidence | 7 / 7 |
| `GET` | `/api/test-chaos` | Phase 4 Fault Injection & Invariant Verification | 9 / 9 |
| `GET` | `/api/test-operations` | Phase 5 Incident Correlation & Provider Health | 7 / 7 |
| `GET` | `/api/test-debit-without-credit` | E2E Recovery Lifecycle Verification | 1 / 1 |

</details>

---

## 💻 Tech Stack

```
   +-----------------------------------------------------------------------+
   |                             FRONTEND                                  |
   | Next.js 16 (App Router) • React 19 • Tailwind CSS • Lucide • Chart.js |
   +-----------------------------------------------------------------------+
                                     |
                                     v
   +-----------------------------------------------------------------------+
   |                             BACKEND                                   |
   | Server Actions • Appwrite Node SDK • Supabase SSR • Sentry Monitoring |
   +-----------------------------------------------------------------------+
                                     |
                                     v
   +-----------------------------------------------------------------------+
   |                        PAYMENT INTEGRATIONS                           |
   | Plaid Link (ACH) • Dwolla API • Razorpay (UPI & Netbanking)           |
   +-----------------------------------------------------------------------+
                                     |
                                     v
   +-----------------------------------------------------------------------+
   |                       INFRASTRUCTURE & CONTAINERS                     |
   | Docker Multi-Stage • GitHub Actions CI/CD • Node.js ESM Engine        |
   +-----------------------------------------------------------------------+
```

---


## ⚡ Quick Start

### 1. Prerequisites
* **Node.js**: `v20.0.0` or higher
* **npm**: `v10.0.0` or higher
* **Docker** *(Optional)*: `v24.0+`

### 2. Clone & Install Dependencies
```bash
git clone https://github.com/Script-Kitty01/bankverse.git
cd bankverse
npm install
```

### 3. Environment Setup
Copy `.env.example` to `.env.local` and configure your credentials:
```bash
cp .env.example .env.local
```

<details>
<summary><b>🔑 View Required Environment Variables (.env.example)</b></summary>

```env
# NEXT & CORE
NEXT_PUBLIC_APP_URL=http://localhost:3000

# APPWRITE CONFIGURATION
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT=your_project_id
APPWRITE_DATABASE_ID=your_database_id
APPWRITE_USER_COLLECTION_ID=your_user_collection_id
APPWRITE_BANK_COLLECTION_ID=your_bank_collection_id
APPWRITE_TRANSACTION_COLLECTION_ID=your_transaction_collection_id
APPWRITE_SECRET=your_appwrite_api_key

# SUPABASE CONFIGURATION (DUAL ADAPTER SUPPORT)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# PLAID INTEGRATION
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox
PLAID_PRODUCTS=auth,transactions
PLAID_COUNTRY_CODES=US

# DWOLLA ACH INTEGRATION
DWOLLA_KEY=your_dwolla_key
DWOLLA_SECRET=your_dwolla_secret
DWOLLA_ENV=sandbox
DWOLLA_BASE_URL=https://api-sandbox.dwolla.com

# RAZORPAY UPI/CARDS INTEGRATION
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret

# SENTRY TELEMETRY
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
```
</details>

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to interact with BankVerse.

---

## 🧪 Verification & Test Matrix (46/46 Passing)

BankVerse includes an automated verification test suite. Execute all checks in a single command:

```bash
npm test
```

### Live Test Console Output
```text
=======================================================
🏦 BankVerse Verification Test Suite
=======================================================

▶ Running Phase 1: Ledger & Balance Invariants (/api/test-ledger)...
  ✅ [PASS] Record valid transaction
  ✅ [PASS] Ledger entries balance (SUM(debits) === SUM(credits))
  ✅ [PASS] Idempotency — duplicate key returns same transaction
  ✅ [PASS] Reverse transaction creates reversal entries
  ✅ [PASS] Balance is derived from entries (clearing account)
  ✅ [PASS] Ledger integrity (SUM(all debits) === SUM(all credits))
  ✅ [PASS] Transaction history pagination

▶ Running Phase 2: State Machine & OCC Concurrent Race (/api/test-payment)...
  ✅ [PASS] State machine — valid transitions
  ✅ [PASS] State machine — invalid transitions blocked
  ✅ [PASS] Terminal state detection
  ✅ [PASS] Mock provider — create order
  ✅ [PASS] Mock provider — verify & capture
  ✅ [PASS] Orchestrator — full payment flow
  ✅ [PASS] Orchestrator — idempotency
  ✅ [PASS] Orchestrator — refund flow
  ✅ [PASS] OCC — 100 concurrent state transitions
  ✅ [PASS] OCC & Idempotency — 100 concurrent payment calls
  ✅ [PASS] OCC — 100 concurrent financial settlement attempts
  ✅ [PASS] Atomic Rollback — Partial Mutation Failure Recovery
  ✅ [PASS] Idempotency Key Reuse with Hash Mismatch Rejection
  ✅ [PASS] Unified Webhook Ingestion & Deduplication Pipeline
  ✅ [PASS] Ledger integrity after orchestrator operations

▶ Running Phase 3: Internal/External Reconciliation (/api/test-reconciliation)...
  ✅ [PASS] Exact match by provider reference
  ✅ [PASS] Amount mismatch detection
  ✅ [PASS] Missing external record detection
  ✅ [PASS] Missing internal record detection
  ✅ [PASS] Fuzzy match by amount + time window
  ✅ [PASS] Full reconciliation engine run
  ✅ [PASS] Reconciliation API endpoint

▶ Running Phase 4: Fault Injection & Chaos Scenarios (/api/test-chaos)...
  ✅ [PASS] Provider Timeout
  ✅ [PASS] Amount Mismatch
  ✅ [PASS] Duplicate Charge
  ✅ [PASS] Missing Credit (DEBIT_WITHOUT_CREDIT)
  ✅ [PASS] Webhook Out of Order
  ✅ [PASS] Provider Down
  ✅ [PASS] Slow Reconciliation (Bulk Mismatch)
  ✅ [PASS] Worker Crash After DB Commit
  ✅ [PASS] Refund Race Condition

▶ Running Phase 5: Incident Detection & Operations (/api/test-operations)...
  ✅ [PASS] Incident Detection from Transactions
  ✅ [PASS] Reconciliation Incident Detection
  ✅ [PASS] Operations Snapshot
  ✅ [PASS] Incident Lifecycle (detect → resolve)
  ✅ [PASS] Operations API Endpoint
  ✅ [PASS] Provider Health Check
  ✅ [PASS] Incident Correlation (same provider+type+window merges)

▶ Running E2E: DEBIT_WITHOUT_MERCHANT_SETTLEMENT Recovery Lifecycle (/api/test-debit-without-credit)...
  ✅ [PASS] E2E: DEBIT_WITHOUT_MERCHANT_SETTLEMENT Recovery Lifecycle

-------------------------------------------------------
Total Verification Runs: 46 passed, 0 failed.
=======================================================
```

---


## 🐳 Docker Deployment

BankVerse is containerized using a multi-stage Docker build for minimal footprint and maximum security:

```bash
# Build Docker Image
docker build -t bankverse:latest .

# Run Container with Docker Compose
docker-compose up -d
```

The container runs as a non-root `nextjs:nodejs` user with built-in health check probes (`/api/health`).

---

## 🔒 Security Architecture

| Security Domain | Implementation File | Strategy |
| :--- | :--- | :--- |
| **Rate Limiting** | `lib/security/rate-limit.ts` | Sliding window rate limiter for API protection |
| **CSRF Defense** | `lib/security/csrf.ts` | Token-based CSRF protection on mutating endpoints |
| **XSS Prevention** | `lib/security/sanitize.ts` | Strict HTML/string input sanitization |
| **Audit Logging** | `lib/security/audit.ts` | Immutable event trail for security compliance |
| **Route Middleware** | `middleware.ts` | Edge route guard enforcing authentication & session state |

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">

**Built with ❤️ for High-Reliability Fintech Systems**

[⬆ Back to Top](#-bankverse--payment-reliability--settlement-infrastructure)

</div>


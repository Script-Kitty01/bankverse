# Plan: ML-Driven Payment Reliability Platform

Build BankVerse into a real-time ML decision platform for payment reliability: train models on versioned provider events, predict provider failure and recovery outcomes, optimize routing cost, and investigate incidents with an asynchronous LLM harness. Ledger and payment state transitions remain authoritative and unchanged; models recommend actions, while existing services and deterministic policy checks control execution.

## Engineering guardrails

- Keep the ledger as the single source of truth for money movement.
- Treat ML as the primary recommendation engine, but require policy validation before any provider or recovery action.
- Prefer in-memory or durable database-backed event storage for runtime; do not rely on local filesystem writes in Vercel/serverless runtime.
- Keep training data causal, versioned, redacted, and auditable; never claim production performance from synthetic benchmark data.
- Keep deterministic routers, rules, and investigator stubs as explicit fallbacks and test fixtures, not as the primary intelligence path.
- Never allow an ML model or LLM to call providers, mutate ledger state, bypass idempotency, or authorize money movement directly.

## Core thesis

BankVerse learns how provider reliability changes over time and recommends the safest, lowest-cost provider or recovery action for each payment. The system combines temporal provider features, supervised failure prediction, recovery-action estimation, constrained routing, Prometheus/Grafana operations telemetry, and replayable evaluation.

## Phase 0: Contracts and boundaries

- Define a canonical `BankEvent` contract covering transaction lifecycle, provider attempts, retries, settlement/reconciliation, routing decisions, incidents, and recovery outcomes.
- Include stable IDs, event type, timestamp, transaction/provider identifiers, amount/currency, attempt, latency, outcome/error, and schema version. Keep raw sensitive payloads out of events.
- Add feature flags/config for telemetry, simulator, ML routing, model version selection, and an explicit routing mode: `SHADOW`, `CANARY`, or `ML_DEFAULT`. `SHADOW` calculates and records ML predictions while static routing executes; `CANARY` sends a deterministic percentage of eligible transactions to ML routing; `ML_DEFAULT` enables ML for all eligible transactions while retaining static fallback.
- Define an append-only event-store interface with an in-memory adapter for tests and a durable adapter suitable for development/runtime. Do not claim SQLite is production durability while the app currently uses process-local demo stores; local JSONL/SQLite stays scoped behind an explicit adapter and is not assumed to be cross-instance durable state.
- The durable adapter must implement a `save(event)` method that writes to a single `telemetry_events` table (Postgres) with a JSONB `payload` column, indexed by `transaction_id` and `provider` for the read APIs.
- Record schema version and redaction policy on every event so the event stream remains safe for downstream models and audits.
- Include model version, feature schema version, decision ID, and feature snapshot references on routing and recovery events.

## Phase 1: Instrument the existing payment path

- Add instrumentation at the provider boundary in `PaymentOrchestrator.processPayment` and `captureWithRetries`, measuring latency and attempt outcomes for create, verify, capture, status lookup, refund, and health calls.
- Emit transaction-created/processing/success/failure/unknown, provider-attempted/success/timeout/declined, retry, settlement, reconciliation, and routing events through one helper rather than scattered ad hoc writes.
- Extend the outbox event typing or introduce a separate telemetry event stream; do not reuse `PAYMENT_CAPTURED` as a generic log event.
- Add adapters/read APIs for provider health, recent attempts, transaction timeline, and error distributions. Preserve existing outbox behavior and ledger invariants.
- When you emit the `RoutingDecision` event, store the full feature vector as a JSONB payload so model re-training can join decisions to actual outcomes without recomputing rolling windows from drift-prone history.
- Define a runtime-safe persistence split:
  - Runtime mode: in-memory event buffer plus persistent Postgres/Supabase-backed storage when configured.
  - Batch/local mode: CLI-based dataset generation and replay using explicit local files for offline benchmarking only.
  - Do not write event or benchmark state into serverless API route-local files as a production pattern.
  - Add Prometheus-compatible operational metrics with bounded labels. Keep detailed event payloads in the event store; do not use transaction IDs, customer IDs, raw error strings, or arbitrary model features as metric labels.

## Phase 2: Observability with Prometheus and Grafana

- In the Next.js app, use `prom-client` and expose a dedicated `app/api/metrics/route.ts` endpoint returning the current Prometheus snapshot with content type `text/plain; version=0.0.4`.
- In the FastAPI service, use `prometheus_fastapi_instrumentator` and expose its own `/metrics` endpoint.
- For local development, configure Prometheus in `docker-compose.yml` to scrape both the Next.js `/api/metrics` endpoint and the FastAPI `/metrics` endpoint; provision Grafana with Prometheus as its data source.
- For Vercel/serverless deployment, document that process-local counters are ephemeral: scrape or forward `/api/metrics` to an external/managed Prometheus-compatible backend. Do not treat one invocation's in-memory counters as durable history.
- Add metric names and label conventions before dashboard work. Labels should be limited to provider, operation, outcome, model version, environment, and bounded route/action values.
- Add an open-source Grafana deployment for local development through `docker-compose.yml`, provisioned with Prometheus as a data source and dashboards stored as versioned project configuration.
- Create dashboards for payment reliability, provider comparison, ML serving health, model decisions, incident response, and ledger safety. Ledger invariant violations must be visible and remain zero.
- Add alert rules for provider failure spikes, ML service unavailability, fallback-rate increases, stale model versions, inference latency budget breaches, and any ledger invariant violation.
- Keep Grafana and Prometheus operational only: they visualize and alert on metrics; they do not become the source of truth for events or financial state.

## Phase 3: Deterministic provider simulator and ML dataset generation

- Add a simulator abstraction alongside `MockPaymentProvider`, with 3-4 named providers, seeded randomness, configurable latency/failure/timeout/decline rates, and time-based regime changes.
- Reuse `PaymentProvider` where possible so simulation produces the same lifecycle events as real payment flows; avoid inserting synthetic records directly into ledger state unless the scenario explicitly represents a confirmed capture.
- Add a TypeScript script/command that generates an initial 200,000+ bounded attempt dataset across multiple provider, latency, failure, timeout, decline, and regime-shift scenarios. Keep smaller fixtures for CI and expose larger sizes only through an explicit local benchmark command.
- Add an explicit local/CI public-data ingestion command, for example `npm run ingest:huggingface -- --dataset <name> --limit 100000`. It must cache raw data under `data/raw/`, validate a pinned revision and SHA-256 checksum, enforce an allowlisted license policy, reject incompatible or missing metadata, and never run inside a serverless API route.
- Implement the Python public-data layer in `scripts/ingest_public.py` with `huggingface-hub`, `datasets`, `pandas`, and `numpy`; write `data/public_envelopes.csv`, `data/failure_priors.json`, and an ingestion manifest. Fraud priors remain explicitly named as fraud proxies, not provider-decline labels.
- Add a schema mapper from public rows to a redacted `TransactionBase` envelope containing only amount, timestamp, payment method/card type, and an opaque source ID. Do not ingest PII, raw card numbers, or restrictive-license data.
- Write a `DataManifest` for every source containing dataset name/URL, revision, license, download timestamp, checksum, mapping version, row count, and source schema. Tag every downstream row as `synthetic`, `public`, or `hybrid`.
- Keep public fraud labels separate from provider outcomes. A fraud label must not be relabeled as a provider decline; the simulator generates provider-specific success, failure, timeout, latency, retry, and counterfactual outcomes over the public transaction envelope.
- Support synthetic-only, hybrid, and public-only modes. Public-only is valid only when a dataset genuinely contains provider outcomes, which is expected to be rare.
- Add dataset generation flags such as `--source synthetic|hybrid`, `--public-dataset <name>`, and `--size <n>`. In hybrid mode, sample public rows, apply the provider simulator to each eligible provider, and preserve the original public row ID for traceability without exposing raw source data.
- Implement the TypeScript overlay in `scripts/generate-hybrid-dataset.ts`; it reads the Python outputs, applies seeded provider simulation and regime changes, and writes `data/ml_dataset.csv` plus `data/dataset_manifest.json`.
- Export canonical JSONL plus tabular CSV/Parquet-compatible records for Python training. Include stable seed, fixed time windows, event IDs, source tags, public-source references, outcome labels, and dataset manifest/hash.
- Add strict leakage checks: time-based train/validation/hold-out splits, feature timestamps, no future events in rolling windows, and no post-decision outcomes in decision features.
- Add a replay/fixture loader so benchmarks can run against the exact same workload.
- Keep simulation deterministic by exposing seeded generator state and fixed date windows. This enables reproducible incident tests and replay comparisons.

### Public dataset ingestion and hybridization

- Prefer public datasets that provide transaction amounts, timestamps, payment method/card type, and useful non-PII context. Candidate datasets require license, schema, and provenance review before use.
- Treat public data as enrichment and generalization evidence, not as a source of provider-routing labels. Public datasets generally do not contain provider choice, provider latency, retry outcomes, or counterfactual provider results.
- Preserve source boundaries in training and evaluation. Run separate hold-out reports for synthetic-only, public-hybrid, and mixed datasets to expose simulator overfitting and distribution shift.
- Keep ingestion reproducible and auditable: pinned dataset revision, checksum, license decision, mapping rules, row counts, rejected-row counts, and source-specific feature coverage must be recorded.

## Phase 4: Python ML training pipeline

- Add an `ml/` Python project with pinned dependencies for pandas, scikit-learn, xgboost, SHAP, calibration, FastAPI, and Uvicorn. Keep training and serving dependencies separate from the Next.js runtime.
- Build causal rolling features: provider success/failure/timeout rates over 5/10/20 attempts, latency statistics, current retry number, amount band, payment method, time-of-day, provider health, and incident state.
- Train logistic regression as the interpretable baseline and XGBoost as the primary tabular candidate. Compare LightGBM only if it produces a measured improvement; adding multiple libraries is not a novelty requirement.
- Train a failure model that returns calibrated probabilities for each eligible provider and a recovery model that estimates outcomes for bounded actions such as retry, switch, wait, reconcile, or escalate.
- Evaluate ROC-AUC, PR-AUC, calibration error/curves, precision-recall at operating thresholds, expected cost, latency, and feature explanations with SHAP. Treat synthetic metrics as pipeline evidence, not production claims.
- Export versioned model artifacts, feature schema, scaler/preprocessor where required, dataset hash, training window, seed, metrics, and promotion status. Store a model registry pointer rather than swapping files blindly.
- Build a counterfactual evaluation path using simulator replay, controlled split traffic, shadow routing, and bounded exploration. Historical action outcomes alone are insufficient to prove that another provider or recovery action would have performed better.

## Phase 5: FastAPI inference and ML routing

- Build a FastAPI serving layer with `/health`, `/predict_failure`, and `/predict_recovery` endpoints. Validate structured input/output schemas and return model version, feature schema version, probabilities, expected cost, and decision ID.
- Add request deadlines, circuit breaking, model-version headers, structured logs, and Prometheus metrics for inference latency, errors, stale model use, and fallback count.
- Add `MLRouter` at the provider-selection boundary. ML is the primary recommendation path only after shadow and canary gates pass; static routing is the timeout/error/circuit-breaker fallback.
- Add a request-scoped routing cache keyed by `transaction_id + attempt_number` so delayed model responses cannot produce duplicate routing decisions. Persist the fallback decision when the ML call fails.
- Require the deterministic `PolicyEngine` to validate provider health, eligibility, idempotency, transaction state, retry limits, cost bounds, and ledger safety before the orchestrator executes any action.
- Add a concrete cost model for routing decisions:
  - `failure_cost(amount)`: expected loss from provider failure, declined payment, or refund risk.
  - `provider_cost(provider, amount)`: per-provider processing or settlement cost.
  - `latency_penalty_per_ms`: cost for time delay affecting customer experience and retry risk.
  - `expected_cost = failure_cost + provider_cost + latency_penalty` for each candidate provider decision.
  - Route selection uses this cost function only as a decision aid and never to mutate funds directly.

## Phase 6: Incident detection and asynchronous ML/LLM harness

- Extend `IncidentDetector` with provider attempt-window rules for consecutive timeouts and failure-rate spikes, using the existing correlation model and `PaymentIncident` lifecycle.
- Add a synchronous trigger pattern: after every failed provider attempt in `orchestrator.ts`, call `incidentDetector.checkProvider(provider, recentEvents)` synchronously so the 5th consecutive timeout or failure spike is detected immediately during the request lifecycle instead of waiting for a background cron job.
- Add read-only harness tools for transaction timeline, provider health, recent failures, retry history, settlement/reconciliation status, error distribution, and recent incidents. Tools query the event store and existing services, not arbitrary application memory.
- Define structured investigation/recommendation/result types. The recovery model synchronously recommends a bounded action for the current request; the policy-gated orchestrator executes it subject to deadlines, attempt limits, idempotency, transaction-state checks, and no-switch-after-capture rules. An asynchronous DeepSeek/OpenAI-compatible harness investigates why the provider degraded, but does not handle the current request.
- Submit asynchronous investigation work through the durable outbox or an explicitly configured queue. Do not rely on fire-and-forget promises in a serverless request because the process may terminate before the investigation is enqueued.
- Keep the deterministic investigator as the default in tests, offline replay, and external-service failure paths. The external LLM is opt-in until prompt injection controls, structured-output validation, timeout handling, audit logging, and policy integration are verified.
- Add a `PolicyEngine` that validates provider health, retry limits, transaction state, idempotency, and ledger safety before delegating any action to existing orchestrator/reconciliation methods. The harness must never call provider or ledger mutation methods directly.
- Add model/recommendation/action/outcome event records for later recovery-model training.
- Add provider cooldown/debounce logic for incident storms: once a provider enters a failure spike, suppress repeated incidents for a fixed window (for example 5 minutes) until recovered status or a new evidence threshold is met.

## Phase 7: Evaluation, retraining, and safe promotion

- Add benchmark scripts comparing static, round-robin, and ML routing on identical replay data. Report success rate, latency, retries, provider concentration, expected cost, and fallback count.
- Add focused verification endpoints/tests for schema validation, deterministic replay, feature causality, routing fallback, incident thresholds, policy denial, and ledger balance.
- Add an automated nightly or bounded-outcome retraining job that pulls newly labeled events, rebuilds features, trains candidate models, and evaluates them against a fixed hold-out set.
- Promote only when the candidate meets minimum sample size, calibration, latency, success-rate, unknown-payment, expected-cost, and invariant gates. A single 1% ECPT improvement is not sufficient evidence.
- Use shadow deployment, then staged canary traffic, before making ML routing the default. Keep an active model-version pointer and automatic rollback to the last known-good model and static router.
- Record model, dataset, feature schema, router, and policy versions in every routing decision and benchmark report.
- Add a model registry table or durable registry document containing model version, type, training timestamp/window, dataset hash, feature schema version, training/validation metrics, calibration metrics, artifact location, promotion status, and rollback predecessor. FastAPI must validate model/artifact/schema compatibility before activation and refresh the production pointer on a controlled schedule.
- Evaluate split-traffic benchmarks using the same fixture and same timestamps concurrently across routing strategies so the comparison is fair and not distorted by time drift or leakage.

## Relevant files

- `lib/ledger/outbox.ts` — existing bounded in-memory outbox and event lifecycle; reuse or separate telemetry from its payment-only event union.
- `lib/payment/provider.interface.ts` — provider abstraction to instrument and reuse for simulation.
- `lib/payment/orchestrator.ts` — provider call/retry boundary and safest routing seam.
- `lib/payment/mock.provider.ts` — reference implementation for deterministic provider simulation.
- `lib/ledger/ledger.service.ts` and `lib/ledger/repository.ts` — financial authority; remain unchanged except for non-invasive event hooks if needed.
- `lib/reconciliation/engine.ts` — source for settlement/reconciliation outcome events and harness read tools.
- `lib/incidents/detector.ts` and `lib/incidents/correlator.ts` — extend anomaly detection while preserving 5-minute correlation and incident lifecycle.
- `lib/chaos/injector.ts` and `lib/chaos/scenarios.ts` — reuse scenario execution and invariants for simulator/regression coverage.
- `lib/risk/dataset.ts`, `features.ts`, `model.ts`, `metrics.ts` — reference deterministic seed, feature construction, model evaluation, and metrics patterns.
- `ml/` — Python dataset export, causal feature engineering, XGBoost/baseline training, calibration, SHAP analysis, model registry metadata, and FastAPI serving.
- `scripts/ingest-huggingface-dataset.mjs` — local/CI public dataset download, cache, checksum/license validation, schema mapping, and manifest generation; it must not be called from an API route.
- `scripts/ingest_public.py` and `requirements-public-ingestion.txt` — Python public envelope and fraud-prior ingestion dependencies and pipeline.
- `scripts/generate-hybrid-dataset.ts` — TypeScript provider overlay and final ML CSV generation.
- `data/raw/` and `data/manifests/` — explicitly local/CI dataset artifacts and provenance manifests, excluded from production runtime state as appropriate.
- `docker-compose.yml` — local Prometheus and Grafana services, provisioning, and dashboard development.
- `observability/` — Prometheus scrape configuration, alert rules, and Grafana dashboard provisioning.
- `app/api/operations/route.ts`, `app/api/chaos/route.ts`, and `app/api/test-*.ts` route equivalents — expose read-only telemetry/benchmark APIs and focused verification without coupling UI to internals.
- `scripts/run-tests.mjs` — register new verification suites and benchmark commands.
- `package.json` — add only the minimum local event-store/scripting dependencies; no Python runtime dependency belongs here.
- `HACKATHON_README.md` and `README.md` — document the demo architecture, limitations, reproducibility, and optional service setup.

## Verification plan

1. Run `npm run lint` and `npm run build` after each phase boundary.
2. Run the existing `npm test` suite before instrumentation and after each integration slice; verify all current ledger/OCC/chaos/risk tests remain green.
3. Add deterministic tests that generate the same event digest for the same seed, distinguish timeout/decline/success events, and prove replay does not create ledger entries by itself.
4. Test causal feature rows against a hand-built timeline where future provider failures must not affect an earlier routing decision.
5. Test Prometheus metric names and bounded labels; verify Grafana dashboards load from versioned provisioning and alert rules fire for synthetic failures.
6. Test `/api/metrics` content type, metric names, bounded labels, and FastAPI `/metrics`; verify Grafana dashboards load from versioned provisioning and alert rules fire for synthetic failures.
7. Test `SHADOW`, deterministic-per-transaction `CANARY`, and `ML_DEFAULT` routing behavior, including static fallback.
8. Test ML service/router timeout, malformed response, stale model, and circuit-breaker paths fall back to the static router and emit an observable fallback event.
9. Test the request-scoped routing cache so a delayed ML response cannot produce duplicate routing decisions for the same `transaction_id + attempt_number`.
10. Test incident thresholds and correlation produce one incident for a provider spike, while the policy engine denies unsafe retries/provider switches and synchronous recovery respects deadlines and attempt limits.
11. Test durable incident enqueue behavior; an LLM investigation must not depend on an unawaited serverless promise.
12. Test public-data ingestion failure paths: unavailable dataset, missing or incompatible license, checksum mismatch, malformed rows, and missing required fields.
13. Verify `source` tags and source IDs survive mapping, hybrid simulation, feature generation, and exported datasets without exposing raw PII.
14. Test dataset time splits and feature timestamps to prove future provider outcomes cannot affect an earlier decision.
15. Run fixed-fixture benchmarks separately on synthetic-only, public-hybrid, and mixed hold-outs; report the performance delta and do not present synthetic metrics as production performance.
16. Add ledger and routing invariants tests to ensure no direct money movement occurs during simulation, inference, LLM investigation, or advisory-only recommendation flow.

## Decisions

- The first milestone is event telemetry plus deterministic provider simulation; the target ML milestone is a Python training and FastAPI serving pipeline.
- Public Hugging Face datasets are optional context enrichment. The simulator remains the authoritative source for provider-routing outcomes, recovery actions, and counterfactual scenarios.
- XGBoost is the primary tabular candidate, with logistic regression as the interpretable baseline. Model choice must be earned by evaluation rather than assumed.
- Python/FastAPI is a first-class ML boundary, isolated from the Next.js runtime and protected by timeout, circuit-breaker, schema, and fallback behavior.
- The external DeepSeek/OpenAI-compatible harness is asynchronous and policy-gated. A deterministic investigator remains the test and outage fallback.
- Prometheus and Grafana are the operational observability layer; the event store remains the detailed training and audit source of truth.
- BankVerse core financial correctness remains authoritative: no ML/LLM direct ledger writes, no direct provider actions from tools, and no production claims from synthetic data.
- SQLite/JSONL should be introduced behind an adapter and scoped to local development/replay; production durability still requires the existing database/queue architecture to be made real.
- The router is a recommendation engine only; money movement remains gated by the ledger and orchestrator contract.
- Incident de-duping is required for noisy failure storms; provider cooldowns prevent alert spam and stale recommendations.

## Scope boundaries

Included:

- Event schema/store
- Provider telemetry
- Prometheus metrics and Grafana dashboards
- Deterministic simulator
- Dataset/replay
- Python ML training and model registry
- FastAPI inference and ML routing seam
- Anomaly detection
- Read-only tools
- Policy-gated recommendation flow
- Focused tests and docs

Excluded from the first implementation slice:

- Fine-tuning or unrestricted autonomous money movement
- Production distributed workers
- Guaranteed serverless background execution
- Broad product dashboard redesign

## Further considerations

1. Use small fixture sizes in CI and expose 200k+ dataset generation only as an explicit local benchmark/training command.
2. Download public datasets only through a pinned local/CI ingestion command; never download them during an API request or training run without a recorded manifest.
3. Treat event schema versioning and redaction as first-class requirements before any external model receives event data.
4. Add durable database/event-queue adapters only when deployment/runtime requirements are selected; the current Vercel-style app cannot rely on local files for cross-instance state.
5. Keep routing decisions explainable: each decision should capture the candidate providers, score, expected cost, and chosen fallback path.
6. Benchmark replay must use the same data and the same time windows; otherwise comparisons are not meaningful.
7. Before promoting any model, run hold-out evaluation against the baseline and require documented cost/latency improvement, calibration quality, minimum sample size, and no correctness regressions.
8. Keep Prometheus labels bounded and separate from high-cardinality event dimensions; detailed transaction-level analysis belongs in the event store and ML dataset.

## Implementation sequence

1. Event contract and store interface.
2. Payment instrumentation and telemetry adapters.
3. Prometheus metrics, Grafana provisioning, and operational dashboards.
4. Deterministic simulation and 200k+ generated replay dataset.
5. Python causal feature pipeline, logistic baseline, XGBoost candidate, calibration, and SHAP evaluation.
6. FastAPI inference service, model registry metadata, shadow mode, and ML router fallback behavior.
7. Incident detector, provider cooldown, and policy engine.
8. Recovery-action model and asynchronous DeepSeek/OpenAI-compatible investigator.
9. Canary routing, retraining workflow, benchmark suite, and rollback gate.

This plan is intentionally scoped so the first milestone is realistic for the current BankVerse app: event telemetry, deterministic simulation, and policy-safe routing intelligence without compromising ledger correctness.

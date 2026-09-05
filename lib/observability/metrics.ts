import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";
import type { BankEvent } from "@/lib/telemetry/events";

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry, prefix: "bankverse_" });

export const paymentOutcomeCounter = new Counter({
  name: "bankverse_payment_outcomes_total",
  help: "Payment outcomes observed by BankVerse.",
  labelNames: ["outcome", "environment"] as const,
  registers: [metricsRegistry],
});

export const providerAttemptCounter = new Counter({
  name: "bankverse_provider_attempts_total",
  help: "Provider attempts observed by operation and outcome.",
  labelNames: ["provider", "operation", "outcome", "environment"] as const,
  registers: [metricsRegistry],
});

export const providerLatencyHistogram = new Histogram({
  name: "bankverse_provider_attempt_latency_ms",
  help: "Provider attempt latency in milliseconds.",
  labelNames: ["provider", "operation", "environment"] as const,
  buckets: [5, 25, 50, 100, 200, 500, 1000, 2500, 5000, 10000],
  registers: [metricsRegistry],
});

export const mlInferenceLatencyHistogram = new Histogram({
  name: "bankverse_ml_inference_latency_ms",
  help: "ML inference latency in milliseconds.",
  labelNames: ["model", "operation", "environment"] as const,
  buckets: [5, 10, 25, 50, 100, 200, 500, 1000, 2500],
  registers: [metricsRegistry],
});

export const mlFallbackCounter = new Counter({
  name: "bankverse_ml_fallbacks_total",
  help: "ML routing requests that used the deterministic fallback.",
  labelNames: ["reason", "environment"] as const,
  registers: [metricsRegistry],
});

export const incidentCounter = new Counter({
  name: "bankverse_incidents_total",
  help: "Incidents detected by provider and incident type.",
  labelNames: ["provider", "incident_type", "environment"] as const,
  registers: [metricsRegistry],
});

export const policyDenialCounter = new Counter({
  name: "bankverse_policy_denials_total",
  help: "Actions denied by the deterministic policy engine.",
  labelNames: ["action", "reason", "environment"] as const,
  registers: [metricsRegistry],
});

export const ledgerInvariantViolationCounter = new Counter({
  name: "bankverse_ledger_invariant_violations_total",
  help: "Ledger invariant violations observed by BankVerse.",
  labelNames: ["invariant", "environment"] as const,
  registers: [metricsRegistry],
});

export const circuitBreakerGauge = new Gauge({
  name: "bankverse_circuit_breaker_open",
  help: "Whether the ML circuit breaker is open (1) or closed (0).",
  labelNames: ["service", "environment"] as const,
  registers: [metricsRegistry],
});

export function metricsEnvironment(): string {
  return process.env.NODE_ENV || "development";
}

export function recordBankEventMetric(event: BankEvent): void {
  const environment = metricsEnvironment();

  if (
    event.eventType === "PAYMENT_SUCCESS" ||
    event.eventType === "PAYMENT_FAILED"
  ) {
    paymentOutcomeCounter.inc({
      outcome:
        event.outcome ||
        (event.eventType === "PAYMENT_SUCCESS" ? "success" : "failure"),
      environment,
    });
  }

  if (
    event.eventType === "PROVIDER_ATTEMPTED" ||
    event.eventType === "PROVIDER_SUCCESS" ||
    event.eventType === "PROVIDER_FAILED" ||
    event.eventType === "PROVIDER_TIMEOUT"
  ) {
    providerAttemptCounter.inc({
      provider: event.provider || "unknown",
      operation: String(event.metadata?.operation || "unknown"),
      outcome: event.outcome || "unknown",
      environment,
    });
  }

  if (event.latencyMs !== undefined) {
    if (event.eventType.startsWith("PROVIDER_")) {
      providerLatencyHistogram.observe(
        {
          provider: event.provider || "unknown",
          operation: String(event.metadata?.operation || "unknown"),
          environment,
        },
        event.latencyMs,
      );
    }

    if (event.eventType === "ROUTING_DECISION") {
      mlInferenceLatencyHistogram.observe(
        {
          model: String(event.metadata?.modelVersion || "unknown"),
          operation: "routing",
          environment,
        },
        event.latencyMs,
      );
    }
  }

  if (event.eventType === "INCIDENT_DETECTED") {
    incidentCounter.inc({
      provider: event.provider || "unknown",
      incident_type: String(event.metadata?.incidentType || "unknown"),
      environment,
    });
  }
}

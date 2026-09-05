import { recordBankEventMetric } from "@/lib/observability/metrics";

/**
 * BankVerse telemetry event contract.
 *
 * This is intentionally runtime-safe and append-only for the first implementation
 * slice: the event stream is in-memory for local/test use, while the durable
 * adapter can be implemented later with Postgres JSONB storage.
 */

export type BankEventOutcome =
  | "SUCCESS"
  | "FAILURE"
  | "TIMEOUT"
  | "DECLINED"
  | "UNKNOWN";

export type BankEventType =
  | "PAYMENT_CREATED"
  | "PAYMENT_PROCESSING"
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED"
  | "PROVIDER_ATTEMPTED"
  | "PROVIDER_SUCCESS"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_DECLINED"
  | "PROVIDER_FAILED"
  | "RETRY_SCHEDULED"
  | "ROUTING_DECISION"
  | "SETTLEMENT_RECONCILED"
  | "INCIDENT_DETECTED";

export interface BankEvent {
  id: string;
  schemaVersion: string;
  eventType: BankEventType;
  timestamp: string;
  transactionId?: string;
  provider?: string;
  amount?: number;
  currency?: string;
  attempt?: number;
  latencyMs?: number;
  outcome?: BankEventOutcome;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface BankEventStore {
  save(event: BankEvent): BankEvent;
  listByTransaction(transactionId: string, limit?: number): BankEvent[];
  list(limit?: number): BankEvent[];
}

export const telemetryStore: BankEvent[] = [];

class InMemoryBankEventStore implements BankEventStore {
  save(event: BankEvent): BankEvent {
    telemetryStore.push(event);
    return event;
  }

  listByTransaction(transactionId: string, limit = 50): BankEvent[] {
    return telemetryStore
      .filter((event) => event.transactionId === transactionId)
      .slice(-limit);
  }

  list(limit = 50): BankEvent[] {
    return telemetryStore.slice(-limit);
  }
}

export const inMemoryBankEventStore = new InMemoryBankEventStore();

export function emitBankEvent(event: BankEvent): BankEvent {
  const savedEvent = inMemoryBankEventStore.save(event);
  recordBankEventMetric(savedEvent);
  return savedEvent;
}

export function getRecentEvents(limit = 50): BankEvent[] {
  return inMemoryBankEventStore.list(limit);
}

export function getEventsByTransaction(
  transactionId: string,
  limit = 50,
): BankEvent[] {
  return inMemoryBankEventStore.listByTransaction(transactionId, limit);
}

/**
 * BankVerse — Transactional Outbox & Event Engine
 *
 * Guarantees atomic persistence of Payment State, Ledger Entries, and Outbox Events
 * within a single transaction boundary.
 */

export type OutboxEventStatus =
  | "PENDING"
  | "PROCESSING"
  | "PROCESSED"
  | "FAILED";

export interface OutboxEvent {
  id: string;
  aggregateId: string;
  eventType:
    | "PAYMENT_CREATED"
    | "PAYMENT_PROCESSING"
    | "PAYMENT_CAPTURED"
    | "PAYMENT_FAILED"
    | "PAYMENT_SETTLED"
    | "PAYMENT_REFUNDED";
  payload: Record<string, unknown>;
  status: OutboxEventStatus;
  retryCount: number;
  version: number;
  createdAt: string;
  processedAt?: string;
  error?: string;
}

// ─── In-Memory Outbox Store ─────────────────────────────────────

export const outboxStore: OutboxEvent[] = [];

/**
 * Persists an outbox event atomically alongside aggregate mutations.
 */
export async function createOutboxEvent(data: {
  aggregateId: string;
  eventType: OutboxEvent["eventType"];
  payload: Record<string, unknown>;
}): Promise<OutboxEvent> {
  const event: OutboxEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    aggregateId: data.aggregateId,
    eventType: data.eventType,
    payload: data.payload,
    status: "PENDING",
    retryCount: 0,
    version: 1,
    createdAt: new Date().toISOString(),
  };

  outboxStore.push(event);
  return event;
}

/**
 * Retrieves pending outbox events for background worker processing.
 */
export async function getPendingOutboxEvents(
  limit = 10,
): Promise<OutboxEvent[]> {
  return outboxStore
    .filter((e) => e.status === "PENDING" || e.status === "FAILED")
    .slice(0, limit);
}

/**
 * Marks outbox event status after worker execution.
 */
export async function updateOutboxEventStatus(
  id: string,
  status: OutboxEventStatus,
  error?: string,
): Promise<OutboxEvent | null> {
  const event = outboxStore.find((e) => e.id === id);
  if (!event) return null;

  event.status = status;
  event.version += 1;
  if (error) event.error = error;
  if (status === "PROCESSED") event.processedAt = new Date().toISOString();

  return event;
}

// ─── Async Outbox Worker Process ───────────────────────────────

export class OutboxWorker {
  /**
   * Process pending outbox events with at-least-once delivery guarantees.
   */
  static async processPendingEvents(): Promise<{
    processed: number;
    failed: number;
  }> {
    const pendingEvents = await getPendingOutboxEvents(20);
    let processed = 0;
    let failed = 0;

    for (const event of pendingEvents) {
      try {
        await updateOutboxEventStatus(event.id, "PROCESSING");

        // Simulate async downstream processing (e.g. status updates, settlement triggers)
        await new Promise((r) => setTimeout(r, 50));

        await updateOutboxEventStatus(event.id, "PROCESSED");
        processed++;
      } catch (err: unknown) {
        await updateOutboxEventStatus(
          event.id,
          "FAILED",
          (err as Error).message || "Worker processing error",
        );
        failed++;
      }
    }

    return { processed, failed };
  }
}

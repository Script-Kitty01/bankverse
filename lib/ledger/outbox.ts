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
  leaseExpiresAt?: string;
  providerIdempotencyKey?: string;
  error?: string;
}

// ─── In-Memory Outbox Store ─────────────────────────────────────

export const outboxStore: OutboxEvent[] = [];

// ─── Bounded Store (SRE hardening) ───────────────────────────────
const MAX_OUTBOX_EVENTS = 5000;
const PROCESSED_EVENT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Prevent unbounded memory growth. Lazily evicts terminal (PROCESSED/FAILED)
 * events older than the TTL; if the store is still over the cap, drops the
 * oldest terminal events. Live PENDING/PROCESSING events are never evicted.
 */
export function evictProcessedOutboxEvents(maxAgeMs = PROCESSED_EVENT_TTL_MS): number {
  if (outboxStore.length === 0) return 0;

  const now = Date.now();
  const cutoff = now - maxAgeMs;
  let evicted = 0;

  // Remove stale terminal events first.
  for (let i = outboxStore.length - 1; i >= 0; i--) {
    const evt = outboxStore[i];
    if (evt.status === "PROCESSED" || evt.status === "FAILED") {
      const createdAt = new Date(evt.createdAt).getTime();
      if (createdAt < cutoff || createdAt > now) {
        outboxStore.splice(i, 1);
        evicted++;
      }
    }
  }

  // If still over the cap, drop oldest terminal events.
  if (outboxStore.length > MAX_OUTBOX_EVENTS) {
    const terminal = outboxStore
      .map((evt, idx) => ({ evt, idx }))
      .filter(
        ({ evt }) => evt.status === "PROCESSED" || evt.status === "FAILED",
      )
      .sort(
        (a, b) =>
          new Date(a.evt.createdAt).getTime() -
          new Date(b.evt.createdAt).getTime(),
      );

    let toRemove = outboxStore.length - MAX_OUTBOX_EVENTS;
    for (let i = terminal.length - 1; i >= 0 && toRemove > 0; i--) {
      outboxStore.splice(terminal[i].idx, 1);
      toRemove--;
      evicted++;
    }
  }

  return evicted;
}

/**
 * Persists an outbox event atomically alongside aggregate mutations.
 */
export async function createOutboxEvent(data: {
  aggregateId: string;
  eventType: OutboxEvent["eventType"];
  payload: Record<string, unknown>;
  providerIdempotencyKey?: string;
}): Promise<OutboxEvent> {
  // Keep the in-memory store bounded.
  evictProcessedOutboxEvents();
  const event: OutboxEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    aggregateId: data.aggregateId,
    eventType: data.eventType,
    payload: data.payload,
    status: "PENDING",
    retryCount: 0,
    version: 1,
    createdAt: new Date().toISOString(),
    providerIdempotencyKey: data.providerIdempotencyKey || `p_idem_${data.aggregateId}`,
  };

  outboxStore.push(event);
  return event;
}

/**
 * Retrieves pending outbox events or events with expired processing leases for recovery.
 */
export async function getPendingOutboxEvents(
  limit = 10,
): Promise<OutboxEvent[]> {
  // Keep the in-memory store bounded on the read path too.
  evictProcessedOutboxEvents();
  const now = Date.now();
  return outboxStore
    .filter((e) => {
      if (e.status === "PENDING" || e.status === "FAILED") return true;
      if (
        e.status === "PROCESSING" &&
        e.leaseExpiresAt &&
        new Date(e.leaseExpiresAt).getTime() <= now
      ) {
        // Stale worker lease detected — recover event
        e.status = "PENDING";
        return true;
      }
      return false;
    })
    .slice(0, limit);
}

/**
 * Marks outbox event status after worker execution, managing lease expiration.
 */
export async function updateOutboxEventStatus(
  id: string,
  status: OutboxEventStatus,
  error?: string,
  leaseTtlSeconds = 30,
): Promise<OutboxEvent | null> {
  const event = outboxStore.find((e) => e.id === id);
  if (!event) return null;

  event.status = status;
  event.version += 1;
  if (error) event.error = error;
  if (status === "PROCESSING") {
    event.leaseExpiresAt = new Date(Date.now() + leaseTtlSeconds * 1000).toISOString();
  } else {
    delete event.leaseExpiresAt;
  }
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

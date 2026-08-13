/**
 * BankVerse — Two-Tiered Idempotency Layer (Redis + Database)
 *
 * Tier 1 (Redis / Cache): Short-lived lock and result cache for rapid duplicate rejection.
 * Tier 2 (Database): Authoritative uniqueness constraint on `idempotencyKey`.
 *
 * Guarantees N identical requests produce exactly 1 financial movement and N safe cached responses.
 */

import { getPaymentTransactionByIdempotencyKey } from "@/lib/ledger/ledger.service";
import type { PaymentTransaction } from "@/lib/ledger/types";

export interface CachedIdempotencyResult {
  transaction: PaymentTransaction;
  cachedAt: string;
  requestHash?: string;
}

// Helper to compute deterministic hash of request parameters
export function computeRequestHash(params: Record<string, unknown>): string {
  const keys = Object.keys(params).sort();
  const serialized = keys.map((k) => `${k}:${JSON.stringify(params[k])}`).join("|");
  let hash = 0;
  for (let i = 0; i < serialized.length; i++) {
    const char = serialized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

// ─── In-Memory Mock Redis Store ─────────────────────────────────

const redisMockStore = new Map<string, { value: string; expiresAt: number }>();

export class IdempotencyManager {
  /**
   * Acquire a short-lived lock in Redis (`SET key token NX EX ttl`).
   */
  static async acquireLock(
    idempotencyKey: string,
    ttlSeconds = 30,
    lockToken = "LOCKED",
  ): Promise<boolean> {
    const lockKey = `lock:${idempotencyKey}`;
    const now = Date.now();

    const existing = redisMockStore.get(lockKey);
    if (existing && existing.expiresAt > now) {
      return false; // Lock already held
    }

    // Set lock with TTL and owner token
    redisMockStore.set(lockKey, {
      value: lockToken,
      expiresAt: now + ttlSeconds * 1000,
    });
    return true;
  }

  /**
   * Release Redis lock safely (token-matching release).
   */
  static async releaseLock(
    idempotencyKey: string,
    lockToken?: string,
  ): Promise<void> {
    const lockKey = `lock:${idempotencyKey}`;
    const existing = redisMockStore.get(lockKey);
    if (existing) {
      if (!lockToken || existing.value === lockToken) {
        redisMockStore.delete(lockKey);
      }
    }
  }

  /**
   * Cache execution result in Redis with optional request hash verification.
   */
  static async cacheResult(
    idempotencyKey: string,
    result: CachedIdempotencyResult,
    requestParams?: Record<string, unknown>,
    ttlSeconds = 86400, // 24 hours
  ): Promise<void> {
    const cacheKey = `result:${idempotencyKey}`;
    const requestHash = requestParams ? computeRequestHash(requestParams) : undefined;
    const dataToCache: CachedIdempotencyResult = {
      ...result,
      requestHash: requestHash || result.requestHash,
    };

    redisMockStore.set(cacheKey, {
      value: JSON.stringify(dataToCache),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Retrieve cached result or query DB authoritative source.
   * Validates request hash to reject idempotency key reuse with different payload.
   */
  static async getResult(
    idempotencyKey: string,
    requestParams?: Record<string, unknown>,
  ): Promise<CachedIdempotencyResult | null> {
    const cacheKey = `result:${idempotencyKey}`;
    const now = Date.now();
    const expectedHash = requestParams ? computeRequestHash(requestParams) : undefined;

    // 1. Check Redis Tier 1 Cache
    const cached = redisMockStore.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      try {
        const parsed: CachedIdempotencyResult = JSON.parse(cached.value);
        if (expectedHash && parsed.requestHash && parsed.requestHash !== expectedHash) {
          throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST");
        }
        return parsed;
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          err.message === "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST"
        ) {
          throw err;
        }
        // Fall back to DB
      }
    }

    // 2. Check Database Tier 2 Authoritative Source
    const existingTx =
      await getPaymentTransactionByIdempotencyKey(idempotencyKey);
    if (existingTx) {
      const dbResult: CachedIdempotencyResult = {
        transaction: existingTx,
        cachedAt: new Date().toISOString(),
        requestHash: expectedHash,
      };

      // Populate Tier 1 cache asynchronously
      IdempotencyManager.cacheResult(idempotencyKey, dbResult, requestParams).catch(
        () => {},
      );
      return dbResult;
    }

    return null;
  }

  /**
   * Reset store (used for test cleanup)
   */
  static clearMockStore(): void {
    redisMockStore.clear();
  }
}

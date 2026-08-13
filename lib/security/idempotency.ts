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
}

// ─── In-Memory Mock Redis Store ─────────────────────────────────

const redisMockStore = new Map<string, { value: string; expiresAt: number }>();

export class IdempotencyManager {
  /**
   * Acquire a short-lived lock in Redis (`SETNX key value EX ttl`).
   */
  static async acquireLock(
    idempotencyKey: string,
    ttlSeconds = 30,
  ): Promise<boolean> {
    const lockKey = `lock:${idempotencyKey}`;
    const now = Date.now();

    const existing = redisMockStore.get(lockKey);
    if (existing && existing.expiresAt > now) {
      return false; // Lock already held
    }

    // Set lock with TTL
    redisMockStore.set(lockKey, {
      value: "LOCKED",
      expiresAt: now + ttlSeconds * 1000,
    });
    return true;
  }

  /**
   * Release Redis lock.
   */
  static async releaseLock(idempotencyKey: string): Promise<void> {
    redisMockStore.delete(`lock:${idempotencyKey}`);
  }

  /**
   * Cache execution result in Redis for rapid repeated response.
   */
  static async cacheResult(
    idempotencyKey: string,
    result: CachedIdempotencyResult,
    ttlSeconds = 86400, // 24 hours
  ): Promise<void> {
    const cacheKey = `result:${idempotencyKey}`;
    redisMockStore.set(cacheKey, {
      value: JSON.stringify(result),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Retrieve cached result or query DB authoritative source.
   */
  static async getResult(
    idempotencyKey: string,
  ): Promise<CachedIdempotencyResult | null> {
    const cacheKey = `result:${idempotencyKey}`;
    const now = Date.now();

    // 1. Check Redis Tier 1 Cache
    const cached = redisMockStore.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      try {
        return JSON.parse(cached.value);
      } catch {
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
      };

      // Populate Tier 1 cache asynchronously
      this.cacheResult(idempotencyKey, dbResult);
      return dbResult;
    }

    return null;
  }
}

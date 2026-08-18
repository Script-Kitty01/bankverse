/**
 * BankVerse — Transaction Log Store
 *
 * Append-only bounded log store (max 5,000 logs, TTL eviction).
 * Supports search, filtering, pagination, and ingestion metrics.
 */

import type { LogFilterParams, TransactionLog } from "./types";

const MAX_LOGS = 5000;
const LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const logsStore: TransactionLog[] = [];

/**
 * Evict stale terminal logs to prevent unbounded memory growth.
 */
export function evictStaleLogs(): number {
  if (logsStore.length === 0) return 0;

  const now = Date.now();
  let evicted = 0;

  for (let i = logsStore.length - 1; i >= 0; i--) {
    const log = logsStore[i];
    const age = now - new Date(log.ingestedAt).getTime();
    if (age > LOG_TTL_MS) {
      logsStore.splice(i, 1);
      evicted++;
    }
  }

  if (logsStore.length > MAX_LOGS) {
    const toRemove = logsStore.length - MAX_LOGS;
    logsStore.splice(0, toRemove);
    evicted += toRemove;
  }

  return evicted;
}

export function saveLog(log: TransactionLog): TransactionLog {
  evictStaleLogs();
  logsStore.push(log);
  return log;
}

export function findLogByHash(dedupeHash: string): TransactionLog | undefined {
  return logsStore.find((l) => l.dedupeHash === dedupeHash);
}

export function findLogById(id: string): TransactionLog | undefined {
  return logsStore.find((l) => l.id === id);
}

export function getAllLogs(): TransactionLog[] {
  return [...logsStore];
}

export function queryLogs(params: LogFilterParams): {
  logs: TransactionLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
} {
  const {
    category,
    source,
    resolutionStatus,
    search,
    page = 1,
    limit = 20,
  } = params;

  let filtered = [...logsStore];

  if (category) {
    filtered = filtered.filter((l) => l.category === category);
  }

  if (source) {
    filtered = filtered.filter(
      (l) => l.source.toLowerCase() === source.toLowerCase(),
    );
  }

  if (resolutionStatus) {
    filtered = filtered.filter((l) => l.resolutionStatus === resolutionStatus);
  }

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (l) =>
        l.externalRef.toLowerCase().includes(q) ||
        l.source.toLowerCase().includes(q) ||
        l.eventType.toLowerCase().includes(q) ||
        l.categoryName.toLowerCase().includes(q) ||
        (l.providerOrderId && l.providerOrderId.toLowerCase().includes(q)) ||
        (l.providerPaymentId && l.providerPaymentId.toLowerCase().includes(q)),
    );
  }

  // Sort newest first
  filtered.sort(
    (a, b) =>
      new Date(b.ingestedAt).getTime() - new Date(a.ingestedAt).getTime(),
  );

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginatedLogs = filtered.slice(startIndex, startIndex + limit);

  return {
    logs: paginatedLogs,
    total,
    page,
    limit,
    totalPages,
  };
}

export function getIngestionStats(): {
  totalIngested: number;
  acceptedCount: number;
  autoSolvedCount: number;
  unresolvedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  autoSolveRate: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  byResolution: Record<string, number>;
} {
  const totalIngested = logsStore.length;
  const acceptedCount = logsStore.filter(
    (l) => l.ingestStatus === "ACCEPTED",
  ).length;
  const autoSolvedCount = logsStore.filter(
    (l) => l.resolutionStatus === "AUTO_SOLVED",
  ).length;
  const unresolvedCount = logsStore.filter(
    (l) => l.resolutionStatus === "UNRESOLVED",
  ).length;
  const duplicateCount = logsStore.filter(
    (l) => l.ingestStatus === "DUPLICATE",
  ).length;
  const rejectedCount = logsStore.filter((l) =>
    l.ingestStatus.startsWith("REJECTED"),
  ).length;

  const autoSolveRate = acceptedCount > 0 ? autoSolvedCount / acceptedCount : 0;

  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byResolution: Record<string, number> = {};

  for (const log of logsStore) {
    byCategory[log.category] = (byCategory[log.category] || 0) + 1;
    bySource[log.source] = (bySource[log.source] || 0) + 1;
    byResolution[log.resolutionStatus] =
      (byResolution[log.resolutionStatus] || 0) + 1;
  }

  return {
    totalIngested,
    acceptedCount,
    autoSolvedCount,
    unresolvedCount,
    duplicateCount,
    rejectedCount,
    autoSolveRate,
    byCategory,
    bySource,
    byResolution,
  };
}

export function clearLogStore(): void {
  logsStore.length = 0;
}

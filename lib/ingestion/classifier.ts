/**
 * BankVerse — Log Classifier & Normalizer
 *
 * Normalizes raw log records into canonical TransactionLogs and classifies
 * each log into 1 of the 9 Chaos/Fault Categories based on heuristics.
 */

import crypto from "crypto";
import type { ChaosCategory, LogSource, SourceType, TransactionLog } from "./types";

export interface RawLogItem {
  reference?: string;
  externalRef?: string;
  orderId?: string;
  providerOrderId?: string;
  paymentId?: string;
  providerPaymentId?: string;
  eventType?: string;
  type?: string;
  category?: string;
  status?: string;
  amount?: number | string;
  currency?: string;
  direction?: string;
  timestamp?: string;
  date?: string;
  source?: string;
  sourceType?: string;
  [key: string]: unknown;
}

export const CATEGORY_NAMES: Record<ChaosCategory, string> = {
  "provider-timeout": "Provider Timeout",
  "amount-mismatch": "Amount Mismatch",
  "duplicate-charge": "Duplicate Charge",
  "missing-credit": "Missing Credit (Ledger Imbalance)",
  "webhook-out-of-order": "Webhook Out of Order",
  "provider-down": "Provider Down",
  "slow-reconciliation": "Slow Reconciliation (Bulk Mismatch)",
  "worker-crash-after-commit": "Worker Crash After DB Commit",
  "refund-race-condition": "Refund Race Condition",
};

export const CATEGORY_SEVERITIES: Record<ChaosCategory, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
  "provider-timeout": "HIGH",
  "amount-mismatch": "HIGH",
  "duplicate-charge": "CRITICAL",
  "missing-credit": "CRITICAL",
  "webhook-out-of-order": "MEDIUM",
  "provider-down": "HIGH",
  "slow-reconciliation": "MEDIUM",
  "worker-crash-after-commit": "CRITICAL",
  "refund-race-condition": "MEDIUM",
};

export function classifyLog(item: RawLogItem): ChaosCategory {
  if (item.category && item.category in CATEGORY_NAMES) {
    return item.category as ChaosCategory;
  }
  const str = JSON.stringify(item).toLowerCase();

  if (str.includes("provider_down") || str.includes("503") || str.includes("service_unavailable")) return "provider-down";
  if (str.includes("timeout") || str.includes("504") || str.includes("gateway_timeout")) return "provider-timeout";
  if (str.includes("duplicate") || str.includes("double_charge")) return "duplicate-charge";
  if (str.includes("debit_without_credit") || str.includes("missing_credit") || str.includes("imbalance")) return "missing-credit";
  if (str.includes("out_of_order")) return "webhook-out-of-order";
  if (str.includes("worker_crash") || str.includes("crash") || str.includes("post_commit")) return "worker-crash-after-commit";
  if (str.includes("refund_race") || str.includes("refund_pending") || str.includes("refund_before_capture")) return "refund-race-condition";
  if (str.includes("bulk_mismatch") || str.includes("slow_reconciliation")) return "slow-reconciliation";
  return "amount-mismatch";
}

export function computeDedupeHash(
  source: string,
  externalRef: string,
  amount: number,
  currency: string,
  timestamp: string,
): string {
  const norm = `${source.toLowerCase()}:${externalRef.trim()}:${amount}:${currency.toUpperCase()}:${new Date(timestamp).getTime() || timestamp}`;
  return crypto.createHash("sha256").update(norm).digest("hex");
}

export function normalizeLogItem(
  item: RawLogItem,
  defaultSource: LogSource = "bank-statement",
  defaultSourceType: SourceType = "PROVIDER_FEED",
): Omit<TransactionLog, "id" | "ingestedAt" | "ingestStatus" | "resolutionStatus"> {
  const source = (item.source || defaultSource) as LogSource;
  const sourceType = (item.sourceType || defaultSourceType) as SourceType;
  const externalRef = (item.externalRef || item.reference || item.providerPaymentId || item.paymentId || item.providerOrderId || item.orderId || `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`).toString();

  let amount = 0;
  if (typeof item.amount === "number") amount = item.amount;
  else if (typeof item.amount === "string") amount = parseFloat(item.amount.replace(/[^0-9.-]/g, "")) || 0;

  const currency = (item.currency || "INR").toUpperCase();
  const absAmount = Math.abs(amount);
  const timestamp = item.timestamp || item.date || new Date().toISOString();
  const eventType = (item.eventType || item.type || item.status || "LOG_ENTRY").toString();
  const category = classifyLog(item);

  return {
    source,
    sourceType,
    externalRef,
    providerOrderId: (item.providerOrderId || item.orderId || "").toString() || undefined,
    providerPaymentId: (item.providerPaymentId || item.paymentId || "").toString() || undefined,
    eventType,
    category,
    categoryName: CATEGORY_NAMES[category],
    severity: CATEGORY_SEVERITIES[category],
    amount: absAmount,
    currency,
    direction: (item.direction || (amount >= 0 ? "CREDIT" : "DEBIT")).toUpperCase() as "DEBIT" | "CREDIT",
    timestamp: new Date(timestamp).toISOString(),
    rawPayload: item,
    dedupeHash: computeDedupeHash(source, externalRef, absAmount, currency, timestamp),
  };
}

export function parseCsvLogs(csvText: string): RawLogItem[] {
  if (!csvText || typeof csvText !== "string") return [];
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const records: RawLogItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^["']|["']$/g, ""));
    const record: RawLogItem = {};
    headers.forEach((header, idx) => {
      if (values[idx] !== undefined) record[header] = values[idx];
    });
    if (Object.keys(record).length > 0) records.push(record);
  }
  return records;
}

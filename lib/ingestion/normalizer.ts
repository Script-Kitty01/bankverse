/**
 * BankVerse — Internal & Provider Normalizer
 *
 * Maps provider-specific and internal schemas (Razorpay, Bank Statements,
 * Internal Ledger exports, Stripe, Plaid) to standard NormalizedTransaction format.
 */

import type {
  NormalizedDirection,
  NormalizedStatus,
  NormalizedTransaction,
  RawRowItem,
  TransactionSourceType,
} from "./normalized-types";

/**
 * Clean and parse monetary amounts from strings or numbers.
 * Handles currency symbols, commas, negative values.
 */
export function parseNumericAmount(val: unknown): { amount: number; inferredDirection?: NormalizedDirection } {
  if (val === null || val === undefined || val === "") {
    return { amount: NaN };
  }

  if (typeof val === "number") {
    if (isNaN(val) || !isFinite(val)) return { amount: NaN };
    return {
      amount: Math.abs(val),
      inferredDirection: val < 0 ? "DEBIT" : "CREDIT",
    };
  }

  const str = String(val).trim();
  if (str.length === 0) return { amount: NaN };

  // Check for negative signs or parenthesized negative numbers e.g. "(100.50)"
  const isNegative = str.startsWith("-") || str.startsWith("(") || /debit/i.test(str);
  const cleanStr = str.replace(/[^0-9.-]/g, "");

  if (cleanStr.length === 0 || cleanStr === "-" || cleanStr === ".") {
    return { amount: NaN };
  }

  const num = parseFloat(cleanStr);
  if (isNaN(num) || !isFinite(num)) {
    return { amount: NaN };
  }

  const absAmount = Math.abs(num);
  return {
    amount: absAmount,
    inferredDirection: isNegative || num < 0 ? "DEBIT" : "CREDIT",
  };
}

/**
 * Parses diverse date formats into an ISO 8601 string.
 */
export function parseIsoTimestamp(val: unknown): string {
  if (val === null || val === undefined || val === "") {
    return "";
  }

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? "" : val.toISOString();
  }

  if (typeof val === "number") {
    const ms = val < 1e11 ? val * 1000 : val;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }

  const str = String(val).trim();
  if (str.length === 0) return "";

  let parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  const ddmmyyyy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (ddmmyyyy) {
    const [, day, month, year, hr = "00", min = "00", sec = "00"] = ddmmyyyy;
    parsed = new Date(
      Date.UTC(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        parseInt(hr, 10),
        parseInt(min, 10),
        parseInt(sec, 10),
      ),
    );
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return "";
}

/**
 * Standardizes provider status words to canonical status.
 */
export function normalizeStatus(rawStatus: unknown): NormalizedStatus {
  if (!rawStatus) return "SUCCESS";
  const s = String(rawStatus).toLowerCase().trim();

  if (s.includes("settle") || s.includes("captured") || s.includes("processed") || s.includes("cleared")) {
    return "SETTLED";
  }
  if (s.includes("success") || s.includes("paid") || s.includes("completed")) {
    return "SUCCESS";
  }
  if (s.includes("refund")) {
    return "REFUNDED";
  }
  if (s.includes("fail") || s.includes("reject") || s.includes("declined") || s.includes("error")) {
    return "FAILED";
  }
  if (s.includes("pend") || s.includes("init") || s.includes("created") || s.includes("auth")) {
    return "PENDING";
  }

  return "SUCCESS";
}

/**
 * Map raw row attributes to NormalizedTransaction candidate.
 */
export function normalizeRawRow(
  rawRow: RawRowItem,
  defaultSource = "bank-statement",
  defaultSourceType: TransactionSourceType = "BANK_STATEMENT",
): Omit<NormalizedTransaction, "validationStatus" | "validationErrors"> {
  const keys = Object.keys(rawRow);
  const getVal = (...fieldNames: string[]): unknown => {
    for (const fn of fieldNames) {
      const normFn = fn.toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const k of keys) {
        const normK = k.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (normK === normFn && rawRow[k] !== undefined && rawRow[k] !== "") {
          return rawRow[k];
        }
      }
    }
    return undefined;
  };

  const rawSource = String(getVal("source", "provider", "bank_name") || defaultSource).toLowerCase();
  let sourceType: TransactionSourceType = defaultSourceType;
  if (rawSource.includes("razorpay") || rawSource.includes("stripe") || rawSource.includes("plaid")) {
    sourceType = "EXTERNAL_PROVIDER";
  } else if (rawSource.includes("internal") || rawSource.includes("ledger")) {
    sourceType = "INTERNAL";
  } else if (rawSource.includes("bank") || rawSource.includes("statement")) {
    sourceType = "BANK_STATEMENT";
  }

  const reference = String(
    getVal(
      "reference",
      "ref_no",
      "external_ref",
      "payment_id",
      "transaction_id",
      "tx_id",
      "utr",
      "id",
      "ref",
    ) || "",
  ).trim();

  const providerOrderId = String(getVal("order_id", "provider_order_id") || "").trim() || undefined;
  const providerPaymentId = String(getVal("payment_id", "provider_payment_id") || "").trim() || undefined;

  const depositVal = getVal("deposit", "credit_amount", "credit");
  const withdrawalVal = getVal("withdrawal", "debit_amount", "debit");

  let amount = NaN;
  let direction: NormalizedDirection = "CREDIT";

  if (depositVal !== undefined && depositVal !== "") {
    const parsed = parseNumericAmount(depositVal);
    amount = parsed.amount;
    direction = "CREDIT";
  } else if (withdrawalVal !== undefined && withdrawalVal !== "") {
    const parsed = parseNumericAmount(withdrawalVal);
    amount = parsed.amount;
    direction = "DEBIT";
  } else {
    const rawAmt = getVal("amount", "txn_amount", "sum", "value");
    const parsed = parseNumericAmount(rawAmt);
    amount = parsed.amount;

    const rawDir = String(getVal("direction", "type", "dr_cr") || "").toUpperCase();
    if (rawDir.includes("DEBIT") || rawDir === "DR" || rawDir.includes("WITHDRAWAL") || rawDir.includes("OUT")) {
      direction = "DEBIT";
    } else if (rawDir.includes("CREDIT") || rawDir === "CR" || rawDir.includes("DEPOSIT") || rawDir.includes("IN")) {
      direction = "CREDIT";
    } else if (parsed.inferredDirection) {
      direction = parsed.inferredDirection;
    }
  }

  const currency = String(getVal("currency", "curr") || "INR").trim().toUpperCase();
  const rawTimestamp = getVal("timestamp", "date", "created_at", "txn_date", "value_date", "time");
  const timestamp = parseIsoTimestamp(rawTimestamp);
  const rawStatus = getVal("status", "payment_state", "state", "txn_status");
  const status = normalizeStatus(rawStatus);
  const description = String(getVal("description", "remarks", "memo", "details") || "").trim() || undefined;

  const id = `norm_tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    source: rawSource,
    sourceType,
    reference,
    providerOrderId,
    providerPaymentId,
    amount,
    currency,
    direction,
    status,
    timestamp,
    description,
    rawPayload: rawRow,
  };
}

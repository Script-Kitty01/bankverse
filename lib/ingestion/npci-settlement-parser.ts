/**
 * BankVerse — NPCI Settlement File Parser
 *
 * Parses NPCI (National Payments Corporation of India) UPI settlement batch files
 * into NormalizedTransaction[] for reconciliation against the internal ledger.
 *
 * NPCI settlement files are CSV exports delivered by sponsor banks (e.g., HDFC, ICICI)
 * containing all UPI transactions settled in a given batch window. These are the
 * ground-truth records that any UPI-based FINTECH must reconcile against.
 *
 * Key NPCI columns:
 *   txn_id           — NPCI transaction ID (primary reference)
 *   settlement_batch — Batch identifier (e.g., SB-20260817-001)
 *   settlement_date  — ISO 8601 settlement timestamp
 *   upi_txn_ref      — UPI transaction reference number
 *   payer_vpa        — Payer's Virtual Payment Address
 *   payer_bank       — Payer's bank name
 *   payee_vpa        — Payee's Virtual Payment Address
 *   payee_bank       — Payee's bank name
 *   amount           — Transaction amount in INR
 *   currency         — ISO 4217 currency code
 *   status           — NPCI status (SUCCESS, FAILED, PENDING, REVERSED)
 *   settlement_flag  — Settlement status (SETTLED, UNSETTLED, DISPUTED)
 *   remarks          — Free-text remarks
 */

import { parseCsvText } from "./csv-parser";
import { parseNumericAmount, parseIsoTimestamp } from "./normalizer";
import type {
  NormalizedTransaction,
  NormalizedStatus,
  NormalizedDirection,
  TransactionSourceType,
  ValidationStatus,
} from "./normalized-types";

// ─── NPCI-specific types ────────────────────────────────────────

export interface NpciSettlementRow {
  txnId: string;
  settlementBatch: string;
  settlementDate: string;
  upiTxnRef: string;
  payerVpa: string;
  payerBank: string;
  payeeVpa: string;
  payeeBank: string;
  amount: number;
  currency: string;
  status: string;
  settlementFlag: string;
  remarks: string;
}

export interface NpciParseResult {
  batchId: string;
  parsedAt: string;
  totalRows: number;
  validCount: number;
  malformedCount: number;
  transactions: NormalizedTransaction[];
  malformedRows: Array<{
    rowIndex: number;
    rawRow: Record<string, string>;
    errors: string[];
  }>;
  /** Summary stats useful for Slice's operations dashboard */
  summary: {
    totalSettledAmount: number;
    totalUnsettledAmount: number;
    uniqueBanks: string[];
    batchCount: number;
    disputedCount: number;
  };
}

// ─── Status mapping ─────────────────────────────────────────────

const NPCI_STATUS_MAP: Record<string, NormalizedStatus> = {
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  PENDING: "PENDING",
  REVERSED: "REFUNDED",
  SETTLED: "SETTLED",
};

function mapNpciStatus(raw: string): NormalizedStatus {
  return NPCI_STATUS_MAP[raw.toUpperCase()] || "PENDING";
}

// ─── Parser ─────────────────────────────────────────────────────

export class NpciSettlementParser {
  /**
   * Parse an NPCI settlement CSV string into NormalizedTransaction[].
   *
   * The parser handles:
   * - Standard NPCI settlement file format (13 columns)
   * - Amount normalization (handles string amounts with commas)
   * - Date parsing to ISO 8601
   * - Status mapping to internal NormalizedStatus
   * - Malformed row detection with detailed error reporting
   * - Batch-level summary statistics
   */
  static parse(csvText: string): NpciParseResult {
    const parsedAt = new Date().toISOString();
    const batchId = `npci_parse_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const csvResult = parseCsvText(csvText, { trimValues: true });

    if (csvResult.headers.length === 0) {
      return {
        batchId,
        parsedAt,
        totalRows: 0,
        validCount: 0,
        malformedCount: 0,
        transactions: [],
        malformedRows: [],
        summary: {
          totalSettledAmount: 0,
          totalUnsettledAmount: 0,
          uniqueBanks: [],
          batchCount: 0,
          disputedCount: 0,
        },
      };
    }

    const transactions: NormalizedTransaction[] = [];
    const malformedRows: NpciParseResult["malformedRows"] = [];
    const banks = new Set<string>();
    const batches = new Set<string>();
    let totalSettledAmount = 0;
    let totalUnsettledAmount = 0;
    let disputedCount = 0;

    for (const row of csvResult.rows) {
      const errors: string[] = [];
      const rawRow = row.rawRecord;

      // Validate required fields
      const txnId = rawRow["txn_id"] || "";
      const upiTxnRef = rawRow["upi_txn_ref"] || "";
      const amountRaw = rawRow["amount"] || "";
      const currency = (rawRow["currency"] || "INR").toUpperCase();
      const statusRaw = rawRow["status"] || "";
      const settlementFlag = (rawRow["settlement_flag"] || "").toUpperCase();
      const settlementBatch = rawRow["settlement_batch"] || "";
      const settlementDateRaw = rawRow["settlement_date"] || "";
      const payerVpa = rawRow["payer_vpa"] || "";
      const payerBank = rawRow["payer_bank"] || "";
      const payeeVpa = rawRow["payee_vpa"] || "";
      const payeeBank = rawRow["payee_bank"] || "";
      const remarks = rawRow["remarks"] || "";

      if (!txnId) errors.push("Missing txn_id");
      if (!upiTxnRef) errors.push("Missing upi_txn_ref");

      // Parse amount
      const { amount, inferredDirection } = parseNumericAmount(amountRaw);
      if (isNaN(amount) || amount <= 0) {
        errors.push(`Invalid amount: "${amountRaw}"`);
      }

      // Parse date
      const timestamp = parseIsoTimestamp(settlementDateRaw);
      if (!timestamp) {
        errors.push(`Invalid settlement_date: "${settlementDateRaw}"`);
      }

      if (errors.length > 0) {
        malformedRows.push({
          rowIndex: row.rowIndex,
          rawRow,
          errors,
        });
        continue;
      }

      // Determine direction: NPCI settlements are CREDIT from payer to payee
      // For Slice (the payee), these are incoming CREDIT transactions
      const direction: NormalizedDirection = inferredDirection || "CREDIT";

      const status = mapNpciStatus(statusRaw);

      const transaction: NormalizedTransaction = {
        id: `npci_${txnId}`,
        source: "npci",
        sourceType: "EXTERNAL_PROVIDER" as TransactionSourceType,
        reference: upiTxnRef,
        providerOrderId: settlementBatch,
        providerPaymentId: txnId,
        amount,
        currency,
        direction,
        status,
        timestamp,
        description:
          remarks || `NPCI UPI settlement: ${payerVpa} → ${payeeVpa}`,
        metadata: {
          settlementBatch,
          payerVpa,
          payerBank,
          payeeVpa,
          payeeBank,
          settlementFlag,
          npciTxnId: txnId,
        },
        rawPayload: rawRow,
        validationStatus: "VALID" as ValidationStatus,
        validationErrors: [],
      };

      transactions.push(transaction);

      // Accumulate summary stats
      if (payerBank) banks.add(payerBank);
      if (payeeBank) banks.add(payeeBank);
      if (settlementBatch) batches.add(settlementBatch);

      if (settlementFlag === "SETTLED") {
        totalSettledAmount += amount;
      } else if (settlementFlag === "UNSETTLED") {
        totalUnsettledAmount += amount;
      }

      if (settlementFlag === "DISPUTED") {
        disputedCount++;
      }
    }

    return {
      batchId,
      parsedAt,
      totalRows: csvResult.rows.length,
      validCount: transactions.length,
      malformedCount: malformedRows.length,
      transactions,
      malformedRows,
      summary: {
        totalSettledAmount,
        totalUnsettledAmount,
        uniqueBanks: Array.from(banks).sort(),
        batchCount: batches.size,
        disputedCount,
      },
    };
  }

  /**
   * Parse and immediately reconcile against the internal ledger.
   *
   * This is the primary integration point for Slice's daily settlement
   * reconciliation workflow:
   * 1. Download NPCI settlement file from sponsor bank SFTP
   * 2. Call NpciSettlementParser.parseAndReconcile(csvContent)
   * 3. Review discrepancies via OperationsDashboard
   */
  static async parseAndReconcile(
    csvText: string,
    dateRange?: { start: string; end: string },
  ): Promise<{
    parseResult: NpciParseResult;
    reconciliationReport: Awaited<
      ReturnType<
        typeof import("@/lib/reconciliation/engine").ReconciliationEngine.prototype.reconcileNormalizedTransactions
      >
    >;
  }> {
    const parseResult = this.parse(csvText);

    const { ReconciliationEngine } =
      await import("@/lib/reconciliation/engine");
    const engine = new ReconciliationEngine({ provider: "npci" });

    const reconciliationReport = await engine.reconcileNormalizedTransactions(
      parseResult.transactions,
      dateRange,
    );

    return { parseResult, reconciliationReport };
  }
}

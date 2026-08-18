/**
 * BankVerse — Normalized Transaction Ingestion Pipeline
 *
 * Core execution engine that ties together CSV parsing, normalization,
 * validation, error reporting, and storage.
 */

import { parseCsvText, type CsvParseOptions } from "./csv-parser";
import {
  type IngestionPipelineResult,
  type MalformedRowReport,
  type NormalizedTransaction,
  type RawRowItem,
  type TransactionSourceType,
} from "./normalized-types";
import { validateAndNormalizeRow } from "./validator";
import { saveLog } from "./store";
import type { TransactionLog } from "./types";
import { computeDedupeHash } from "./classifier";

export class TransactionIngestionPipeline {
  /**
   * Process raw JSON or object array items through the pipeline.
   */
  static processItems(
    items: RawRowItem[],
    defaultSource = "bank-statement",
    defaultSourceType: TransactionSourceType = "BANK_STATEMENT",
  ): IngestionPipelineResult {
    const batchId = `pipeline_batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const processedAt = new Date().toISOString();

    const transactions: NormalizedTransaction[] = [];
    const validTransactions: NormalizedTransaction[] = [];
    const malformedRows: MalformedRowReport[] = [];

    items.forEach((item, index) => {
      const rowIndex = index + 1;

      if (!item || typeof item !== "object") {
        malformedRows.push({
          rowIndex,
          rawRow: item ? String(item) : "null",
          errors: ["Row payload is not a valid record object"],
        });
        return;
      }

      const normalized = validateAndNormalizeRow(item, defaultSource, defaultSourceType);
      transactions.push(normalized);

      if (normalized.validationStatus === "VALID") {
        validTransactions.push(normalized);

        // Save to log store so reconciliation & operations engine can query it
        const logEntry: TransactionLog = {
          id: normalized.id,
          source: normalized.source,
          sourceType: normalized.sourceType as any,
          externalRef: normalized.reference,
          providerOrderId: normalized.providerOrderId,
          providerPaymentId: normalized.providerPaymentId,
          eventType: normalized.status,
          category: "amount-mismatch",
          categoryName: "Ingested Transaction",
          severity: "LOW",
          amount: normalized.amount,
          currency: normalized.currency,
          direction: normalized.direction,
          timestamp: normalized.timestamp,
          ingestedAt: processedAt,
          rawPayload: normalized.rawPayload || item,
          dedupeHash: computeDedupeHash(
            normalized.source,
            normalized.reference,
            normalized.amount,
            normalized.currency,
            normalized.timestamp,
          ),
          ingestStatus: "ACCEPTED",
          resolutionStatus: "AUTO_SOLVED",
          resolutionDetails: "Normalized ingestion pipeline accepted record.",
        };
        saveLog(logEntry);
      } else {
        malformedRows.push({
          rowIndex,
          rawRow: item,
          errors: normalized.validationErrors,
        });
      }
    });

    return {
      batchId,
      processedAt,
      totalRows: items.length,
      validCount: validTransactions.length,
      malformedCount: malformedRows.length,
      transactions,
      validTransactions,
      malformedRows,
    };
  }

  /**
   * Parse CSV string content and process through normalization & validation pipeline.
   */
  static processCsv(
    csvText: string,
    defaultSource = "bank-statement",
    defaultSourceType: TransactionSourceType = "BANK_STATEMENT",
    csvOptions?: CsvParseOptions,
  ): IngestionPipelineResult {
    const parseResult = parseCsvText(csvText, csvOptions);

    const items: RawRowItem[] = parseResult.rows.map((r) => r.rawRecord);
    const pipelineResult = this.processItems(items, defaultSource, defaultSourceType);

    // Adjust row indexes to match actual CSV line numbers
    if (parseResult.rows.length === items.length) {
      pipelineResult.malformedRows.forEach((m, i) => {
        const parseRow = parseResult.rows[i];
        if (parseRow) {
          m.rowIndex = parseRow.rowIndex;
        }
      });
    }

    // Attach parse errors as malformed row reports if any
    parseResult.parseErrors.forEach((pErr) => {
      pipelineResult.malformedRows.push({
        rowIndex: pErr.line,
        rawRow: `CSV Line ${pErr.line}`,
        errors: [pErr.message],
      });
    });

    return pipelineResult;
  }
}

/**
 * BankVerse — Log Ingestor Engine
 *
 * Core engine for ingesting batch transaction logs (JSON or CSV).
 * Normalizes, classifies into 1 of 9 fault categories, checks auto-solve policies,
 * deduplicates via SHA-256 hash, and emits outbox events.
 */

import {
  normalizeLogItem,
  parseCsvLogs,
  type RawLogItem,
} from "./classifier";
import { getPolicyForCategory } from "./policies";
import {
  findLogByHash,
  saveLog,
} from "./store";
import type {
  IngestBatchRequest,
  IngestResult,
  LogSource,
  SourceType,
  TransactionLog,
} from "./types";
import { createOutboxEvent } from "@/lib/ledger/outbox";
import { IncidentDetector } from "@/lib/incidents/detector";

export class LogIngestor {
  /**
   * Ingests a batch of transaction logs (JSON array or CSV string).
   */
  static async ingest(request: IngestBatchRequest): Promise<IngestResult> {
    const batchId = `ingest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const processedAt = new Date().toISOString();

    const defaultSource: LogSource = request.source || "bank-statement";
    const defaultSourceType: SourceType = request.sourceType || "PROVIDER_FEED";

    let itemsToProcess: RawLogItem[] = [];

    if (typeof request.payload === "string" || request.rawFormat === "CSV") {
      const csvString = typeof request.payload === "string" ? request.payload : "";
      itemsToProcess = parseCsvLogs(csvString);
    } else if (Array.isArray(request.payload)) {
      itemsToProcess = request.payload;
    } else if (request.payload && typeof request.payload === "object") {
      itemsToProcess = [request.payload as RawLogItem];
    }

    const logs: TransactionLog[] = [];
    let accepted = 0;
    let autoSolved = 0;
    let unresolved = 0;
    let duplicates = 0;
    let rejected = 0;

    for (let i = 0; i < itemsToProcess.length; i++) {
      const rawItem = itemsToProcess[i];
      if (!rawItem || typeof rawItem !== "object") {
        rejected++;
        continue;
      }

      try {
        const normalized = normalizeLogItem(
          rawItem,
          defaultSource,
          defaultSourceType,
        );

        // Check deduplication
        const existing = findLogByHash(normalized.dedupeHash);
        if (existing) {
          duplicates++;
          const duplicateLog: TransactionLog = {
            ...normalized,
            id: `log_${Date.now()}_${i}_dup`,
            ingestedAt: new Date().toISOString(),
            ingestStatus: "DUPLICATE",
            resolutionStatus: "NOT_REQUIRED",
            resolutionDetails: `Duplicate log ignored (matches existing entry ${existing.id})`,
          };
          saveLog(duplicateLog);
          logs.push(duplicateLog);
          continue;
        }

        // Evaluate auto-solve policy for the 9 categories
        const policy = getPolicyForCategory(normalized.category);
        const autoSolveEnabled = policy ? policy.enabled : false;

        const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        let resolutionStatus: TransactionLog["resolutionStatus"] = "UNRESOLVED";
        let resolutionDetails = "Awaiting manual review by operations team.";

        if (autoSolveEnabled) {
          resolutionStatus = "AUTO_SOLVED";
          resolutionDetails = policy
            ? `Auto-solved by policy: ${policy.remediationAction}`
            : "Auto-solved by policy rule.";
          autoSolved++;
        } else {
          resolutionStatus = "UNRESOLVED";
          unresolved++;

          // Create active incident for manual review
          IncidentDetector.createIncident({
            title: `Ingested Fault [${normalized.categoryName}] on ${normalized.source}`,
            severity: normalized.severity,
            provider: normalized.source,
            affectedTransactionCount: 1,
            totalAffectedAmount: normalized.amount,
            mismatchTypes: [normalized.category],
            reconciliationItemIds: [id],
          });
        }

        accepted++;

        const logRecord: TransactionLog = {
          ...normalized,
          id,
          ingestedAt: new Date().toISOString(),
          ingestStatus: "ACCEPTED",
          resolutionStatus,
          resolutionDetails,
        };

        // Emit outbox event
        await createOutboxEvent({
          aggregateId: id,
          eventType: "PAYMENT_CAPTURED", // re-use outbox event type for downstream workers
          payload: {
            logId: id,
            source: logRecord.source,
            category: logRecord.category,
            amount: logRecord.amount,
            resolutionStatus: logRecord.resolutionStatus,
          },
        });

        saveLog(logRecord);
        logs.push(logRecord);
      } catch (err: unknown) {
        rejected++;
      }
    }

    return {
      batchId,
      processedAt,
      total: itemsToProcess.length,
      accepted,
      autoSolved,
      unresolved,
      duplicates,
      rejected,
      logs,
    };
  }
}

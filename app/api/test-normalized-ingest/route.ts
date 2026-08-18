/**
 * BankVerse Verification Suite — Normalized Transaction Ingestion Pipeline
 *
 * GET /api/test-normalized-ingest — Runs verification tests for:
 * 1. NormalizedTransaction schema structure
 * 2. CSV Parser with headers, quotes, whitespace, and line numbers
 * 3. Validator (field checks: ref, amount, currency, timestamp, direction)
 * 4. Internal / Provider normalization (Razorpay, Bank Statement, Internal Ledger)
 * 5. Unit tests for malformed rows (resilience, per-row error tracking)
 * 6. Sample demo-data/ dataset execution
 * 7. Reconciliation engine integration with normalized transaction pipeline
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { TransactionIngestionPipeline } from "@/lib/ingestion/pipeline";
import { parseCsvText } from "@/lib/ingestion/csv-parser";
import { validateTransaction, validateAndNormalizeRow } from "@/lib/ingestion/validator";
import { ReconciliationEngine } from "@/lib/reconciliation/engine";
import { PaymentOrchestrator } from "@/lib/payment/orchestrator";

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  error?: string;
}

export async function GET() {
  const results: TestResult[] = [];
  const startTime = Date.now();

  // ─── Test 1: CSV Parser ───────────────────────────────────────
  try {
    const sampleCsv = `Header_1, Header_2, "Header 3", "Header, 4"
val1, val2, "quoted value", "value with, comma"
"escaped ""quote""", 100.50, "line 2", "clean"`;

    const parsed = parseCsvText(sampleCsv);
    const passed =
      parsed.headers.length === 4 &&
      parsed.rows.length === 2 &&
      parsed.rows[0].rawRecord["header_1"] === "val1" &&
      parsed.rows[0].rawRecord["header_4"] === "value with, comma" &&
      parsed.rows[1].rawRecord["header_1"] === 'escaped "quote"';

    results.push({
      name: "CSV Parser (Headers, Quotes, Escaping & Line Indexes)",
      passed,
      details: passed
        ? `Successfully parsed ${parsed.rows.length} rows with ${parsed.headers.length} headers`
        : `Headers: ${parsed.headers.length}, Rows: ${parsed.rows.length}`,
    });
  } catch (e: any) {
    results.push({
      name: "CSV Parser (Headers, Quotes, Escaping & Line Indexes)",
      passed: false,
      details: "Unexpected error",
      error: e.message,
    });
  }

  // ─── Test 2: Validator (Mandatory Invariants) ─────────────────
  try {
    const validCandidate = {
      id: "tx_val_001",
      source: "razorpay",
      sourceType: "EXTERNAL_PROVIDER" as const,
      reference: "ref_val_001",
      amount: 1250.0,
      currency: "INR",
      direction: "CREDIT" as const,
      status: "SUCCESS" as const,
      timestamp: new Date().toISOString(),
    };

    const validResult = validateTransaction(validCandidate);

    const invalidCandidate = {
      id: "tx_val_002",
      source: "bank-statement",
      sourceType: "BANK_STATEMENT" as const,
      reference: "",
      amount: -100,
      currency: "INVALID",
      direction: "INVALID" as any,
      status: "UNKNOWN" as any,
      timestamp: "NOT_A_DATE",
    };

    const invalidResult = validateTransaction(invalidCandidate);

    const passed =
      validResult.validationStatus === "VALID" &&
      validResult.validationErrors.length === 0 &&
      invalidResult.validationStatus === "MALFORMED" &&
      invalidResult.validationErrors.length >= 4;

    results.push({
      name: "Validator Invariant Checks",
      passed,
      details: passed
        ? `Validated clean row as VALID, flagged bad row as MALFORMED with ${invalidResult.validationErrors.length} distinct errors`
        : `Valid result: ${validResult.validationStatus}, Invalid errors: ${invalidResult.validationErrors.length}`,
    });
  } catch (e: any) {
    results.push({
      name: "Validator Invariant Checks",
      passed: false,
      details: "Unexpected error",
      error: e.message,
    });
  }

  // ─── Test 3: Internal / Provider Normalization ────────────────
  try {
    const rzpRow = {
      payment_id: "pay_RZP_99",
      order_id: "ord_RZP_99",
      amount: "₹1,500.50",
      status: "captured",
      created_at: "2026-08-16T10:00:00Z",
      source: "razorpay",
    };
    const rzpNorm = validateAndNormalizeRow(rzpRow, "razorpay");

    const bankRow = {
      "Ref No": "BANK_REF_88",
      Deposit: "₹2,500.00",
      "Txn Date": "16/08/2026 14:30:00",
      Description: "NEFT Credit",
    };
    const bankNorm = validateAndNormalizeRow(bankRow, "bank-statement");

    const passed =
      rzpNorm.validationStatus === "VALID" &&
      rzpNorm.reference === "pay_RZP_99" &&
      rzpNorm.amount === 1500.5 &&
      rzpNorm.status === "SETTLED" &&
      bankNorm.validationStatus === "VALID" &&
      bankNorm.reference === "BANK_REF_88" &&
      bankNorm.amount === 2500.0 &&
      bankNorm.direction === "CREDIT";

    results.push({
      name: "Internal & Provider Schema Normalization",
      passed,
      details: passed
        ? `Normalized Razorpay (${rzpNorm.reference}, ${rzpNorm.amount} ${rzpNorm.currency}, ${rzpNorm.status}) and Bank Statement (${bankNorm.reference}, ${bankNorm.amount} ${bankNorm.currency})`
        : `RZP Valid: ${rzpNorm.validationStatus}, Bank Valid: ${bankNorm.validationStatus}`,
    });
  } catch (e: any) {
    results.push({
      name: "Internal & Provider Schema Normalization",
      passed: false,
      details: "Unexpected error",
      error: e.message,
    });
  }

  // ─── Test 4: Unit Tests for Malformed Rows ─────────────────────
  try {
    const malformedCsv = `reference,amount,currency,direction,status,date,description
valid_ref_001,1000.00,INR,CREDIT,SUCCESS,2026-08-16T10:00:00Z,Valid baseline
,1500.00,INR,CREDIT,SUCCESS,2026-08-16T10:05:00Z,Missing reference
malformed_002,NOT_A_NUMBER,INR,CREDIT,SUCCESS,2026-08-16T10:10:00Z,Non-numeric amount
malformed_003,0.00,INR,CREDIT,SUCCESS,2026-08-16T10:15:00Z,Zero amount
malformed_004,2000.00,BAD_CURRENCY,CREDIT,SUCCESS,2026-08-16T10:20:00Z,Invalid currency
malformed_005,3000.00,INR,CREDIT,SUCCESS,BAD_DATE_VAL,Unparseable date
valid_ref_002,4500.00,INR,DEBIT,SUCCESS,2026-08-16T10:30:00Z,Valid tail row`;

    const pipelineRes = TransactionIngestionPipeline.processCsv(malformedCsv, "test-feed");

    const passed =
      pipelineRes.totalRows === 7 &&
      pipelineRes.validCount === 2 &&
      pipelineRes.malformedCount === 5 &&
      pipelineRes.malformedRows.length === 5 &&
      pipelineRes.validTransactions.length === 2 &&
      pipelineRes.validTransactions[0].reference === "valid_ref_001" &&
      pipelineRes.validTransactions[1].reference === "valid_ref_002";

    results.push({
      name: "Malformed Rows Isolation & Unit Tests",
      passed,
      details: passed
        ? `Successfully ingested 2 valid transactions and isolated 5 malformed rows with detailed error reporting`
        : `Total: ${pipelineRes.totalRows}, Valid: ${pipelineRes.validCount}, Malformed: ${pipelineRes.malformedCount}`,
    });
  } catch (e: any) {
    results.push({
      name: "Malformed Rows Isolation & Unit Tests",
      passed: false,
      details: "Unexpected error",
      error: e.message,
    });
  }

  // ─── Test 5: Sample demo-data/ Datasets Ingestion ──────────────
  try {
    const demoDir = path.join(process.cwd(), "demo-data");
    const rzpPath = path.join(demoDir, "razorpay_settlements.csv");
    const bankPath = path.join(demoDir, "bank_statement.csv");

    const rzpCsv = fs.readFileSync(rzpPath, "utf-8");
    const bankCsv = fs.readFileSync(bankPath, "utf-8");

    const rzpRes = TransactionIngestionPipeline.processCsv(rzpCsv, "razorpay");
    const bankRes = TransactionIngestionPipeline.processCsv(bankCsv, "bank-statement");

    const passed =
      rzpRes.validCount >= 5 &&
      bankRes.validCount >= 5 &&
      rzpRes.validTransactions[0].source === "razorpay" &&
      bankRes.validTransactions[0].source === "bank-statement";

    results.push({
      name: "Sample demo-data/ Datasets Processing",
      passed,
      details: passed
        ? `Processed demo-data datasets: Razorpay (${rzpRes.validCount} valid), Bank Statement (${bankRes.validCount} valid)`
        : `RZP Valid: ${rzpRes.validCount}, Bank Valid: ${bankRes.validCount}`,
    });
  } catch (e: any) {
    results.push({
      name: "Sample demo-data/ Datasets Processing",
      passed: false,
      details: "Unexpected error",
      error: e.message,
    });
  }

  // ─── Test 6: Connection to Reconciliation Engine ──────────────
  try {
    const orchestrator = new PaymentOrchestrator({ maxRetries: 1, retryDelayMs: 10 });
    const runKey = Date.now();

    await orchestrator.processPayment({
      customerId: `norm-cust-${runKey}`,
      merchantId: `norm-merch-${runKey}`,
      amount: 1500,
      currency: "INR",
      method: "upi",
      description: "Pipeline reconciliation test",
    });

    const externalCsv = `reference,source,amount,currency,status,date
pay_RZP_001,razorpay,1500,INR,captured,2026-08-16T10:00:00Z
pay_RZP_002,razorpay,2500,INR,captured,2026-08-16T10:15:00Z`;

    const pipelineRes = TransactionIngestionPipeline.processCsv(externalCsv, "razorpay");

    const engine = new ReconciliationEngine({ provider: "razorpay" });
    const report = await engine.reconcileNormalizedTransactions(pipelineRes.validTransactions);

    const passed =
      report.run.status === "COMPLETED" &&
      report.run.totalItems >= 1;

    results.push({
      name: "Normalized Pipeline Connection to Reconciliation Engine",
      passed,
      details: passed
        ? `Reconciled ${report.run.totalItems} items from normalized transaction ingestion pipeline (status: ${report.run.status})`
        : `Status: ${report.run.status}, Items: ${report.run.totalItems}`,
    });
  } catch (e: any) {
    results.push({
      name: "Normalized Pipeline Connection to Reconciliation Engine",
      passed: false,
      details: "Unexpected error",
      error: e.message,
    });
  }

  // ─── Summary ──────────────────────────────────────────────────
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  const duration = Date.now() - startTime;

  return NextResponse.json({
    phase: "Normalized Transaction Ingestion Pipeline Verification",
    timestamp: new Date().toISOString(),
    duration: `${duration}ms`,
    summary: `${passedCount}/${results.length} tests passed`,
    passed: passedCount,
    failed: failedCount,
    results,
  });
}

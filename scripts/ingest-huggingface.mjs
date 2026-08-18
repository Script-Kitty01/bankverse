/**
 * BankVerse — Hugging Face Transaction Dataset Ingestor
 *
 * Downloads real banking transaction datasets directly from Hugging Face Hub:
 * 1. alokkulkarni/financial_Transactions
 * 2. Andyrasika/bank_transactions
 *
 * Transforms CSV records into transaction logs, posts them to /api/logs/ingest,
 * and prints detailed ingestion, classification, and auto-solve statistics.
 */

const BASE_URL = process.env.TEST_URL || "http://localhost:3000";

const HF_DATASETS = [
  {
    name: "alokkulkarni/financial_Transactions",
    url: "https://huggingface.co/datasets/alokkulkarni/financial_Transactions/raw/main/transactions.csv",
    source: "huggingface:financial_transactions",
  },
  {
    name: "Andyrasika/bank_transactions",
    url: "https://huggingface.co/datasets/Andyrasika/bank_transactions/raw/main/labelled_transactions.csv",
    source: "huggingface:bank_transactions",
  },
];

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^["']|["']$/g, ""));
    const record = {};
    headers.forEach((header, idx) => {
      if (values[idx] !== undefined) record[header] = values[idx];
    });
    if (Object.keys(record).length > 0) records.push(record);
  }
  return records;
}

async function runHuggingFaceIngestion() {
  console.log("\n=======================================================");
  console.log("🤗 BankVerse Hugging Face Dataset Ingestion Pipeline");
  console.log("=======================================================\n");

  for (const ds of HF_DATASETS) {
    console.log(`📡 Fetching Hugging Face dataset: [${ds.name}]...`);
    console.log(`   URL: ${ds.url}`);

    try {
      const response = await fetch(ds.url);
      if (!response.ok) {
        console.log(`   ❌ Download error: HTTP ${response.status}`);
        continue;
      }

      const csvText = await response.text();
      const records = parseCsv(csvText);
      console.log(`   ✅ Downloaded ${records.length} raw records from Hugging Face.`);

      const formattedLogs = records.slice(0, 50).map((row, idx) => {
        const amountStr = row["Amount"] || row["Transaction value (£)"] || row["Transaction value ()"] || "100";
        const amount = parseFloat(amountStr.toString().replace(/[^0-9.-]/g, "")) || 100;
        const ref = row["Account"] || row["Supplier"] ? `${row["Account"] || row["Supplier"]}_${idx}` : `hf_ref_${Date.now()}_${idx}`;
        const desc = row["Description"] || row["Classification"] || "Hugging Face Transaction";

        const faultStatuses = [
          "504_gateway_timeout",
          "amount_mismatch_delta",
          "double_charge_detected",
          "debit_without_credit",
          "out_of_order_webhook",
          "503_service_unavailable",
          "bulk_mismatch_batch",
          "worker_crash_post_commit",
          "refund_before_capture",
          "completed_settled",
        ];
        const status = faultStatuses[idx % faultStatuses.length];

        return {
          reference: ref,
          source: ds.source,
          sourceType: "BANK_STATEMENT",
          amount: Math.abs(amount),
          currency: "INR",
          status: status,
          description: `${desc} [${row["Category"] || row["Classification"] || "General"}]`,
          timestamp: new Date().toISOString(),
        };
      });

      console.log(`   🚀 Ingesting batch of ${formattedLogs.length} logs into BankVerse...`);
      const ingestRes = await fetch(`${BASE_URL}/api/logs/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: ds.source,
          sourceType: "BANK_STATEMENT",
          rawFormat: "JSON",
          payload: formattedLogs,
        }),
      });

      const ingestData = await ingestRes.json();
      if (ingestData.success) {
        const r = ingestData.result;
        console.log(`   ✨ Ingestion complete for [${ds.name}]:`);
        console.log(`      Batch ID:      ${r.batchId}`);
        console.log(`      Accepted:      ${r.accepted}`);
        console.log(`      Auto-Solved:   ${r.autoSolved}`);
        console.log(`      Unresolved:    ${r.unresolved}`);
        console.log(`      Duplicates:    ${r.duplicates}`);
      } else {
        console.log(`   ❌ Ingestion API error: ${ingestData.error}`);
      }
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
    console.log("");
  }

  console.log("-------------------------------------------------------");
  console.log("📊 Overall Pipeline Ingestion Summary & Metrics");
  console.log("-------------------------------------------------------");

  try {
    const statsRes = await fetch(`${BASE_URL}/api/logs/stats`);
    const statsData = await statsRes.json();

    if (statsData.success) {
      const s = statsData.stats;
      console.log(`Total Ingested Store Logs:  ${s.totalIngested}`);
      console.log(`Total Accepted Logs:        ${s.acceptedCount}`);
      console.log(`Auto-Solved Rate:           ${(s.autoSolveRate * 100).toFixed(1)}% (${s.autoSolvedCount} logs)`);
      console.log(`Unresolved / Flagged:       ${s.unresolvedCount}`);
      console.log(`Duplicates Blocked:         ${s.duplicateCount}`);
      console.log("\nFault Distribution Across 9 Categories:");
      console.dir(s.byCategory, { depth: null });
      console.log("\nSource Distribution:");
      console.dir(s.bySource, { depth: null });
    }
  } catch (e) {
    console.log("Could not fetch global stats:", e.message);
  }

  console.log("=======================================================\n");
}

runHuggingFaceIngestion();

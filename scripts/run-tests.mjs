/**
 * BankVerse Test Runner — CLI harness
 * Runs all verification checks across 6 phases against local server or in-process.
 */

import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.NEXT_PUBLIC_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE || "true";

const BASE_URL = process.env.TEST_URL || "http://localhost:3000";

const ENDPOINTS = [
  {
    name: "Phase 1: Ledger & Balance Invariants",
    path: "/api/test-ledger",
    file: "./app/api/test-ledger/route.ts",
  },
  {
    name: "Phase 2: State Machine & OCC Concurrent Race",
    path: "/api/test-payment",
    file: "./app/api/test-payment/route.ts",
  },
  {
    name: "Phase 3: Internal/External Reconciliation",
    path: "/api/test-reconciliation",
    file: "./app/api/test-reconciliation/route.ts",
  },
  {
    name: "Phase 4: Fault Injection & Chaos Scenarios",
    path: "/api/test-chaos",
    file: "./app/api/test-chaos/route.ts",
  },
  {
    name: "Phase 5: Incident Detection & Operations",
    path: "/api/test-operations",
    file: "./app/api/test-operations/route.ts",
  },
  {
    name: "Phase 6: Transaction Log Ingestion & Auto-Solve Engine",
    path: "/api/test-ingest",
    file: "./app/api/test-ingest/route.ts",
  },
  {
    name: "Phase 7: Normalized Transaction Ingestion Pipeline",
    path: "/api/test-normalized-ingest",
    file: "./app/api/test-normalized-ingest/route.ts",
  },
  {
    name: "E2E: DEBIT_WITHOUT_MERCHANT_SETTLEMENT Recovery Lifecycle",
    path: "/api/test-debit-without-credit",
    file: "./app/api/test-debit-without-credit/route.ts",
  },
  {
    name: "Phase 9: NPCI Settlement Reconciliation",
    path: "/api/test-npci-settlement",
    file: "./app/api/test-npci-settlement/route.ts",
  },
  {
    name: "Phase 10: Credit Line Engine (UPI Credit Card)",
    path: "/api/test-credit",
    file: "./app/api/test-credit/route.ts",
  },
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

async function runInProcess(filePath) {
  const root = process.cwd();
  const jiti = require("jiti")(path.join(root, "package.json"), {
    alias: { "@": root },
  });
  const route = jiti(filePath);
  const response = await route.GET();
  return await response.json();
}

async function run() {
  console.log("\n=======================================================");
  console.log("🏦 BankVerse Verification Test Suite");
  console.log("=======================================================\n");

  let totalPassed = 0;
  let totalFailed = 0;

  for (const ep of ENDPOINTS) {
    console.log(`▶ Running ${ep.name} (${ep.path})...`);
    let res;
    try {
      res = await fetchJson(`${BASE_URL}${ep.path}`);
    } catch {
      // Fallback to in-process execution if HTTP server is not running
      try {
        res = await runInProcess(ep.file);
      } catch (inProcErr) {
        console.log(
          `  ❌ [FAIL] ${ep.name}: Execution error - ${inProcErr.message}`,
        );
        totalFailed++;
        console.log("");
        continue;
      }
    }

    let testList = [];
    if (Array.isArray(res.results)) {
      testList = res.results;
    } else if (res.results && typeof res.results === "object") {
      testList = Object.values(res.results).map((item) => ({
        name: item.name,
        passed: item.passed,
        details: item.actualBehavior || item.details || item.error,
      }));
    }

    if (testList.length > 0) {
      for (const test of testList) {
        if (test.passed) {
          console.log(`  ✅ [PASS] ${test.name}`);
          totalPassed++;
        } else {
          console.log(
            `  ❌ [FAIL] ${test.name}: ${test.details || test.error || "Failed"}`,
          );
          totalFailed++;
        }
      }
    } else if (res.passed !== undefined) {
      if (res.passed) {
        console.log(`  ✅ [PASS] ${ep.name}`);
        totalPassed++;
      } else {
        console.log(`  ❌ [FAIL] ${ep.name}`);
        totalFailed++;
      }
    } else {
      console.log(
        `  ℹ️ Completed ${ep.name}: ${res.summary || JSON.stringify(res)}`,
      );
      totalPassed++;
    }
    console.log("");
  }

  console.log("-------------------------------------------------------");
  console.log(
    `Total Verification Runs: ${totalPassed} passed, ${totalFailed} failed.`,
  );
  console.log("=======================================================\n");

  if (totalFailed > 0) {
    process.exit(1);
  }
}

run();

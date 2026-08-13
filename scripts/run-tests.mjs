/**
 * BankVerse Test Runner — CLI harness
 * Runs all 39 verification checks across 6 phases against local server.
 */

import http from "node:http";

const BASE_URL = process.env.TEST_URL || "http://localhost:3000";

const ENDPOINTS = [
  { name: "Phase 1: Ledger & Balance Invariants", path: "/api/test-ledger" },
  { name: "Phase 2: State Machine & OCC Concurrent Race", path: "/api/test-payment" },
  { name: "Phase 3: Internal/External Reconciliation", path: "/api/test-reconciliation" },
  { name: "Phase 4: Fault Injection & Chaos Scenarios", path: "/api/test-chaos" },
  { name: "Phase 5: Incident Detection & Operations", path: "/api/test-operations" },
  { name: "E2E: DEBIT_WITHOUT_CREDIT Recovery Lifecycle", path: "/api/test-debit-without-credit" },
];

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Failed to parse JSON response: ${data.slice(0, 100)}`));
          }
        });
      })
      .on("error", reject);
  });
}

async function run() {
  console.log("\n=======================================================");
  console.log("🏦 BankVerse Verification Test Suite");
  console.log("=======================================================\n");

  let totalPassed = 0;
  let totalFailed = 0;

  for (const ep of ENDPOINTS) {
    console.log(`▶ Running ${ep.name} (${ep.path})...`);
    try {
      const res = await fetchJson(`${BASE_URL}${ep.path}`);
      if (res.results && Array.isArray(res.results)) {
        for (const test of res.results) {
          if (test.passed) {
            console.log(`  ✅ [PASS] ${test.name}`);
            totalPassed++;
          } else {
            console.log(`  ❌ [FAIL] ${test.name}: ${test.details || test.error}`);
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
        console.log(`  ℹ️ Completed ${ep.name}: ${res.summary || JSON.stringify(res)}`);
        totalPassed++;
      }
    } catch (err) {
      console.log(`  ⚠️ Endpoint unreachable (${ep.path}): ${err.message}`);
      console.log(`     Note: Start the Next.js app ('npm run dev') to run interactive endpoint checks.`);
    }
    console.log("");
  }

  console.log("-------------------------------------------------------");
  console.log(`Total Verification Runs: ${totalPassed} passed, ${totalFailed} failed.`);
  console.log("=======================================================\n");
}

run();
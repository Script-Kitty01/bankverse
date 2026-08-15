import { chromium } from "playwright";

const BASE_URL = process.env.TEST_URL || "https://bankverse.vercel.app";

async function run() {
  console.log("==================================================");
  console.log("🏦 Running Live Site E2E Verification via Playwright against " + BASE_URL);
  console.log("==================================================\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Test 1: Page Navigation
  const routes = [
    "/sign-in",
    "/sign-up",
    "/api/health"
  ];

  console.log("1. Checking page routes & status codes...");
  for (const route of routes) {
    const res = await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
    console.log(`   Route: ${route} -> Status: ${res ? res.status() : 'N/A'}, Title: "${await page.title()}"`);
  }

  // Test 2: Verification APIs
  const testEndpoints = [
    "/api/test-ledger",
    "/api/test-payment",
    "/api/test-reconciliation",
    "/api/test-chaos",
    "/api/test-operations",
    "/api/test-debit-without-credit"
  ];

  console.log("\n2. Checking Live Verification Test Endpoints...");
  let totalPassed = 0;
  let totalFailed = 0;

  for (const ep of testEndpoints) {
    try {
      const res = await page.request.get(`${BASE_URL}${ep}`);
      const json = await res.json();
      const passedCount = json.passed ?? json.summary ?? "OK";
      const failedCount = json.failed ?? 0;

      if (typeof json.passed === "number") {
        totalPassed += json.passed;
        totalFailed += json.failed || 0;
      } else if (json.passed === true) {
        totalPassed++;
      }

      console.log(`   API ${ep}: HTTP ${res.status()} -> Summary: ${json.summary || json.test || 'OK'}`);
    } catch (e) {
      console.log(`   API ${ep} Error:`, e.message);
      totalFailed++;
    }
  }

  await browser.close();

  console.log("\n--------------------------------------------------");
  console.log(`Live Site Test Completion. Total Passes: ${totalPassed}, Total Failures: ${totalFailed}`);
  console.log("==================================================");

  if (totalFailed > 0) {
    process.exit(1);
  }
}

run().catch(console.error);

import { chromium } from "playwright";
import fs from "fs";

const BASE_URL = "https://bankverse.vercel.app";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const endpoints = [
    "/api/test-payment",
    "/api/test-reconciliation",
    "/api/test-chaos",
  ];

  for (const ep of endpoints) {
    console.log(`\n==================================================`);
    console.log(`FULL TEST RESULTS FOR: ${ep}`);
    console.log(`==================================================`);
    const res = await page.request.get(`${BASE_URL}${ep}`);
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
  }

  await browser.close();
}

run().catch(console.error);

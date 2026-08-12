/**
 * BankVerse — Phase 4: Chaos Lab Verification
 *
 * GET /api/test-chaos — Runs all chaos scenarios and reports results.
 */

import { NextResponse } from "next/server";
import { ChaosInjector } from "@/lib/chaos/injector";
import { CHAOS_SCENARIOS } from "@/lib/chaos/scenarios";

export async function GET() {
  const results: Record<string, any> = {};
  let passed = 0;
  let failed = 0;

  for (const scenario of CHAOS_SCENARIOS) {
    const result = await ChaosInjector.runScenario(scenario.id);
    results[scenario.id] = {
      name: scenario.name,
      severity: scenario.severity,
      passed: result.passed,
      actualBehavior: result.actualBehavior,
      duration: result.duration,
    };
    if (result.passed) passed++;
    else failed++;
  }

  return NextResponse.json({
    phase: 4,
    name: "Chaos Lab",
    total: CHAOS_SCENARIOS.length,
    passed,
    failed,
    passRate: CHAOS_SCENARIOS.length > 0 ? passed / CHAOS_SCENARIOS.length : 0,
    results,
  });
}

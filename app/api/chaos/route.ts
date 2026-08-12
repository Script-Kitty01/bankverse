/**
 * BankVerse — Chaos Lab API
 *
 * GET  /api/chaos          — List scenarios or get latest report
 * POST /api/chaos          — Run a scenario or full suite
 */

import { NextResponse } from "next/server";
import { ChaosInjector } from "@/lib/chaos/injector";
import { CHAOS_SCENARIOS } from "@/lib/chaos/scenarios";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "scenarios";

  switch (action) {
    case "report":
      const report = ChaosInjector.getLatestReport();
      return NextResponse.json({ success: true, report });

    case "active":
      const active = ChaosInjector.getActiveInjections();
      return NextResponse.json({ success: true, active });

    case "scenarios":
    default:
      return NextResponse.json({
        success: true,
        scenarios: CHAOS_SCENARIOS.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          severity: s.severity,
          injectDescription: s.injectDescription,
          expectedBehavior: s.expectedBehavior,
        })),
      });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scenarioId, action } = body;

    switch (action) {
      case "run-all":
        const report = await ChaosInjector.runFullSuite();
        return NextResponse.json({ success: true, report });

      case "run":
      default:
        if (!scenarioId) {
          return NextResponse.json(
            { success: false, error: "scenarioId is required" },
            { status: 400 },
          );
        }

        const scenario = CHAOS_SCENARIOS.find((s) => s.id === scenarioId);
        if (!scenario) {
          return NextResponse.json(
            { success: false, error: `Unknown scenario: ${scenarioId}` },
            { status: 404 },
          );
        }

        const result = await ChaosInjector.runScenario(scenarioId);
        return NextResponse.json({ success: true, result });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

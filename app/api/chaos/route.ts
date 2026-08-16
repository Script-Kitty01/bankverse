/**
 * BankVerse — Chaos Lab API
 *
 * GET  /api/chaos          — List scenarios or get latest report
 * POST /api/chaos          — Run a scenario or full suite
 */

import { NextResponse } from "next/server";
import { ChaosInjector } from "@/lib/chaos/injector";
import { CHAOS_SCENARIOS, type ChaosScenarioDef, addCustomScenario } from "@/lib/chaos/scenarios";
import { readJsonBody } from "@/lib/security/request";
import {
  isOpsRequestAuthorized,
  unauthorizedResponse,
} from "@/lib/security/ops-auth";

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
  // SRE: reject anonymous fault injection unless demo mode is enabled.
  if (!isOpsRequestAuthorized(request)) {
    return unauthorizedResponse();
  }

  try {
    const parsedBody = await readJsonBody<{
      action?: string;
      scenarioId?: string;
      // create-custom fields
      name?: string;
      description?: string;
      severity?: string;
      injectDescription?: string;
      expectedBehavior?: string;
      invariant?: string;
      failureType?: string;
      latencyMs?: number | string;
      failureRate?: number | string;
    }>(request);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { success: false, error: parsedBody.error },
        { status: 400 },
      );
    }

    const { scenarioId, action } = parsedBody.data;

    switch (action) {
      case "run-all":
        const report = await ChaosInjector.runFullSuite();
        return NextResponse.json({ success: true, report });

      case "create-custom": {
        const {
          name,
          description,
          severity,
          injectDescription,
          expectedBehavior,
          invariant,
          failureType,
          latencyMs,
          failureRate,
        } = parsedBody.data;

        // Validate severity against the known enum; reject unknown values.
        const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
        const sanitizedSeverity = VALID_SEVERITIES.includes(severity || "")
          ? (severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")
          : "HIGH";

        const id = `custom-${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const customDef = {
          id,
          name: name || "Custom Chaos Scenario",
          description: description || "User-configured custom failure injection scenario",
          severity: sanitizedSeverity,
          injectDescription: injectDescription || `Simulates ${failureType || "custom"} failure mode`,
          expectedBehavior: expectedBehavior || "System maintains financial invariants and logs anomaly",
          invariant: invariant || "SUM(debits) === SUM(credits) remains true",
          failureType: failureType as ChaosScenarioDef["failureType"],
          latencyMs: Number(latencyMs) || 300,
          failureRate: Number(failureRate) || 0,
        } satisfies ChaosScenarioDef;

        addCustomScenario(customDef);
        const result = await ChaosInjector.runScenario(id);
        return NextResponse.json({ success: true, scenario: customDef, result });
      }

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

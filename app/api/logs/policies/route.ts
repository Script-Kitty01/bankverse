/**
 * BankVerse — Auto-Solve Policies API
 *
 * GET  /api/logs/policies — Fetch the 9 category policies & toggles
 * POST /api/logs/policies — Update policy toggle for a category
 */

import { NextResponse } from "next/server";
import { getPolicies, updatePolicy, resetPolicies } from "@/lib/ingestion/policies";
import { readJsonBody } from "@/lib/security/request";
import type { ChaosCategory } from "@/lib/ingestion/types";

export async function GET() {
  return NextResponse.json({
    success: true,
    policies: getPolicies(),
  });
}

export async function POST(request: Request) {
  try {
    const parsed = await readJsonBody<{
      action?: string;
      categoryId?: ChaosCategory;
      enabled?: boolean;
    }>(request);

    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: 400 },
      );
    }

    const { action, categoryId, enabled } = parsed.data;

    if (action === "reset") {
      resetPolicies();
      return NextResponse.json({
        success: true,
        message: "Policies reset to defaults",
        policies: getPolicies(),
      });
    }

    if (!categoryId || enabled === undefined) {
      return NextResponse.json(
        { success: false, error: "categoryId and enabled boolean required" },
        { status: 400 },
      );
    }

    const updated = updatePolicy(categoryId, enabled);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: `Invalid categoryId: ${categoryId}` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      policy: updated,
      policies: getPolicies(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update policy" },
      { status: 500 },
    );
  }
}

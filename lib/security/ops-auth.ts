/**
 * BankVerse — Operational API Authorization Guard
 *
 * SRE hardening: prevents anonymous mutation of operational control surfaces
 * (incident resolution, reconciliation triggers, chaos injection).
 *
 * Behavior:
 *  - Demo mode (`NEXT_PUBLIC_DEMO_MODE=true`): open access (local exploration).
 *  - Otherwise: requires `x-ops-admin-key` header matching the
 *    `OPS_ADMIN_KEY` env var. Failures return HTTP 401.
 */
import { NextResponse } from "next/server";

const OPS_ADMIN_HEADER = "x-ops-admin-key";

export function isOpsRequestAuthorized(request: Request): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return true;
  }

  const adminKey = process.env.OPS_ADMIN_KEY;
  if (!adminKey) {
    // Misconfiguration — fail closed rather than allowing unauthenticated access.
    console.error(
      "[OpsAuth] OPS_ADMIN_KEY is not configured. Rejecting operational request.",
    );
    return false;
  }

  const provided = request.headers.get(OPS_ADMIN_HEADER) || "";
  return provided === adminKey;
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { success: false, error: "Unauthorized: admin key required" },
    { status: 401 },
  );
}
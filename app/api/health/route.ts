import { NextResponse } from "next/server";

/**
 * Health check endpoint for monitoring and load balancers.
 * GET /api/health
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
    },
    { status: 200 }
  );
}

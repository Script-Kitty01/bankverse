import { NextResponse } from "next/server";
import { generateDataset } from "@/lib/risk/dataset";
import { detectRings } from "@/lib/risk/rings";

export async function GET() {
  return NextResponse.json({ rings: detectRings(generateDataset()) });
}
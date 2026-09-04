import { NextResponse } from "next/server";
import { generateDataset } from "@/lib/risk/dataset";
import { trainDetector } from "@/lib/risk/metrics";

export async function POST(request: Request) {
  const payload = await request.json();
  const history = generateDataset().slice(0, 900);
  const transaction = { ...history[0], ...payload, id: "live_risk_transaction", isFraud: false, fraudPattern: "LEGITIMATE" as const };
  return NextResponse.json(trainDetector(history).score(transaction, history));
}
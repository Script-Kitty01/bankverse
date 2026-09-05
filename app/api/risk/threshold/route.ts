import { NextResponse } from "next/server";
import { generateDataset, stratifiedSplit } from "@/lib/risk/dataset";
import {
  DEFAULT_COSTS,
  evaluateThreshold,
  trainDetector,
} from "@/lib/risk/metrics";

export async function POST(request: Request) {
  const body = (await request.json()) as { threshold?: number };
  if (
    typeof body.threshold !== "number" ||
    body.threshold < 0 ||
    body.threshold > 1
  ) {
    return NextResponse.json(
      { error: "threshold must be a number between 0 and 1" },
      { status: 400 },
    );
  }

  const split = stratifiedSplit(generateDataset());
  const metrics = evaluateThreshold(
    trainDetector(split.train),
    split.test,
    body.threshold,
    DEFAULT_COSTS,
    split.train,
  );
  return NextResponse.json({
    ...metrics,
    costs: DEFAULT_COSTS,
    testCount: split.test.length,
  });
}

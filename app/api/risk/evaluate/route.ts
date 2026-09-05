import { NextResponse } from "next/server";
import { generateDataset, stratifiedSplit } from "@/lib/risk/dataset";
import {
  evaluateThreshold,
  trainDetector,
  DEFAULT_COSTS,
} from "@/lib/risk/metrics";

export async function GET() {
  const split = stratifiedSplit(generateDataset());
  const detector = trainDetector(split.train);
  const thresholds = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((threshold) =>
    evaluateThreshold(detector, split.test, threshold, undefined, split.train),
  );
  const optimal = thresholds.reduce((best, current) =>
    current.expectedCostInr < best.expectedCostInr ? current : best,
  );
  return NextResponse.json({
    seed: split.seed,
    trainCount: split.train.length,
    testCount: split.test.length,
    sourceDatasetSize: split.train.length + split.test.length,
    fraudCount: split.test.filter((item) => item.isFraud).length,
    costs: DEFAULT_COSTS,
    optimal,
    thresholds,
  });
}

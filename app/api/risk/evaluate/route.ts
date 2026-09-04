import { NextResponse } from "next/server";
import { generateDataset, stratifiedSplit } from "@/lib/risk/dataset";
import { evaluateThreshold, trainDetector, DEFAULT_COSTS } from "@/lib/risk/metrics";

export async function GET() {
  const split = stratifiedSplit(generateDataset());
  const sample = (items: typeof split.train, size: number) => [
    ...items.filter((item) => item.isFraud),
    ...items.filter((item) => !item.isFraud).slice(0, size),
  ].slice(0, size);
  const trainSample = sample(split.train, 1800);
  const testSample = sample(split.test, 900);
  const detector = trainDetector(trainSample);
  const thresholds = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((threshold) => evaluateThreshold(detector, testSample, threshold));
  const optimal = thresholds.reduce((best, current) => current.expectedCostInr < best.expectedCostInr ? current : best);
  return NextResponse.json({ seed: split.seed, trainCount: trainSample.length, testCount: testSample.length, sourceDatasetSize: split.train.length + split.test.length, fraudCount: testSample.filter((item) => item.isFraud).length, costs: DEFAULT_COSTS, optimal, thresholds });
}
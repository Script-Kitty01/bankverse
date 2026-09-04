import { NextResponse } from "next/server";
import { generateDataset, stratifiedSplit } from "@/lib/risk/dataset";
import { extractFeatures } from "@/lib/risk/features";
import { evaluateThreshold, trainDetector } from "@/lib/risk/metrics";

export async function GET() {
  const first = generateDataset();
  const second = generateDataset();
  const split = stratifiedSplit(first);
  const sameSeedIsDeterministic =
    JSON.stringify(first) === JSON.stringify(second);
  const noOverlap =
    new Set(split.train.map((item) => item.id)).size +
      new Set(split.test.map((item) => item.id)).size ===
    first.length;
  const fraudCount = first.filter((item) => item.isFraud).length;
  const sampledTrain = [...split.train.filter((item) => item.isFraud), ...split.train.filter((item) => !item.isFraud).slice(0, 1800)];
  const sampledTest = [...split.test.filter((item) => item.isFraud), ...split.test.filter((item) => !item.isFraud).slice(0, 900)];
  const reference = first[500];
  const causalBefore = extractFeatures(reference, first.slice(0, 500));
  const causalAfter = extractFeatures(reference, first);
  const noFutureLeakage =
    JSON.stringify(causalBefore) === JSON.stringify(causalAfter);
  const detector = trainDetector(sampledTrain, 0, 0.8);
  const suspicious = first.find(
    (item) => item.fraudPattern === "CARD_TESTING",
  )!;
  const burstHistory = Array.from({ length: 9 }, (_, index) => ({
    ...suspicious,
    id: `fixture_${index}`,
    timestamp: new Date(
      Date.parse(suspicious.timestamp) - (9 - index) * 60 * 1000,
    ).toISOString(),
    amount: 10,
  }));
  const score = detector.score(suspicious, burstHistory);
  const evaluation = evaluateThreshold(trainDetector(sampledTrain), sampledTest, 0.5);
  const explainableScore =
    score.decision !== "ALLOW" &&
    score.triggeredRules.length > 0 &&
    score.topContributingFeatures.length > 0;
  const passed =
    sameSeedIsDeterministic &&
    noOverlap &&
    noFutureLeakage &&
    explainableScore &&
    evaluation.truePositive + evaluation.falseNegative ===
      sampledTest.filter((item) => item.isFraud).length &&
    fraudCount === 360 &&
    split.train.length + split.test.length === first.length;

  return NextResponse.json(
    {
      phase: "risk-foundation",
      passed,
      checks: {
        sameSeedIsDeterministic,
        noOverlap,
        noFutureLeakage,
        explainableScore,
        decision: score.decision,
        modelProbability: score.modelProbability,
        triggeredRuleCount: score.triggeredRules.length,
        topFeatureCount: score.topContributingFeatures.length,
        metricsComputed: evaluation.expectedCostInr >= 0,
        fraudCount,
        total: first.length,
      },
      split: { train: split.train.length, test: split.test.length },
    },
    { status: passed ? 200 : 500 },
  );
}

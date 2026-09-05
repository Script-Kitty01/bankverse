import { NextResponse } from "next/server";
import { generateDataset, stratifiedSplit } from "@/lib/risk/dataset";
import { extractFeatures } from "@/lib/risk/features";
import { evaluateThreshold, trainDetector } from "@/lib/risk/metrics";
import { detectRings } from "@/lib/risk/rings";

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
  const reference = first[500];
  const causalBefore = extractFeatures(reference, first.slice(0, 500));
  const causalAfter = extractFeatures(reference, first);
  const noFutureLeakage =
    JSON.stringify(causalBefore) === JSON.stringify(causalAfter);
  const detector = trainDetector(split.train, 0, 0.8);
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
  const evaluation = evaluateThreshold(
    trainDetector(split.train),
    split.test,
    0.5,
    undefined,
    split.train,
  );
  const ringFixture = Array.from({ length: 3 }, (_, index) => ({
    ...reference,
    id: `ring_fixture_${index}`,
    customerId: `ring_customer_${index}`,
    deviceId: "shared_ring_device",
    timestamp: new Date(
      Date.parse(reference.timestamp) + index * 10 * 60 * 1000,
    ).toISOString(),
    isFraud: index === 0,
  }));
  const relabeledRingFixture = ringFixture.map((item) => ({
    ...item,
    isFraud: false,
    fraudPattern: "LEGITIMATE" as const,
  }));
  const ringsWithLabels = detectRings(ringFixture);
  const ringsWithoutLabels = detectRings(relabeledRingFixture);
  const labelIndependentRings =
    JSON.stringify(ringsWithLabels) === JSON.stringify(ringsWithoutLabels);
  const explainableScore =
    score.decision !== "ALLOW" &&
    score.triggeredRules.length > 0 &&
    score.topContributingFeatures.length > 0;
  const passed =
    sameSeedIsDeterministic &&
    noOverlap &&
    noFutureLeakage &&
    labelIndependentRings &&
    explainableScore &&
    evaluation.truePositive + evaluation.falseNegative ===
      split.test.filter((item) => item.isFraud).length &&
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
        labelIndependentRings,
        explainableScore,
        decision: score.decision,
        modelProbability: score.modelProbability,
        triggeredRuleCount: score.triggeredRules.length,
        topFeatureCount: score.topContributingFeatures.length,
        metricsComputed: evaluation.expectedCostInr >= 0,
        fraudCount,
        total: first.length,
        evaluatedTestCount: split.test.length,
      },
      split: { train: split.train.length, test: split.test.length },
    },
    { status: passed ? 200 : 500 },
  );
}

import type { EvaluationMetrics, RiskTransaction } from "./types";
import { buildFeatureRows } from "./features";
import { RiskDetector } from "./detector";
import { LogisticRegression } from "./model";

export const DEFAULT_COSTS = { falsePositiveInr: 150, falseNegativeInr: 4500 };

export function evaluateThreshold(
  detector: RiskDetector,
  transactions: RiskTransaction[],
  threshold: number,
  costs = DEFAULT_COSTS,
): EvaluationMetrics {
  let truePositive = 0; let falsePositive = 0; let trueNegative = 0; let falseNegative = 0;
  const rows = buildFeatureRows(transactions);
  for (const { transaction, features } of rows) {
    const score = detector.scoreFeatures(transaction, features);
    const predicted = score.riskScore / 100 >= threshold;
    if (predicted && transaction.isFraud) truePositive++;
    else if (predicted) falsePositive++;
    else if (transaction.isFraud) falseNegative++;
    else trueNegative++;
  }
  const precision = truePositive / Math.max(1, truePositive + falsePositive);
  const recall = truePositive / Math.max(1, truePositive + falseNegative);
  return {
    threshold, truePositive, falsePositive, trueNegative, falseNegative, precision, recall,
    f1: 2 * precision * recall / Math.max(0.0001, precision + recall),
    falsePositiveRate: falsePositive / Math.max(1, falsePositive + trueNegative),
    expectedCostInr: falsePositive * costs.falsePositiveInr + falseNegative * costs.falseNegativeInr,
  };
}

export function trainDetector(train: RiskTransaction[], reviewThreshold = 0.45, blockThreshold = 0.8): RiskDetector {
  const model = new LogisticRegression();
  const rows = buildFeatureRows(train);
  model.train(rows.map(({ transaction, features }) => ({ features, label: transaction.isFraud })));
  return new RiskDetector(model, reviewThreshold, blockThreshold);
}

import { FEATURE_NAMES, LogisticRegression } from "./model";
import { evaluateRules } from "./rules";
import type { RiskFeatureVector, RiskScore, RiskTransaction } from "./types";
import { extractFeatures } from "./features";

export class RiskDetector {
  constructor(
    private readonly model: LogisticRegression,
    private readonly reviewThreshold = 0.45,
    private readonly blockThreshold = 0.8,
  ) {}

  score(transaction: RiskTransaction, history: RiskTransaction[]): RiskScore {
    return this.scoreFeatures(transaction, extractFeatures(transaction, history));
  }

  scoreFeatures(transaction: RiskTransaction, features: RiskFeatureVector): RiskScore {
    const rules = evaluateRules(features);
    const triggeredRules = rules.filter((rule) => rule.triggered);
    const ruleBoost = Math.min(0.35, triggeredRules.length * 0.12);
    const modelProbability = this.model.predictProbability(features);
    const probability = Math.min(1, modelProbability + ruleBoost);
    const decision =
      probability >= this.blockThreshold
        ? "BLOCK"
        : probability >= this.reviewThreshold
          ? "REVIEW"
          : "ALLOW";
    const topContributingFeatures = FEATURE_NAMES.map((name, index) => ({
      name,
      contribution: Math.abs(this.model.weights[index] * features[name]),
    }))
      .sort((left, right) => right.contribution - left.contribution)
      .slice(0, 3)
      .map((item) => item.name);
    return {
      transactionId: transaction.id,
      riskScore: Math.round(probability * 100),
      modelProbability,
      decision,
      triggeredRules: triggeredRules.map(
        (rule) => `${rule.name}: ${rule.reason}`,
      ),
      topContributingFeatures,
    };
  }
}

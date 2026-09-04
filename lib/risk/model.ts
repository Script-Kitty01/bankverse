import type { RiskFeatureVector } from "./types";

export const FEATURE_NAMES = Object.keys({
  txnsLast10Min: 0,
  txnsLastHour: 0,
  distinctMerchantsLast24h: 0,
  amountDeviation: 0,
  lowAmountBurst: 0,
  nightHour: 0,
  newMerchant: 0,
  dormantReactivation: 0,
  refundRatio: 0,
  deviceSharingCount: 0,
}) as Array<keyof RiskFeatureVector>;

function values(features: RiskFeatureVector): number[] {
  return FEATURE_NAMES.map((name) => features[name]);
}

export class LogisticRegression {
  weights = new Array(FEATURE_NAMES.length).fill(0);
  bias = 0;

  train(
    rows: Array<{ features: RiskFeatureVector; label: boolean }>,
    epochs = 180,
    learningRate = 0.08,
  ): void {
    for (let epoch = 0; epoch < epochs; epoch++) {
      const gradients = new Array(this.weights.length).fill(0);
      let biasGradient = 0;
      for (const row of rows) {
        const vector = values(row.features);
        const probability = this.predictProbability(row.features);
        const error = probability - (row.label ? 1 : 0);
        vector.forEach((value, index) => {
          gradients[index] += error * value;
        });
        biasGradient += error;
      }
      const rate = learningRate / rows.length;
      this.weights = this.weights.map(
        (weight, index) => weight - rate * (gradients[index] + 0.01 * weight),
      );
      this.bias -= rate * biasGradient;
    }
  }

  predictProbability(features: RiskFeatureVector): number {
    const logit =
      this.bias +
      values(features).reduce(
        (sum, value, index) => sum + value * this.weights[index],
        0,
      );
    return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, logit))));
  }
}

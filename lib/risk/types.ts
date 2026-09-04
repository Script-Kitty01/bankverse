export type FraudPattern =
  | "LEGITIMATE"
  | "CARD_TESTING"
  | "VELOCITY_RING"
  | "NIGHT_ANOMALY"
  | "REFUND_ABUSE";

export type RiskDecision = "ALLOW" | "REVIEW" | "BLOCK";

export interface RiskTransaction {
  id: string;
  customerId: string;
  payerVpa: string;
  merchantId: string;
  bank: string;
  deviceId: string;
  amount: number;
  currency: "INR";
  timestamp: string;
  status: "SUCCESS" | "REFUNDED";
  isFraud: boolean;
  fraudPattern: FraudPattern;
}

export interface RiskDatasetSplit {
  train: RiskTransaction[];
  test: RiskTransaction[];
  seed: number;
}

export interface RiskFeatureVector {
  txnsLast10Min: number;
  txnsLastHour: number;
  distinctMerchantsLast24h: number;
  amountDeviation: number;
  lowAmountBurst: number;
  nightHour: number;
  newMerchant: number;
  dormantReactivation: number;
  refundRatio: number;
  deviceSharingCount: number;
}

export interface RiskScore {
  transactionId: string;
  riskScore: number;
  modelProbability: number;
  decision: RiskDecision;
  triggeredRules: string[];
  topContributingFeatures: string[];
}

export interface ConfusionMatrix {
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
}

export interface EvaluationMetrics extends ConfusionMatrix {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  falsePositiveRate: number;
  expectedCostInr: number;
}

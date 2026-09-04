import type { RiskFeatureVector } from "./types";

export interface RiskRuleResult {
  name: string;
  triggered: boolean;
  reason: string;
}

export function evaluateRules(features: RiskFeatureVector): RiskRuleResult[] {
  return [
    {
      name: "CARD_TESTING_BURST",
      triggered: features.txnsLast10Min >= 8 && features.lowAmountBurst === 1,
      reason: "Repeated low-value attempts in a ten-minute window.",
    },
    {
      name: "VELOCITY_CAP",
      triggered: features.txnsLastHour >= 10,
      reason: "Transaction velocity exceeds the review threshold.",
    },
    {
      name: "NIGHT_HIGH_VALUE",
      triggered:
        features.nightHour === 1 &&
        features.newMerchant === 1 &&
        features.amountDeviation >= 3,
      reason: "High-deviation activity at a new merchant during night hours.",
    },
    {
      name: "SHARED_DEVICE",
      triggered: features.deviceSharingCount >= 4,
      reason: "The device is associated with several customer identities.",
    },
    {
      name: "REFUND_PATTERN",
      triggered: features.refundRatio >= 0.5,
      reason: "A high share of recent activity has been refunded.",
    },
  ];
}

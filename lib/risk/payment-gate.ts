import { generateDataset, stratifiedSplit } from "./dataset";
import { trainDetector } from "./metrics";
import type { RiskScore, RiskTransaction } from "./types";

export interface PaymentRiskContext {
  deviceId?: string;
  payerVpa?: string;
  bank?: string;
}

export interface PaymentRiskInput {
  customerId: string;
  merchantId: string;
  amount: number;
  currency: string;
  context?: PaymentRiskContext;
  history?: RiskTransaction[];
}

let detector: ReturnType<typeof trainDetector> | undefined;

function getDetector() {
  if (!detector) {
    const split = stratifiedSplit(generateDataset());
    detector = trainDetector(split.train);
  }
  return detector;
}

function buildTransaction(input: PaymentRiskInput): RiskTransaction {
  return {
    id: `live_risk_${input.customerId}_${input.merchantId}_${input.amount}`,
    customerId: input.customerId,
    payerVpa: input.context?.payerVpa ?? `${input.customerId}@bankverse`,
    merchantId: input.merchantId,
    bank: input.context?.bank ?? "BANKVERSE",
    deviceId: input.context?.deviceId ?? `device_${input.customerId}`,
    amount: input.amount,
    currency: "INR",
    timestamp: new Date().toISOString(),
    status: "SUCCESS",
    isFraud: false,
    fraudPattern: "LEGITIMATE",
  };
}

function applyPaymentPolicy(score: RiskScore): RiskScore {
  if (score.decision !== "ALLOW" || score.triggeredRules.length === 0) {
    return score;
  }

  const decision = score.triggeredRules.length >= 3 ? "BLOCK" : "REVIEW";
  return {
    ...score,
    riskScore: Math.max(score.riskScore, decision === "BLOCK" ? 80 : 45),
    decision,
  };
}

export function evaluatePaymentRisk(input: PaymentRiskInput): RiskScore {
  const transaction = buildTransaction(input);
  const history = input.history ?? generateDataset();
  return applyPaymentPolicy(getDetector().score(transaction, history));
}

import type { RiskTransaction } from "./types";

export interface FraudRing {
  id: string;
  deviceId: string;
  members: string[];
  merchants: string[];
  transactionCount: number;
  exposureInr: number;
  firstSeen: string;
  lastSeen: string;
}

export function detectRings(transactions: RiskTransaction[]): FraudRing[] {
  const groups = new Map<string, RiskTransaction[]>();
  for (const transaction of transactions.filter((item) => item.isFraud)) {
    groups.set(transaction.deviceId, [...(groups.get(transaction.deviceId) ?? []), transaction]);
  }
  return [...groups.entries()]
    .filter(([, items]) => new Set(items.map((item) => item.customerId)).size >= 2)
    .map(([deviceId, items], index) => ({
      id: `ring_${index + 1}`,
      deviceId,
      members: [...new Set(items.map((item) => item.customerId))],
      merchants: [...new Set(items.map((item) => item.merchantId))],
      transactionCount: items.length,
      exposureInr: items.reduce((sum, item) => sum + item.amount, 0),
      firstSeen: items[0].timestamp,
      lastSeen: items[items.length - 1].timestamp,
    }));
}
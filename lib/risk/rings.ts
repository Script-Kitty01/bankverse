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
  evidence: string[];
}

export function detectRings(transactions: RiskTransaction[]): FraudRing[] {
  const groups = new Map<string, RiskTransaction[]>();
  for (const transaction of transactions) {
    groups.set(transaction.deviceId, [
      ...(groups.get(transaction.deviceId) ?? []),
      transaction,
    ]);
  }
  return [...groups.entries()]
    .map(([deviceId, items]) => ({
      deviceId,
      items: [...items].sort((left, right) =>
        left.timestamp.localeCompare(right.timestamp),
      ),
    }))
    .filter(({ items }) => {
      const members = new Set(items.map((item) => item.customerId));
      const firstSeen = Date.parse(items[0].timestamp);
      const lastSeen = Date.parse(items[items.length - 1].timestamp);
      return (
        members.size >= 2 &&
        items.length >= 3 &&
        lastSeen - firstSeen <= 60 * 60 * 1000
      );
    })
    .map(({ deviceId, items }) => ({
      deviceId,
      items,
      members: [...new Set(items.map((item) => item.customerId))],
      merchants: [...new Set(items.map((item) => item.merchantId))],
    }))
    .map(({ deviceId, items, members, merchants }, index) => ({
      id: `ring_${index + 1}`,
      deviceId,
      members,
      merchants,
      transactionCount: items.length,
      exposureInr: items.reduce((sum, item) => sum + item.amount, 0),
      firstSeen: items[0].timestamp,
      lastSeen: items[items.length - 1].timestamp,
      evidence: [
        `${members.length} customers shared one device`,
        `${items.length} transactions occurred within one hour`,
        `${merchants.length} merchants were involved`,
      ],
    }));
}

import type { RiskDatasetSplit, RiskTransaction, FraudPattern } from "./types";

const BANKS = ["HDFC", "ICICI", "SBI", "AXIS"];
const MERCHANTS = [
  "grocerly",
  "medcart",
  "railquick",
  "stylehub",
  "foodlane",
  "rentpay",
];
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function transaction(
  index: number,
  start: number,
  next: () => number,
  fraudPattern: FraudPattern = "LEGITIMATE",
  overrides: Partial<RiskTransaction> = {},
): RiskTransaction {
  const timestamp = new Date(
    start + Math.floor(next() * 10 * DAY_MS),
  ).toISOString();
  return {
    id: `risk_txn_${index.toString().padStart(5, "0")}`,
    customerId: `customer_${Math.floor(next() * 500)
      .toString()
      .padStart(4, "0")}`,
    payerVpa: `user${Math.floor(next() * 500)}@ok${BANKS[Math.floor(next() * BANKS.length)].toLowerCase()}`,
    merchantId: MERCHANTS[Math.floor(next() * MERCHANTS.length)],
    bank: BANKS[Math.floor(next() * BANKS.length)],
    deviceId: `device_${Math.floor(next() * 700)
      .toString()
      .padStart(4, "0")}`,
    amount: Math.round((80 + next() * 4900) * 100) / 100,
    currency: "INR",
    timestamp,
    status: "SUCCESS",
    isFraud: fraudPattern !== "LEGITIMATE",
    fraudPattern,
    ...overrides,
  };
}

export function generateDataset(
  seed = 20260905,
  size = 12000,
): RiskTransaction[] {
  const next = random(seed);
  const start = Date.parse("2026-08-01T00:00:00.000Z");
  const fraudCount = Math.floor(size * 0.03);
  const transactions: RiskTransaction[] = [];

  for (let index = 0; index < size - fraudCount; index++) {
    transactions.push(transaction(index, start, next));
  }

  const patterns: FraudPattern[] = [
    "CARD_TESTING",
    "VELOCITY_RING",
    "NIGHT_ANOMALY",
    "REFUND_ABUSE",
  ];
  for (let index = 0; index < fraudCount; index++) {
    const fraudPattern = patterns[index % patterns.length];
    const base = transaction(
      size - fraudCount + index,
      start,
      next,
      fraudPattern,
      {
        amount:
          fraudPattern === "CARD_TESTING"
            ? 10 + (index % 5) * 10
            : 2500 + (index % 7) * 725,
        deviceId: `fraud_device_${Math.floor(index / 4)}`,
         customerId: `fraud_customer_${Math.floor(index / 4)}`,
        merchantId:
          fraudPattern === "VELOCITY_RING" ? "merchant_cluster_01" : undefined,
      },
    );
      if (fraudPattern === "CARD_TESTING" || fraudPattern === "VELOCITY_RING") {
        base.timestamp = new Date(start + Math.floor(index / 20) * HOUR + (index % 20) * 60 * 1000).toISOString();
      }
    if (fraudPattern === "NIGHT_ANOMALY") {
      const night = new Date(start + (index % 10) * DAY_MS);
      night.setUTCHours(3, index % 60, 0, 0);
      base.timestamp = night.toISOString();
    }
    if (fraudPattern === "REFUND_ABUSE")
      base.status = index % 2 === 0 ? "REFUNDED" : "SUCCESS";
    transactions.push(base);
  }

  return transactions.sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );
}

export function stratifiedSplit(
  transactions: RiskTransaction[],
  trainRatio = 0.7,
  seed = 20260905,
): RiskDatasetSplit {
  const next = random(seed);
  const groups = new Map<FraudPattern, RiskTransaction[]>();
  for (const item of transactions)
    groups.set(item.fraudPattern, [
      ...(groups.get(item.fraudPattern) ?? []),
      item,
    ]);

  const train: RiskTransaction[] = [];
  const test: RiskTransaction[] = [];
  for (const group of groups.values()) {
    const shuffled = [...group].sort(() => next() - 0.5);
    const splitAt = Math.floor(shuffled.length * trainRatio);
    train.push(...shuffled.slice(0, splitAt));
    test.push(...shuffled.slice(splitAt));
  }
  return { train, test, seed };
}

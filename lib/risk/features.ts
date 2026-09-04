import type { RiskFeatureVector, RiskTransaction } from "./types";

const TEN_MINUTES = 10 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function priorTransactions(
  current: RiskTransaction,
  history: RiskTransaction[],
): RiskTransaction[] {
  const currentTime = Date.parse(current.timestamp);
  return history.filter(
    (item) =>
      item.id !== current.id && Date.parse(item.timestamp) < currentTime,
  );
}

export function extractFeatures(
  current: RiskTransaction,
  history: RiskTransaction[],
): RiskFeatureVector {
  const previous = priorTransactions(current, history);
  const currentTime = Date.parse(current.timestamp);
  const recent = previous.filter(
    (item) => currentTime - Date.parse(item.timestamp) <= HOUR,
  );
  const burst = previous.filter(
    (item) => currentTime - Date.parse(item.timestamp) <= TEN_MINUTES,
  );
  const dayHistory = previous.filter(
    (item) => currentTime - Date.parse(item.timestamp) <= DAY,
  );
  const customerHistory = previous.filter(
    (item) => item.customerId === current.customerId,
  );
  const customerAmounts = customerHistory.map((item) => item.amount);
  const average =
    customerAmounts.length > 0
      ? customerAmounts.reduce((sum, amount) => sum + amount, 0) /
        customerAmounts.length
      : current.amount;
  const variance =
    customerAmounts.length > 1
      ? customerAmounts.reduce(
          (sum, amount) => sum + (amount - average) ** 2,
          0,
        ) / customerAmounts.length
      : 1;
  const hour = new Date(currentTime).getUTCHours();
  const lastCustomerTransaction = customerHistory.at(-1);
  const customerMerchants = new Set(
    customerHistory.map((item) => item.merchantId),
  );
  const deviceUsers = new Set(
    previous
      .filter((item) => item.deviceId === current.deviceId)
      .map((item) => item.customerId),
  );

  return {
    txnsLast10Min: burst.length,
    txnsLastHour: recent.length,
    distinctMerchantsLast24h: new Set(dayHistory.map((item) => item.merchantId))
      .size,
    amountDeviation: Math.abs(current.amount - average) / Math.max(1, Math.sqrt(variance)),
    lowAmountBurst: burst.length >= 3 && current.amount <= 50 ? 1 : 0,
    nightHour: hour >= 2 && hour <= 5 ? 1 : 0,
    newMerchant: customerMerchants.has(current.merchantId) ? 0 : 1,
    dormantReactivation:
      lastCustomerTransaction !== undefined &&
      currentTime - Date.parse(lastCustomerTransaction.timestamp) > 7 * DAY
        ? 1
        : 0,
    refundRatio:
      customerHistory.length > 0
        ? customerHistory.filter((item) => item.status === "REFUNDED").length /
          customerHistory.length
        : 0,
    deviceSharingCount: deviceUsers.size,
  };
}

export function buildFeatureRows(
  transactions: RiskTransaction[],
): Array<{ transaction: RiskTransaction; features: RiskFeatureVector }> {
  const ordered = [...transactions].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );
  return ordered.map((transaction) => ({
    transaction,
    features: extractFeatures(
      transaction,
      ordered.slice(Math.max(0, ordered.indexOf(transaction) - 200), ordered.indexOf(transaction) + 1),
    ),
  }));
}

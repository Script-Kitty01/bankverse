export type DatasetSource = "synthetic" | "public" | "hybrid";

export interface TransactionBase {
  id: string;
  amount: number;
  currency: "INR";
  timestamp: string;
  method: "upi" | "card" | "netbanking" | "wallet";
  cardType?: string;
  source: DatasetSource;
  publicSourceId?: string;
}

export interface ProviderProfile {
  name: string;
  baseLatencyMs: number;
  failureRate: number;
  timeoutRate: number;
  declineRate: number;
  costInr: number;
}

export interface ProviderSimulationResult {
  transactionId: string;
  provider: string;
  attempt: number;
  timestamp: string;
  amount: number;
  currency: "INR";
  method: TransactionBase["method"];
  source: DatasetSource;
  publicSourceId?: string;
  latencyMs: number;
  outcome: "SUCCESS" | "FAILURE" | "TIMEOUT" | "DECLINED";
  retryCount: number;
  expectedCostInr: number;
  regime: string;
}

export interface ProviderSimulatorOptions {
  seed?: number;
  regime?: string;
  profiles?: ProviderProfile[];
}

const DEFAULT_PROFILES: ProviderProfile[] = [
  {
    name: "provider_alpha",
    baseLatencyMs: 180,
    failureRate: 0.025,
    timeoutRate: 0.01,
    declineRate: 0.02,
    costInr: 1.2,
  },
  {
    name: "provider_beta",
    baseLatencyMs: 240,
    failureRate: 0.018,
    timeoutRate: 0.018,
    declineRate: 0.025,
    costInr: 1.05,
  },
  {
    name: "provider_gamma",
    baseLatencyMs: 125,
    failureRate: 0.04,
    timeoutRate: 0.008,
    declineRate: 0.018,
    costInr: 1.45,
  },
];

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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export class DeterministicProviderSimulator {
  readonly profiles: ProviderProfile[];
  private readonly next: () => number;

  constructor(options: ProviderSimulatorOptions = {}) {
    this.profiles = options.profiles ?? DEFAULT_PROFILES;
    this.next = random(options.seed ?? 20260905);
  }

  simulate(
    transaction: TransactionBase,
    provider: ProviderProfile,
    attempt = 0,
  ): ProviderSimulationResult {
    const regime = this.regimeFor(transaction.timestamp);
    const regimeMultiplier =
      regime === "provider_stress" && provider.name === "provider_beta"
        ? 2.8
        : 1;
    const latencyMs = Math.max(
      1,
      Math.round(
        provider.baseLatencyMs * (0.8 + this.next() * 0.7) * regimeMultiplier,
      ),
    );
    const timeoutRate = clamp(provider.timeoutRate * regimeMultiplier, 0, 0.95);
    const failureRate = clamp(provider.failureRate * regimeMultiplier, 0, 0.95);
    const declineRate = clamp(
      provider.declineRate * (regime === "high_declines" ? 1.8 : 1),
      0,
      0.95,
    );
    const draw = this.next();
    let outcome: ProviderSimulationResult["outcome"] = "SUCCESS";

    if (draw < timeoutRate) outcome = "TIMEOUT";
    else if (draw < timeoutRate + failureRate) outcome = "FAILURE";
    else if (draw < timeoutRate + failureRate + declineRate)
      outcome = "DECLINED";

    const failureCost = outcome === "SUCCESS" ? 0 : transaction.amount * 0.02;

    return {
      transactionId: transaction.id,
      provider: provider.name,
      attempt,
      timestamp: transaction.timestamp,
      amount: transaction.amount,
      currency: transaction.currency,
      method: transaction.method,
      source: transaction.source,
      publicSourceId: transaction.publicSourceId,
      latencyMs,
      outcome,
      retryCount: attempt,
      expectedCostInr: Number(
        (failureCost + provider.costInr + latencyMs * 0.002).toFixed(4),
      ),
      regime,
    };
  }

  simulateAllProviders(
    transaction: TransactionBase,
  ): ProviderSimulationResult[] {
    return this.profiles.map((provider) =>
      this.simulate(transaction, provider),
    );
  }

  regimeFor(timestamp: string): string {
    const hour = new Date(timestamp).getUTCHours();
    const day = new Date(timestamp).getUTCDate();
    if (day % 11 === 0) return "provider_stress";
    if (hour >= 20 || hour <= 2) return "high_declines";
    return "normal";
  }
}

export function defaultProviderProfiles(): ProviderProfile[] {
  return DEFAULT_PROFILES.map((profile) => ({ ...profile }));
}

import crypto from "node:crypto";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import csvParser from "csv-parser";
import { createObjectCsvWriter } from "csv-writer";
import {
  defaultProviderProfiles,
  DeterministicProviderSimulator,
  type ProviderSimulationResult,
  type TransactionBase,
} from "../lib/simulation/deterministic-provider-simulator";

interface PublicEnvelope {
  transaction_id: string;
  amount: string;
  timestamp: string;
  hour: string;
  day_of_week: string;
  merchant_category: string;
  payment_method: string;
  source: string;
  public_source_id: string;
}

interface FailurePrior {
  amount_bucket: string;
  hour: number;
  fraud_proxy_rate: number;
  transaction_count: number;
}

interface MlRow {
  transaction_id: string;
  provider: string;
  timestamp: string;
  amount: number;
  hour: number;
  day_of_week: number;
  merchant_category: string;
  payment_method: string;
  failure: 0 | 1;
  outcome: ProviderSimulationResult["outcome"];
  latency_ms: number;
  attempt: number;
  retry_count: number;
  recovery_action: "NONE" | "RETRY" | "SWITCH" | "WAIT";
  recovery_success: 0 | 1;
  fraud_proxy_rate: number;
  regime: string;
  source: string;
  public_source_id: string;
}

const root = process.cwd();
const dataDirectory = path.join(root, "data");

function parseArgs(argv: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    if (key.includes("=")) {
      const [name, value] = key.split("=", 2);
      values[name] = value;
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      values[key] = argv[index + 1];
      index += 1;
    }
  }
  return values;
}

function readCsv(filePath: string): Promise<PublicEnvelope[]> {
  return new Promise((resolve, reject) => {
    const rows: PublicEnvelope[] = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on("data", (row: PublicEnvelope) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

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

function amountBucket(amount: number): string {
  if (amount <= 10) return "0-10";
  if (amount <= 50) return "10-50";
  if (amount <= 100) return "50-100";
  if (amount <= 500) return "100-500";
  if (amount <= 10000) return "500-10000";
  return "10000+";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function priorFor(
  priors: FailurePrior[],
  amount: number,
  hour: number,
): number {
  const exact = priors.find(
    (prior) =>
      prior.amount_bucket === amountBucket(amount) &&
      Number(prior.hour) === hour,
  );
  return Number(exact?.fraud_proxy_rate ?? 0);
}

function recoveryAction(
  outcome: ProviderSimulationResult["outcome"],
  next: () => number,
): MlRow["recovery_action"] {
  if (outcome === "SUCCESS") return "NONE";
  return ["RETRY", "SWITCH", "WAIT"][
    Math.floor(next() * 3)
  ] as MlRow["recovery_action"];
}

async function sha256(filePath: string): Promise<string> {
  const contents = await fsPromises.readFile(filePath);
  return crypto.createHash("sha256").update(contents).digest("hex");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const envelopePath =
    args.envelopes ?? path.join(dataDirectory, "public_envelopes.csv");
  const priorsPath =
    args.priors ?? path.join(dataDirectory, "failure_priors.json");
  const outputPath = args.output ?? path.join(dataDirectory, "ml_dataset.csv");
  const seed = Number(args.seed ?? 42);
  const limit = Number(args.limit ?? 0);

  const envelopes = await readCsv(envelopePath);
  const priors = JSON.parse(
    await fsPromises.readFile(priorsPath, "utf8"),
  ) as FailurePrior[];
  const selected = limit > 0 ? envelopes.slice(0, limit) : envelopes;
  const simulator = new DeterministicProviderSimulator({
    seed,
    profiles: defaultProviderProfiles(),
  });
  const next = random(seed + 1);
  const rows: MlRow[] = [];

  for (const envelope of selected) {
    const amount = Number(envelope.amount);
    const hour = Number(envelope.hour);
    const base: TransactionBase = {
      id: envelope.transaction_id,
      amount,
      currency: "INR",
      timestamp: new Date(envelope.timestamp).toISOString(),
      method: ["upi", "card", "netbanking", "wallet"].includes(
        envelope.payment_method?.toLowerCase(),
      )
        ? (envelope.payment_method.toLowerCase() as TransactionBase["method"])
        : "card",
      cardType: envelope.payment_method,
      source: "hybrid",
      publicSourceId: envelope.public_source_id || envelope.transaction_id,
    };
    const fraudProxyRate = priorFor(priors, amount, hour);

    for (const [index, profile] of simulator.profiles.entries()) {
      const simulated = simulator.simulate(base, profile);
      const regimeMultiplier =
        simulated.regime === "provider_stress" && index === 1
          ? 2.8
          : simulated.regime === "high_declines"
            ? 1.8
            : 1;
      const failureProbability = clamp(
        (profile.failureRate + profile.timeoutRate + profile.declineRate) *
          (1 + fraudProxyRate) *
          regimeMultiplier,
        0,
        0.95,
      );
      const failed = next() < failureProbability;
      const outcome: ProviderSimulationResult["outcome"] = failed
        ? next() < profile.timeoutRate / Math.max(failureProbability, 0.0001)
          ? "TIMEOUT"
          : next() < 0.35
            ? "DECLINED"
            : "FAILURE"
        : "SUCCESS";
      const action = recoveryAction(outcome, next);

      rows.push({
        transaction_id: envelope.transaction_id,
        provider: profile.name,
        timestamp: base.timestamp,
        amount,
        hour,
        day_of_week: Number(envelope.day_of_week),
        merchant_category: envelope.merchant_category || "unknown",
        payment_method: base.method,
        failure: failed ? 1 : 0,
        outcome,
        latency_ms: simulated.latencyMs,
        attempt: 1,
        retry_count: failed ? 1 : 0,
        recovery_action: action,
        recovery_success: failed ? (next() > 0.3 ? 1 : 0) : 1,
        fraud_proxy_rate: Number(fraudProxyRate.toFixed(8)),
        regime: simulated.regime,
        source: "public_hybrid",
        public_source_id: base.publicSourceId ?? base.id,
      });
    }
  }

  await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });
  const writer = createObjectCsvWriter({
    path: outputPath,
    header: Object.keys(rows[0] ?? {}).map((id) => ({ id, title: id })),
  });
  await writer.writeRecords(rows);

  const manifest = {
    version: "hybrid-ml-dataset.v1",
    generated_at: new Date().toISOString(),
    seed,
    envelope_rows: selected.length,
    provider_rows: rows.length,
    source_breakdown: { public_hybrid: rows.length },
    priors_source: path.relative(root, priorsPath),
    envelope_source: path.relative(root, envelopePath),
    output: path.relative(root, outputPath),
    output_sha256: await sha256(outputPath),
    recovery_outcomes: "simulated; not observed production outcomes",
    regime_scenarios: ["provider_stress", "high_declines", "normal"],
    time_split: "delegated to Phase 4 training pipeline",
  };
  await fsPromises.writeFile(
    path.join(dataDirectory, "dataset_manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error: unknown) => {
  console.error(
    `Hybrid dataset generation failed: ${(error as Error).message}`,
  );
  process.exitCode = 1;
});

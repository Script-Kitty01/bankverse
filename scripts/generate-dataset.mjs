import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = process.cwd();
const jiti = require("jiti")(path.join(root, "package.json"), {
  alias: { "@": root },
});
const { DeterministicProviderSimulator, defaultProviderProfiles } = jiti(
  path.join(root, "lib/simulation/deterministic-provider-simulator.ts"),
);

function parseArgs(argv) {
  const values = {};
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const key = argument.slice(2);
    if (key.includes("=")) {
      const [name, value] = key.split("=", 2);
      values[name] = value;
      continue;
    }
    values[key] = argv[index + 1]?.startsWith("--") ? true : argv[++index];
  }
  if (positional.length > 0) values.size ??= positional[0];
  if (positional.length > 1) values.seed ??= positional[1];
  if (positional.length > 2) values.source ??= positional[2];
  return values;
}

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function transaction(index, start, next, source = "synthetic") {
  const timestamp = new Date(
    start + Math.floor(next() * 31 * 86400000),
  ).toISOString();
  const methods = ["upi", "card", "netbanking", "wallet"];
  return {
    id: `sim_txn_${index.toString().padStart(7, "0")}`,
    amount: Number((50 + next() * 4950).toFixed(2)),
    currency: "INR",
    timestamp,
    method: methods[Math.floor(next() * methods.length)],
    cardType: next() > 0.5 ? "visa" : "mastercard",
    source,
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seed = Number(args.seed ?? 20260905);
  const size = Math.max(1, Math.min(Number(args.size ?? 1000), 1_000_000));
  const source = args.source ?? "synthetic";
  if (!["synthetic", "hybrid"].includes(source)) {
    throw new Error("--source must be synthetic or hybrid for this generator");
  }

  const next = random(seed);
  const start = Date.parse("2026-08-01T00:00:00.000Z");
  const simulator = new DeterministicProviderSimulator({
    seed,
    profiles: defaultProviderProfiles(),
  });
  const rows = [];

  for (let index = 0; index < size; index++) {
    const base = transaction(
      index,
      start,
      next,
      source === "hybrid" ? "hybrid" : "synthetic",
    );
    for (const result of simulator.simulateAllProviders(base))
      rows.push(result);
  }

  const outputDirectory = path.join(root, "data", "generated");
  await fs.mkdir(outputDirectory, { recursive: true });
  const jsonl = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  const columns = Object.keys(rows[0]);
  const csv =
    [
      columns.join(","),
      ...rows.map((row) =>
        columns.map((column) => csvEscape(row[column])).join(","),
      ),
    ].join("\n") + "\n";
  const datasetHash = crypto.createHash("sha256").update(jsonl).digest("hex");
  const manifest = {
    datasetName: `bankverse-${source}`,
    source,
    seed,
    baseTransactionCount: size,
    providerAttemptCount: rows.length,
    generatedAt: new Date().toISOString(),
    providers: simulator.profiles.map((profile) => profile.name),
    schemaVersion: "provider-attempt.v1",
    sha256: datasetHash,
  };

  await fs.writeFile(
    path.join(outputDirectory, `${source}-provider-attempts.jsonl`),
    jsonl,
    "utf8",
  );
  await fs.writeFile(
    path.join(outputDirectory, `${source}-provider-attempts.csv`),
    csv,
    "utf8",
  );
  await fs.writeFile(
    path.join(outputDirectory, `${source}-manifest.json`),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(`Dataset generation failed: ${error.message}`);
  process.exitCode = 1;
});

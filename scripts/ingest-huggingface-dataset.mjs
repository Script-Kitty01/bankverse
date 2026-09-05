import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ALLOWED_LICENSES = new Set([
  "apache-2.0",
  "mit",
  "cc0-1.0",
  "cc-by-4.0",
  "odbl-1.0",
]);

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
  if (positional.length > 0) values.dataset ??= positional[0];
  if (positional.length > 1) values.url ??= positional[1];
  if (positional.length > 2) values.sha256 ??= positional[2];
  if (positional.length > 3) values.license ??= positional[3];
  return values;
}

function parseCsv(text, limit) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0]
    .split(",")
    .map((header) => header.trim().replace(/^['"]|['"]$/g, ""));
  return lines
    .slice(1, limit + 1)
    .map((line) => {
      const values = line.split(",");
      return Object.fromEntries(
        headers.map((header, column) => [
          header,
          values[column]?.trim().replace(/^['"]|['"]$/g, "") ?? "",
        ]),
      );
    })
    .map((row, index) => ({ row, index }));
}

function findValue(row, candidates) {
  const entries = Object.entries(row);
  const match = entries.find(([key]) =>
    candidates.includes(key.toLowerCase().replaceAll(" ", "_")),
  );
  return match?.[1];
}

function mapRow(row, index, datasetName) {
  const amountValue = findValue(row, [
    "amount",
    "transaction_amount",
    "transaction_value",
    "amount_inr",
  ]);
  const timestampValue = findValue(row, [
    "timestamp",
    "date",
    "transaction_date",
    "time",
  ]);
  const methodValue = findValue(row, [
    "payment_method",
    "card_type",
    "type",
    "method",
  ]);
  const amount = Number(String(amountValue ?? "").replace(/[^0-9.-]/g, ""));
  const parsedTimestamp = timestampValue ? new Date(timestampValue) : null;
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !parsedTimestamp ||
    Number.isNaN(parsedTimestamp.getTime())
  )
    return null;
  const timestamp = parsedTimestamp.toISOString();

  return {
    id: `public_${datasetName.replace(/[^a-z0-9]+/gi, "_")}_${index}`,
    amount: Number(Math.abs(amount).toFixed(2)),
    currency: "INR",
    timestamp,
    method: String(methodValue ?? "card")
      .toLowerCase()
      .includes("upi")
      ? "upi"
      : "card",
    cardType: methodValue ? String(methodValue).toLowerCase() : undefined,
    source: "public",
    publicSourceId:
      findValue(row, ["id", "transaction_id", "index"]) ?? String(index),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const datasetName = args.dataset;
  const url = args.url;
  const revision = args.revision ?? "unspecified";
  const license = String(args.license ?? "").toLowerCase();
  const expectedSha256 = String(args.sha256 ?? "").toLowerCase();
  const limit = Math.max(1, Math.min(Number(args.limit ?? 100000), 1_000_000));

  if (
    !datasetName ||
    !url ||
    !expectedSha256 ||
    !ALLOWED_LICENSES.has(license)
  ) {
    throw new Error(
      "Required: --dataset, --url, --sha256, and an allowlisted --license (apache-2.0, mit, cc0-1.0, cc-by-4.0, odbl-1.0)",
    );
  }

  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Dataset download failed with HTTP ${response.status}`);
  const raw = Buffer.from(await response.arrayBuffer());
  const actualSha256 = crypto.createHash("sha256").update(raw).digest("hex");
  if (actualSha256 !== expectedSha256)
    throw new Error(
      `Checksum mismatch: expected ${expectedSha256}, got ${actualSha256}`,
    );

  const rawDirectory = path.join(root, "data", "raw");
  const manifestDirectory = path.join(root, "data", "manifests");
  await fs.mkdir(rawDirectory, { recursive: true });
  await fs.mkdir(manifestDirectory, { recursive: true });
  const safeName = datasetName.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const records = parseCsv(raw.toString("utf8"), limit);
  const mapped = records
    .map(({ row, index }) => mapRow(row, index, safeName))
    .filter(Boolean);
  const rejectedRows = records.length - mapped.length;
  const manifest = {
    datasetName,
    url,
    revision,
    license,
    downloadedAt: new Date().toISOString(),
    sha256: actualSha256,
    mappingVersion: "transaction-base.v1",
    sourceRowCount: records.length,
    mappedRowCount: mapped.length,
    rejectedRowCount: rejectedRows,
    source: "public",
    piiPolicy:
      "allowlisted transaction context only; raw source rows are not used as model features",
  };

  await fs.writeFile(path.join(rawDirectory, `${safeName}.csv`), raw);
  await fs.writeFile(
    path.join(rawDirectory, `${safeName}.jsonl`),
    mapped.map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  await fs.writeFile(
    path.join(manifestDirectory, `${safeName}.manifest.json`),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(`Hugging Face ingestion failed: ${error.message}`);
  process.exitCode = 1;
});

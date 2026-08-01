import { Client } from "dwolla-v2";

/**
 * Creates a configured Dwolla client instance.
 */
export function createDwollaClient() {
  return new Client({
    key: process.env.DWOLLA_KEY!,
    secret: process.env.DWOLLA_SECRET!,
    environment: process.env.DWOLLA_ENV as "sandbox" | "production" || "sandbox",
  });
}

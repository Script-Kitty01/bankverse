import { getSupabaseClient } from "@/lib/supabase/config";

/**
 * Legacy compatibility wrapper for Supabase migration.
 */
export function createServerClient() {
  const supabase = getSupabaseClient();
  return {
    supabase,
  };
}

export function createSessionClient() {
  return createServerClient();
}

// Supabase Table & Collection Mapping
export const DATABASE_ID = "bankverse";
export const USERS_COLLECTION_ID = "users";
export const BANKS_COLLECTION_ID = "banks";
export const TRANSACTIONS_COLLECTION_ID = "transactions";
export const LEDGER_ACCOUNTS_COLLECTION_ID = "ledger_accounts";
export const LEDGER_ENTRIES_COLLECTION_ID = "ledger_entries";
export const PAYMENT_TRANSACTIONS_COLLECTION_ID = "payment_transactions";
export const RECONCILIATION_RUNS_COLLECTION_ID = "reconciliation_runs";
export const RECONCILIATION_ITEMS_COLLECTION_ID = "reconciliation_items";
export const INCIDENTS_COLLECTION_ID = "incidents";
export const OUTBOX_EVENTS_COLLECTION_ID = "outbox_events";

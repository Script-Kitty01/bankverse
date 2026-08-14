import { createClient } from "@supabase/supabase-js";

/**
 * Get configured Supabase client instance for server-side & client-side operations.
 */
export function getSupabaseClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://tekuzhxsfsbhtjxwxvwp.supabase.co";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "sb_publishable__fvKlAAqO_-XnHd8gTLxIw_3C-kFn_d";

  return createClient(supabaseUrl, supabaseKey);
}

export const supabase = getSupabaseClient();
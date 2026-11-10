import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client. Uses ONLY the public URL + anon/publishable key.
 * Data access is protected by row-level security; the service-role key is never used here.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isCloudConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isCloudConfigured) throw new Error("Supabase is not configured");
  if (!client) {
    client = createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

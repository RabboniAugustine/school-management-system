import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. It bypasses row-level security, so it must only be used in server code that has
 * already authenticated the caller or verified a provider signature (for example the Paystack webhook).
 * Never import this file from a client component: the "server-only" import makes the build fail if you do.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

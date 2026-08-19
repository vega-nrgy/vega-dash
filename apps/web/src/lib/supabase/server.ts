import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client. Uses the service role key because this is an
 * internal, single-tenant dashboard with no per-user auth/RLS yet — never
 * import this from a Client Component (the `server-only` guard enforces that
 * at build time).
 */
export function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Copy .env.local.example to .env.local."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client — anon key only, used for auth (sign-in/out) from
 * Client Components. Never used for data access; server code goes through
 * getSupabaseServerClient (service role) instead.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cookie-bound Supabase client (anon key) for reading/mutating the auth
 * session from Server Components, Route Handlers, and Server Actions.
 * Distinct from getSupabaseServerClient (service role, data access only,
 * no session) in ./server.ts.
 */
export async function createSupabaseAuthServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render — cookies are
            // read-only there. Middleware refreshes the session instead.
          }
        },
      },
    }
  );
}

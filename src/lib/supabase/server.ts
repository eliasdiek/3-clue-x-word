import "server-only";
import { cookies } from "next/headers";
import { io } from "next/cache";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "./database.types";
import { applyRememberPreference, REMEMBER_COOKIE } from "./cookie-options";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Uses the publishable key and the signed-in user's cookies, so every query
 * runs under Row Level Security as that user. Never uses the service role.
 */
export async function createClient(options: { remember?: boolean } = {}) {
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = getPublicEnv();
  const remember = options.remember ?? cookieStore.get(REMEMBER_COOKIE)?.value !== "0";
  // With Partial Prefetching the App Shell may read cookies, but the Supabase
  // client reads Date.now() (session expiry). Mark what follows as I/O so it
  // runs per request, never inside a prerender. Resolves immediately in
  // Server Actions and Route Handlers.
  await io();

  return createServerClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options: cookieOptions } of cookiesToSet) {
            cookieStore.set(name, value, applyRememberPreference(cookieOptions, remember));
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes sessions, so this is safe to ignore.
        }
      },
    },
  });
}

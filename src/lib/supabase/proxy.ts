import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv, isSupabaseConfigured } from "@/lib/env";
import { decideRoute } from "@/lib/auth/routes";
import type { Database } from "./database.types";
import { applyRememberPreference, REMEMBER_COOKIE } from "./cookie-options";

/**
 * Refreshes the Supabase session cookie on every request and performs an
 * optimistic redirect. This is a convenience only: every admin page and
 * action re-checks the session and admin role on the server, and the
 * database enforces Row Level Security.
 */
export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    const decision = decideRoute(request.nextUrl, { configured: false, signedIn: false });
    return decision.type === "redirect"
      ? NextResponse.redirect(new URL(decision.to, request.url))
      : NextResponse.next();
  }

  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = getPublicEnv();
  const remember = request.cookies.get(REMEMBER_COOKIE)?.value !== "0";
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, applyRememberPreference(options, remember));
        }
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // getClaims() must run straight after creating the client so an expiring
  // session is refreshed reliably before anything else reads it.
  const { data } = await supabase.auth.getClaims();
  const decision = decideRoute(request.nextUrl, { configured: true, signedIn: Boolean(data?.claims?.sub) });

  if (decision.type === "redirect") {
    const redirect = NextResponse.redirect(new URL(decision.to, request.url));
    // Carry any refreshed auth cookies across the redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

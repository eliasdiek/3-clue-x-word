import type { CookieOptions } from "@supabase/ssr";

/** Remembers the "Remember me" choice so session refreshes keep honouring it. */
export const REMEMBER_COOKIE = "cxw-remember";

/**
 * Without "Remember me", auth cookies become browser-session cookies: they
 * are dropped when the browser closes instead of lasting for months.
 */
export function applyRememberPreference(options: CookieOptions, remember: boolean): CookieOptions {
  if (remember) return options;
  // A removal (maxAge 0) must stay a removal.
  if (options.maxAge === 0) return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}

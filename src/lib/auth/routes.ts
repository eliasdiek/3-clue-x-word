/**
 * Pure routing rules for authentication, shared by the proxy and tests.
 * These are optimistic UX redirects; real authorization happens on the
 * server (requireAdmin) and in the database (RLS).
 */

/** Pages that never require a session. */
const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth/confirm", "/setup-required"];

/** Pages a signed-in user is sent away from. */
const SIGNED_OUT_ONLY_PATHS = ["/login", "/forgot-password"];

/** Needs the short-lived session created by a password-reset link. */
const RECOVERY_PATHS = ["/reset-password"];

export const DEFAULT_SIGNED_IN_PATH = "/dashboard";

export type RouteDecision = { type: "next" } | { type: "redirect"; to: string };

function matches(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function decideRoute(
  url: { pathname: string; search: string; searchParams: URLSearchParams },
  state: { configured: boolean; signedIn: boolean },
): RouteDecision {
  const { pathname, search } = url;

  if (!state.configured) {
    return matches(pathname, ["/setup-required"]) ? { type: "next" } : { type: "redirect", to: "/setup-required" };
  }

  if (!state.signedIn) {
    if (matches(pathname, RECOVERY_PATHS)) return { type: "redirect", to: "/login?notice=reset-link-expired" };
    if (matches(pathname, PUBLIC_PATHS)) return { type: "next" };
    const target = `${pathname}${search}`;
    const keepTarget = pathname !== "/" && pathname !== DEFAULT_SIGNED_IN_PATH;
    return { type: "redirect", to: keepTarget ? `/login?next=${encodeURIComponent(target)}` : "/login" };
  }

  // A signed-in user whose account is not an admin is sent to /login?error=…
  // by the server; let that page render instead of bouncing back.
  if (matches(pathname, SIGNED_OUT_ONLY_PATHS) && !url.searchParams.has("error")) {
    return { type: "redirect", to: DEFAULT_SIGNED_IN_PATH };
  }

  return { type: "next" };
}

/**
 * Only allow redirects to paths on this site, preventing open redirects such
 * as `?next=https://evil.example` or `?next=//evil.example`.
 */
export function safeNextPath(next: string | null | undefined, fallback = DEFAULT_SIGNED_IN_PATH): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (matches(next.split("?")[0], SIGNED_OUT_ONLY_PATHS)) return fallback;
  return next;
}

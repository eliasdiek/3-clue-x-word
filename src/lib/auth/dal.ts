import "server-only";
import { redirect } from "next/navigation";
import { cacheLife } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AdminRole } from "@/lib/supabase/database.types";

export type AdminSession = {
  adminId: string;
  userId: string;
  email: string | null;
  displayName: string;
  role: AdminRole;
};

export type SessionState =
  | { status: "signed-out" }
  | { status: "not-admin"; userId: string }
  | { status: "admin"; admin: AdminSession };

/**
 * Data Access Layer: the single place that decides who the current user is.
 * Verifies the session JWT (getClaims) and looks up an *active* admin profile.
 *
 * "use cache: private" dedupes calls within a request and lets navigations
 * between admin pages be instant: the result rides along in the per-session
 * App Shell held in browser memory (5 minutes, the minimum for App Shell
 * inclusion). It is never stored in a server cache across requests, so every
 * server render, Server Action and Postgres RLS check still verifies the
 * session afresh. (Don't wrap it in React cache(); the two don't combine.)
 */
export async function getSessionState(): Promise<SessionState> {
  "use cache: private";
  cacheLife({ stale: 300 });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { status: "signed-out" };

  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("id, display_name, role, is_active")
    .eq("auth_user_id", claims.sub)
    .maybeSingle();

  if (!profile || !profile.is_active) return { status: "not-admin", userId: claims.sub };

  return {
    status: "admin",
    admin: {
      adminId: profile.id,
      userId: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      displayName: profile.display_name,
      role: profile.role,
    },
  };
}

/**
 * Use in every admin page, Server Action and Route Handler that touches admin
 * data. Redirects instead of returning when the caller is not an admin.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const state = await getSessionState();
  if (state.status === "signed-out") redirect("/login");
  if (state.status === "not-admin") redirect("/login?error=not-admin");
  return state.admin;
}

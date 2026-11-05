"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { REMEMBER_COOKIE } from "@/lib/supabase/cookie-options";
import { getPublicEnv } from "@/lib/env";
import { writeAuditLog } from "@/lib/audit";
import { getSessionState } from "@/lib/auth/dal";
import { safeNextPath } from "@/lib/auth/routes";
import { AUTH_ERRORS, loginErrorMessage } from "@/lib/auth/messages";
import {
  fieldErrorsFrom,
  forgotPasswordSchema,
  loginSchema,
  newPasswordSchema,
  type ActionResult,
  type ForgotPasswordInput,
  type LoginInput,
  type NewPasswordInput,
} from "@/lib/validation/auth";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function signIn(input: LoginInput, next?: string | null): Promise<ActionResult<keyof LoginInput>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const { email, password, remember } = parsed.data;

  const cookieStore = await cookies();
  cookieStore.set(REMEMBER_COOKIE, remember ? "1" : "0", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { maxAge: ONE_YEAR_SECONDS } : {}),
  });

  const supabase = await createClient({ remember });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, formError: loginErrorMessage(error) };

  // Signing in is not enough: the account must have an active admin profile.
  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("id, is_active")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return { ok: false, formError: AUTH_ERRORS.notAdmin };
  }

  await writeAuditLog(supabase, {
    adminId: profile.id,
    action: "auth.login",
    resourceType: "admin",
    resourceId: profile.id,
  });

  redirect(safeNextPath(next));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const state = await getSessionState();
  if (state.status === "admin") {
    await writeAuditLog(supabase, {
      adminId: state.admin.adminId,
      action: "auth.logout",
      resourceType: "admin",
      resourceId: state.admin.adminId,
    });
  }
  await supabase.auth.signOut();
  redirect("/login?notice=signed-out");
}

async function siteUrl(): Promise<string> {
  const configured = getPublicEnv().NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function requestPasswordReset(
  input: ForgotPasswordInput,
): Promise<ActionResult<keyof ForgotPasswordInput>> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/reset-password`,
  });

  if (error?.status === 429) return { ok: false, formError: AUTH_ERRORS.rateLimited };
  if (error) console.error("[auth] password reset request failed:", error.message);

  // Same answer whether or not the address has an account.
  return {
    ok: true,
    message: "If that email belongs to an administrator, a password-reset link is on its way. It expires in 1 hour.",
  };
}

export async function updatePassword(
  input: NewPasswordInput,
  options: { afterReset?: boolean } = {},
): Promise<ActionResult<keyof NewPasswordInput>> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, formError: AUTH_ERRORS.sessionExpired };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { ok: false, fieldErrors: { password: "Please choose a password you haven't used here before." } };
    }
    if (error.code === "weak_password") {
      return { ok: false, fieldErrors: { password: "That password is too easy to guess. Please choose another." } };
    }
    if (error.status === 429) return { ok: false, formError: AUTH_ERRORS.rateLimited };
    console.error("[auth] password update failed:", error.message);
    return { ok: false, formError: AUTH_ERRORS.unexpected };
  }

  const state = await getSessionState();
  if (state.status === "admin") {
    await writeAuditLog(supabase, {
      adminId: state.admin.adminId,
      action: options.afterReset ? "auth.password_reset" : "auth.password_changed",
      resourceType: "admin",
      resourceId: state.admin.adminId,
    });
  }

  if (options.afterReset) {
    // Finish the recovery session and ask for a fresh login with the new password.
    await supabase.auth.signOut();
    redirect("/login?notice=password-updated");
  }

  return { ok: true, message: "Your password has been changed." };
}

import { describe, expect, it } from "vitest";
import { applyRememberPreference } from "@/lib/supabase/cookie-options";
import { AUTH_ERRORS, loginErrorMessage } from "@/lib/auth/messages";
import { loginSchema, newPasswordSchema } from "@/lib/validation/auth";

describe("remember me", () => {
  const persistent = { path: "/", maxAge: 34_560_000, sameSite: "lax" as const };

  it("keeps long-lived cookies when remembered", () => {
    expect(applyRememberPreference(persistent, true)).toEqual(persistent);
  });

  it("turns auth cookies into browser-session cookies when not remembered", () => {
    const result = applyRememberPreference({ ...persistent, expires: new Date() }, false);
    expect(result).toEqual({ path: "/", sameSite: "lax" });
  });

  it("still deletes cookies on logout when not remembered", () => {
    expect(applyRememberPreference({ path: "/", maxAge: 0 }, false)).toEqual({ path: "/", maxAge: 0 });
  });
});

describe("login error messages", () => {
  it("never reveals whether the email exists", () => {
    expect(loginErrorMessage({ code: "invalid_credentials", status: 400 })).toBe(AUTH_ERRORS.invalidCredentials);
    expect(loginErrorMessage({ code: "user_not_found", status: 400 })).toBe(AUTH_ERRORS.invalidCredentials);
  });

  it("explains rate limiting", () => {
    expect(loginErrorMessage({ status: 429 })).toBe(AUTH_ERRORS.rateLimited);
  });

  it("falls back to a generic message", () => {
    expect(loginErrorMessage({ status: 500 })).toBe(AUTH_ERRORS.unexpected);
    expect(loginErrorMessage(null)).toBe(AUTH_ERRORS.unexpected);
  });
});

describe("auth validation", () => {
  it("requires a valid email and a password", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "", remember: false });
    expect(result.success).toBe(false);
    const fields = result.error?.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["email", "password"]));
  });

  it("trims the email address", () => {
    const result = loginSchema.parse({ email: "  john@example.com ", password: "x", remember: true });
    expect(result.email).toBe("john@example.com");
  });

  it("requires matching new passwords of a sensible length", () => {
    expect(newPasswordSchema.safeParse({ password: "short", confirmPassword: "short" }).success).toBe(false);
    const mismatch = newPasswordSchema.safeParse({ password: "long enough pass", confirmPassword: "different pass" });
    expect(mismatch.error?.issues[0].path).toEqual(["confirmPassword"]);
    expect(newPasswordSchema.safeParse({ password: "long enough pass", confirmPassword: "long enough pass" }).success).toBe(
      true,
    );
  });
});

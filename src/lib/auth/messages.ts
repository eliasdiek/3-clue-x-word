/**
 * Plain-English messages for the auth screens. Kept deliberately vague where
 * detail would reveal whether an email address has an account.
 */

export const AUTH_ERRORS = {
  invalidCredentials: "That email and password don't match. Please check them and try again.",
  notAdmin: "This account isn't allowed to use the admin website. Please contact the site owner.",
  rateLimited: "Too many attempts. Please wait a few minutes and try again.",
  emailNotConfirmed: "This account's email address hasn't been confirmed yet. Please check your inbox.",
  unexpected: "Something went wrong on our side. Please try again in a moment.",
  sessionExpired: "Your password-reset link has expired or was already used. Please request a new one.",
} as const;

/** Maps a Supabase Auth error to a safe message for the login form. */
export function loginErrorMessage(error: { code?: string; status?: number } | null): string {
  switch (error?.code) {
    case "invalid_credentials":
    case "user_not_found":
      return AUTH_ERRORS.invalidCredentials;
    case "email_not_confirmed":
      return AUTH_ERRORS.emailNotConfirmed;
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return AUTH_ERRORS.rateLimited;
    case "user_banned":
      return AUTH_ERRORS.notAdmin;
  }
  if (error?.status === 429) return AUTH_ERRORS.rateLimited;
  if (error?.status === 400) return AUTH_ERRORS.invalidCredentials;
  return AUTH_ERRORS.unexpected;
}

/** Banners shown on the login page, keyed by ?notice= or ?error=. */
export const LOGIN_NOTICES: Record<string, { tone: "success" | "warning" | "error"; text: string }> = {
  "signed-out": { tone: "success", text: "You have been logged out safely." },
  "password-updated": { tone: "success", text: "Your password has been changed. Please log in." },
  "reset-link-expired": { tone: "warning", text: AUTH_ERRORS.sessionExpired },
  "not-admin": { tone: "error", text: AUTH_ERRORS.notAdmin },
};

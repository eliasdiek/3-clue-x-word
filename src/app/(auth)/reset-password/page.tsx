import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { NewPasswordForm } from "@/components/auth/new-password-form";

export const metadata: Metadata = { title: "Choose a New Password" };

/**
 * Reached from the emailed reset link via /auth/confirm, which creates a
 * short-lived recovery session. The proxy sends visitors without a session
 * back to /login, and the server action re-checks the session.
 */
export default function ResetPasswordPage() {
  return (
    <Card className="px-6 py-8 sm:px-10 sm:py-10">
      <h1 className="text-center text-3xl font-extrabold text-navy">Choose a new password</h1>
      <p className="mt-2 mb-6 text-center text-base text-ink-muted">
        After saving, you&apos;ll log in again with your new password.
      </p>
      <NewPasswordForm afterReset />
    </Card>
  );
}

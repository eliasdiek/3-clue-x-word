import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Forgot Password" };

export default function ForgotPasswordPage() {
  return (
    <Card className="px-6 py-8 sm:px-10 sm:py-10">
      <h1 className="text-center text-3xl font-extrabold text-navy">Forgot your password?</h1>
      <p className="mt-2 mb-6 text-center text-base text-ink-muted">
        Enter the email address you log in with and we&apos;ll send you a link to choose a new password.
      </p>
      <ForgotPasswordForm />
    </Card>
  );
}

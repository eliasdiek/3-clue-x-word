import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Admin Login" };

export default function LoginPage() {
  return (
    <Card className="px-6 py-8 sm:px-10 sm:py-10">
      <h1 id="login-heading" className="mb-6 text-center text-3xl font-extrabold text-navy">
        Admin Login
      </h1>
      {/* The form reads ?next= and ?notice= from the URL, so it renders at request time. */}
      <Suspense
        fallback={
          <div className="fade-in-delayed flex justify-center py-16 text-brand">
            <Spinner className="size-8" label="Loading login form" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </Card>
  );
}

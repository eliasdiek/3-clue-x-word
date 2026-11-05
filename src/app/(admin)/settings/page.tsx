import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/dal";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { Card, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Account Settings" };

export default function SettingsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader title="Account Settings" description="Your administrator details and password." />

      <Card className="p-6 sm:p-8">
        <h2 className="text-xl font-extrabold text-navy">Your account</h2>
        <Suspense fallback={<AccountDetailsSkeleton />}>
          <AccountDetails />
        </Suspense>
      </Card>

      {/* The password form's Server Action verifies the session itself. */}
      <Card className="p-6 sm:p-8">
        <h2 className="mb-5 text-xl font-extrabold text-navy">Change password</h2>
        <div className="max-w-md">
          <NewPasswordForm />
        </div>
      </Card>
    </div>
  );
}

const ROWS = ["Name", "Email", "Role"] as const;

async function AccountDetails() {
  const admin = await requireAdmin();
  const values: Record<(typeof ROWS)[number], string> = {
    Name: admin.displayName,
    Email: admin.email ?? "—",
    Role: admin.role === "owner" ? "Owner" : "Administrator",
  };
  return (
    <dl className="mt-4 grid gap-4 sm:grid-cols-[10rem_1fr]">
      {ROWS.map((row) => (
        <div key={row} className="contents">
          <dt className="font-bold text-ink-muted">{row}</dt>
          <dd className="text-lg text-ink">{values[row]}</dd>
        </div>
      ))}
    </dl>
  );
}

function AccountDetailsSkeleton() {
  return (
    <div role="status" className="mt-4 grid gap-4 sm:grid-cols-[10rem_1fr]">
      <span className="sr-only">Loading your account details…</span>
      {ROWS.map((row) => (
        <div key={row} aria-hidden className="contents">
          <span className="font-bold text-ink-muted">{row}</span>
          <span className="h-7 w-56 max-w-full rounded-md bg-brand-soft skeleton-pulse" />
        </div>
      ))}
    </div>
  );
}

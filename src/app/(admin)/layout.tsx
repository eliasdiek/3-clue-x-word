import { Suspense } from "react";
import { AdminHeader } from "@/components/layout/admin-header";
import { AccountMenu } from "@/components/layout/account-menu";
import { Sidebar } from "@/components/layout/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { requireAdmin } from "@/lib/auth/dal";

/**
 * Protected admin shell. The chrome (header, sidebar) is static and renders
 * instantly; everything that depends on the session streams in behind
 * Suspense. <AdminGate> verifies the admin role on the server before any
 * page content renders — the proxy redirect alone is never relied upon.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AdminHeader
        accountMenu={
          <Suspense fallback={<div className="size-11 rounded-full bg-brand-soft skeleton-pulse" />}>
            <CurrentAccountMenu />
          </Suspense>
        }
      />
      <div className="flex flex-1">
        <Sidebar />
        <main id="main" className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-10">
          <Suspense fallback={<PageLoading />}>
            <AdminGate>{children}</AdminGate>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}

async function CurrentAccountMenu() {
  const admin = await requireAdmin();
  return <AccountMenu displayName={admin.displayName} email={admin.email} />;
}

/** Only appears if loading takes longer than a moment (see .fade-in-delayed). */
function PageLoading() {
  return (
    <div className="fade-in-delayed flex items-center justify-center gap-3 py-24 text-lg text-ink-muted" role="status">
      <Spinner className="size-7 text-brand" />
      Loading…
    </div>
  );
}

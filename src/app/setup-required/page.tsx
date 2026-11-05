import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/env";
import { BrandLogo } from "@/components/layout/brand";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Setup Required" };

/** Shown instead of a crash when the Supabase environment variables are missing. */
export default function SetupRequiredPage() {
  const configured = isSupabaseConfigured();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <BrandLogo className="w-64" />
      <Card className="max-w-xl p-8">
        {configured ? (
          <>
            <h1 className="text-2xl font-extrabold text-navy">The website is configured</h1>
            <p className="mt-2 text-ink-muted">Supabase settings were found.</p>
            <ButtonLink href="/login" className="mt-6">
              Go to login
            </ButtonLink>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold text-navy">One more step: connect the database</h1>
            <p className="mt-3 text-ink-muted">
              This website needs its Supabase project details before anyone can log in. A developer should:
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-6 text-ink">
              <li>
                Copy <code className="rounded bg-canvas px-1.5 py-0.5">.env.example</code> to{" "}
                <code className="rounded bg-canvas px-1.5 py-0.5">.env.local</code>.
              </li>
              <li>Fill in the Supabase project URL and publishable key.</li>
              <li>Restart the website.</li>
            </ol>
          </>
        )}
      </Card>
    </div>
  );
}

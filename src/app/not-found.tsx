import { BrandLogo } from "@/components/layout/brand";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <BrandLogo className="w-56" />
      <h1 className="text-3xl font-extrabold text-navy">Page not found</h1>
      <p className="max-w-md text-lg text-ink-muted">That page doesn&apos;t exist or may have moved.</p>
      <ButtonLink href="/dashboard">Go to the dashboard</ButtonLink>
    </div>
  );
}

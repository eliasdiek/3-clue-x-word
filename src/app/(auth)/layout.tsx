import { BrandLogo, TileScatter, Waves } from "@/components/layout/brand";

/** Shared look for login, forgot-password and reset-password. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center overflow-hidden bg-linear-to-b from-[#f4f2ff] to-canvas px-4 pt-10 pb-40 sm:pt-14">
      <TileScatter className="absolute -top-6 -left-8 -z-10 w-56 -rotate-12 opacity-70 sm:w-72" />
      <TileScatter className="absolute top-40 -right-10 -z-10 w-48 rotate-14 opacity-60 sm:w-64" />
      <Waves className="absolute inset-x-0 bottom-0 -z-10 h-40 w-full sm:h-56" />

      <header className="flex w-full max-w-md flex-col items-center gap-4">
        <BrandLogo priority className="w-64 sm:w-80" />
        <p className="flex w-full items-center gap-4 text-sm font-extrabold tracking-[0.3em] text-ink-muted uppercase">
          <span aria-hidden className="h-px flex-1 bg-line-strong" />
          Puzzle Administration
          <span aria-hidden className="h-px flex-1 bg-line-strong" />
        </p>
      </header>

      <main className="mt-8 w-full max-w-md">{children}</main>
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "./brand";

/** Top bar: logo, section title, decorative waves and the account menu. */
export function AdminHeader({ accountMenu }: { accountMenu: ReactNode }) {
  return (
    // z-20 keeps the header (and the account dropdown that hangs below it)
    // above the page. Only the decorative waves are clipped, not the header,
    // so the dropdown can extend past the header's bottom edge.
    <header className="relative isolate z-20 flex h-20 items-center gap-4 border-b border-line bg-surface px-4 sm:h-24 sm:gap-6 sm:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <svg
          viewBox="0 0 800 100"
          preserveAspectRatio="none"
          className="absolute inset-y-0 right-0 h-full w-3/5 opacity-80"
        >
          <path d="M0 100 C 200 95, 380 20, 800 0 L800 100 Z" className="fill-harder/70" />
          <path d="M120 100 C 320 90, 500 40, 800 30 L800 100 Z" className="fill-medium/70" />
          <path d="M260 100 C 460 95, 620 70, 800 65 L800 100 Z" className="fill-easier/80" />
        </svg>
      </div>

      <Link href="/dashboard" className="shrink-0 rounded-lg" aria-label="3-Clue X-Word dashboard">
        <BrandLogo priority className="w-32 sm:w-44" />
      </Link>
      <span aria-hidden className="hidden h-10 w-px bg-line-strong sm:block" />
      <p className="hidden text-xl font-bold text-navy/80 sm:block">Puzzle Administration</p>
      <div className="ml-auto">{accountMenu}</div>
    </header>
  );
}

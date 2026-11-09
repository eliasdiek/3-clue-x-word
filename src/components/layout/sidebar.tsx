"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TileScatter } from "./brand";
import { activeNavHref, NAV_ITEMS } from "./nav-items";

/**
 * Dark navy navigation; the current page is highlighted in purple. The links
 * are static. The highlight depends on the address, which on pages like
 * /puzzles/[id] is only known at request time, so it streams in behind
 * Suspense (the fallback is the same links without a highlight).
 */
export function Sidebar() {
  return (
    // Fills the height beside the scrolling page; scrolls itself only if the
    // window is too short for all the links.
    <nav
      aria-label="Main"
      className="relative flex w-20 shrink-0 flex-col overflow-x-hidden overflow-y-auto bg-navy px-3 py-8 lg:w-64 lg:px-4"
    >
      <Suspense fallback={<NavLinks active={null} />}>
        <HighlightedNavLinks />
      </Suspense>
      <TileScatter variant="navy" className="absolute -bottom-4 -left-4 w-48 rotate-12" />
    </nav>
  );
}

function HighlightedNavLinks() {
  return <NavLinks active={activeNavHref(usePathname())} />;
}

function NavLinks({ active }: { active: string | null }) {
  return (
    <ul className="relative z-10 flex flex-col gap-2">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const current = active === href;
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              title={label}
              className={cn(
                "flex h-13 items-center gap-4 rounded-xl px-3 text-lg font-bold text-white transition-colors lg:px-4",
                current ? "bg-brand shadow-lg shadow-black/20" : "hover:bg-navy-soft",
              )}
            >
              <Icon aria-hidden className="size-6 shrink-0" strokeWidth={2} />
              <span className="sr-only lg:not-sr-only">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

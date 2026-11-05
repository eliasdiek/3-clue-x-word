import { BookOpen, LayoutDashboard, ListChecks, Quote, Settings, SquarePlus, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra path prefixes that should also highlight this item. */
  matches?: string[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/puzzles/new", label: "Create Puzzle", icon: SquarePlus },
  { href: "/puzzles", label: "Puzzle List", icon: ListChecks, matches: ["/puzzles/"] },
  { href: "/dictionary", label: "Clue Dictionary", icon: BookOpen },
  { href: "/quotes", label: "Daily Quotes", icon: Quote },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Chooses the single most specific nav item for the current path. */
export function activeNavHref(pathname: string): string | null {
  let best: { href: string; length: number } | null = null;
  for (const item of NAV_ITEMS) {
    const candidates = [item.href, ...(item.matches ?? [])];
    for (const prefix of candidates) {
      const hit = pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
      if (hit && (!best || prefix.length > best.length)) best = { href: item.href, length: prefix.length };
    }
  }
  return best?.href ?? null;
}

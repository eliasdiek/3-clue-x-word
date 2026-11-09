"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Spinner } from "./spinner";

const SEARCH_DELAY_MS = 350;

type ListFiltersProps = {
  searchLabel: string;
  /** A select stored in the URL under `name` (an empty value removes it). */
  select: { name: string; label: string; options: readonly { value: string; label: string }[] };
};

/** Search box and one select for a list page. State lives in the URL, so results can be bookmarked. */
export function ListFilters({ searchLabel, select }: ListFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");

  function navigate(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page"); // new filters start from the first page
    const search = next.toString();
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false }));
  }

  // Search as you type, after a short pause.
  useEffect(() => {
    if (query === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => navigate({ q: query.trim() }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate reads the latest params
  }, [query]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-64 flex-1 sm:max-w-md">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-muted" />
        <label htmlFor="list-search" className="sr-only">
          {searchLabel}
        </label>
        <input
          id="list-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={`${searchLabel}…`}
          className="h-12 w-full rounded-xl border-2 border-line-strong bg-surface pr-3 pl-11 text-base text-ink outline-none focus:border-brand"
        />
      </div>
      <label htmlFor="list-select" className="sr-only">
        {select.label}
      </label>
      <select
        id="list-select"
        value={params.get(select.name) ?? ""}
        onChange={(event) => navigate({ [select.name]: event.currentTarget.value })}
        className="h-12 rounded-xl border-2 border-line-strong bg-surface px-3 text-base font-semibold text-navy outline-none focus:border-brand"
      >
        {select.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {pending ? <Spinner className="size-5 text-brand" label="Updating the list" /> : null}
    </div>
  );
}

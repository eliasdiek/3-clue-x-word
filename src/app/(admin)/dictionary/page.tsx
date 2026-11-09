import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDateTime } from "@/lib/utils";
import { ClueSetCard } from "@/components/dictionary/clue-set-card";
import { Card, PageHeader } from "@/components/ui/card";
import { ListFilters } from "@/components/ui/list-filters";

export const metadata: Metadata = { title: "Clue Dictionary" };

const PAGE_SIZE = 25;
const SORTS = [
  { value: "", label: "Most used first" },
  { value: "az", label: "A to Z" },
  { value: "recent", label: "Recently used first" },
] as const;

type SearchParams = Promise<{ q?: string; sort?: string; page?: string }>;

export default function DictionaryPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clue Dictionary"
        description="Every word from your published puzzles, with the clues it was given. Added automatically when you publish."
      />
      <Suspense fallback={<div className="h-12" />}>
        <ListFilters searchLabel="Search words" select={{ name: "sort", label: "Sort", options: SORTS }} />
      </Suspense>
      <Suspense fallback={<DictionarySkeleton />}>
        <DictionaryRows searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DictionaryRows({ searchParams }: { searchParams: SearchParams }) {
  const { q = "", sort = "", page: pageParam } = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const search = q.trim().toUpperCase().replace(/[^A-Z]/g, "");

  let query = supabase
    .from("dictionary_word_summaries")
    .select("id, normalized_word, word_length, clue_set_count, usage_count, last_used_at", { count: "exact" })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (search) query = query.like("normalized_word", `${search}%`);
  if (sort === "az") query = query.order("normalized_word");
  else if (sort === "recent") query = query.order("last_used_at", { ascending: false, nullsFirst: false });
  else query = query.order("usage_count", { ascending: false }).order("normalized_word");

  const { data: words, count, error } = await query;
  if (error) throw new Error("We couldn't load the dictionary. Please refresh the page.");

  if (!words?.length) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <BookOpen aria-hidden className="size-10 text-brand" />
        <p className="max-w-lg text-lg text-ink-muted">
          {search
            ? `No words start with “${search}”.`
            : "The dictionary is empty. It fills itself with every word and its three clues each time you publish a puzzle."}
        </p>
      </Card>
    );
  }

  const ids = words.map((w) => w.id);
  const [{ data: sets }, { data: usages }] = await Promise.all([
    supabase
      .from("dictionary_clue_sets")
      .select("id, dictionary_word_id, harder_clue, medium_clue, easier_clue, updated_at")
      .in("dictionary_word_id", ids)
      .order("updated_at", { ascending: false }),
    supabase
      .from("dictionary_word_usages")
      .select("dictionary_word_id, clue_set_id, puzzle_id, used_at")
      .in("dictionary_word_id", ids)
      .order("used_at", { ascending: false }),
  ]);
  const puzzleIds = [...new Set((usages ?? []).map((u) => u.puzzle_id))];
  const { data: puzzles } = puzzleIds.length
    ? await supabase.from("puzzles").select("id, puzzle_number").in("id", puzzleIds)
    : { data: [] };
  const numberOf = new Map((puzzles ?? []).map((p) => [p.id, p.puzzle_number]));

  const total = count ?? 0;
  const pages = Math.ceil(total / PAGE_SIZE);
  const first = (page - 1) * PAGE_SIZE + 1;
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sort) params.set("sort", sort);
    if (n > 1) params.set("page", String(n));
    const qs = params.toString();
    return qs ? `/dictionary?${qs}` : "/dictionary";
  };

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line">
        {words.map((word) => {
          const wordSets = (sets ?? []).filter((s) => s.dictionary_word_id === word.id);
          const wordUsages = (usages ?? []).filter((u) => u.dictionary_word_id === word.id);
          return (
            <li key={word.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4 hover:bg-canvas">
                  <span className="min-w-40 font-grid text-xl font-bold tracking-wide text-navy">{word.normalized_word}</span>
                  <span className="text-base text-ink-muted">{word.word_length} letters</span>
                  <span className="text-base text-ink">
                    {word.clue_set_count} clue set{word.clue_set_count === 1 ? "" : "s"}
                  </span>
                  <span className="text-base text-ink">
                    Used {word.usage_count} time{word.usage_count === 1 ? "" : "s"}
                  </span>
                  <span className="text-base text-ink-muted">
                    {word.last_used_at ? `Last used ${formatDateTime(word.last_used_at)}` : "Not used yet"}
                  </span>
                  <ChevronDown aria-hidden className="ml-auto size-5 text-ink-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="flex flex-col gap-3 bg-canvas/60 px-5 pt-1 pb-5">
                  {wordSets.length ? (
                    wordSets.map((set) => {
                      const used = wordUsages.filter((u) => u.clue_set_id === set.id);
                      const numbers = [...new Set(used.map((u) => numberOf.get(u.puzzle_id)).filter(Boolean))];
                      return (
                        <ClueSetCard
                          key={set.id}
                          id={set.id}
                          word={word.normalized_word}
                          clues={{ harder: set.harder_clue, medium: set.medium_clue, easier: set.easier_clue }}
                          usedIn={numbers.length ? `Used in puzzle ${numbers.map((n) => `#${n}`).join(", ")}` : "Not in any published puzzle now"}
                        />
                      );
                    })
                  ) : (
                    <p className="text-base text-ink-muted">No clue sets left for this word.</p>
                  )}
                  {wordUsages.length ? (
                    <p className="text-sm text-ink-muted">
                      Usage history:{" "}
                      {wordUsages.map((u, i) => {
                        const n = numberOf.get(u.puzzle_id);
                        return (
                          <span key={`${u.puzzle_id}-${i}`}>
                            {i > 0 ? ", " : ""}
                            <Link href={`/puzzles/${u.puzzle_id}/review`} className="font-semibold text-brand hover:underline">
                              {n ? `#${n}` : "puzzle"}
                            </Link>{" "}
                            ({formatDateTime(u.used_at)})
                          </span>
                        );
                      })}
                    </p>
                  ) : null}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
        <p className="text-base text-ink-muted">
          Showing {first}–{first + words.length - 1} of {total} word{total === 1 ? "" : "s"}
        </p>
        {pages > 1 ? (
          <div className="flex items-center gap-2">
            <PageLink href={pageHref(page - 1)} disabled={page <= 1} label="Previous page">
              <ChevronLeft aria-hidden className="size-5" />
            </PageLink>
            <span className="px-2 font-bold text-navy">
              Page {page} of {pages}
            </span>
            <PageLink href={pageHref(page + 1)} disabled={page >= pages} label="Next page">
              <ChevronRight aria-hidden className="size-5" />
            </PageLink>
          </div>
        ) : null}
      </nav>
    </Card>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  const classes = "flex size-11 items-center justify-center rounded-xl border-2 border-line-strong bg-surface text-navy";
  if (disabled) {
    return (
      <span aria-disabled className={cn(classes, "opacity-40")} title={label}>
        {children}
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <Link href={href} className={cn(classes, "hover:border-brand hover:text-brand")} aria-label={label}>
      {children}
    </Link>
  );
}

function DictionarySkeleton() {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Loading the dictionary…</span>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-14 rounded-xl bg-brand-soft skeleton-pulse" />
      ))}
    </div>
  );
}

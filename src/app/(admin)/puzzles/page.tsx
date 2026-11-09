import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { isStage, STAGE_FILTERS, STAGES, stageHref } from "@/lib/puzzle/stages";
import { cn, formatDateTime } from "@/lib/utils";
import { ListFilters } from "@/components/ui/list-filters";
import { PuzzleRowActions } from "@/components/puzzle/puzzle-row-actions";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Puzzle List" };

const PAGE_SIZE = 20;

type SearchParams = Promise<{ q?: string; stage?: string; page?: string }>;

export default function PuzzleListPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Puzzle List"
        description="Every puzzle, most recently changed first."
        actions={
          <ButtonLink href="/puzzles/new" size="lg" icon={<Plus aria-hidden className="size-5" />}>
            Create New Puzzle
          </ButtonLink>
        }
      />
      <Suspense fallback={<div className="h-12" />}>
        <ListFilters
          searchLabel="Search by puzzle number or title"
          select={{ name: "stage", label: "Show", options: STAGE_FILTERS }}
        />
      </Suspense>
      <Card className="overflow-hidden">
        <Suspense fallback={<ListSkeleton />}>
          <PuzzleRows searchParams={searchParams} />
        </Suspense>
      </Card>
    </div>
  );
}

async function PuzzleRows({ searchParams }: { searchParams: SearchParams }) {
  const { q = "", stage, page: pageParam } = await searchParams;
  await requireAdmin();
  const supabase = await createClient();

  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  let query = supabase
    .from("puzzle_summaries")
    .select("id, puzzle_number, title, stage, word_count, completed_clue_count, updated_at, published_at", {
      count: "exact",
    })
    .order("updated_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  query = isStage(stage) ? query.eq("stage", stage) : query.neq("stage", "archived");
  const search = q.trim();
  if (/^#?\d+$/.test(search)) {
    query = query.eq("puzzle_number", Number(search.replace("#", "")));
  } else if (search) {
    // Escape LIKE wildcards so the search matches the text literally.
    query = query.ilike("title", `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }

  const { data: rows, count, error } = await query;
  if (error) throw new Error("We couldn't load your puzzles. Please refresh the page.");
  const total = count ?? 0;

  if (!rows?.length) {
    return (
      <p className="px-6 py-14 text-center text-lg text-ink-muted">
        {search || stage ? "No puzzles match. Try a different search or filter." : "No puzzles yet. Click “Create New Puzzle” to start one."}
      </p>
    );
  }

  const first = (page - 1) * PAGE_SIZE + 1;
  const last = first + rows.length - 1;
  const pages = Math.ceil(total / PAGE_SIZE);
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (stage) params.set("stage", stage);
    if (n > 1) params.set("page", String(n));
    const qs = params.toString();
    return qs ? `/puzzles?${qs}` : "/puzzles";
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-base">
          <thead className="bg-brand-soft/60 text-sm font-bold text-navy">
            <tr>
              <th scope="col" className="px-5 py-3">#</th>
              <th scope="col" className="px-5 py-3">Title</th>
              <th scope="col" className="px-5 py-3">Status</th>
              <th scope="col" className="px-5 py-3">Clues done</th>
              <th scope="col" className="px-5 py-3">Last updated</th>
              <th scope="col" className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const name = row.puzzle_number ? `puzzle #${row.puzzle_number}` : row.title ? `“${row.title}”` : "this draft";
              return (
                <tr key={row.id} className="hover:bg-canvas">
                  <td className="px-5 py-3 font-bold text-navy tabular-nums">
                    {row.puzzle_number ? `#${row.puzzle_number}` : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <Link href={stageHref(row.id, row.stage)} className="font-semibold text-navy underline-offset-2 hover:text-brand hover:underline">
                      {row.title ?? (row.puzzle_number ? `Puzzle #${row.puzzle_number}` : "Untitled draft")}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn("rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap", STAGES[row.stage].badge)}>
                      {STAGES[row.stage].label}
                    </span>
                  </td>
                  <td className="px-5 py-3 tabular-nums">
                    {row.stage === "grid" ? "—" : `${row.completed_clue_count} / ${row.word_count}`}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-ink-muted">{formatDateTime(row.updated_at)}</td>
                  <td className="px-5 py-2">
                    <PuzzleRowActions id={row.id} name={name} stage={row.stage} everPublished={Boolean(row.published_at)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
        <p className="text-base text-ink-muted">
          Showing {first}–{last} of {total} puzzle{total === 1 ? "" : "s"}
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
    </>
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

function ListSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-3 p-5">
      <span className="sr-only">Loading puzzles…</span>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-12 rounded-lg bg-brand-soft skeleton-pulse" />
      ))}
    </div>
  );
}

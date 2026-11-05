import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { PuzzleSummaryRow } from "@/lib/supabase/database.types";
import { formatDateTime } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Puzzle List" };

/**
 * A simple list so drafts can be reopened. Search, filters, paging and the
 * row actions (preview, duplicate, archive) arrive in build step 4.
 */
export default function PuzzleListPage() {
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
      <Card className="overflow-hidden">
        <Suspense fallback={<ListSkeleton />}>
          <PuzzleRows />
        </Suspense>
      </Card>
      <p className="text-base text-ink-muted">Search, filters and more actions arrive in build step 4.</p>
    </div>
  );
}

function describe(row: Pick<PuzzleSummaryRow, "status" | "grid_finalized_at" | "word_count" | "completed_clue_count">) {
  if (row.status === "published") return { label: "Published", className: "bg-success text-success-ink" };
  if (row.status === "archived") return { label: "Archived", className: "bg-line text-ink-muted" };
  if (!row.grid_finalized_at) return { label: "Building grid", className: "bg-warning text-warning-ink" };
  if (row.completed_clue_count < row.word_count) return { label: "Adding clues", className: "bg-easier text-easier-ink" };
  return { label: "Ready to publish", className: "bg-brand-soft text-brand" };
}

async function PuzzleRows() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("puzzle_summaries")
    .select("id, puzzle_number, status, grid_finalized_at, word_count, completed_clue_count, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("We couldn't load your puzzles. Please refresh the page.");

  if (!rows?.length) {
    return <p className="px-6 py-12 text-center text-lg text-ink-muted">No puzzles yet. Click “Create New Puzzle” to start one.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-base">
        <thead className="bg-brand-soft/60 text-sm font-bold text-navy">
          <tr>
            <th scope="col" className="px-5 py-3">
              #
            </th>
            <th scope="col" className="px-5 py-3">
              Status
            </th>
            <th scope="col" className="px-5 py-3">
              Words
            </th>
            <th scope="col" className="px-5 py-3">
              Clues done
            </th>
            <th scope="col" className="px-5 py-3">
              Last updated
            </th>
            <th scope="col" className="px-5 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => {
            const status = describe(row);
            return (
              <tr key={row.id} className="hover:bg-canvas">
                <td className="px-5 py-3 font-bold text-navy">{row.puzzle_number ? `#${row.puzzle_number}` : "Draft"}</td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${status.className}`}>{status.label}</span>
                </td>
                <td className="px-5 py-3 tabular-nums">{row.grid_finalized_at ? row.word_count : "—"}</td>
                <td className="px-5 py-3 tabular-nums">
                  {row.grid_finalized_at ? `${row.completed_clue_count} / ${row.word_count}` : "—"}
                </td>
                <td className="px-5 py-3 text-ink-muted">{formatDateTime(row.updated_at)}</td>
                <td className="px-5 py-3 text-right">
                  <Link href={`/puzzles/${row.id}/grid`} className="font-bold text-brand underline-offset-2 hover:underline">
                    Open<span className="sr-only"> puzzle {row.puzzle_number ?? "draft"}</span>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-3 p-5">
      <span className="sr-only">Loading puzzles…</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-10 rounded-lg bg-brand-soft skeleton-pulse" />
      ))}
    </div>
  );
}

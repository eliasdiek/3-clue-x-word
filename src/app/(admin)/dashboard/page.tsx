import { Suspense } from "react";
import type { Metadata } from "next";
import { Grid3x3, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { computeDashboardStats } from "@/lib/dashboard/stats";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The heading and actions are static, so they appear the moment the page is
 * opened; the figures stream in behind a skeleton of the same size.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description="Your puzzles at a glance."
        actions={
          <ButtonLink href="/puzzles/new" size="lg" icon={<Plus aria-hidden className="size-5" />}>
            Create New Puzzle
          </ButtonLink>
        }
      />
      <Suspense fallback={<StatCardsSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: rows, error }, { data: nextNumber }] = await Promise.all([
    supabase.from("puzzle_summaries").select("status, word_count, completed_clue_count, grid_finalized_at"),
    supabase.rpc("next_puzzle_number"),
  ]);

  if (error) {
    console.error("[dashboard] failed to load puzzle summaries:", error.message);
    throw new Error("We couldn't load your puzzles. Please refresh the page.");
  }

  const stats = computeDashboardStats(rows ?? []);

  return (
    <>
      <StatCards stats={stats} />

      {stats.total === 0 ? (
        <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <Grid3x3 aria-hidden className="size-9" />
          </span>
          <h2 className="text-2xl font-extrabold text-navy">No puzzles yet</h2>
          <p className="max-w-md text-lg text-ink-muted">
            Start your first crossword: type letters into a blank 12×12 grid, then add three clues for every word.
          </p>
          <ButtonLink href="/puzzles/new" size="lg" icon={<Plus aria-hidden className="size-5" />}>
            Create Puzzle
          </ButtonLink>
        </Card>
      ) : (
        <Alert tone="info">
          The searchable puzzle list (open, preview, duplicate, archive) arrives in the next build step.
        </Alert>
      )}

      {nextNumber ? (
        <p className="text-base text-ink-muted">
          The next puzzle you publish will be <strong className="text-navy">#{nextNumber}</strong>.
        </p>
      ) : null}
    </>
  );
}

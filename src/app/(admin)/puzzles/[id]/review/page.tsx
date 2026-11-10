import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { loadPuzzleWithClues } from "@/lib/puzzle/load";
import { validateForPublish } from "@/lib/puzzle/publish";
import { PuzzleSteps } from "@/components/puzzle/puzzle-steps";
import { ReviewView } from "@/components/puzzle/review-view";
import { PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Review & Store" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<ReviewSkeleton />}>
      <ReviewLoader params={params} />
    </Suspense>
  );
}

async function ReviewLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  await requireAdmin();
  const supabase = await createClient();
  const puzzle = await loadPuzzleWithClues(supabase, id);
  if (!puzzle) notFound();

  const published = Boolean(puzzle.publishedAt);
  // The same checks the publish Server Action runs, shown up front.
  const problems = published ? [] : validateForPublish(puzzle);

  const [{ data: nextNumber }, { data: known }] = await Promise.all([
    published ? Promise.resolve({ data: null }) : supabase.rpc("next_puzzle_number"),
    supabase
      .from("dictionary_words")
      .select("normalized_word")
      .in("normalized_word", [...new Set(puzzle.words.map((w) => w.answer))]),
  ]);

  // Once published, the puzzle's own words are in the dictionary too.
  const reused = published ? 0 : (known?.length ?? 0);

  return <ReviewView puzzle={puzzle} problems={problems} nextNumber={nextNumber ?? null} reusedWordCount={reused} />;
}

function ReviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status">
      <span className="sr-only">Loading the review…</span>
      <PageHeader title="Puzzle" description="Review & store: check the finished puzzle, then store it." />
      <PuzzleSteps current={3} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,44rem)_minmax(18rem,1fr)]">
        <div className="aspect-square w-full max-w-[44rem] rounded-card bg-brand-soft skeleton-pulse" />
        <div className="h-96 rounded-card bg-brand-soft skeleton-pulse" />
      </div>
    </div>
  );
}

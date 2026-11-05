import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { parseGrid } from "@/lib/puzzle/grid";
import { GridEditor, type WordWithClues } from "@/components/puzzle/grid-editor";
import { PuzzleSteps } from "@/components/puzzle/puzzle-steps";
import { PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Grid Editor" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function PuzzleGridPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <PuzzleGridLoader params={params} />
    </Suspense>
  );
}

async function PuzzleGridLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  await requireAdmin();
  const supabase = await createClient();

  const { data: puzzle } = await supabase
    .from("puzzles")
    .select("id, puzzle_number, status, grid_data, grid_finalized_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!puzzle) notFound();

  const grid = parseGrid(puzzle.grid_data);
  if (!grid) throw new Error("This puzzle's grid could not be read.");

  // Words that already have clue text, so the editor can warn before losing them.
  const { data: words } = await supabase
    .from("puzzle_words")
    .select("id, clue_number, direction, answer, start_row, start_column")
    .eq("puzzle_id", id)
    .order("direction")
    .order("clue_number");
  const wordIds = (words ?? []).map((w) => w.id);
  const { data: clues } = wordIds.length
    ? await supabase
        .from("puzzle_clues")
        .select("puzzle_word_id, harder_clue, medium_clue, easier_clue")
        .in("puzzle_word_id", wordIds)
    : { data: [] };
  const withText = new Set(
    (clues ?? [])
      .filter((c) => [c.harder_clue, c.medium_clue, c.easier_clue].some((t) => t.trim() !== ""))
      .map((c) => c.puzzle_word_id),
  );
  const wordsWithClues: WordWithClues[] = (words ?? [])
    .filter((w) => withText.has(w.id))
    .map((w) => ({
      number: w.clue_number,
      direction: w.direction,
      answer: w.answer,
      startRow: w.start_row,
      startColumn: w.start_column,
    }));

  return (
    <GridEditor
      key={puzzle.id}
      initial={{
        puzzleId: puzzle.id,
        puzzleNumber: puzzle.puzzle_number,
        status: puzzle.status,
        grid,
        finished: Boolean(puzzle.grid_finalized_at),
        updatedAt: puzzle.updated_at,
        wordsWithClues,
      }}
    />
  );
}

function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status">
      <span className="sr-only">Loading the puzzle…</span>
      <PageHeader title="Puzzle" description="Crossword grid editor" />
      <PuzzleSteps current={1} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,44rem)_minmax(16rem,1fr)]">
        <div className="aspect-square w-full max-w-[44rem] rounded-card bg-brand-soft skeleton-pulse" />
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-card bg-brand-soft skeleton-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

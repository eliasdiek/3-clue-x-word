import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { parseGrid, toFinishedGrid } from "@/lib/puzzle/grid";
import { ClueEditor, type ClueSuggestion, type ClueWord } from "@/components/puzzle/clue-editor";
import { PuzzleSteps } from "@/components/puzzle/puzzle-steps";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Clue Editor" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUGGESTIONS_PER_WORD = 5;

export default function PuzzleCluesPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<CluesSkeleton />}>
      <PuzzleCluesLoader params={params} />
    </Suspense>
  );
}

async function PuzzleCluesLoader({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: words } = await supabase
    .from("puzzle_words")
    .select("id, clue_number, direction, answer, cell_positions")
    .eq("puzzle_id", id)
    .order("direction")
    .order("clue_number");

  if (!words?.length) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={puzzle.puzzle_number ? `Puzzle #${puzzle.puzzle_number}` : "Draft Puzzle"} />
        <PuzzleSteps current={2} links={{ 1: `/puzzles/${id}/grid` }} />
        <Card className="flex flex-col items-start gap-4 p-6">
          <p className="text-lg text-ink">
            There are no words yet. Type the crossword into the grid and click <strong>Done</strong>; the word list for the
            clues is made from the grid.
          </p>
          <ButtonLink href={`/puzzles/${id}/grid`}>Go to the Grid</ButtonLink>
        </Card>
      </div>
    );
  }

  const [{ data: clues }, { data: dictionaryWords }] = await Promise.all([
    supabase
      .from("puzzle_clues")
      .select("puzzle_word_id, harder_clue, medium_clue, easier_clue, source_clue_set_id")
      .in(
        "puzzle_word_id",
        words.map((w) => w.id),
      ),
    supabase
      .from("dictionary_words")
      .select("id, normalized_word")
      .in("normalized_word", [...new Set(words.map((w) => w.answer))]),
  ]);

  // Clue sets used for the same words in earlier published puzzles.
  const suggestions: Record<string, ClueSuggestion[]> = {};
  if (dictionaryWords?.length) {
    const answerById = new Map(dictionaryWords.map((d) => [d.id, d.normalized_word]));
    const { data: sets } = await supabase
      .from("dictionary_clue_sets")
      .select("id, dictionary_word_id, harder_clue, medium_clue, easier_clue, updated_at")
      .in("dictionary_word_id", [...answerById.keys()])
      .order("updated_at", { ascending: false });
    for (const set of sets ?? []) {
      const answer = answerById.get(set.dictionary_word_id);
      if (!answer) continue;
      const list = (suggestions[answer] ??= []);
      if (list.length < SUGGESTIONS_PER_WORD) {
        list.push({ id: set.id, harder: set.harder_clue, medium: set.medium_clue, easier: set.easier_clue });
      }
    }
  }

  const clueByWord = new Map((clues ?? []).map((c) => [c.puzzle_word_id, c]));
  const clueWords: ClueWord[] = words.map((w) => {
    const c = clueByWord.get(w.id);
    return {
      wordId: w.id,
      number: w.clue_number,
      direction: w.direction,
      answer: w.answer,
      cells: w.cell_positions,
      harder: c?.harder_clue ?? "",
      medium: c?.medium_clue ?? "",
      easier: c?.easier_clue ?? "",
      sourceClueSetId: c?.source_clue_set_id ?? null,
    };
  });

  return (
    <ClueEditor
      key={puzzle.id}
      initial={{
        puzzleId: puzzle.id,
        puzzleNumber: puzzle.puzzle_number,
        status: puzzle.status,
        grid: toFinishedGrid(grid),
        gridFinished: Boolean(puzzle.grid_finalized_at),
        updatedAt: puzzle.updated_at,
        words: clueWords,
        suggestions,
      }}
    />
  );
}

function CluesSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status">
      <span className="sr-only">Loading the clues…</span>
      <PageHeader title="Puzzle" description="Clue editor: add a Harder, Medium and Easier clue for every word." />
      <PuzzleSteps current={2} />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-card bg-brand-soft skeleton-pulse" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-brand-soft skeleton-pulse" />
        ))}
      </div>
    </div>
  );
}

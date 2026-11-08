import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PuzzleStatus } from "@/lib/supabase/database.types";
import { parseGrid, type GridRows } from "./grid";
import type { StoredWord } from "./publish";

export type LoadedPuzzle = {
  id: string;
  puzzleNumber: number | null;
  status: PuzzleStatus;
  grid: GridRows;
  gridFinished: boolean;
  updatedAt: string;
  publishedAt: string | null;
  words: (StoredWord & { wordId: string })[];
};

/**
 * Reads a puzzle with its words and clues (under RLS, as the signed-in
 * administrator). Words come back across first, then down, in number order.
 * Returns null when the puzzle doesn't exist or can't be seen.
 */
export async function loadPuzzleWithClues(supabase: SupabaseClient<Database>, id: string): Promise<LoadedPuzzle | null> {
  const { data: puzzle } = await supabase
    .from("puzzles")
    .select("id, puzzle_number, status, grid_data, grid_finalized_at, updated_at, published_at")
    .eq("id", id)
    .maybeSingle();
  if (!puzzle) return null;
  const grid = parseGrid(puzzle.grid_data);
  if (!grid) throw new Error("This puzzle's grid could not be read.");

  const { data: words, error } = await supabase
    .from("puzzle_words")
    .select("id, clue_number, direction, answer, start_row, start_column, cell_positions")
    .eq("puzzle_id", id)
    .order("direction")
    .order("clue_number");
  if (error) throw new Error("This puzzle's words could not be loaded.");

  const ids = (words ?? []).map((w) => w.id);
  const { data: clues } = ids.length
    ? await supabase.from("puzzle_clues").select("puzzle_word_id, harder_clue, medium_clue, easier_clue").in("puzzle_word_id", ids)
    : { data: [] };
  const byWord = new Map((clues ?? []).map((c) => [c.puzzle_word_id, c]));

  return {
    id: puzzle.id,
    puzzleNumber: puzzle.puzzle_number,
    status: puzzle.status,
    grid,
    gridFinished: Boolean(puzzle.grid_finalized_at),
    updatedAt: puzzle.updated_at,
    publishedAt: puzzle.published_at,
    words: (words ?? []).map((w) => {
      const c = byWord.get(w.id);
      return {
        wordId: w.id,
        number: w.clue_number,
        direction: w.direction,
        answer: w.answer,
        startRow: w.start_row,
        startColumn: w.start_column,
        cells: w.cell_positions,
        harder: c?.harder_clue ?? "",
        medium: c?.medium_clue ?? "",
        easier: c?.easier_clue ?? "",
      };
    }),
  };
}

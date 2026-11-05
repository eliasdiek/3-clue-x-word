import type { Metadata } from "next";
import { GridEditor } from "@/components/puzzle/grid-editor";
import { emptyGrid } from "@/lib/puzzle/grid";

export const metadata: Metadata = { title: "Create Puzzle" };

/**
 * A clean white board. Nothing is stored until the first letter is typed;
 * the editor then creates the draft and switches the address to its own page.
 * Every save goes through Server Actions that verify the administrator.
 */
export default function NewPuzzlePage() {
  return (
    <GridEditor
      initial={{
        puzzleId: null,
        puzzleNumber: null,
        status: "draft",
        grid: emptyGrid(),
        finished: false,
        updatedAt: null,
        wordsWithClues: [],
      }}
    />
  );
}

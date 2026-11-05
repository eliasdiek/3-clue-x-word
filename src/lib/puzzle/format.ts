/**
 * Labels and messages in the exact formats used by the client specification
 * (Crossword 3 Clue #3.docx). Rows and columns are 0-based in code and in the
 * database, and 1-based in everything shown to people.
 */
import type { WordDirection } from "@/lib/supabase/database.types";

/** Word position label, e.g. 3 + "down" → "3d" (POSN / Wordnum). */
export function wordLabel(number: number, direction: WordDirection): string {
  return `${number}${direction === "across" ? "a" : "d"}`;
}

/** Square reference, e.g. row 0, column 4 → "R01C05" (STARTPOS / SQNUM). */
export function squareRef(row: number, column: number): string {
  const pad = (n: number) => String(n + 1).padStart(2, "0");
  return `R${pad(row)}C${pad(column)}`;
}

export type ClueCheckItem = {
  number: number;
  direction: WordDirection;
  answer: string;
  /** Number of the three clues that are filled in (0–3). */
  cluesFilled: number;
};

export const ALL_CLUES_PRESENT_MESSAGE = "All words are present and have 3 clues";

/**
 * The report shown after "Done": either the all-clear message or one line per
 * word that is missing clues, e.g. "Word 4d, SASH has no clues" and
 * "Word 7a, VALLEYS only has 2 clues". Words are listed across first, then
 * down, each in number order, which is the order the solver sees them.
 */
export function clueCheckReport(words: ClueCheckItem[]): { ok: boolean; lines: string[] } {
  const problems = [...words]
    .filter((word) => word.cluesFilled < 3)
    .sort((a, b) => (a.direction === b.direction ? a.number - b.number : a.direction === "across" ? -1 : 1))
    .map((word) => {
      const name = `Word ${wordLabel(word.number, word.direction)}, ${word.answer}`;
      if (word.cluesFilled <= 0) return `${name} has no clues`;
      return `${name} only has ${word.cluesFilled} clue${word.cluesFilled === 1 ? "" : "s"}`;
    });
  return problems.length === 0 ? { ok: true, lines: [ALL_CLUES_PRESENT_MESSAGE] } : { ok: false, lines: problems };
}

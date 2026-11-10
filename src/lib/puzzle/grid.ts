/**
 * The crossword grid engine, following the client specification
 * (Crossword 3 Clue #3.docx, "Initialisation"):
 *
 *  - The administrator types letters onto a clean white 12×12 board.
 *  - On "Done", every square without a letter becomes a black square.
 *  - A square starts an across word if it has no letter to its left (the
 *    first column counts as "no letter") and a letter to its right; it starts
 *    a down word if it has no letter above and a letter below.
 *  - Starting squares are numbered in sequence, left to right along each row,
 *    top row first. One number can start both an across and a down word.
 *  - Words are listed across first, then down, each in number order — the
 *    order the solver meets them (the specification's IND field).
 *
 * Pure functions only: shared by the editor, the server actions and tests.
 * Rows and columns are 0-based here; see format.ts for "R01C05" labels.
 */
import { GRID_SIZE, MIN_WORD_LENGTH } from "@/lib/constants/game";
import type { WordDirection } from "@/lib/supabase/database.types";
import { squareRef } from "./format";

/** One string per row, GRID_SIZE characters each: A–Z, "." empty, "#" black. */
export type GridRows = string[];
export type CellPosition = [row: number, column: number];

export const EMPTY_CELL = ".";
export const BLOCK_CELL = "#";

export type GridWord = {
  number: number;
  direction: WordDirection;
  answer: string;
  startRow: number;
  startColumn: number;
  cells: CellPosition[];
};

export type GridAnalysis = {
  /** Clue number shown in each square's top-left corner, or null. */
  numbers: (number | null)[][];
  /** Across words in number order, then down words in number order. */
  words: GridWord[];
  /** Letters that are not part of any word of 2+ letters. */
  strayLetters: CellPosition[];
  letterCount: number;
};

const ROW_PATTERN = new RegExp(`^[A-Z.#]{${GRID_SIZE}}$`);

export function emptyGrid(): GridRows {
  return Array.from({ length: GRID_SIZE }, () => EMPTY_CELL.repeat(GRID_SIZE));
}

/** Returns the value as GridRows when it is a well-formed grid, else null. */
export function parseGrid(value: unknown): GridRows | null {
  if (!Array.isArray(value) || value.length !== GRID_SIZE) return null;
  if (!value.every((row) => typeof row === "string" && ROW_PATTERN.test(row))) return null;
  return [...value];
}

export function isLetter(value: string | undefined): boolean {
  return value !== undefined && value.length === 1 && value >= "A" && value <= "Z";
}

export function cellAt(grid: GridRows, row: number, column: number): string {
  return grid[row]?.[column] ?? EMPTY_CELL;
}

function hasLetter(grid: GridRows, row: number, column: number): boolean {
  if (row < 0 || column < 0 || row >= GRID_SIZE || column >= GRID_SIZE) return false;
  return isLetter(grid[row][column]);
}

/** Returns a copy of the grid with one square changed. */
export function withCell(grid: GridRows, row: number, column: number, value: string): GridRows {
  const next = [...grid];
  const chars = next[row].split("");
  chars[column] = value;
  next[row] = chars.join("");
  return next;
}

/** "Done": every square without a letter becomes a black square. */
export function toFinishedGrid(grid: GridRows): GridRows {
  return grid.map((row) => row.replace(/[^A-Z]/g, BLOCK_CELL));
}

/** Back to the white board for editing: black squares become empty again. */
export function toEditableGrid(grid: GridRows): GridRows {
  return grid.map((row) => row.replace(/[^A-Z]/g, EMPTY_CELL));
}

export function isGridEmpty(grid: GridRows): boolean {
  return grid.every((row) => !/[A-Z]/.test(row));
}

export function analyzeGrid(grid: GridRows): GridAnalysis {
  const numbers: (number | null)[][] = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  const across: GridWord[] = [];
  const down: GridWord[] = [];
  const inWord = Array.from({ length: GRID_SIZE }, () => Array<boolean>(GRID_SIZE).fill(false));
  let next = 1;
  let letterCount = 0;

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let column = 0; column < GRID_SIZE; column++) {
      if (!hasLetter(grid, row, column)) continue;
      letterCount++;

      const startsAcross = !hasLetter(grid, row, column - 1) && hasLetter(grid, row, column + 1);
      const startsDown = !hasLetter(grid, row - 1, column) && hasLetter(grid, row + 1, column);
      if (!startsAcross && !startsDown) continue;

      const number = next++;
      numbers[row][column] = number;
      if (startsAcross) across.push(readWord(grid, number, "across", row, column, inWord));
      if (startsDown) down.push(readWord(grid, number, "down", row, column, inWord));
    }
  }

  const strayLetters: CellPosition[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let column = 0; column < GRID_SIZE; column++) {
      if (hasLetter(grid, row, column) && !inWord[row][column]) strayLetters.push([row, column]);
    }
  }

  return { numbers, words: [...across, ...down], strayLetters, letterCount };
}

function readWord(
  grid: GridRows,
  number: number,
  direction: WordDirection,
  startRow: number,
  startColumn: number,
  inWord: boolean[][],
): GridWord {
  const [dRow, dColumn] = direction === "across" ? [0, 1] : [1, 0];
  const cells: CellPosition[] = [];
  let answer = "";
  for (let row = startRow, column = startColumn; hasLetter(grid, row, column); row += dRow, column += dColumn) {
    cells.push([row, column]);
    answer += grid[row][column];
    inWord[row][column] = true;
  }
  return { number, direction, answer, startRow, startColumn, cells };
}

/**
 * Problems that stop "Done", in plain English. Empty when the grid is fine.
 * (Words are at least MIN_WORD_LENGTH letters by construction.)
 */
export function gridProblems(analysis: GridAnalysis): string[] {
  if (analysis.letterCount === 0) return ["The grid is empty. Type the crossword's words into the grid first."];
  if (analysis.words.length === 0) {
    return [`No words found. A word needs at least ${MIN_WORD_LENGTH} letters next to each other.`];
  }
  return analysis.strayLetters.map(
    ([row, column]) =>
      `The letter at ${squareRef(row, column)} isn't part of any word. Every letter must belong to a word of at least ${MIN_WORD_LENGTH} letters.`,
  );
}

type WordIdentity = Pick<GridWord, "direction" | "answer" | "startRow" | "startColumn">;

/** Identity used to carry clues over when the grid is changed and finished again. */
export function wordKey(word: WordIdentity): string {
  return `${word.direction}:${word.startRow}:${word.startColumn}:${word.answer}`;
}

/**
 * Which existing words (those with clues) keep their clues when the grid is
 * finished again. Mirrors finish_puzzle_grid() in the database: first the
 * same direction, start square and answer; then, for words that moved, the
 * same direction and answer. Lets the editor warn before clues are lost.
 */
export function matchClueCarryOver<Old extends WordIdentity, New extends WordIdentity>(
  oldWords: Old[],
  newWords: New[],
): { kept: { from: Old; to: New }[]; dropped: Old[] } {
  const used = new Set<number>();
  const match = new Map<number, number>();
  const pass = (same: (a: Old, b: New) => boolean) => {
    newWords.forEach((word, i) => {
      if (match.has(i)) return;
      const j = oldWords.findIndex((old, index) => !used.has(index) && same(old, word));
      if (j >= 0) {
        used.add(j);
        match.set(i, j);
      }
    });
  };
  pass((a, b) => wordKey(a) === wordKey(b));
  pass((a, b) => a.direction === b.direction && a.answer === b.answer);

  return {
    kept: [...match].map(([i, j]) => ({ from: oldWords[j], to: newWords[i] })),
    dropped: oldWords.filter((_, j) => !used.has(j)),
  };
}

/**
 * The first across word (1a, or whichever across word is numbered first):
 * the leftmost run of two or more letters in the highest row that has one.
 * Works while composing too. Used to title puzzles; the SQL backfill in
 * 20261110000100_auto_titles.sql uses the same rule.
 */
export function firstAcrossWord(grid: GridRows): string | null {
  for (const row of grid) {
    const match = row.match(/[A-Z]{2,}/);
    if (match) return match[0];
  }
  return null;
}

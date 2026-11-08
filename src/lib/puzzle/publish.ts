/**
 * Publishing: the final checks and the snapshot delivered to the mobile app.
 * Pure functions, shared by the review page, the publish Server Action and
 * tests, so the browser and the server never disagree.
 */
import { CLUE_LEVEL_LABELS, CLUE_LEVELS, CLUE_MAX_LENGTH, GRID_SIZE, SCORING_RULES } from "@/lib/constants/game";
import type { WordDirection } from "@/lib/supabase/database.types";
import { cluesFilled } from "@/lib/validation/clues";
import { clueCheckReport, squareRef, wordLabel } from "./format";
import { analyzeGrid, isLetter, wordKey, type CellPosition, type GridRows } from "./grid";

/** A word as stored in the database, with its clues. */
export type StoredWord = {
  number: number;
  direction: WordDirection;
  answer: string;
  startRow: number;
  startColumn: number;
  cells: CellPosition[];
  harder: string;
  medium: string;
  easier: string;
};

export const PAYLOAD_SCHEMA_VERSION = "v1";

export type PublishedWord = {
  number: number;
  /** "1a", "3d": the specification's word label. */
  label: string;
  answer: string;
  length: number;
  startRow: number;
  startColumn: number;
  /** "R01C05": the specification's STARTPOS. */
  startSquare: string;
  cells: CellPosition[];
  clues: { harder: string; medium: string; easier: string };
};

/**
 * Version 1 of the published puzzle, as stored in puzzle_publications and
 * served to the app. puzzleId, puzzleNumber, version and publishedAt are
 * stamped by the database when it publishes, so they always match the record.
 *
 * Answers are included so the app can check letters offline. Anyone who
 * inspects the download can read them; see the README.
 */
export type PublishedPuzzlePayload = {
  schemaVersion: typeof PAYLOAD_SCHEMA_VERSION;
  gridSize: number;
  /** Solution rows: A–Z for letters, "#" for black squares. */
  solution: string[];
  blockedCells: CellPosition[];
  numberedCells: { number: number; row: number; column: number }[];
  /** Solver order: across words in number order, then down words. */
  across: PublishedWord[];
  down: PublishedWord[];
  scoring: { pointsPerLetter: { harder: number; medium: number; easier: number; showMe: number } };
  letterCount: number;
  /** Every letter solved with the Harder clue (crossing letters counted once). */
  maxScore: number;
};

/**
 * Everything that must be true before publishing. Returns plain-English
 * problems; an empty list means the puzzle can be published.
 */
export function validateForPublish(input: { grid: GridRows; gridFinished: boolean; words: StoredWord[] }): string[] {
  const { grid, gridFinished, words } = input;
  const problems: string[] = [];

  if (grid.length !== GRID_SIZE || grid.some((row) => row.length !== GRID_SIZE)) {
    return ["The grid is not 12×12. Open the grid and click Done again."];
  }
  if (!gridFinished || grid.some((row) => row.includes("."))) {
    return ["The grid was changed after Done. Open the grid and click Done again."];
  }

  const analysis = analyzeGrid(grid);
  if (analysis.words.length === 0) return ["The grid has no words."];
  for (const [row, column] of analysis.strayLetters) {
    problems.push(`The letter at ${squareRef(row, column)} isn't part of any word.`);
  }

  // The stored word list must be exactly what the grid produces now:
  // same answers, start squares, numbers and cells, nothing missing or extra.
  const expected = new Map(analysis.words.map((w) => [`${w.direction}:${w.number}`, w]));
  const stored = new Map(words.map((w) => [`${w.direction}:${w.number}`, w]));
  const mismatch =
    expected.size !== stored.size ||
    words.length !== stored.size ||
    [...expected].some(([key, w]) => {
      const s = stored.get(key);
      return (
        !s ||
        wordKey(s) !== wordKey(w) ||
        s.cells.length !== w.cells.length ||
        s.cells.some(([r, c], i) => r !== w.cells[i][0] || c !== w.cells[i][1])
      );
    });
  if (mismatch) {
    problems.push("The word list doesn't match the grid. Open the grid and click Done again.");
    return problems;
  }

  const report = clueCheckReport(
    words.map((w) => ({ number: w.number, direction: w.direction, answer: w.answer, cluesFilled: cluesFilled(w) })),
  );
  if (!report.ok) problems.push(...report.lines);

  for (const w of words) {
    for (const level of CLUE_LEVELS) {
      if (w[level].trim().length > CLUE_MAX_LENGTH) {
        problems.push(
          `Word ${wordLabel(w.number, w.direction)}, ${w.answer}: the ${CLUE_LEVEL_LABELS[level]} clue is longer than ${CLUE_MAX_LENGTH} characters.`,
        );
      }
    }
  }
  return problems;
}

/** Builds the snapshot for the app from a puzzle that passed validateForPublish(). */
export function buildPublishedPayload(input: { grid: GridRows; words: StoredWord[] }): PublishedPuzzlePayload {
  const solution = input.grid.map((row) => row.replace(/[^A-Z]/g, "#"));
  const analysis = analyzeGrid(solution);

  const blockedCells: CellPosition[] = [];
  const numberedCells: PublishedPuzzlePayload["numberedCells"] = [];
  let letterCount = 0;
  solution.forEach((row, r) => {
    [...row].forEach((value, c) => {
      if (isLetter(value)) letterCount++;
      else blockedCells.push([r, c]);
      const number = analysis.numbers[r][c];
      if (number) numberedCells.push({ number, row: r, column: c });
    });
  });

  const toPublished = (w: StoredWord): PublishedWord => ({
    number: w.number,
    label: wordLabel(w.number, w.direction),
    answer: w.answer,
    length: w.answer.length,
    startRow: w.startRow,
    startColumn: w.startColumn,
    startSquare: squareRef(w.startRow, w.startColumn),
    cells: w.cells,
    clues: { harder: w.harder.trim(), medium: w.medium.trim(), easier: w.easier.trim() },
  });
  const byNumber = (a: StoredWord, b: StoredWord) => a.number - b.number;

  return {
    schemaVersion: PAYLOAD_SCHEMA_VERSION,
    gridSize: GRID_SIZE,
    solution,
    blockedCells,
    numberedCells,
    across: input.words.filter((w) => w.direction === "across").sort(byNumber).map(toPublished),
    down: input.words.filter((w) => w.direction === "down").sort(byNumber).map(toPublished),
    scoring: { pointsPerLetter: { ...SCORING_RULES.pointsPerLetter } },
    letterCount,
    maxScore: letterCount * SCORING_RULES.maxPointsPerLetter,
  };
}

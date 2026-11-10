import { describe, expect, it } from "vitest";
import { analyzeGrid, toFinishedGrid } from "@/lib/puzzle/grid";
import { buildPublishedPayload, validateForPublish, type StoredWord } from "@/lib/puzzle/publish";
import { SAMPLE_CROSSWORD } from "../support/sample-crossword";

const GRID = toFinishedGrid(SAMPLE_CROSSWORD);

/** The sample crossword's words as the database would store them, all clued. */
const storedWords = (clue = (answer: string) => ({ harder: `H ${answer}`, medium: `M ${answer}`, easier: `E ${answer}` })): StoredWord[] =>
  analyzeGrid(GRID).words.map((w) => ({ ...w, ...clue(w.answer) }));

describe("validateForPublish", () => {
  it("passes a finished, fully clued puzzle", () => {
    expect(validateForPublish({ grid: GRID, gridFinished: true, words: storedWords() })).toEqual([]);
  });

  it("reports missing clues in the specification's words", () => {
    const words = storedWords().map((w) =>
      w.answer === "SASH" ? { ...w, harder: "", medium: "", easier: "" } : w.answer === "VALUE" ? { ...w, easier: " " } : w,
    );
    expect(validateForPublish({ grid: GRID, gridFinished: true, words })).toEqual([
      "Word 7a, VALUE only has 2 clues",
      "Word 4d, SASH has no clues",
    ]);
  });

  it("refuses a grid that was edited after Done", () => {
    expect(validateForPublish({ grid: GRID, gridFinished: false, words: storedWords() })[0]).toMatch(/click Done again/);
    expect(validateForPublish({ grid: SAMPLE_CROSSWORD, gridFinished: true, words: storedWords() })[0]).toMatch(
      /click Done again/,
    );
  });

  it("refuses a word list that no longer matches the grid", () => {
    const missing = storedWords().slice(1);
    const wrongCells = storedWords().map((w, i) => (i === 0 ? { ...w, cells: w.cells.slice().reverse() } : w));
    const renumbered = storedWords().map((w, i) => (i === 0 ? { ...w, number: 2 } : w));
    for (const words of [missing, wrongCells, renumbered]) {
      expect(validateForPublish({ grid: GRID, gridFinished: true, words })).toEqual([
        "The word list doesn't match the grid. Open the grid and click Done again.",
      ]);
    }
  });

  it("refuses clues over the length limit", () => {
    const words = storedWords().map((w, i) => (i === 0 ? { ...w, medium: "x".repeat(51) } : w));
    expect(validateForPublish({ grid: GRID, gridFinished: true, words })).toEqual([
      "Word 1a, JEALOUSY: the Medium clue is longer than 50 characters.",
    ]);
  });
});

describe("buildPublishedPayload", () => {
  const payload = buildPublishedPayload({ grid: GRID, words: storedWords() });

  it("contains the solution, black squares and numbered squares", () => {
    expect(payload.schemaVersion).toBe("v1");
    expect(payload.gridSize).toBe(12);
    expect(payload.solution[0]).toBe("JEALOUSY#SUM");
    expect(payload.blockedCells).toContainEqual([0, 8]);
    expect(payload.blockedCells).toHaveLength(144 - payload.letterCount);
    expect(payload.numberedCells.slice(0, 3)).toEqual([
      { number: 1, row: 0, column: 0 },
      { number: 2, row: 0, column: 2 },
      { number: 3, row: 0, column: 4 },
    ]);
  });

  it("lists across then down words in number order, with three clues each", () => {
    expect(payload.across.map((w) => w.label).slice(0, 3)).toEqual(["1a", "5a", "7a"]);
    expect(payload.down.map((w) => w.label).slice(0, 3)).toEqual(["1d", "2d", "3d"]);
    const sash = payload.down.find((w) => w.answer === "SASH")!;
    expect(sash).toMatchObject({
      label: "4d",
      length: 4,
      startSquare: "R01C07",
      clues: { harder: "H SASH", medium: "M SASH", easier: "E SASH" },
    });
  });

  it("includes the scoring rules and the maximum score", () => {
    expect(payload.scoring.pointsPerLetter).toEqual({ harder: 7, medium: 5, easier: 3, showMe: 0 });
    expect(payload.maxScore).toBe(payload.letterCount * 7);
  });
});

describe("chooseAutoTitle", () => {
  it("names a puzzle after its first across word, adding a number when that name is taken", async () => {
    const { chooseAutoTitle } = await import("@/lib/puzzle/format");
    expect(chooseAutoTitle("JEALOUSY", [])).toBe("JEALOUSY");
    expect(chooseAutoTitle("JEALOUSY", ["JEALOUSY"])).toBe("JEALOUSY2");
    expect(chooseAutoTitle("JEALOUSY", ["jealousy", "JEALOUSY2"])).toBe("JEALOUSY3");
    expect(chooseAutoTitle("HEAVE", ["JEALOUSY"])).toBe("HEAVE");
  });
});

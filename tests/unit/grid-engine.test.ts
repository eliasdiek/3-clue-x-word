import { describe, expect, it } from "vitest";
import {
  analyzeGrid,
  emptyGrid,
  gridProblems,
  isGridEmpty,
  matchClueCarryOver,
  parseGrid,
  toEditableGrid,
  toFinishedGrid,
  withCell,
  wordKey,
} from "@/lib/puzzle/grid";
import { wordLabel } from "@/lib/puzzle/format";
import { SAMPLE_CROSSWORD as SAMPLE } from "../support/sample-crossword";

const labels = (grid: string[]) => analyzeGrid(grid).words.map((w) => `${wordLabel(w.number, w.direction)} ${w.answer}`);

describe("analyzeGrid on the specification's sample crossword", () => {
  const analysis = analyzeGrid(SAMPLE);

  it("numbers the first row like the specification: 1–6", () => {
    const firstRow = analysis.numbers[0].map((n, column) => (n ? [n, column + 1] : null)).filter(Boolean);
    expect(firstRow).toEqual([
      [1, 1],
      [2, 3],
      [3, 5],
      [4, 7],
      [5, 10],
      [6, 12],
    ]);
  });

  it("finds the words the specification names", () => {
    const words = labels(SAMPLE);
    expect(words).toEqual(expect.arrayContaining(["1a JEALOUSY", "1d JOVIAL", "2d ALLEY", "4d SASH", "7a VALUE", "8a SILVER"]));
  });

  it("makes 5a the second across word (2, 3 and 4 start down words inside JEALOUSY)", () => {
    const acrossWords = analysis.words.filter((w) => w.direction === "across");
    expect(acrossWords[1]).toMatchObject({ number: 5, answer: "SUM" });
    expect(analysis.words.filter((w) => w.number === 1).map((w) => w.direction)).toEqual(["across", "down"]);
    expect(analysis.words.filter((w) => w.number === 5).map((w) => w.direction)).toEqual(["across", "down"]);
  });

  it("numbers squares in the middle of an across word when a down word starts there", () => {
    // MO, ED and NO start inside MOMENT (row 11).
    expect(labels(SAMPLE)).toEqual(expect.arrayContaining(["22a MOMENT", "23d MO", "24d ED", "25d NO"]));
  });

  it("lists across words first, then down words, each in number order", () => {
    const order = analysis.words.map((w) => `${w.direction}:${w.number}`);
    const acrossCount = analysis.words.filter((w) => w.direction === "across").length;
    expect(order.slice(0, acrossCount).every((o) => o.startsWith("across"))).toBe(true);
    const numbersIn = (dir: string) => analysis.words.filter((w) => w.direction === dir).map((w) => w.number);
    expect(numbersIn("across")).toEqual([...numbersIn("across")].sort((a, b) => a - b));
    expect(numbersIn("down")).toEqual([...numbersIn("down")].sort((a, b) => a - b));
    expect(analysis.words).toHaveLength(32);
    expect(Math.max(...analysis.words.map((w) => w.number))).toBe(27);
  });

  it("records start squares and the cells of each word", () => {
    const sash = analysis.words.find((w) => w.answer === "SASH")!;
    expect(sash).toMatchObject({ number: 4, direction: "down", startRow: 0, startColumn: 6 });
    expect(sash.cells).toEqual([
      [0, 6],
      [1, 6],
      [2, 6],
      [3, 6],
    ]);
  });

  it("has no stray letters and no problems", () => {
    expect(analysis.strayLetters).toEqual([]);
    expect(gridProblems(analysis)).toEqual([]);
  });
});

describe("grid rules", () => {
  it("treats the first column and top row as having no letter before them", () => {
    let grid = emptyGrid();
    grid = withCell(grid, 0, 0, "A");
    grid = withCell(grid, 0, 1, "T");
    expect(labels(grid)).toEqual(["1a AT"]);
  });

  it("runs words to the grid edge", () => {
    const grid = emptyGrid();
    grid[11] = "ABCDEFGHIJKL";
    expect(labels(grid)).toEqual(["1a ABCDEFGHIJKL"]);
  });

  it("treats black squares the same as empty squares", () => {
    const grid = toFinishedGrid(["CAT#DOG.....", ...emptyGrid().slice(1)]);
    expect(labels(grid)).toEqual(["1a CAT", "2a DOG"]);
  });

  it("reports letters that are not part of a word", () => {
    let grid = emptyGrid();
    grid = withCell(grid, 0, 0, "A");
    grid = withCell(grid, 0, 1, "B");
    grid = withCell(grid, 5, 5, "Q");
    const problems = gridProblems(analyzeGrid(grid));
    expect(problems).toEqual([expect.stringContaining("R06C06")]);
  });

  it("explains an empty grid and a grid without words", () => {
    expect(gridProblems(analyzeGrid(emptyGrid()))[0]).toMatch(/empty/);
    expect(gridProblems(analyzeGrid(withCell(emptyGrid(), 3, 3, "A")))[0]).toMatch(/No words found/);
  });
});

describe("grid helpers", () => {
  it("turns empty squares black on Done and back to white for editing", () => {
    const finished = toFinishedGrid(SAMPLE);
    expect(finished[0]).toBe("JEALOUSY#SUM");
    expect(toEditableGrid(finished)).toEqual(SAMPLE);
  });

  it("validates stored grids", () => {
    expect(parseGrid(SAMPLE)).toEqual(SAMPLE);
    expect(parseGrid(SAMPLE.slice(1))).toBeNull();
    expect(parseGrid([...SAMPLE.slice(1), "lowercase..."])).toBeNull();
    expect(parseGrid("not a grid")).toBeNull();
  });

  it("detects an empty grid", () => {
    expect(isGridEmpty(emptyGrid())).toBe(true);
    expect(isGridEmpty(SAMPLE)).toBe(false);
  });

  it("predicts which clues survive a grid change, like the database does", () => {
    const before = analyzeGrid(["CAT.DOG.EMU.", ...emptyGrid().slice(1)]).words;
    const after = analyzeGrid(["........EMU.", "CAT.OWL.....", ...emptyGrid().slice(2)]).words;
    const { kept, dropped } = matchClueCarryOver(before, after);
    expect(kept.map((k) => `${k.from.answer}→${wordLabel(k.to.number, k.to.direction)}`).sort()).toEqual([
      "CAT→2a",
      "EMU→1a",
    ]);
    expect(dropped.map((d) => d.answer)).toEqual(["DOG"]);
  });

  it("keys words by direction, start and answer", () => {
    const word = analyzeGrid(SAMPLE).words[0];
    expect(wordKey(word)).toBe("across:0:0:JEALOUSY");
  });
});

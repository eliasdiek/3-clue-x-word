import { describe, expect, it } from "vitest";
import { ALL_CLUES_PRESENT_MESSAGE, clueCheckReport, squareRef, wordLabel } from "@/lib/puzzle/format";

describe("specification formats", () => {
  it("labels words like the specification (1a, 3d)", () => {
    expect(wordLabel(1, "across")).toBe("1a");
    expect(wordLabel(3, "down")).toBe("3d");
  });

  it("references squares as R01C05, 1-based", () => {
    expect(squareRef(0, 4)).toBe("R01C05"); // the "O" of OVER in the sample
    expect(squareRef(6, 11)).toBe("R07C12");
  });
});

describe("clueCheckReport", () => {
  it("gives the all-clear message when every word has 3 clues", () => {
    expect(clueCheckReport([{ number: 1, direction: "across", answer: "JEALOUSY", cluesFilled: 3 }])).toEqual({
      ok: true,
      lines: [ALL_CLUES_PRESENT_MESSAGE],
    });
    expect(ALL_CLUES_PRESENT_MESSAGE).toBe("All words are present and have 3 clues");
  });

  it("lists problem words across first, then down, in number order", () => {
    const report = clueCheckReport([
      { number: 4, direction: "down", answer: "SASH", cluesFilled: 0 },
      { number: 7, direction: "across", answer: "VALLEYS", cluesFilled: 2 },
      { number: 1, direction: "across", answer: "JEALOUSY", cluesFilled: 3 },
      { number: 2, direction: "down", answer: "ALLEY", cluesFilled: 1 },
    ]);
    expect(report.ok).toBe(false);
    expect(report.lines).toEqual([
      "Word 7a, VALLEYS only has 2 clues",
      "Word 2d, ALLEY only has 1 clue",
      "Word 4d, SASH has no clues",
    ]);
  });
});

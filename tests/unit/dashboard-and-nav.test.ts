import { describe, expect, it } from "vitest";
import { countStages, relativeTime } from "@/lib/dashboard/stats";
import { describeActivity } from "@/lib/dashboard/activity";
import { activeNavHref } from "@/components/layout/nav-items";

describe("countStages", () => {
  it("reports zeros for an empty database", () => {
    expect(countStages([])).toEqual({ grid: 0, clues: 0, ready: 0, published: 0, archived: 0, total: 0 });
  });

  it("counts only what the rows contain", () => {
    const rows = (["grid", "clues", "clues", "ready", "published", "archived"] as const).map((stage) => ({ stage }));
    expect(countStages(rows)).toEqual({ grid: 1, clues: 2, ready: 1, published: 1, archived: 1, total: 6 });
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  const fmt = () => "1 Nov 2026";
  it.each([
    ["2026-11-09T11:59:40Z", "just now"],
    ["2026-11-09T11:55:00Z", "5 min ago"],
    ["2026-11-09T09:00:00Z", "3 hours ago"],
    ["2026-11-08T10:00:00Z", "yesterday"],
    ["2026-11-05T12:00:00Z", "4 days ago"],
    ["2026-11-01T12:00:00Z", "1 Nov 2026"],
  ])("describes %s as %s", (when, expected) => {
    expect(relativeTime(when, now, fmt)).toBe(expected);
  });
});

describe("describeActivity", () => {
  const names = new Map([["p1", "“Sunday special”"]]);
  it("names puzzles and adds useful detail", () => {
    expect(describeActivity({ action: "puzzle.published", resourceId: "p1", metadata: { puzzleNumber: 12 } }, names)).toBe(
      "Published puzzle #12",
    );
    expect(describeActivity({ action: "puzzle.grid_finished", resourceId: "p1", metadata: { wordCount: 32 } }, names)).toBe(
      "Finished the grid of “Sunday special” (32 words)",
    );
    expect(describeActivity({ action: "puzzle.archived", resourceId: "gone", metadata: {} }, names)).toBe("Archived a puzzle");
    expect(describeActivity({ action: "quote.saved", resourceId: null, metadata: { date: "2026-11-12" } }, names)).toBe(
      "Saved the quote for Thu 12 Nov",
    );
  });

  it("hides entries that aren't worth showing", () => {
    expect(describeActivity({ action: "auth.login", resourceId: null, metadata: {} }, names)).toBeNull();
  });
});

describe("activeNavHref", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/puzzles/new", "/puzzles/new"],
    ["/puzzles", "/puzzles"],
    ["/puzzles/1234/clues", "/puzzles"],
    ["/dictionary", "/dictionary"],
    ["/quotes", "/quotes"],
    ["/settings", "/settings"],
    ["/somewhere-else", null],
  ])("highlights the right item for %s", (path, expected) => {
    expect(activeNavHref(path)).toBe(expected);
  });
});

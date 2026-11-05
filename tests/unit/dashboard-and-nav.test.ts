import { describe, expect, it } from "vitest";
import { computeDashboardStats } from "@/lib/dashboard/stats";
import { activeNavHref } from "@/components/layout/nav-items";

describe("computeDashboardStats", () => {
  it("reports zeros for an empty database", () => {
    expect(computeDashboardStats([])).toEqual({ total: 0, published: 0, incomplete: 0, ready: 0 });
  });

  it("counts only what the rows contain", () => {
    const now = "2026-11-04T00:00:00Z";
    const stats = computeDashboardStats([
      { status: "published", word_count: 20, completed_clue_count: 20, grid_finalized_at: now },
      { status: "draft", word_count: 0, completed_clue_count: 0, grid_finalized_at: null }, // grid unfinished
      { status: "draft", word_count: 10, completed_clue_count: 4, grid_finalized_at: now }, // clues missing
      { status: "ready", word_count: 10, completed_clue_count: 10, grid_finalized_at: now }, // complete draft
      { status: "draft", word_count: 8, completed_clue_count: 8, grid_finalized_at: now }, // complete, not yet marked ready
      { status: "archived", word_count: 5, completed_clue_count: 5, grid_finalized_at: now },
    ]);
    expect(stats).toEqual({ total: 6, published: 1, incomplete: 2, ready: 2 });
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

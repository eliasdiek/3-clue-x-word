import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { parsePuzzleNumber, resolveQuoteDate } from "@/lib/api/v1";
import { addDays, daysInMonth, isValidDate, shiftMonth, todayIn } from "@/lib/quotes/dates";

vi.mock("server-only", () => ({}));

/** A minimal stand-in for the Supabase query builder used by the routes. */
type Result = { data: unknown; error: unknown };
let nextResult: Result = { data: null, error: null };
const calls: [string, unknown[]][] = [];
function builder(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "select", "gt", "eq", "order", "limit"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return chain;
    };
  }
  chain.maybeSingle = () => Promise.resolve(nextResult);
  chain.then = (resolve: (r: Result) => unknown) => resolve(nextResult);
  return chain;
}
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => builder() }));

const { GET: listPuzzles } = await import("@/app/api/v1/puzzles/route");
const { GET: nextPuzzle } = await import("@/app/api/v1/puzzles/next/route");
const { GET: onePuzzle } = await import("@/app/api/v1/puzzles/[number]/route");
const { GET: todaysQuote } = await import("@/app/api/v1/quotes/today/route");

const req = (path: string) => new NextRequest(new URL(path, "http://localhost"));

beforeEach(() => {
  nextResult = { data: null, error: null };
  calls.length = 0;
});

describe("date helpers", () => {
  it("validates, adds days and lists months", () => {
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysInMonth("2026-02")).toHaveLength(28);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("knows today in Brisbane", () => {
    // 20:00 UTC on 8 Nov is 06:00 on 9 Nov in Brisbane (UTC+10).
    expect(todayIn("Australia/Brisbane", new Date("2026-11-08T20:00:00Z"))).toBe("2026-11-09");
  });
});

describe("API helpers", () => {
  it("parses puzzle numbers strictly", () => {
    expect(parsePuzzleNumber("12")).toBe(12);
    expect(parsePuzzleNumber("0")).toBe(0);
    expect(parsePuzzleNumber("-1")).toBeNull();
    expect(parsePuzzleNumber("1.5")).toBeNull();
    expect(parsePuzzleNumber("abc")).toBeNull();
  });

  it("accepts the player's date only within a day of UTC", () => {
    const now = new Date("2026-11-08T20:00:00Z");
    expect(resolveQuoteDate(null, now)).toBe("2026-11-09"); // Brisbane today
    expect(resolveQuoteDate("2026-11-09", now)).toBe("2026-11-09");
    expect(resolveQuoteDate("2026-11-07", now)).toBe("2026-11-07");
    expect(resolveQuoteDate("2026-11-12", now)).toBeNull(); // peeking ahead
    expect(resolveQuoteDate("not-a-date", now)).toBeNull();
  });
});

describe("GET /api/v1/puzzles", () => {
  it("lists published puzzles with a stable shape", async () => {
    nextResult = {
      data: [
        { puzzle_number: 1, publication_version: 1, published_at: "2026-11-01T00:00:00Z" },
        { puzzle_number: 2, publication_version: 1, published_at: "2026-11-02T00:00:00Z" },
      ],
      error: null,
    };
    const res = await listPuzzles(req("/api/v1/puzzles?limit=1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      apiVersion: "v1",
      puzzles: [{ puzzleNumber: 1, version: 1, publishedAt: "2026-11-01T00:00:00Z" }],
      hasMore: true,
    });
    expect(res.headers.get("Cache-Control")).toContain("max-age");
  });

  it("rejects bad paging values", async () => {
    expect((await listPuzzles(req("/api/v1/puzzles?after=x"))).status).toBe(400);
    expect((await listPuzzles(req("/api/v1/puzzles?limit=500"))).status).toBe(400);
  });

  it("reports an outage without leaking details", async () => {
    nextResult = { data: null, error: { message: "connection refused to 10.0.0.1" } };
    const res = await listPuzzles(req("/api/v1/puzzles"));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("10.0.0.1");
  });
});

describe("GET /api/v1/puzzles/next and /:number", () => {
  it("returns the next puzzle after the one given", async () => {
    nextResult = { data: { payload_snapshot: { puzzleNumber: 5, schemaVersion: "v1" } }, error: null };
    const res = await nextPuzzle(req("/api/v1/puzzles/next?after=4"));
    expect(await res.json()).toEqual({ apiVersion: "v1", puzzle: { puzzleNumber: 5, schemaVersion: "v1" } });
    expect(calls).toContainEqual(["gt", ["puzzle_number", 4]]);
  });

  it("says when there are no more puzzles", async () => {
    const res = await nextPuzzle(req("/api/v1/puzzles/next?after=99"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("no-more-puzzles");
  });

  it("serves one puzzle by number, cacheably", async () => {
    nextResult = { data: { payload_snapshot: { puzzleNumber: 3 } }, error: null };
    const res = await onePuzzle(req("/api/v1/puzzles/3"), { params: Promise.resolve({ number: "3" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
    expect((await onePuzzle(req("/api/v1/puzzles/0"), { params: Promise.resolve({ number: "0" }) })).status).toBe(400);
  });
});

describe("GET /api/v1/quotes/today", () => {
  it("returns the quote for the requested date", async () => {
    const today = new Date().toISOString().slice(0, 10);
    nextResult = { data: { quote_date: today, quote_text: "Well begun is half done.", author: "Aristotle", commentary: null }, error: null };
    const res = await todaysQuote(req(`/api/v1/quotes/today?date=${today}`));
    expect(await res.json()).toEqual({
      apiVersion: "v1",
      quote: { date: today, text: "Well begun is half done.", author: "Aristotle", comment: null },
    });
  });

  it("refuses dates far from today and reports missing quotes", async () => {
    expect((await todaysQuote(req("/api/v1/quotes/today?date=2030-01-01"))).status).toBe(400);
    const res = await todaysQuote(req("/api/v1/quotes/today"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("no-quote");
  });
});

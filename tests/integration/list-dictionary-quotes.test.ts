import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { analyzeGrid, emptyGrid, type GridRows } from "@/lib/puzzle/grid";
import { buildPublishedPayload, type StoredWord } from "@/lib/puzzle/publish";
import { asRole, createTestDatabase, createUser } from "../support/pglite";

let db: PGlite;
let adminId: string;
let otherUserId: string;

const GRID: GridRows = ["CAT.........", "O...........", "W...........", ...emptyGrid().slice(3)];

const asAdmin = <T>(fn: (tx: Transaction) => Promise<T>) => asRole(db, "authenticated", adminId, fn);

/** A puzzle at a given stage: "grid" (not finished), "clues", "ready" or "published". */
async function puzzleAt(stage: "grid" | "clues" | "ready" | "published", title?: string) {
  return asAdmin(async (tx) => {
    const {
      rows: [p],
    } = await tx.query<{ id: string; updated_at: string }>(
      "insert into public.puzzles (title, grid_data) values ($1, $2::jsonb) returning id, updated_at",
      [title ?? null, JSON.stringify(GRID)],
    );
    if (stage === "grid") return p.id;
    const words = analyzeGrid(GRID).words;
    await tx.query("select * from public.finish_puzzle_grid($1, $2::jsonb, $3::jsonb, $4)", [
      p.id,
      JSON.stringify(GRID),
      JSON.stringify(words.map(({ number, direction, answer, startRow, startColumn }) => ({ number, direction, answer, startRow, startColumn }))),
      p.updated_at,
    ]);
    if (stage === "clues") return p.id;
    const { rows } = await tx.query<{ id: string; answer: string }>("select id, answer from public.puzzle_words where puzzle_id = $1", [p.id]);
    await tx.query("select * from public.save_puzzle_clues($1, $2::jsonb)", [
      p.id,
      JSON.stringify(rows.map((r) => ({ wordId: r.id, harder: `H ${r.answer}`, medium: `M ${r.answer}`, easier: `E ${r.answer}` }))),
    ]);
    if (stage === "ready") return p.id;
    const stored: StoredWord[] = words.map((w) => ({ ...w, harder: `H ${w.answer}`, medium: `M ${w.answer}`, easier: `E ${w.answer}` }));
    await tx.query("select * from public.publish_puzzle($1, $2::jsonb, null)", [
      p.id,
      JSON.stringify(buildPublishedPayload({ grid: GRID.map((r) => r.replace(/\./g, "#")), words: stored })),
    ]);
    return p.id;
  });
}

const stageOf = async (id: string) =>
  (await db.query<{ stage: string }>("select stage from public.puzzle_summaries where id = $1", [id])).rows[0].stage;

beforeAll(async () => {
  db = await createTestDatabase();
  adminId = await createUser(db, "john@example.com", { admin: true });
  otherUserId = await createUser(db, "someone@example.com");
});

afterAll(async () => {
  await db.close();
});

describe("puzzle_summaries.stage", () => {
  it("names each step of the workflow", async () => {
    // Separate transactions: each step bumps updated_at.
    expect(await stageOf(await puzzleAt("grid"))).toBe("grid");
    expect(await stageOf(await puzzleAt("clues"))).toBe("clues");
    expect(await stageOf(await puzzleAt("ready"))).toBe("ready");
    expect(await stageOf(await puzzleAt("published"))).toBe("published");
  });
});

describe("archive_puzzle / restore_puzzle", () => {
  it("withdraws a published puzzle from the app and brings it back", async () => {
    const id = await puzzleAt("published");
    const live = async () =>
      (
        await asRole(db, "anon", null, (tx) =>
          tx.query("select 1 from public.puzzle_publications where puzzle_id = $1", [id]),
        )
      ).rows.length;
    expect(await live()).toBe(1);

    await asAdmin((tx) => tx.query("select public.archive_puzzle($1)", [id]));
    expect(await stageOf(id)).toBe("archived");
    expect(await live()).toBe(0);

    await asAdmin((tx) => tx.query("select public.restore_puzzle($1)", [id]));
    expect(await stageOf(id)).toBe("published");
    expect(await live()).toBe(1);
  });

  it("archives and restores a draft", async () => {
    const id = await puzzleAt("clues");
    await asAdmin((tx) => tx.query("select public.archive_puzzle($1)", [id]));
    expect(await stageOf(id)).toBe("archived");
    await asAdmin((tx) => tx.query("select public.restore_puzzle($1)", [id]));
    expect(await stageOf(id)).toBe("clues");
  });

  it("is refused for non-admins", async () => {
    const id = await puzzleAt("grid");
    await expect(
      asRole(db, "authenticated", otherUserId, (tx) => tx.query("select public.archive_puzzle($1)", [id])),
    ).rejects.toThrow(/Only administrators/);
    await expect(asRole(db, "anon", null, (tx) => tx.query("select public.archive_puzzle($1)", [id]))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("duplicate_puzzle", () => {
  it("copies the grid, words and clues into a new unnumbered draft", async () => {
    const source = await puzzleAt("published", "Sunday special");
    const {
      rows: [{ duplicate_puzzle: copy }],
    } = await asAdmin((tx) => tx.query<{ duplicate_puzzle: string }>("select public.duplicate_puzzle($1)", [source]));

    const { rows } = await db.query<{ title: string; status: string; puzzle_number: number | null; stage: string }>(
      "select title, status, puzzle_number, stage from public.puzzle_summaries where id = $1",
      [copy],
    );
    expect(rows[0]).toEqual({ title: "Copy of Sunday special", status: "draft", puzzle_number: null, stage: "ready" });
    const clues = await db.query<{ harder_clue: string }>(
      "select c.harder_clue from public.puzzle_words w join public.puzzle_clues c on c.puzzle_word_id = w.id where w.puzzle_id = $1 order by w.direction",
      [copy],
    );
    expect(clues.rows.map((r) => r.harder_clue)).toEqual(["H CAT", "H COW"]);
  });
});

describe("dictionary_word_summaries", () => {
  it("counts clue sets and uses for published words", async () => {
    await puzzleAt("published");
    const { rows } = await asAdmin((tx) =>
      tx.query<{ normalized_word: string; clue_set_count: number; usage_count: number; word_length: number }>(
        "select normalized_word, clue_set_count, usage_count, word_length from public.dictionary_word_summaries where normalized_word = 'CAT'",
      ),
    );
    expect(rows[0].clue_set_count).toBe(1);
    expect(rows[0].usage_count).toBeGreaterThanOrEqual(1);
    expect(rows[0].word_length).toBe(3);
  });

  it("is hidden from the public", async () => {
    await expect(
      asRole(db, "anon", null, (tx) => tx.query("select * from public.dictionary_word_summaries")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("daily quotes", () => {
  it("lets the app read up to one day ahead of UTC, never further", async () => {
    await db.query(
      `insert into public.daily_quotes (quote_date, quote_text) values
         (current_date, 'today'), (current_date + 1, 'tomorrow in UTC'), (current_date + 2, 'future')`,
    );
    const { rows } = await asRole(db, "anon", null, (tx) =>
      tx.query<{ quote_text: string }>("select quote_text from public.daily_quotes order by quote_date"),
    );
    expect(rows.map((r) => r.quote_text)).toEqual(["today", "tomorrow in UTC"]);
  });
});

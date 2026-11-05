import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { analyzeGrid, emptyGrid, type GridRows } from "@/lib/puzzle/grid";
import { asRole, createTestDatabase, createUser } from "../support/pglite";
import { SAMPLE_CROSSWORD } from "../support/sample-crossword";

let db: PGlite;
let adminId: string;
let otherUserId: string;

/** The word list exactly as the editor sends it (computed by the shared engine). */
const wordsFor = (grid: GridRows) =>
  analyzeGrid(grid).words.map(({ number, direction, answer, startRow, startColumn }) => ({
    number,
    direction,
    answer,
    startRow,
    startColumn,
  }));

type FinishResult = { word_count: number; kept_clue_count: number; dropped_clue_count: number; updated_at: string };

async function newPuzzle(grid: GridRows = SAMPLE_CROSSWORD) {
  const { rows } = await asRole(db, "authenticated", adminId, (tx) =>
    tx.query<{ id: string; updated_at: string; created_by: string | null }>(
      "insert into public.puzzles (grid_data) values ($1::jsonb) returning id, updated_at, created_by",
      [JSON.stringify(grid)],
    ),
  );
  return rows[0];
}

function finish(tx: Transaction, puzzleId: string, grid: GridRows, words: unknown, expected: string | null) {
  return tx.query<FinishResult>("select * from public.finish_puzzle_grid($1, $2::jsonb, $3::jsonb, $4)", [
    puzzleId,
    JSON.stringify(grid),
    JSON.stringify(words),
    expected,
  ]);
}

async function finishAsAdmin(puzzleId: string, grid: GridRows, expected: string | null, words: unknown = wordsFor(grid)) {
  const { rows } = await asRole(db, "authenticated", adminId, (tx) => finish(tx, puzzleId, grid, words, expected));
  return rows[0];
}

async function wordsInDb(puzzleId: string) {
  const { rows } = await db.query<{
    clue_number: number;
    direction: string;
    answer: string;
    cell_positions: number[][];
    harder_clue: string | null;
  }>(
    `select w.clue_number, w.direction, w.answer, w.cell_positions, c.harder_clue
     from public.puzzle_words w left join public.puzzle_clues c on c.puzzle_word_id = w.id
     where w.puzzle_id = $1 order by w.direction, w.clue_number`,
    [puzzleId],
  );
  return rows;
}

beforeAll(async () => {
  db = await createTestDatabase();
  adminId = await createUser(db, "john@example.com", { admin: true, name: "John Ward" });
  otherUserId = await createUser(db, "someone@example.com");
});

afterAll(async () => {
  await db.close();
});

describe("creating a puzzle", () => {
  it("records the signed-in administrator as the creator", async () => {
    const puzzle = await newPuzzle(emptyGrid());
    const { rows } = await db.query<{ id: string }>(
      "select p.id from public.admin_profiles p join auth.users u on u.id = p.auth_user_id where u.id = $1",
      [adminId],
    );
    expect(puzzle.created_by).toBe(rows[0].id);
  });
});

describe("finish_puzzle_grid (Done)", () => {
  it("stores black squares, every word with its cells, and an empty clue row per word", async () => {
    const puzzle = await newPuzzle();
    const result = await finishAsAdmin(puzzle.id, SAMPLE_CROSSWORD, puzzle.updated_at);
    expect(result).toMatchObject({ word_count: 32, kept_clue_count: 0, dropped_clue_count: 0 });

    const {
      rows: [stored],
    } = await db.query<{ grid_data: string[]; grid_finalized_at: string | null }>(
      "select grid_data, grid_finalized_at from public.puzzles where id = $1",
      [puzzle.id],
    );
    expect(stored.grid_data[0]).toBe("JEALOUSY#SUM");
    expect(stored.grid_data.join("")).not.toContain(".");
    expect(stored.grid_finalized_at).not.toBeNull();

    const words = await wordsInDb(puzzle.id);
    expect(words).toHaveLength(32);
    const sash = words.find((w) => w.answer === "SASH")!;
    expect(sash).toMatchObject({ clue_number: 4, direction: "down" });
    expect(sash.cell_positions).toEqual([
      [0, 6],
      [1, 6],
      [2, 6],
      [3, 6],
    ]);
    expect(words.every((w) => w.harder_clue === "")).toBe(true);
  });

  it("keeps clues for words that are still in the grid, even if they moved", async () => {
    const before = ["CAT.DOG.EMU.", ...emptyGrid().slice(1)];
    const puzzle = await newPuzzle(before);
    const first = await finishAsAdmin(puzzle.id, before, puzzle.updated_at);
    await db.query(
      `update public.puzzle_clues c set harder_clue = 'Clue for ' || w.answer
       from public.puzzle_words w where w.id = c.puzzle_word_id and w.puzzle_id = $1`,
      [puzzle.id],
    );

    // EMU stays put, CAT moves to the next row, DOG is removed, OWL is new.
    const after = ["........EMU.", "CAT.OWL.....", ...emptyGrid().slice(2)];
    const second = await finishAsAdmin(puzzle.id, after, first.updated_at);
    expect(second).toMatchObject({ word_count: 3, kept_clue_count: 2, dropped_clue_count: 1 });

    const stored = await wordsInDb(puzzle.id);
    expect(stored.map((w) => [w.answer, w.harder_clue])).toEqual([
      ["EMU", "Clue for EMU"],
      ["CAT", "Clue for CAT"],
      ["OWL", ""],
    ]);
  });

  it("refuses a word list that doesn't match the grid", async () => {
    const puzzle = await newPuzzle();
    const words = wordsFor(SAMPLE_CROSSWORD);
    const cases: [string, unknown][] = [
      ["a missing word", words.slice(1)],
      ["a wrong answer", words.map((w, i) => (i === 0 ? { ...w, answer: "JEALOUSX" } : w))],
      ["a partial word", words.map((w, i) => (i === 0 ? { ...w, answer: "JEALOUS" } : w))],
      ["wrong numbering", words.map((w, i) => (i === 0 ? { ...w, number: 2 } : w))],
      ["a duplicated word", [...words.slice(0, -1), words[0]]],
      ["no words", []],
    ];
    for (const [label, bad] of cases) {
      await expect(finishAsAdmin(puzzle.id, SAMPLE_CROSSWORD, puzzle.updated_at, bad), label).rejects.toThrow();
    }
  });

  it("refuses a stale save (the puzzle changed elsewhere)", async () => {
    const puzzle = await newPuzzle();
    await finishAsAdmin(puzzle.id, SAMPLE_CROSSWORD, puzzle.updated_at);
    await expect(finishAsAdmin(puzzle.id, SAMPLE_CROSSWORD, puzzle.updated_at)).rejects.toThrow(/changed somewhere else/);
  });

  it("is refused for non-admins and the public", async () => {
    const puzzle = await newPuzzle();
    const words = wordsFor(SAMPLE_CROSSWORD);
    await expect(
      asRole(db, "authenticated", otherUserId, (tx) => finish(tx, puzzle.id, SAMPLE_CROSSWORD, words, null)),
    ).rejects.toThrow(/Only administrators/);
    await expect(
      asRole(db, "anon", null, (tx) => finish(tx, puzzle.id, SAMPLE_CROSSWORD, words, null)),
    ).rejects.toThrow(/permission denied/);
  });

  it("is refused for a published puzzle", async () => {
    const puzzle = await newPuzzle();
    const done = await finishAsAdmin(puzzle.id, SAMPLE_CROSSWORD, puzzle.updated_at);
    await db.query(
      "update public.puzzle_clues c set harder_clue = 'h', medium_clue = 'm', easier_clue = 'e' from public.puzzle_words w where w.id = c.puzzle_word_id and w.puzzle_id = $1",
      [puzzle.id],
    );
    const {
      rows: [fresh],
    } = await db.query<{ updated_at: string }>("select updated_at from public.puzzles where id = $1", [puzzle.id]);
    expect(fresh.updated_at).toEqual(done.updated_at);
    await asRole(db, "authenticated", adminId, (tx) =>
      tx.query("select * from public.publish_puzzle($1, '{}'::jsonb, $2)", [puzzle.id, fresh.updated_at]),
    );
    await expect(finishAsAdmin(puzzle.id, SAMPLE_CROSSWORD, null)).rejects.toThrow(/cannot be changed/);
  });

  it("writes an audit entry", async () => {
    const puzzle = await newPuzzle();
    await finishAsAdmin(puzzle.id, SAMPLE_CROSSWORD, puzzle.updated_at);
    const { rows } = await db.query<{ metadata: { wordCount: number } }>(
      "select metadata from public.admin_audit_logs where action = 'puzzle.grid_finished' and resource_id = $1",
      [puzzle.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.wordCount).toBe(32);
  });
});

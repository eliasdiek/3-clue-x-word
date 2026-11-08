import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { analyzeGrid, emptyGrid, type GridRows } from "@/lib/puzzle/grid";
import { asRole, createTestDatabase, createUser } from "../support/pglite";

let db: PGlite;
let adminId: string;
let otherUserId: string;

const GRID: GridRows = ["CAT.........", "O...........", "W...........", ...emptyGrid().slice(3)];

type SaveResult = { updated_at: string; word_count: number; completed_count: number };

/** A puzzle whose grid has been finished (Done), with ids of its words. */
async function finishedPuzzle() {
  return asRole(db, "authenticated", adminId, async (tx) => {
    const {
      rows: [puzzle],
    } = await tx.query<{ id: string; updated_at: string }>(
      "insert into public.puzzles (grid_data) values ($1::jsonb) returning id, updated_at",
      [JSON.stringify(GRID)],
    );
    const words = analyzeGrid(GRID).words.map(({ number, direction, answer, startRow, startColumn }) => ({
      number,
      direction,
      answer,
      startRow,
      startColumn,
    }));
    await tx.query("select * from public.finish_puzzle_grid($1, $2::jsonb, $3::jsonb, $4)", [
      puzzle.id,
      JSON.stringify(GRID),
      JSON.stringify(words),
      puzzle.updated_at,
    ]);
    const { rows } = await tx.query<{ id: string; answer: string }>(
      "select id, answer from public.puzzle_words where puzzle_id = $1",
      [puzzle.id],
    );
    return { id: puzzle.id, word: Object.fromEntries(rows.map((r) => [r.answer, r.id])) as Record<string, string> };
  });
}

function save(tx: Transaction, puzzleId: string, clues: unknown) {
  return tx.query<SaveResult>("select * from public.save_puzzle_clues($1, $2::jsonb)", [puzzleId, JSON.stringify(clues)]);
}

async function saveAsAdmin(puzzleId: string, clues: unknown) {
  const { rows } = await asRole(db, "authenticated", adminId, (tx) => save(tx, puzzleId, clues));
  return rows[0];
}

async function cluesFor(puzzleId: string) {
  const { rows } = await db.query<{ answer: string; harder_clue: string; medium_clue: string; easier_clue: string }>(
    `select w.answer, c.harder_clue, c.medium_clue, c.easier_clue
     from public.puzzle_words w join public.puzzle_clues c on c.puzzle_word_id = w.id
     where w.puzzle_id = $1 order by w.direction`,
    [puzzleId],
  );
  return rows;
}

beforeAll(async () => {
  db = await createTestDatabase();
  adminId = await createUser(db, "john@example.com", { admin: true });
  otherUserId = await createUser(db, "someone@example.com");
});

afterAll(async () => {
  await db.close();
});

describe("save_puzzle_clues", () => {
  it("saves trimmed clues and reports progress", async () => {
    const puzzle = await finishedPuzzle();
    const result = await saveAsAdmin(puzzle.id, [
      { wordId: puzzle.word.CAT, harder: "  Feline  ", medium: "Pet that purrs", easier: "Kitty" },
      { wordId: puzzle.word.COW, harder: "Bovine", medium: "", easier: "" },
    ]);
    expect(result).toMatchObject({ word_count: 2, completed_count: 1 });
    expect(await cluesFor(puzzle.id)).toEqual([
      { answer: "CAT", harder_clue: "Feline", medium_clue: "Pet that purrs", easier_clue: "Kitty" },
      { answer: "COW", harder_clue: "Bovine", medium_clue: "", easier_clue: "" },
    ]);
  });

  it("marks the puzzle as changed so a stale review can't be published", async () => {
    const puzzle = await finishedPuzzle();
    const {
      rows: [before],
    } = await db.query<{ updated_at: Date }>("select updated_at from public.puzzles where id = $1", [puzzle.id]);
    const result = await saveAsAdmin(puzzle.id, [{ wordId: puzzle.word.CAT, harder: "Feline", medium: "", easier: "" }]);
    expect(new Date(result.updated_at).getTime()).toBeGreaterThan(before.updated_at.getTime());
  });

  it("sends a 'ready' puzzle back to draft when a clue is cleared", async () => {
    const puzzle = await finishedPuzzle();
    const full = (wordId: string) => ({ wordId, harder: "h", medium: "m", easier: "e" });
    await saveAsAdmin(puzzle.id, [full(puzzle.word.CAT), full(puzzle.word.COW)]);
    await db.query("update public.puzzles set status = 'ready' where id = $1", [puzzle.id]);

    await saveAsAdmin(puzzle.id, [{ ...full(puzzle.word.COW), easier: " " }]);
    const { rows } = await db.query<{ status: string }>("select status from public.puzzles where id = $1", [puzzle.id]);
    expect(rows[0].status).toBe("draft");
  });

  it("refuses a word that isn't in this puzzle (stale word list)", async () => {
    const first = await finishedPuzzle();
    const second = await finishedPuzzle();
    await expect(
      saveAsAdmin(first.id, [{ wordId: second.word.CAT, harder: "x", medium: "", easier: "" }]),
    ).rejects.toThrow(/word list has changed/);
  });

  it("refuses clues while the grid is not finished", async () => {
    const puzzle = await finishedPuzzle();
    await db.query("update public.puzzles set grid_finalized_at = null where id = $1", [puzzle.id]);
    await expect(
      saveAsAdmin(puzzle.id, [{ wordId: puzzle.word.CAT, harder: "x", medium: "", easier: "" }]),
    ).rejects.toThrow(/Click Done on the grid/);
  });

  it("refuses non-admins and the public", async () => {
    const puzzle = await finishedPuzzle();
    const clues = [{ wordId: puzzle.word.CAT, harder: "x", medium: "", easier: "" }];
    await expect(asRole(db, "authenticated", otherUserId, (tx) => save(tx, puzzle.id, clues))).rejects.toThrow(
      /Only administrators/,
    );
    await expect(asRole(db, "anon", null, (tx) => save(tx, puzzle.id, clues))).rejects.toThrow(/permission denied/);
  });

  it("refuses changes to a published puzzle", async () => {
    const puzzle = await finishedPuzzle();
    const full = (wordId: string) => ({ wordId, harder: "h", medium: "m", easier: "e" });
    const saved = await saveAsAdmin(puzzle.id, [full(puzzle.word.CAT), full(puzzle.word.COW)]);
    await asRole(db, "authenticated", adminId, (tx) =>
      tx.query("select * from public.publish_puzzle($1, '{}'::jsonb, $2)", [puzzle.id, saved.updated_at]),
    );
    await expect(saveAsAdmin(puzzle.id, [full(puzzle.word.CAT)])).rejects.toThrow(/cannot be changed/);
  });
});

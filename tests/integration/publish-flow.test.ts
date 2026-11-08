import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { analyzeGrid, toFinishedGrid } from "@/lib/puzzle/grid";
import { buildPublishedPayload, validateForPublish, type PublishedPuzzlePayload, type StoredWord } from "@/lib/puzzle/publish";
import { asRole, createTestDatabase, createUser } from "../support/pglite";
import { SAMPLE_CROSSWORD } from "../support/sample-crossword";

let db: PGlite;
let adminId: string;

beforeAll(async () => {
  db = await createTestDatabase();
  adminId = await createUser(db, "john@example.com", { admin: true });
});

afterAll(async () => {
  await db.close();
});

/** Reads a puzzle back the way the publish Server Action does. */
async function load(puzzleId: string) {
  const {
    rows: [puzzle],
  } = await db.query<{ grid_data: string[]; grid_finalized_at: Date | null; updated_at: Date }>(
    "select grid_data, grid_finalized_at, updated_at from public.puzzles where id = $1",
    [puzzleId],
  );
  const { rows } = await db.query<{
    clue_number: number;
    direction: "across" | "down";
    answer: string;
    start_row: number;
    start_column: number;
    cell_positions: [number, number][];
    harder_clue: string;
    medium_clue: string;
    easier_clue: string;
  }>(
    `select w.clue_number, w.direction, w.answer, w.start_row, w.start_column, w.cell_positions,
            c.harder_clue, c.medium_clue, c.easier_clue
     from public.puzzle_words w join public.puzzle_clues c on c.puzzle_word_id = w.id
     where w.puzzle_id = $1`,
    [puzzleId],
  );
  const words: StoredWord[] = rows.map((r) => ({
    number: r.clue_number,
    direction: r.direction,
    answer: r.answer,
    startRow: r.start_row,
    startColumn: r.start_column,
    cells: r.cell_positions,
    harder: r.harder_clue,
    medium: r.medium_clue,
    easier: r.easier_clue,
  }));
  return { grid: puzzle.grid_data, gridFinished: Boolean(puzzle.grid_finalized_at), updatedAt: puzzle.updated_at, words };
}

describe("publishing the specification's sample crossword end to end", () => {
  it("finishes the grid, saves clues, validates, publishes and fills the dictionary", async () => {
    const puzzleId = await asRole(db, "authenticated", adminId, async (tx) => {
      const {
        rows: [p],
      } = await tx.query<{ id: string; updated_at: string }>(
        "insert into public.puzzles (grid_data) values ($1::jsonb) returning id, updated_at",
        [JSON.stringify(SAMPLE_CROSSWORD)],
      );
      const words = analyzeGrid(SAMPLE_CROSSWORD).words.map(({ number, direction, answer, startRow, startColumn }) => ({
        number,
        direction,
        answer,
        startRow,
        startColumn,
      }));
      await tx.query("select * from public.finish_puzzle_grid($1, $2::jsonb, $3::jsonb, $4)", [
        p.id,
        JSON.stringify(SAMPLE_CROSSWORD),
        JSON.stringify(words),
        p.updated_at,
      ]);
      return p.id;
    });

    // Not publishable yet: no clues.
    let state = await load(puzzleId);
    expect(validateForPublish(state)).toContain("Word 1a, JEALOUSY has no clues");

    await asRole(db, "authenticated", adminId, async (tx) => {
      const { rows } = await tx.query<{ id: string; answer: string }>(
        "select id, answer from public.puzzle_words where puzzle_id = $1",
        [puzzleId],
      );
      const clues = rows.map((r) => ({ wordId: r.id, harder: `Hard ${r.answer}`, medium: `Medium ${r.answer}`, easier: `Easy ${r.answer}` }));
      await tx.query("select * from public.save_puzzle_clues($1, $2::jsonb)", [puzzleId, JSON.stringify(clues)]);
    });

    state = await load(puzzleId);
    expect(state.grid).toEqual(toFinishedGrid(SAMPLE_CROSSWORD));
    expect(validateForPublish(state)).toEqual([]);

    const payload = buildPublishedPayload(state);
    const { rows } = await asRole(db, "authenticated", adminId, (tx) =>
      tx.query<{ puzzle_number: number }>("select * from public.publish_puzzle($1, $2::jsonb, $3)", [
        puzzleId,
        JSON.stringify(payload),
        state.updatedAt,
      ]),
    );
    expect(rows[0].puzzle_number).toBe(1);

    // The snapshot the app will download, stamped by the database.
    const { rows: snaps } = await db.query<{ payload_snapshot: PublishedPuzzlePayload & { puzzleNumber: number; puzzleId: string } }>(
      "select payload_snapshot from public.puzzle_publications where puzzle_id = $1 and is_current",
      [puzzleId],
    );
    const snapshot = snaps[0].payload_snapshot;
    expect(snapshot).toMatchObject({ puzzleId, puzzleNumber: 1, version: 1, schemaVersion: "v1", gridSize: 12 });
    expect(snapshot.across[0]).toMatchObject({ label: "1a", answer: "JEALOUSY", clues: { harder: "Hard JEALOUSY" } });
    expect(snapshot.down).toHaveLength(16);

    // Visible to the public (the app), and the dictionary learned every word.
    const anon = await asRole(db, "anon", null, (tx) =>
      tx.query<{ puzzle_number: number }>("select puzzle_number from public.puzzle_publications"),
    );
    expect(anon.rows.map((r) => r.puzzle_number)).toEqual([1]);
    const { rows: dict } = await db.query<{ count: number }>("select count(*)::int as count from public.dictionary_words");
    expect(dict[0].count).toBe(32);
  });
});

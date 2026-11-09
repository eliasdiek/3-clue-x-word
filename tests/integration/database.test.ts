import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { asRole, createTestDatabase, createUser } from "../support/pglite";

// A tiny but coherent crossword: CAT (1 Across) crosses COW (1 Down) at C.
const SMALL_GRID = ["CAT.........", "O...........", "W...........", ...Array(9).fill(".".repeat(12))];

const WORDS = [
  { n: 1, dir: "across", answer: "CAT", cells: [[0, 0], [0, 1], [0, 2]] },
  { n: 1, dir: "down", answer: "COW", cells: [[0, 0], [1, 0], [2, 0]] },
] as const;

let db: PGlite;
let adminId: string;
let otherUserId: string;

async function createPuzzle(
  tx: Transaction,
  options: { clues?: "complete" | "partial" | "none"; finalized?: boolean } = {},
) {
  const { clues = "complete", finalized = true } = options;
  const {
    rows: [puzzle],
  } = await tx.query<{ id: string; updated_at: string }>(
    `insert into public.puzzles (title, grid_data, grid_finalized_at)
     values ('Test', $1::jsonb, case when $2 then now() end)
     returning id, updated_at`,
    [JSON.stringify(SMALL_GRID), finalized],
  );
  for (const w of WORDS) {
    const {
      rows: [word],
    } = await tx.query<{ id: string }>(
      `insert into public.puzzle_words
         (puzzle_id, clue_number, direction, answer, word_length, start_row, start_column, cell_positions)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) returning id`,
      [puzzle.id, w.n, w.dir, w.answer, w.answer.length, w.cells[0][0], w.cells[0][1], JSON.stringify(w.cells)],
    );
    if (clues !== "none") {
      await tx.query(
        `insert into public.puzzle_clues (puzzle_word_id, harder_clue, medium_clue, easier_clue)
         values ($1, $2, $3, $4)`,
        [word.id, `Hard ${w.answer}`, clues === "partial" ? "   " : `Medium ${w.answer}`, `Easy ${w.answer}`],
      );
    }
  }
  // Re-read updated_at: inserting children does not touch the puzzle row.
  const {
    rows: [fresh],
  } = await tx.query<{ updated_at: string }>("select updated_at from public.puzzles where id = $1", [puzzle.id]);
  return { id: puzzle.id, updatedAt: fresh.updated_at };
}

async function publish(tx: Transaction, puzzleId: string, expectedUpdatedAt: string | null) {
  const { rows } = await tx.query<{ puzzle_number: number; publication_version: number }>(
    "select * from public.publish_puzzle($1, $2::jsonb, $3)",
    [puzzleId, JSON.stringify({ schemaVersion: "v1", gridSize: 12 }), expectedUpdatedAt],
  );
  return rows[0];
}

beforeAll(async () => {
  db = await createTestDatabase();
  adminId = await createUser(db, "john@example.com", { admin: true, name: "John Ward" });
  otherUserId = await createUser(db, "someone@example.com");
});

afterAll(async () => {
  await db.close();
});

describe("schema constraints", () => {
  it("creates puzzles with an empty 12x12 grid by default", async () => {
    const result = await asRole(db, "authenticated", adminId, (tx) =>
      tx.query<{ grid_data: string[] }>("insert into public.puzzles default values returning grid_data"),
    );
    const grid = result.rows[0].grid_data;
    expect(grid).toHaveLength(12);
    expect(grid.every((row) => row === "............")).toBe(true);
  });

  it.each([
    ["11 rows", Array(11).fill(".".repeat(12))],
    ["a short row", [...Array(11).fill(".".repeat(12)), "..."]],
    ["lowercase letters", [...Array(11).fill(".".repeat(12)), "abc........."]],
    ["digits", [...Array(11).fill(".".repeat(12)), "1..........."]],
  ])("rejects grid data with %s", async (_label, grid) => {
    await expect(
      asRole(db, "authenticated", adminId, (tx) =>
        tx.query("insert into public.puzzles (grid_data) values ($1::jsonb)", [JSON.stringify(grid)]),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("rejects a word whose length disagrees with its answer", async () => {
    await expect(
      asRole(db, "authenticated", adminId, async (tx) => {
        const { rows } = await tx.query<{ id: string }>("insert into public.puzzles default values returning id");
        await tx.query(
          `insert into public.puzzle_words
             (puzzle_id, clue_number, direction, answer, word_length, start_row, start_column, cell_positions)
           values ($1, 1, 'across', 'CAT', 4, 0, 0, '[[0,0],[0,1],[0,2]]')`,
          [rows[0].id],
        );
      }),
    ).rejects.toThrow(/puzzle_words_length_matches/);
  });

  it("rejects duplicate clue records for the same word position", async () => {
    await expect(
      asRole(db, "authenticated", adminId, async (tx) => {
        const { id } = await createPuzzle(tx, { clues: "none" });
        const { rows } = await tx.query<{ id: string }>(
          "select id from public.puzzle_words where puzzle_id = $1 limit 1",
          [id],
        );
        await tx.query("insert into public.puzzle_clues (puzzle_word_id) values ($1)", [rows[0].id]);
        await tx.query("insert into public.puzzle_clues (puzzle_word_id) values ($1)", [rows[0].id]);
      }),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("row level security", () => {
  it("hides all admin data from anonymous visitors", async () => {
    await asRole(db, "authenticated", adminId, (tx) => createPuzzle(tx));
    await expect(asRole(db, "anon", null, (tx) => tx.query("select * from public.puzzles"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asRole(db, "anon", null, (tx) => tx.query("select * from public.dictionary_words")),
    ).rejects.toThrow(/permission denied/);
  });

  it("hides admin data from signed-in users who are not administrators", async () => {
    const { rows } = await asRole(db, "authenticated", otherUserId, (tx) => tx.query("select * from public.puzzles"));
    expect(rows).toHaveLength(0);
    await expect(
      asRole(db, "authenticated", otherUserId, (tx) => tx.query("insert into public.puzzles default values")),
    ).rejects.toThrow(/row-level security/);
  });

  it("lets a user read only their own admin profile and never change it", async () => {
    const { rows } = await asRole(db, "authenticated", otherUserId, (tx) =>
      tx.query("select * from public.admin_profiles"),
    );
    expect(rows).toHaveLength(0);
    await expect(
      asRole(db, "authenticated", otherUserId, (tx) =>
        tx.query("insert into public.admin_profiles (auth_user_id, display_name) values ($1, 'Me')", [otherUserId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("treats a deactivated admin as a non-admin", async () => {
    const inactive = await createUser(db, "former@example.com", { admin: true, active: false });
    const { rows } = await asRole(db, "authenticated", inactive, (tx) =>
      tx.query<{ is_admin: boolean }>("select public.is_admin() as is_admin"),
    );
    expect(rows[0].is_admin).toBe(false);
  });

  it("doesn't release future quotes to the public (beyond time-zone lead)", async () => {
    // Up to one day ahead of UTC is allowed (see 20261109000100), so
    // players east of UTC get their own "today".
    await asRole(db, "authenticated", adminId, (tx) =>
      tx.query(
        `insert into public.daily_quotes (quote_date, quote_text, author) values
           (current_date, 'Today', 'A'), (current_date + 3, 'Later', 'B')`,
      ),
    );
    const { rows } = await asRole(db, "anon", null, (tx) =>
      tx.query<{ quote_text: string }>("select quote_text from public.daily_quotes"),
    );
    expect(rows.map((r) => r.quote_text)).toEqual(["Today"]);
  });
});

describe("publishing", () => {
  it("refuses to publish when a clue is missing", async () => {
    await expect(
      asRole(db, "authenticated", adminId, async (tx) => {
        const p = await createPuzzle(tx, { clues: "partial" });
        await publish(tx, p.id, p.updatedAt);
      }),
    ).rejects.toThrow(/missing one or more clues/);
  });

  it("refuses to publish a grid that was never finished", async () => {
    await expect(
      asRole(db, "authenticated", adminId, async (tx) => {
        const p = await createPuzzle(tx, { finalized: false });
        await publish(tx, p.id, p.updatedAt);
      }),
    ).rejects.toThrow(/has not been finished/);
  });

  it("refuses non-administrators", async () => {
    const p = await asRole(db, "authenticated", adminId, (tx) => createPuzzle(tx));
    await expect(asRole(db, "authenticated", otherUserId, (tx) => publish(tx, p.id, p.updatedAt))).rejects.toThrow(
      /Only administrators/,
    );
    await expect(asRole(db, "anon", null, (tx) => publish(tx, p.id, p.updatedAt))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("refuses a puzzle changed after it was checked", async () => {
    await expect(
      asRole(db, "authenticated", adminId, async (tx) => {
        const p = await createPuzzle(tx);
        await publish(tx, p.id, "2000-01-01T00:00:00Z");
      }),
    ).rejects.toThrow(/changed after it was checked/);
  });

  it("assigns consecutive numbers without gaps from failed attempts", async () => {
    const first = await asRole(db, "authenticated", adminId, async (tx) => {
      const p = await createPuzzle(tx);
      return publish(tx, p.id, p.updatedAt);
    });

    // A failed publish in between must not consume a number.
    await expect(
      asRole(db, "authenticated", adminId, async (tx) => {
        const p = await createPuzzle(tx, { clues: "partial" });
        await publish(tx, p.id, p.updatedAt);
      }),
    ).rejects.toThrow();

    const second = await asRole(db, "authenticated", adminId, async (tx) => {
      const p = await createPuzzle(tx);
      return publish(tx, p.id, p.updatedAt);
    });

    expect(second.puzzle_number).toBe(first.puzzle_number + 1);
    expect(first.publication_version).toBe(1);
  });

  it("never publishes the same puzzle twice", async () => {
    await expect(
      asRole(db, "authenticated", adminId, async (tx) => {
        const p = await createPuzzle(tx);
        await publish(tx, p.id, p.updatedAt);
        await publish(tx, p.id, null);
      }),
    ).rejects.toThrow(/already been published/);
  });

  it("stamps the snapshot, exposes it publicly and keeps drafts hidden", async () => {
    const { puzzleId, number } = await asRole(db, "authenticated", adminId, async (tx) => {
      const p = await createPuzzle(tx);
      const result = await publish(tx, p.id, p.updatedAt);
      await createPuzzle(tx); // an unpublished draft alongside it
      return { puzzleId: p.id, number: result.puzzle_number };
    });

    const { rows } = await asRole(db, "anon", null, (tx) =>
      tx.query<{ puzzle_id: string; payload_snapshot: Record<string, unknown> }>(
        "select puzzle_id, payload_snapshot from public.puzzle_publications where puzzle_number = $1",
        [number],
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].payload_snapshot).toMatchObject({
      puzzleId,
      puzzleNumber: number,
      version: 1,
      schemaVersion: "v1",
    });

    const all = await asRole(db, "anon", null, (tx) =>
      tx.query<{ puzzle_id: string }>("select puzzle_id from public.puzzle_publications"),
    );
    const drafts = await db.query<{ id: string }>("select id from public.puzzles where published_at is null");
    const exposed = new Set(all.rows.map((r) => r.puzzle_id));
    expect(drafts.rows.some((d) => exposed.has(d.id))).toBe(false);
  });

  it("locks the answers of a published puzzle and protects its snapshot", async () => {
    const puzzleId = await asRole(db, "authenticated", adminId, async (tx) => {
      const p = await createPuzzle(tx);
      await publish(tx, p.id, p.updatedAt);
      return p.id;
    });

    await expect(
      asRole(db, "authenticated", adminId, (tx) =>
        tx.query("update public.puzzles set grid_data = public.empty_grid_data() where id = $1", [puzzleId]),
      ),
    ).rejects.toThrow(/cannot be changed/);
    await expect(
      asRole(db, "authenticated", adminId, (tx) =>
        tx.query("update public.puzzle_words set answer = 'DOG' where puzzle_id = $1", [puzzleId]),
      ),
    ).rejects.toThrow(/locked/);
    await expect(
      asRole(db, "authenticated", adminId, (tx) => tx.query("delete from public.puzzles where id = $1", [puzzleId])),
    ).rejects.toThrow(/cannot be deleted/);
    // Even the database owner cannot rewrite a published snapshot.
    await expect(
      db.query("update public.puzzle_publications set payload_snapshot = '{}' where puzzle_id = $1", [puzzleId]),
    ).rejects.toThrow(/cannot be modified/);
  });

  it("lets drafts be deleted, together with their words and clues", async () => {
    const remaining = await asRole(db, "authenticated", adminId, async (tx) => {
      const p = await createPuzzle(tx);
      await tx.query("delete from public.puzzles where id = $1", [p.id]);
      return tx.query("select 1 from public.puzzle_words where puzzle_id = $1", [p.id]);
    });
    expect(remaining.rows).toHaveLength(0);
  });

  it("adds published words and clues to the dictionary without duplicates", async () => {
    // Every published test puzzle uses CAT with the same clues, so the
    // dictionary must hold one CAT entry and one clue set with many usages.
    const { rows } = await asRole(db, "authenticated", adminId, (tx) =>
      tx.query<{ normalized_word: string; sets: number; usages: number }>(
        `select w.normalized_word,
                (select count(*)::int from public.dictionary_clue_sets s where s.dictionary_word_id = w.id) as sets,
                (select count(*)::int from public.dictionary_word_usages u where u.dictionary_word_id = w.id) as usages
         from public.dictionary_words w
         order by w.normalized_word`,
      ),
    );
    expect(rows.map((r) => r.normalized_word)).toEqual(["CAT", "COW"]);
    expect(rows.every((r) => r.sets === 1)).toBe(true);
    expect(rows.every((r) => r.usages >= 3)).toBe(true);
  });

  it("summarises word and clue counts for the dashboard", async () => {
    const summary = await asRole(db, "authenticated", adminId, async (tx) => {
      const p = await createPuzzle(tx, { clues: "partial" });
      const { rows } = await tx.query<{ word_count: number; completed_clue_count: number }>(
        "select word_count, completed_clue_count from public.puzzle_summaries where id = $1",
        [p.id],
      );
      return rows[0];
    });
    expect(summary).toEqual({ word_count: 2, completed_clue_count: 0 });
  });
});

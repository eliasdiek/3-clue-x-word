"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/dal";
import { writeAuditLog } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { chooseAutoTitle } from "./format";
import { analyzeGrid, firstAcrossWord, gridProblems, parseGrid, toEditableGrid } from "./grid";

/**
 * Server Actions for the grid editor. Each one re-checks the administrator
 * (requireAdmin) and runs under Row Level Security as that user. Grids are
 * re-validated here; the database re-checks the word list again on Done.
 */

export type GridFailureReason = "invalid" | "problems" | "stale" | "locked" | "not-found" | "error";

export type SaveGridResult =
  | { ok: true; puzzleId: string; updatedAt: string }
  | { ok: false; reason: GridFailureReason; message: string; problems?: string[] };

export type FinishGridResult =
  | {
      ok: true;
      puzzleId: string;
      updatedAt: string;
      wordCount: number;
      keptClueCount: number;
      droppedClueCount: number;
    }
  | { ok: false; reason: GridFailureReason; message: string; problems?: string[] };

const MESSAGES: Record<Exclude<GridFailureReason, "problems">, string> = {
  invalid: "The grid could not be read. Please reload the page and try again.",
  stale: "This puzzle was changed in another window or by someone else. Reload the page to see the latest version.",
  locked: "Stored puzzles are locked and can't be edited.",
  "not-found": "This puzzle no longer exists.",
  error: "Something went wrong while saving. Your changes are still on screen; please try again.",
};

const fail = (reason: Exclude<GridFailureReason, "problems">) => ({ ok: false as const, reason, message: MESSAGES[reason] });

/** Saves the grid while composing. Creates the puzzle on the first save. */
export async function saveGridDraft(input: {
  puzzleId: string | null;
  grid: unknown;
  expectedUpdatedAt: string | null;
}): Promise<SaveGridResult> {
  const admin = await requireAdmin();
  const parsed = parseGrid(input.grid);
  if (!parsed) return fail("invalid");
  // While composing, the board has no black squares (they appear on Done).
  const grid = toEditableGrid(parsed);
  const supabase = await createClient();

  if (!input.puzzleId) {
    const { data, error } = await supabase
      .from("puzzles")
      .insert({ grid_data: grid })
      .select("id, updated_at")
      .single();
    if (error || !data) {
      console.error("[puzzle] create failed:", error?.message);
      return fail("error");
    }
    await writeAuditLog(supabase, {
      adminId: admin.adminId,
      action: "puzzle.created",
      resourceType: "puzzle",
      resourceId: data.id,
    });
    const titled = await giveAutoTitle(supabase, data.id, firstAcrossWord(grid), null);
    return { ok: true, puzzleId: data.id, updatedAt: titled ?? data.updated_at };
  }

  // Editing the grid un-finishes it: the word list must be regenerated on Done.
  let query = supabase
    .from("puzzles")
    .update({ grid_data: grid, grid_finalized_at: null, updated_by: admin.adminId })
    .eq("id", input.puzzleId)
    .is("published_at", null);
  if (input.expectedUpdatedAt) query = query.eq("updated_at", input.expectedUpdatedAt);
  const { data, error } = await query.select("id, updated_at, title").maybeSingle();

  if (error) return explain(error);
  if (data) {
    // Keep the title in step with the first across word as it's typed.
    const titled = await giveAutoTitle(supabase, data.id, firstAcrossWord(grid), data.title);
    return { ok: true, puzzleId: data.id, updatedAt: titled ?? data.updated_at };
  }
  return whyNotUpdated(input.puzzleId);
}

/** "Done": black squares, numbering and the word list, checked and stored. */
export async function finishGrid(input: {
  puzzleId: string | null;
  grid: unknown;
  expectedUpdatedAt: string | null;
}): Promise<FinishGridResult> {
  await requireAdmin();
  const parsed = parseGrid(input.grid);
  if (!parsed) return fail("invalid");

  const analysis = analyzeGrid(parsed);
  const problems = gridProblems(analysis);
  if (problems.length > 0) {
    return { ok: false, reason: "problems", message: "Please fix these before clicking Done:", problems };
  }

  let puzzleId = input.puzzleId;
  let expectedUpdatedAt = input.expectedUpdatedAt;
  if (!puzzleId) {
    const created = await saveGridDraft({ puzzleId: null, grid: parsed, expectedUpdatedAt: null });
    if (!created.ok) return created;
    puzzleId = created.puzzleId;
    expectedUpdatedAt = created.updatedAt;
  }

  const supabase = await createClient();
  const words = analysis.words.map(({ number, direction, answer, startRow, startColumn }) => ({
    number,
    direction,
    answer,
    startRow,
    startColumn,
  }));
  const { data, error } = await supabase.rpc("finish_puzzle_grid", {
    p_puzzle_id: puzzleId,
    p_grid: parsed,
    p_words: words,
    p_expected_updated_at: expectedUpdatedAt,
  });

  if (error) return explain(error);
  const row = data?.[0];
  if (!row) return fail("error");

  const titled = await giveAutoTitle(supabase, puzzleId, firstAcrossWord(parsed));
  return {
    ok: true,
    puzzleId,
    updatedAt: titled ?? row.updated_at,
    wordCount: row.word_count,
    keptClueCount: row.kept_clue_count,
    droppedClueCount: row.dropped_clue_count,
  };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Titles given automatically: a first across word, maybe with a number (JEALOUSY, JEALOUSY2). */
const AUTO_TITLE = /^[A-Z]+\d*$/;

/**
 * Names the puzzle after its first across word so it's easy to find again
 * (the client's request). A title someone typed is kept; an automatic one is
 * updated if the first word changed. Returns the puzzle's new updated_at, or
 * null if nothing changed.
 */
async function giveAutoTitle(
  supabase: Supabase,
  puzzleId: string,
  answer: string | null,
  /** The puzzle's title if already known (null = untitled); fetched when left out. */
  knownTitle?: string | null,
): Promise<string | null> {
  if (!answer) return null; // no across word yet
  try {
    let title = knownTitle;
    if (title === undefined) {
      const { data: puzzle } = await supabase.from("puzzles").select("title").eq("id", puzzleId).maybeSingle();
      title = puzzle?.title ?? null;
    }
    const current = title?.trim() ?? "";
    if (current && !AUTO_TITLE.test(current)) return null; // typed by someone: keep it
    if (current && new RegExp(`^${answer}\\d*$`).test(current)) return null; // already named after this word

    const { data: others } = await supabase
      .from("puzzles")
      .select("title")
      .neq("id", puzzleId)
      .ilike("title", `${answer}%`);
    const next = chooseAutoTitle(
      answer,
      (others ?? []).map((o) => o.title ?? "").filter((t) => new RegExp(`^${answer}\\d*$`, "i").test(t)),
    );
    const { data, error } = await supabase.from("puzzles").update({ title: next }).eq("id", puzzleId).select("updated_at").maybeSingle();
    if (error) {
      console.error("[puzzle] auto title failed:", error.code, error.message);
      return null;
    }
    return data?.updated_at ?? null;
  } catch (error) {
    // A missing title is no reason to fail a save.
    console.error("[puzzle] auto title failed:", error);
    return null;
  }
}

function explain(error: PostgrestError) {
  switch (error.code) {
    case "40001":
      return fail("stale");
    case "P0002":
      return fail("not-found");
    case "23514":
      if (/cannot be changed|locked/i.test(error.message)) return fail("locked");
      return { ok: false as const, reason: "problems" as const, message: error.message, problems: [error.message] };
    default:
      console.error("[puzzle] save failed:", error.code, error.message);
      return fail("error");
  }
}

async function whyNotUpdated(puzzleId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("puzzles").select("published_at").eq("id", puzzleId).maybeSingle();
  if (!data) return fail("not-found");
  if (data.published_at) return fail("locked");
  return fail("stale");
}

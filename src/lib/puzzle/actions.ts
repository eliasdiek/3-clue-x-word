"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/dal";
import { writeAuditLog } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { analyzeGrid, gridProblems, parseGrid, toEditableGrid } from "./grid";

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
  locked: "Published puzzles are locked and can't be edited.",
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
    return { ok: true, puzzleId: data.id, updatedAt: data.updated_at };
  }

  // Editing the grid un-finishes it: the word list must be regenerated on Done.
  let query = supabase
    .from("puzzles")
    .update({ grid_data: grid, grid_finalized_at: null, updated_by: admin.adminId })
    .eq("id", input.puzzleId)
    .is("published_at", null);
  if (input.expectedUpdatedAt) query = query.eq("updated_at", input.expectedUpdatedAt);
  const { data, error } = await query.select("id, updated_at").maybeSingle();

  if (error) return explain(error);
  if (data) return { ok: true, puzzleId: data.id, updatedAt: data.updated_at };
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
  return {
    ok: true,
    puzzleId,
    updatedAt: row.updated_at,
    wordCount: row.word_count,
    keptClueCount: row.kept_clue_count,
    droppedClueCount: row.dropped_clue_count,
  };
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

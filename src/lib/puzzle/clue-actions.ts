"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/dal";
import { writeAuditLog } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { cluesFilled, saveCluesSchema, type ClueEdit } from "@/lib/validation/clues";
import { clueCheckReport } from "./format";

/**
 * Server Actions for the clue editor. Each re-checks the administrator and
 * runs under Row Level Security; save_puzzle_clues() re-checks the rest.
 */

export type ClueFailureReason = "invalid" | "stale" | "locked" | "not-found" | "error";

export type SaveCluesResult =
  | { ok: true; updatedAt: string; wordCount: number; completedCount: number }
  | { ok: false; reason: ClueFailureReason; message: string };

export type CheckCluesResult =
  | { ok: true; complete: boolean; lines: string[] }
  | { ok: false; reason: ClueFailureReason; message: string };

const MESSAGES: Record<ClueFailureReason, string> = {
  invalid: "Some clues couldn't be saved. Please check them and try again.",
  stale: "The word list has changed since this page was opened. Reload the page to see the latest words.",
  locked: "Published puzzles are locked and can't be edited.",
  "not-found": "This puzzle no longer exists.",
  error: "Something went wrong while saving. Your clues are still on screen; please try again.",
};

const fail = (reason: ClueFailureReason) => ({ ok: false as const, reason, message: MESSAGES[reason] });

export async function saveClues(input: { puzzleId: string; clues: ClueEdit[] }): Promise<SaveCluesResult> {
  await requireAdmin();
  const parsed = saveCluesSchema.safeParse(input);
  if (!parsed.success) return { ...fail("invalid"), message: parsed.error.issues[0]?.message ?? MESSAGES.invalid };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_puzzle_clues", {
    p_puzzle_id: parsed.data.puzzleId,
    p_clues: parsed.data.clues,
  });
  if (error) return explain(error);
  const row = data?.[0];
  if (!row) return fail("error");
  return { ok: true, updatedAt: row.updated_at, wordCount: row.word_count, completedCount: row.completed_count };
}

/**
 * The clue list's "Done": checks every word has three clues and reports in
 * the specification's words. A complete puzzle is marked ready to publish.
 */
export async function checkClues(input: { puzzleId: string }): Promise<CheckCluesResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { data: puzzle } = await supabase
    .from("puzzles")
    .select("id, status, grid_finalized_at, published_at")
    .eq("id", input.puzzleId)
    .maybeSingle();
  if (!puzzle) return fail("not-found");
  if (puzzle.published_at) return fail("locked");
  if (!puzzle.grid_finalized_at) return fail("stale");

  const { data: words, error } = await supabase
    .from("puzzle_words")
    .select("id, clue_number, direction, answer")
    .eq("puzzle_id", puzzle.id);
  if (error || !words) return fail("error");
  const { data: clues } = await supabase
    .from("puzzle_clues")
    .select("puzzle_word_id, harder_clue, medium_clue, easier_clue")
    .in(
      "puzzle_word_id",
      words.map((w) => w.id),
    );
  const byWord = new Map((clues ?? []).map((c) => [c.puzzle_word_id, c]));

  const report = clueCheckReport(
    words.map((w) => {
      const c = byWord.get(w.id);
      return {
        number: w.clue_number,
        direction: w.direction,
        answer: w.answer,
        cluesFilled: c ? cluesFilled({ harder: c.harder_clue, medium: c.medium_clue, easier: c.easier_clue }) : 0,
      };
    }),
  );

  const nextStatus = report.ok ? "ready" : "draft";
  if (puzzle.status !== nextStatus) {
    await supabase.from("puzzles").update({ status: nextStatus, updated_by: admin.adminId }).eq("id", puzzle.id);
  }
  await writeAuditLog(supabase, {
    adminId: admin.adminId,
    action: "puzzle.clues_checked",
    resourceType: "puzzle",
    resourceId: puzzle.id,
    metadata: { complete: report.ok, problems: report.ok ? 0 : report.lines.length },
  });
  return { ok: true, complete: report.ok, lines: report.lines };
}

function explain(error: PostgrestError) {
  switch (error.code) {
    case "40001":
      return fail("stale");
    case "P0002":
      return fail("not-found");
    case "23514":
      return fail("locked");
    case "22023":
    case "23502":
      return fail("invalid");
    default:
      console.error("[clues] save failed:", error.code, error.message);
      return fail("error");
  }
}

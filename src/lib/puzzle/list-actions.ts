"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/dal";
import { writeAuditLog } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

/**
 * Puzzle List row actions. Each re-checks the administrator and runs under
 * Row Level Security; the database functions and triggers enforce the rules
 * (published puzzles can't be deleted or edited, only archived).
 */

export type ListActionResult = { ok: true; puzzleId?: string } | { ok: false; message: string };

const id = z.uuid();
const failed = (message: string): ListActionResult => ({ ok: false, message });

export async function duplicatePuzzle(puzzleId: string): Promise<ListActionResult> {
  await requireAdmin();
  if (!id.safeParse(puzzleId).success) return failed("That puzzle couldn't be found.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_puzzle", { p_puzzle_id: puzzleId });
  if (error || !data) {
    console.error("[puzzles] duplicate failed:", error?.message);
    return failed("The puzzle couldn't be copied. Please try again.");
  }
  return { ok: true, puzzleId: data };
}

export async function archivePuzzle(puzzleId: string): Promise<ListActionResult> {
  await requireAdmin();
  if (!id.safeParse(puzzleId).success) return failed("That puzzle couldn't be found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_puzzle", { p_puzzle_id: puzzleId });
  if (error) {
    console.error("[puzzles] archive failed:", error.message);
    return failed("The puzzle couldn't be archived. Please try again.");
  }
  return { ok: true };
}

export async function restorePuzzle(puzzleId: string): Promise<ListActionResult> {
  await requireAdmin();
  if (!id.safeParse(puzzleId).success) return failed("That puzzle couldn't be found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_puzzle", { p_puzzle_id: puzzleId });
  if (error) {
    console.error("[puzzles] restore failed:", error.message);
    return failed("The puzzle couldn't be restored. Please try again.");
  }
  return { ok: true };
}

/** Deletes a draft. Puzzles that were ever published can only be archived. */
export async function deletePuzzle(puzzleId: string): Promise<ListActionResult> {
  const admin = await requireAdmin();
  if (!id.safeParse(puzzleId).success) return failed("That puzzle couldn't be found.");
  const supabase = await createClient();
  const { data: puzzle } = await supabase.from("puzzles").select("published_at").eq("id", puzzleId).maybeSingle();
  if (!puzzle) return failed("That puzzle couldn't be found.");
  if (puzzle.published_at) return failed("Published puzzles can't be deleted. Archive it instead.");

  const { error } = await supabase.from("puzzles").delete().eq("id", puzzleId);
  if (error) {
    console.error("[puzzles] delete failed:", error.message);
    return failed("The puzzle couldn't be deleted. Please try again.");
  }
  await writeAuditLog(supabase, {
    adminId: admin.adminId,
    action: "puzzle.deleted",
    resourceType: "puzzle",
    resourceId: puzzleId,
  });
  return { ok: true };
}

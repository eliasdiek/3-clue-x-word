"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/dal";
import { writeAuditLog } from "@/lib/audit";
import { CLUE_MAX_LENGTH } from "@/lib/constants/game";
import { createClient } from "@/lib/supabase/server";

/**
 * Clue Dictionary edits. A dictionary clue set is only a suggestion for
 * future puzzles: published puzzles keep their own copy of their clues (in
 * puzzle_clues and the immutable publication snapshot), so editing or
 * removing a set here never changes a published puzzle.
 */

export type DictionaryActionResult = { ok: true } | { ok: false; message: string };

const clue = z
  .string()
  .transform((v) => v.trim())
  .pipe(
    z
      .string()
      .min(1, "All three clues are needed.")
      .max(CLUE_MAX_LENGTH, `Clues can be up to ${CLUE_MAX_LENGTH} characters.`),
  );
const clueSetSchema = z.object({ id: z.uuid(), harder: clue, medium: clue, easier: clue });

export async function updateClueSet(input: z.input<typeof clueSetSchema>): Promise<DictionaryActionResult> {
  const admin = await requireAdmin();
  const parsed = clueSetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the clues." };
  const { id, harder, medium, easier } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("dictionary_clue_sets")
    .update({ harder_clue: harder, medium_clue: medium, easier_clue: easier })
    .eq("id", id);
  if (error?.code === "23505") {
    return { ok: false, message: "This word already has a clue set with exactly these clues." };
  }
  if (error) {
    console.error("[dictionary] update failed:", error.message);
    return { ok: false, message: "The clues couldn't be saved. Please try again." };
  }
  await writeAuditLog(supabase, { adminId: admin.adminId, action: "dictionary.clue_set_updated", resourceType: "clue_set", resourceId: id });
  return { ok: true };
}

export async function deleteClueSet(id: string): Promise<DictionaryActionResult> {
  const admin = await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "That clue set couldn't be found." };
  const supabase = await createClient();
  const { error } = await supabase.from("dictionary_clue_sets").delete().eq("id", id);
  if (error) {
    console.error("[dictionary] delete failed:", error.message);
    return { ok: false, message: "The clue set couldn't be removed. Please try again." };
  }
  await writeAuditLog(supabase, { adminId: admin.adminId, action: "dictionary.clue_set_deleted", resourceType: "clue_set", resourceId: id });
  return { ok: true };
}

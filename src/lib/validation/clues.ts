import { z } from "zod";
import { CLUE_MAX_LENGTH } from "@/lib/constants/game";

/** Shared by the clue editor and its Server Actions (validated on both). */

const clueText = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().max(CLUE_MAX_LENGTH, `Clues can be up to ${CLUE_MAX_LENGTH} characters.`));

export const clueEditSchema = z.object({
  wordId: z.uuid(),
  harder: clueText,
  medium: clueText,
  easier: clueText,
  sourceClueSetId: z.uuid().nullable(),
});
export type ClueEdit = z.input<typeof clueEditSchema>;

export const saveCluesSchema = z.object({
  puzzleId: z.uuid(),
  clues: z.array(clueEditSchema).min(1).max(144),
});

/** Number of the three clues that are filled in. */
export function cluesFilled(clue: { harder: string; medium: string; easier: string }): number {
  return [clue.harder, clue.medium, clue.easier].filter((text) => text.trim() !== "").length;
}

import type { NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { CACHE, fail, ok, parsePuzzleNumber } from "@/lib/api/v1";

/** GET /api/v1/puzzles/:number — one published puzzle, in full. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const number = parsePuzzleNumber((await params).number);
  if (!number) return fail(400, "invalid-number", "The puzzle number must be a positive whole number.");

  const { data, error } = await createPublicClient()
    .from("puzzle_publications")
    .select("payload_snapshot")
    .eq("puzzle_number", number)
    .maybeSingle();
  if (error) return fail(503, "unavailable", "Puzzles are unavailable right now. Please try again later.");
  if (!data) return fail(404, "not-found", `Puzzle #${number} is not available.`);
  return ok({ puzzle: data.payload_snapshot }, CACHE.immutable);
}

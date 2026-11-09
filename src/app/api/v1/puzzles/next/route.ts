import type { NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { fail, ok, parsePuzzleNumber } from "@/lib/api/v1";

/**
 * GET /api/v1/puzzles/next?after=12
 * The first published puzzle numbered above `after` (default 0), in full.
 * Numbers can skip when a puzzle has been withdrawn, so the app should ask
 * for "the next one after the last I played", not "number + 1".
 */
export async function GET(request: NextRequest) {
  const after = parsePuzzleNumber(request.nextUrl.searchParams.get("after") ?? "0");
  if (after === null) return fail(400, "invalid-after", "`after` must be a whole number.");

  const { data, error } = await createPublicClient()
    .from("puzzle_publications")
    .select("payload_snapshot")
    .gt("puzzle_number", after)
    .order("puzzle_number")
    .limit(1)
    .maybeSingle();
  if (error) return fail(503, "unavailable", "Puzzles are unavailable right now. Please try again later.");
  if (!data) return fail(404, "no-more-puzzles", `There is no published puzzle after #${after} yet.`);
  return ok({ puzzle: data.payload_snapshot });
}

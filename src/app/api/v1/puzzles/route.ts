import type { NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { fail, ok, parsePuzzleNumber } from "@/lib/api/v1";

const MAX_LIMIT = 100;

/**
 * GET /api/v1/puzzles?after=0&limit=50
 * Lists published puzzles (number, version, publication date), in number
 * order, starting after `after`. Withdrawn (archived) puzzles are not listed.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const after = parsePuzzleNumber(params.get("after") ?? "0");
  const limit = parsePuzzleNumber(params.get("limit") ?? "50");
  if (after === null) return fail(400, "invalid-after", "`after` must be a whole number.");
  if (!limit || limit > MAX_LIMIT) return fail(400, "invalid-limit", `\`limit\` must be between 1 and ${MAX_LIMIT}.`);

  const { data, error } = await createPublicClient()
    .from("puzzle_publications")
    .select("puzzle_number, publication_version, published_at")
    .gt("puzzle_number", after)
    .order("puzzle_number")
    .limit(limit + 1);
  if (error) return fail(503, "unavailable", "Puzzles are unavailable right now. Please try again later.");

  const rows = data ?? [];
  return ok({
    puzzles: rows.slice(0, limit).map((r) => ({
      puzzleNumber: r.puzzle_number,
      version: r.publication_version,
      publishedAt: r.published_at,
    })),
    hasMore: rows.length > limit,
  });
}

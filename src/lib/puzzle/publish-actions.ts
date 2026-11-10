"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { loadPuzzleWithClues } from "./load";
import { buildPublishedPayload, validateForPublish } from "./publish";

export type PublishResult =
  | { ok: true; puzzleNumber: number; publishedAt: string }
  | {
      ok: false;
      reason: "problems" | "stale" | "already-published" | "not-found" | "error";
      message: string;
      problems?: string[];
    };

/**
 * Publishes a reviewed puzzle. The checks run here on the server against the
 * stored puzzle, whatever the browser showed; publish_puzzle() then re-checks,
 * allocates the next consecutive number and stores the snapshot in one
 * transaction. `reviewedUpdatedAt` is the version the administrator looked at:
 * if anything changed since, nothing is published.
 */
export async function publishPuzzle(input: { puzzleId: string; reviewedUpdatedAt: string }): Promise<PublishResult> {
  await requireAdmin();
  const supabase = await createClient();
  const puzzle = await loadPuzzleWithClues(supabase, input.puzzleId);
  if (!puzzle) return { ok: false, reason: "not-found", message: "This puzzle no longer exists." };
  if (puzzle.publishedAt) {
    return {
      ok: false,
      reason: "already-published",
      message: `This puzzle has already been stored as #${puzzle.puzzleNumber}.`,
    };
  }
  if (new Date(puzzle.updatedAt).getTime() !== new Date(input.reviewedUpdatedAt).getTime()) {
    return {
      ok: false,
      reason: "stale",
      message: "The puzzle was changed after this review was opened. Reload the page and check it again.",
    };
  }

  const problems = validateForPublish(puzzle);
  if (problems.length) {
    return { ok: false, reason: "problems", message: "This puzzle can't be stored yet:", problems };
  }

  const payload = buildPublishedPayload(puzzle) as unknown as Json;
  const { data, error } = await supabase.rpc("publish_puzzle", {
    p_puzzle_id: puzzle.id,
    p_payload: payload,
    p_expected_updated_at: puzzle.updatedAt,
  });
  if (error) return explain(error);
  const row = data?.[0];
  if (!row) return { ok: false, reason: "error", message: "Storing failed. Nothing was stored; please try again." };
  return { ok: true, puzzleNumber: row.puzzle_number, publishedAt: row.published_at };
}

function explain(error: PostgrestError): PublishResult {
  switch (error.code) {
    case "40001":
      return {
        ok: false,
        reason: "stale",
        message: "The puzzle was changed after this review was opened. Reload the page and check it again.",
      };
    case "23505":
      return { ok: false, reason: "already-published", message: error.message };
    case "23514":
      return { ok: false, reason: "problems", message: "This puzzle can't be stored yet:", problems: [error.message] };
    default:
      console.error("[publish] failed:", error.code, error.message);
      return { ok: false, reason: "error", message: "Storing failed. Nothing was stored; please try again." };
  }
}

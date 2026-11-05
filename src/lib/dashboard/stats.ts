import type { PuzzleSummaryRow } from "@/lib/supabase/database.types";

export type DashboardStats = {
  total: number;
  published: number;
  incomplete: number;
  ready: number;
};

type SummaryInput = Pick<PuzzleSummaryRow, "status" | "word_count" | "completed_clue_count" | "grid_finalized_at">;

/**
 * Dashboard figures, computed only from real puzzle rows. Unpublished puzzles
 * are split by the specification's "Done" check:
 *  - Incomplete: grid not finished, or some word lacks its three clues.
 *  - Ready to Publish: every word is present and has 3 clues.
 * Archived puzzles count towards the total only.
 */
export function computeDashboardStats(rows: SummaryInput[]): DashboardStats {
  let published = 0;
  let incomplete = 0;
  let ready = 0;
  for (const row of rows) {
    if (row.status === "published") published++;
    if (row.status === "draft" || row.status === "ready") {
      const complete = Boolean(row.grid_finalized_at) && row.word_count > 0 && row.completed_clue_count >= row.word_count;
      if (complete) ready++;
      else incomplete++;
    }
  }
  return { total: rows.length, published, incomplete, ready };
}

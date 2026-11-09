import type { PuzzleStage } from "@/lib/supabase/database.types";

export type StageCounts = Record<PuzzleStage, number> & { total: number };

/** Puzzles per workflow stage, computed only from real puzzle rows. */
export function countStages(rows: { stage: PuzzleStage }[]): StageCounts {
  const counts: StageCounts = { grid: 0, clues: 0, ready: 0, published: 0, archived: 0, total: rows.length };
  for (const row of rows) counts[row.stage]++;
  return counts;
}

/** "just now", "5 min ago", "3 hours ago", "yesterday", "4 days ago", or a date. */
export function relativeTime(value: string | Date, now: Date, formatDate: (d: Date) => string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(date);
}

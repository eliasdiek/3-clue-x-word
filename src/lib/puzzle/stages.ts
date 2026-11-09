import type { PuzzleStage } from "@/lib/supabase/database.types";

/** Labels and badge styles for each workflow stage (puzzle_summaries.stage). */
export const STAGES: Record<PuzzleStage, { label: string; badge: string }> = {
  grid: { label: "Building grid", badge: "bg-warning text-warning-ink" },
  clues: { label: "Adding clues", badge: "bg-easier text-easier-ink" },
  ready: { label: "Ready to publish", badge: "bg-brand-soft text-brand" },
  published: { label: "Published", badge: "bg-success text-success-ink" },
  archived: { label: "Archived", badge: "bg-line text-ink-muted" },
};

export const STAGE_FILTERS = [
  { value: "", label: "All active puzzles" },
  { value: "grid", label: "Building grid" },
  { value: "clues", label: "Adding clues" },
  { value: "ready", label: "Ready to publish" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
] as const;

export function isStage(value: string | undefined): value is PuzzleStage {
  return value !== undefined && value in STAGES;
}

/** The page where work on a puzzle continues. */
export function stageHref(id: string, stage: PuzzleStage): string {
  if (stage === "grid") return `/puzzles/${id}/grid`;
  if (stage === "clues") return `/puzzles/${id}/clues`;
  return `/puzzles/${id}/review`;
}

import type { Json } from "@/lib/supabase/database.types";
import { formatDay, isValidDate } from "@/lib/quotes/dates";

export type AuditEntry = {
  action: string;
  resourceId: string | null;
  metadata: Json;
};

/** How a puzzle is named in sentences: "#12", "“Sunday special”" or "a draft". */
export type PuzzleNames = Map<string, string>;

const meta = (entry: AuditEntry, key: string): Json | undefined =>
  entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata)
    ? (entry.metadata as Record<string, Json>)[key]
    : undefined;

/**
 * A plain-English line for an audit-log entry, or null for entries that
 * aren't worth showing on the dashboard.
 */
export function describeActivity(entry: AuditEntry, names: PuzzleNames): string | null {
  const puzzle = (entry.resourceId && names.get(entry.resourceId)) || "a puzzle";
  switch (entry.action) {
    case "puzzle.created":
      return `Started ${puzzle}`;
    case "puzzle.grid_finished": {
      const words = meta(entry, "wordCount");
      return `Finished the grid of ${puzzle}${typeof words === "number" ? ` (${words} words)` : ""}`;
    }
    case "puzzle.clues_checked":
      return meta(entry, "complete") ? `Checked the clues of ${puzzle}: all present` : `Checked the clues of ${puzzle}: some missing`;
    case "puzzle.published": {
      const number = meta(entry, "puzzleNumber");
      return typeof number === "number" ? `Published puzzle #${number}` : `Published ${puzzle}`;
    }
    case "puzzle.archived":
      return `Archived ${puzzle}`;
    case "puzzle.restored":
      return `Restored ${puzzle}`;
    case "puzzle.duplicated":
      return `Made a copy: ${puzzle}`;
    case "puzzle.deleted":
      return "Deleted a draft";
    case "quote.saved": {
      const date = meta(entry, "date");
      return typeof date === "string" && isValidDate(date) ? `Saved the quote for ${formatDay(date)}` : "Saved a daily quote";
    }
    case "quote.deleted":
      return "Removed a daily quote";
    case "dictionary.clue_set_updated":
      return "Edited clues in the dictionary";
    case "dictionary.clue_set_deleted":
      return "Removed a clue set from the dictionary";
    default:
      return null;
  }
}

/** The actions describeActivity() knows how to show. */
export const DASHBOARD_ACTIONS = [
  "puzzle.created",
  "puzzle.grid_finished",
  "puzzle.clues_checked",
  "puzzle.published",
  "puzzle.archived",
  "puzzle.restored",
  "puzzle.duplicated",
  "puzzle.deleted",
  "quote.saved",
  "quote.deleted",
  "dictionary.clue_set_updated",
  "dictionary.clue_set_deleted",
] as const;

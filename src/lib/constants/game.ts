/**
 * Central product configuration shared by the admin website, the API and
 * (via the API contract) the future mobile app.
 *
 * Scoring rules are kept separate from colours: UI code must read colours
 * from CLUE_LEVEL_STYLES, never infer meaning from them.
 */

export const GRID_SIZE = 12 as const;
export const MIN_WORD_LENGTH = 2 as const;

/** Configurable clue length (initially 50, per the original specification). */
export const CLUE_MAX_LENGTH = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_CLUE_MAX_LENGTH);
  // The database enforces a hard ceiling of 200 characters.
  return Number.isInteger(raw) && raw > 0 && raw <= 200 ? raw : 50;
})();

export const CLUE_LEVELS = ["harder", "medium", "easier"] as const;
export type ClueLevel = (typeof CLUE_LEVELS)[number];

/** Points per solved letter. "showMe" letters are worth nothing. */
export const SCORING_RULES = {
  pointsPerLetter: { harder: 7, medium: 5, easier: 3, showMe: 0 },
  /** Max score = distinct non-blocked letters × harder points (crossings counted once). */
  maxPointsPerLetter: 7,
} as const;

export const CLUE_LEVEL_LABELS: Record<ClueLevel, string> = {
  harder: "Harder",
  medium: "Medium",
  easier: "Easier",
};

/**
 * Colour mapping from the client specification (Crossword 3 Clue #3.docx),
 * which corrects itself to: HARDER (YELLOW), MEDIUM (PINK), EASIER (BLUE).
 * Earlier passages and the mockups swap pink/blue; this is the single place
 * to change it. Values are Tailwind classes backed by theme tokens.
 */
export const CLUE_LEVEL_STYLES: Record<ClueLevel, { surface: string; border: string; text: string }> = {
  harder: { surface: "bg-harder", border: "border-harder-strong", text: "text-harder-ink" },
  medium: { surface: "bg-medium", border: "border-medium-strong", text: "text-medium-ink" },
  easier: { surface: "bg-easier", border: "border-easier-strong", text: "text-easier-ink" },
};

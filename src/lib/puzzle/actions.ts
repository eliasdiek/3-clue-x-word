"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/dal";
import { writeAuditLog } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { chooseAutoTitle } from "./format";
import { analyzeGrid, firstAcrossWord, gridProblems, parseGrid, toEditableGrid } from "./grid";

/**
 * Server Actions for the grid editor. Each one re-checks the administrator
 * (requireAdmin) and runs under Row Level Security as that user. Grids are
 * re-validated here; the database re-checks the word list again on Done.
 */

export type GridFailureReason = "invalid" | "problems" | "stale" | "locked" | "not-found" | "error";

export type SaveGridResult =
  | { ok: true; puzzleId: string; updatedAt: string }
  | { ok: false; reason: GridFailureReason; message: string; problems?: string[] };

export type FinishGridResult =
  | {
      ok: true;
      puzzleId: string;
      updatedAt: string;
      wordCount: number;
      keptClueCount: number;
      droppedClueCount: number;
      /** Words given their most recent clues from the Clue Dictionary. */
      filledClueCount: number;
    }
  | { ok: false; reason: GridFailureReason; message: string; problems?: string[] };

const MESSAGES: Record<Exclude<GridFailureReason, "problems">, string> = {
  invalid: "The grid could not be read. Please reload the page and try again.",
  stale: "This puzzle was changed in another window or by someone else. Reload the page to see the latest version.",
  locked: "Stored puzzles are locked and can't be edited.",
  "not-found": "This puzzle no longer exists.",
  error: "Something went wrong while saving. Your changes are still on screen; please try again.",
};

const fail = (reason: Exclude<GridFailureReason, "problems">) => ({ ok: false as const, reason, message: MESSAGES[reason] });

/** Saves the grid while composing. Creates the puzzle on the first save. */
export async function saveGridDraft(input: {
  puzzleId: string | null;
  grid: unknown;
  expectedUpdatedAt: string | null;
  /** The grid as this page last loaded or saved it (see checkGridUnchanged). */
  baseGrid?: unknown;
}): Promise<SaveGridResult> {
  const admin = await requireAdmin();
  const parsed = parseGrid(input.grid);
  if (!parsed) return fail("invalid");
  // While composing, the board has no black squares (they appear on Done).
  const grid = toEditableGrid(parsed);
  const supabase = await createClient();

  if (!input.puzzleId) {
    const { data, error } = await supabase
      .from("puzzles")
      .insert({ grid_data: grid })
      .select("id, updated_at")
      .single();
    if (error || !data) {
      console.error("[puzzle] create failed:", error?.message);
      return fail("error");
    }
    await writeAuditLog(supabase, {
      adminId: admin.adminId,
      action: "puzzle.created",
      resourceType: "puzzle",
      resourceId: data.id,
    });
    const titled = await giveAutoTitle(supabase, data.id, firstAcrossWord(grid), null);
    return { ok: true, puzzleId: data.id, updatedAt: titled ?? data.updated_at };
  }

  // Editing the grid un-finishes it: the word list must be regenerated on Done.
  let query = supabase
    .from("puzzles")
    .update({ grid_data: grid, grid_finalized_at: null, updated_by: admin.adminId })
    .eq("id", input.puzzleId)
    .is("published_at", null);
  if (input.expectedUpdatedAt) query = query.eq("updated_at", input.expectedUpdatedAt);
  const { data, error } = await query.select("id, updated_at, title").maybeSingle();

  if (error) return explain(error);
  if (data) {
    // Keep the title in step with the first across word as it's typed.
    const titled = await giveAutoTitle(supabase, data.id, firstAcrossWord(grid), data.title);
    return { ok: true, puzzleId: data.id, updatedAt: titled ?? data.updated_at };
  }

  // Not updated: either the puzzle changed since this page last saw it, or it
  // is locked or gone. Saving clues or retitling also changes updated_at, so
  // only a different *grid* counts as someone else's change.
  const check = await checkGridUnchanged(supabase, input.puzzleId, input.expectedUpdatedAt, input.baseGrid);
  if (!check.ok) return check;
  const retry = await supabase
    .from("puzzles")
    .update({ grid_data: grid, grid_finalized_at: null, updated_by: admin.adminId })
    .eq("id", input.puzzleId)
    .is("published_at", null)
    .eq("updated_at", check.updatedAt)
    .select("id, updated_at, title")
    .maybeSingle();
  if (retry.error) return explain(retry.error);
  if (!retry.data) return fail("stale");
  const titled = await giveAutoTitle(supabase, retry.data.id, firstAcrossWord(grid), retry.data.title);
  return { ok: true, puzzleId: retry.data.id, updatedAt: titled ?? retry.data.updated_at };
}

/**
 * Whether it's safe to write over the puzzle's grid. `expectedUpdatedAt` is
 * when this page last saw the puzzle and `baseGrid` the grid it saw then.
 * If the row changed but its grid didn't (clues were saved, the title was
 * set), there's nothing to overwrite, so the current updated_at is returned
 * to use instead. A different grid means a real conflict: "stale".
 */
async function checkGridUnchanged(
  supabase: Supabase,
  puzzleId: string,
  expectedUpdatedAt: string | null,
  baseGrid: unknown,
): Promise<{ ok: true; updatedAt: string } | ReturnType<typeof fail>> {
  const { data } = await supabase
    .from("puzzles")
    .select("updated_at, grid_data, published_at")
    .eq("id", puzzleId)
    .maybeSingle();
  if (!data) return fail("not-found");
  if (data.published_at) return fail("locked");
  if (!expectedUpdatedAt || sameTime(data.updated_at, expectedUpdatedAt)) return { ok: true, updatedAt: data.updated_at };
  const base = parseGrid(baseGrid);
  const current = parseGrid(data.grid_data);
  if (base && current && toEditableGrid(base).join("") === toEditableGrid(current).join("")) {
    return { ok: true, updatedAt: data.updated_at };
  }
  return fail("stale");
}

const sameTime = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

/** "Done": black squares, numbering and the word list, checked and stored. */
export async function finishGrid(input: {
  puzzleId: string | null;
  grid: unknown;
  expectedUpdatedAt: string | null;
  /** The grid as this page last loaded or saved it (see checkGridUnchanged). */
  baseGrid?: unknown;
}): Promise<FinishGridResult> {
  await requireAdmin();
  const parsed = parseGrid(input.grid);
  if (!parsed) return fail("invalid");

  const analysis = analyzeGrid(parsed);
  const problems = gridProblems(analysis);
  if (problems.length > 0) {
    return { ok: false, reason: "problems", message: "Please fix these before clicking Done:", problems };
  }

  let puzzleId = input.puzzleId;
  let expectedUpdatedAt = input.expectedUpdatedAt;
  if (!puzzleId) {
    const created = await saveGridDraft({ puzzleId: null, grid: parsed, expectedUpdatedAt: null });
    if (!created.ok) return created;
    puzzleId = created.puzzleId;
    expectedUpdatedAt = created.updatedAt;
  }

  const supabase = await createClient();
  if (input.puzzleId) {
    // Clues saved since this page loaded aren't a reason to refuse Done.
    const check = await checkGridUnchanged(supabase, puzzleId, expectedUpdatedAt, input.baseGrid);
    if (!check.ok) return check;
    expectedUpdatedAt = check.updatedAt;
  }
  const words = analysis.words.map(({ number, direction, answer, startRow, startColumn }) => ({
    number,
    direction,
    answer,
    startRow,
    startColumn,
  }));
  const { data, error } = await supabase.rpc("finish_puzzle_grid", {
    p_puzzle_id: puzzleId,
    p_grid: parsed,
    p_words: words,
    p_expected_updated_at: expectedUpdatedAt,
  });

  if (error) return explain(error);
  const row = data?.[0];
  if (!row) return fail("error");

  const filled = await fillCluesFromDictionary(supabase, puzzleId);
  const titled = await giveAutoTitle(supabase, puzzleId, firstAcrossWord(parsed));
  return {
    ok: true,
    puzzleId,
    updatedAt: titled ?? filled.updatedAt ?? row.updated_at,
    wordCount: row.word_count,
    keptClueCount: row.kept_clue_count,
    droppedClueCount: row.dropped_clue_count,
    filledClueCount: filled.count,
  };
}

/**
 * Words used before start with their most recent three clues from the Clue
 * Dictionary (the client's request), ready to keep or edit. Only words with
 * no clue text at all are filled; clues kept from before Done stay as they
 * are. Returns how many were filled and the puzzle's new updated_at.
 */
async function fillCluesFromDictionary(
  supabase: Supabase,
  puzzleId: string,
): Promise<{ count: number; updatedAt: string | null }> {
  const none = { count: 0, updatedAt: null };
  try {
    const { data: words } = await supabase.from("puzzle_words").select("id, answer").eq("puzzle_id", puzzleId);
    if (!words?.length) return none;
    const { data: clues } = await supabase
      .from("puzzle_clues")
      .select("puzzle_word_id, harder_clue, medium_clue, easier_clue")
      .in(
        "puzzle_word_id",
        words.map((w) => w.id),
      );
    const hasText = new Set(
      (clues ?? [])
        .filter((c) => [c.harder_clue, c.medium_clue, c.easier_clue].some((t) => t.trim() !== ""))
        .map((c) => c.puzzle_word_id),
    );
    const blank = words.filter((w) => !hasText.has(w.id));
    if (!blank.length) return none;

    const { data: dictionaryWords } = await supabase
      .from("dictionary_words")
      .select("id, normalized_word")
      .in("normalized_word", [...new Set(blank.map((w) => w.answer))]);
    if (!dictionaryWords?.length) return none;
    const { data: sets } = await supabase
      .from("dictionary_clue_sets")
      .select("id, dictionary_word_id, harder_clue, medium_clue, easier_clue, updated_at")
      .in(
        "dictionary_word_id",
        dictionaryWords.map((d) => d.id),
      )
      .order("updated_at", { ascending: false });

    const answerById = new Map(dictionaryWords.map((d) => [d.id, d.normalized_word]));
    const latest = new Map<string, NonNullable<typeof sets>[number]>();
    for (const set of sets ?? []) {
      const answer = answerById.get(set.dictionary_word_id);
      if (answer && !latest.has(answer)) latest.set(answer, set);
    }
    const items = blank.flatMap((w) => {
      const set = latest.get(w.answer);
      return set
        ? [{ wordId: w.id, harder: set.harder_clue, medium: set.medium_clue, easier: set.easier_clue, sourceClueSetId: set.id }]
        : [];
    });
    if (!items.length) return none;

    const { data, error } = await supabase.rpc("save_puzzle_clues", { p_puzzle_id: puzzleId, p_clues: items });
    if (error) {
      console.error("[puzzle] dictionary fill failed:", error.code, error.message);
      return none;
    }
    return { count: items.length, updatedAt: data?.[0]?.updated_at ?? null };
  } catch (error) {
    // Clues can still be typed by hand; no reason to fail Done.
    console.error("[puzzle] dictionary fill failed:", error);
    return none;
  }
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Titles given automatically: a first across word, maybe with a number (JEALOUSY, JEALOUSY2). */
const AUTO_TITLE = /^[A-Z]+\d*$/;

/**
 * Names the puzzle after its first across word so it's easy to find again
 * (the client's request). A title someone typed is kept; an automatic one is
 * updated if the first word changed. Returns the puzzle's new updated_at, or
 * null if nothing changed.
 */
async function giveAutoTitle(
  supabase: Supabase,
  puzzleId: string,
  answer: string | null,
  /** The puzzle's title if already known (null = untitled); fetched when left out. */
  knownTitle?: string | null,
): Promise<string | null> {
  if (!answer) return null; // no across word yet
  try {
    let title = knownTitle;
    if (title === undefined) {
      const { data: puzzle } = await supabase.from("puzzles").select("title").eq("id", puzzleId).maybeSingle();
      title = puzzle?.title ?? null;
    }
    const current = title?.trim() ?? "";
    if (current && !AUTO_TITLE.test(current)) return null; // typed by someone: keep it
    if (current && new RegExp(`^${answer}\\d*$`).test(current)) return null; // already named after this word

    const { data: others } = await supabase
      .from("puzzles")
      .select("title")
      .neq("id", puzzleId)
      .ilike("title", `${answer}%`);
    const next = chooseAutoTitle(
      answer,
      (others ?? []).map((o) => o.title ?? "").filter((t) => new RegExp(`^${answer}\\d*$`, "i").test(t)),
    );
    const { data, error } = await supabase.from("puzzles").update({ title: next }).eq("id", puzzleId).select("updated_at").maybeSingle();
    if (error) {
      console.error("[puzzle] auto title failed:", error.code, error.message);
      return null;
    }
    return data?.updated_at ?? null;
  } catch (error) {
    // A missing title is no reason to fail a save.
    console.error("[puzzle] auto title failed:", error);
    return null;
  }
}

function explain(error: PostgrestError) {
  switch (error.code) {
    case "40001":
      return fail("stale");
    case "P0002":
      return fail("not-found");
    case "23514":
      if (/cannot be changed|locked/i.test(error.message)) return fail("locked");
      return { ok: false as const, reason: "problems" as const, message: error.message, problems: [error.message] };
    default:
      console.error("[puzzle] save failed:", error.code, error.message);
      return fail("error");
  }
}


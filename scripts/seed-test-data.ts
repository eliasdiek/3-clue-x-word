/**
 * Adds clearly labelled TEST data to the Supabase project, for trying the
 * admin website. Run it again to refresh it; remove it with --clean.
 *
 *   npm run seed:test            add (or replace) the test data
 *   npm run seed:test -- --clean remove the test data
 *
 * What it adds:
 *   - three draft puzzles, titled "[TEST] …", one at each stage:
 *       still typing the grid, adding clues, ready to publish
 *     (all use the sample crossword from the client specification)
 *   - a week of daily quotes around today, marked "TEST QUOTE"
 *
 * It never publishes. Publishing uses up real, permanent puzzle numbers
 * (#1, #2 …), so try that yourself on a puzzle you're happy to keep as #1,
 * or archive it afterwards. The clue dictionary is left alone too: it fills
 * itself from real published puzzles.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY from .env / .env.local (local only; the
 * website never uses it).
 */
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { analyzeGrid, toEditableGrid, toFinishedGrid } from "../src/lib/puzzle/grid";

config({ path: [".env.local", ".env"], quiet: true });

const { values } = parseArgs({ options: { clean: { type: "boolean", default: false } } });

const TEST_PREFIX = "[TEST]";
const QUOTE_MARKER = "TEST QUOTE";

/** The sample crossword from the client specification (Crossword 3 Clue #3.docx). */
const SAMPLE = [
  "JEALOUSY.SUM",
  "O.L.V.A..A.A",
  "VALUE.SILVER",
  "I.E.R.H..A.A",
  "ABYSS..EIGHT",
  "L..Y...L.E.H",
  "..AMPS.VIDEO",
  "HELP..LED..N",
  "A.OT...SIGNS",
  "N.EON...O.O.",
  "D..MOMENT.N.",
  "YAK.DODOS.E.",
];

/** Harder, Medium, Easier clue for every word in the sample (each ≤ 50 characters). */
const CLUES: Record<string, [string, string, string]> = {
  JEALOUSY: ["The green-eyed monster", "Resentment of a rival", "Feeling of envy"],
  SUM: ["Bottom line", "Total of an addition", "Add it all up"],
  VALUE: ["What something's really worth", "Price or importance", "How much it's worth"],
  SILVER: ["Argent, to a herald", "Second-place medal", "Shiny grey metal"],
  ABYSS: ["Bottomless chasm", "Very deep gulf", "A deep, deep hole"],
  EIGHT: ["Octet's number", "Number of legs on a spider", "Seven plus one"],
  AMPS: ["Units for a current", "Guitarists' loudspeakers", "Short for amplifiers"],
  VIDEO: ["Recorded footage", "Clip on a phone", "Film you might stream"],
  HELP: ["Beatles' cry of 1965", "Lend a hand", "Shout when in trouble"],
  LED: ["Was in front", "Guided the way", "Went first"],
  OT: ["Genesis is in it (abbr.)", "Bible's first half (abbr.)", "Old Testament, briefly"],
  SIGNS: ["Omens", "Puts a name on", "Road warnings"],
  EON: ["Geological age", "Very, very long time", "Ages and ages"],
  MOMENT: ["Brief spell of time", "Instant", "Just a second"],
  YAK: ["Shaggy Tibetan ox", "Chatter on and on", "Hairy animal of the Himalayas"],
  DODOS: ["Mauritius's lost birds", "Extinct flightless birds", "Birds that are gone"],
  JOVIAL: ["Like Jupiter, in mood", "Full of good cheer", "Happy and friendly"],
  ALLEY: ["Bowling lane", "Narrow back lane", "Small street"],
  OVERS: ["Six-ball cricket sets", "Bowling spells in cricket", "Cricket sets of six"],
  SASH: ["Window frame part", "Band worn over a shoulder", "Ribbon belt"],
  SAVAGED: ["Mauled", "Attacked fiercely", "Bitten and torn"],
  MARATHONS: ["Tests of 42.195 km", "Very long races", "Long running races"],
  SYMPTOM: ["Sign of a condition", "Fever, for one", "A sign you are sick"],
  ELVES: ["Santa's workforce", "Tolkien's Legolas and kin", "Little helpers"],
  ALOE: ["Vera's partner", "Soothing succulent", "Plant for sunburn"],
  IDIOTS: ["Nincompoops", "Fools", "Silly people"],
  HANDY: ["Within reach", "Useful", "Easy to get to"],
  NONE: ["Not a soul", "Not any", "Zero"],
  NOD: ["Silent yes", "Bob the head", "Head move for yes"],
  MO: ["Brief instant", "Missouri, briefly", "Half a mo"],
  ED: ["Newsroom boss, briefly", "Editor, for short", "Short for Edward"],
  NO: ["Nay", "The opposite of yes", "Not yes"],
};

const QUOTES: { offset: number; text: string; author: string }[] = [
  { offset: -3, text: "The best way out is always through.", author: "Robert Frost" },
  { offset: -2, text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { offset: -1, text: "Well begun is half done.", author: "Aristotle" },
  { offset: 0, text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { offset: 1, text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { offset: 2, text: "Knowledge is power.", author: "Francis Bacon" },
  { offset: 3, text: "What we think, we become.", author: "Buddha" },
];

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");

/** Retries network-level failures (slow or flaky connections), not HTTP errors. */
const retryingFetch: typeof fetch = async (input, init) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      if (attempt >= 4) throw error;
      console.log(`  (network problem, retrying ${attempt}/3…)`);
    }
  }
};

const supabase = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: retryingFetch },
});

function dateInBrisbane(offsetDays: number): string {
  const day = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(day); // YYYY-MM-DD
}

async function clean() {
  const { data: puzzles, error } = await supabase
    .from("puzzles")
    .select("id, published_at")
    .like("title", `${TEST_PREFIX}%`);
  if (error) fail(`Could not list test puzzles: ${error.message}`);
  const drafts = (puzzles ?? []).filter((p) => !p.published_at);
  if (drafts.length) {
    const { error: deleteError } = await supabase.from("puzzles").delete().in("id", drafts.map((p) => p.id));
    if (deleteError) fail(`Could not delete test puzzles: ${deleteError.message}`);
  }
  const published = (puzzles ?? []).length - drafts.length;
  if (published) console.log(`• Kept ${published} published test puzzle(s): published puzzles can only be archived.`);

  const { error: quoteError, count } = await supabase
    .from("daily_quotes")
    .delete({ count: "exact" })
    .like("commentary", `${QUOTE_MARKER}%`);
  if (quoteError) fail(`Could not delete test quotes: ${quoteError.message}`);
  console.log(`• Removed ${drafts.length} test puzzle(s) and ${count ?? 0} test quote(s).`);
}

async function seed() {
  const { data: owner } = await supabase
    .from("admin_profiles")
    .select("id, display_name")
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!owner) fail("No administrator found. Run `npm run admin:create` first.");

  const finished = toFinishedGrid(SAMPLE);
  const words = analyzeGrid(finished).words;
  const missing = words.filter((w) => !CLUES[w.answer]).map((w) => w.answer);
  if (missing.length) fail(`Missing test clues for: ${missing.join(", ")}`);

  type Stage = { title: string; grid: string[]; finished: boolean; clueShare: number; status: "draft" | "ready" };
  const stages: Stage[] = [
    {
      title: `${TEST_PREFIX} Still typing the grid`,
      grid: toEditableGrid([...SAMPLE.slice(0, 5), ...Array(7).fill(".".repeat(12))]),
      finished: false,
      clueShare: 0,
      status: "draft",
    },
    { title: `${TEST_PREFIX} Adding clues`, grid: finished, finished: true, clueShare: 0.4, status: "draft" },
    { title: `${TEST_PREFIX} Ready to publish`, grid: finished, finished: true, clueShare: 1, status: "ready" },
  ];

  for (const stage of stages) {
    const { data: puzzle, error } = await supabase
      .from("puzzles")
      .insert({
        title: stage.title,
        grid_data: stage.grid,
        grid_finalized_at: stage.finished ? new Date().toISOString() : null,
        created_by: owner.id,
        updated_by: owner.id,
      })
      .select("id")
      .single();
    if (error || !puzzle) fail(`Could not create "${stage.title}": ${error?.message}`);

    if (stage.finished) {
      const { data: rows, error: wordError } = await supabase
        .from("puzzle_words")
        .insert(
          words.map((w) => ({
            puzzle_id: puzzle.id,
            clue_number: w.number,
            direction: w.direction,
            answer: w.answer,
            word_length: w.answer.length,
            start_row: w.startRow,
            start_column: w.startColumn,
            cell_positions: w.cells,
          })),
        )
        .select("id, answer, direction, clue_number");
      if (wordError || !rows) fail(`Could not add words: ${wordError?.message}`);

      const clueCount = Math.round(rows.length * stage.clueShare);
      const { error: clueError } = await supabase.from("puzzle_clues").insert(
        rows.map((row, index) => {
          const [harder, medium, easier] = CLUES[row.answer];
          // Partly clued puzzle: some words complete, one with a single clue, the rest empty.
          const full = index < clueCount;
          const partial = !full && index === clueCount;
          return {
            puzzle_word_id: row.id,
            harder_clue: full || partial ? harder : "",
            medium_clue: full ? medium : "",
            easier_clue: full ? easier : "",
            updated_by: owner.id,
          };
        }),
      );
      if (clueError) fail(`Could not add clues: ${clueError.message}`);
    }

    if (stage.status !== "draft") {
      await supabase.from("puzzles").update({ status: stage.status }).eq("id", puzzle.id);
    }
    console.log(`• ${stage.title}`);
  }

  const { error: quoteError } = await supabase.from("daily_quotes").upsert(
    QUOTES.map((q) => ({
      quote_date: dateInBrisbane(q.offset),
      quote_text: q.text,
      author: q.author,
      commentary: `${QUOTE_MARKER}: replace before launch.`,
    })),
    { onConflict: "quote_date", ignoreDuplicates: true },
  );
  if (quoteError) fail(`Could not add quotes: ${quoteError.message}`);
  console.log(`• Daily quotes for ${dateInBrisbane(-3)} to ${dateInBrisbane(3)} (existing dates left alone)`);
}

async function main() {
  await clean();
  if (values.clean) return;
  await seed();
  console.log("\n✔ Test data ready. Open the Puzzle List to try it. Remove it with: npm run seed:test -- --clean\n");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));

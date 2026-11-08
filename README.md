# 3-Clue X-Word — Admin Website (Phase 1)

A private website where an administrator builds 12×12 crosswords, writes three
clues (Harder, Medium, Easier) for every word, and publishes them for the
future Flutter mobile app.

**Stack:** Next.js 16 (App Router, Cache Components) · TypeScript (strict) ·
Tailwind CSS 4 · Supabase (Postgres, Auth, Row Level Security) ·
React Hook Form + Zod · Vitest + Testing Library · Playwright.

## Build progress

| Step | Scope | Status |
| --- | --- | --- |
| 1 | Project setup, Supabase integration, theme, shared components | ✅ Done |
| 2 | Database schema, migrations, RLS, publish function | ✅ Done (tested on PGlite) |
| 3 | Admin login, password reset, protected layout | ✅ Done |
| 4 | Dashboard puzzle list (search, filters, pagination, actions) | Simple list done; search, filters and actions next |
| 5 | 12×12 grid editor + word extraction engine | ✅ Done |
| 6 | Clue editor | ✅ Done |
| 7 | Clue dictionary | Not started |
| 8 | Review & publish | ✅ Done |
| 9 | Mobile delivery API + Daily Quotes page | Not started (tables and RLS in place; menu item added) |
| 10 | Hardening, docs, deployment | Not started |

## Getting started

1. **Install:** `npm install` (Node 22+).
2. **Create a Supabase project** at supabase.com.
3. **Configure:** copy `.env.example` to `.env.local` and fill in the project
   URL and publishable key (Project Settings → API).
4. **Apply the database migrations:**
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npm run db:push
   ```
5. **Auth settings in the Supabase dashboard** (Authentication):
   - Turn **off** "Allow new users to sign up". Admins are created by script.
   - Set **Site URL** to your website address and add
     `<site>/auth/confirm` to **Redirect URLs**.
   - Replace the **Reset Password** email template with
     [`supabase/templates/recovery.html`](supabase/templates/recovery.html).
   - Set the minimum password length to 10.
6. **Create the first administrator** (needs `SUPABASE_SERVICE_ROLE_KEY` in
   `.env.local`; only this local script uses it):
   ```bash
   npm run admin:create -- --email john@example.com --name "John Ward"
   ```
7. **Run:** `npm run dev` and open http://localhost:3000.

Without `.env.local`, every page shows a "connect the database" message
instead of crashing.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Unit, component and database tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright) |
| `npm run typecheck` · `npm run lint` | Type checking · linting |
| `npm run db:push` | Apply migrations to the linked Supabase project |
| `npm run db:types` | Generate DB types into `database.generated.ts` |
| `npm run admin:create` | Create or promote an administrator |
| `npm run seed:test` | Add `[TEST]` puzzles (one at each stage) and a week of test quotes; `-- --clean` removes them. Never publishes |

## Architecture

```
Browser ──▶ proxy.ts (refresh session, optimistic redirects)
        ──▶ (admin) layout ── AdminGate: requireAdmin() on the server
                 └─ pages / server actions ── Supabase (as the signed-in user)
                                                  └─ Row Level Security: is_admin()
Mobile app ──▶ /api/* (Step 9) ── Supabase anon role ── RLS: live snapshots only
```

Security has three independent layers. The proxy only does convenience
redirects. Every admin page and server action calls `requireAdmin()`, which
checks the session JWT and an **active** `admin_profiles` row. Postgres RLS
refuses admin data to anyone who is not an admin. The website never uses the
service-role key.

### Folder structure

```
src/
  app/
    (auth)/login, forgot-password, reset-password   sign-in screens
    (admin)/dashboard, puzzles, dictionary, settings protected admin pages
    auth/confirm/route.ts                            email-link landing
    setup-required/                                  missing-config page
  components/  ui/ (buttons, fields, dialogs) · layout/ · auth/ · dashboard/
  lib/
    auth/        dal.ts (requireAdmin), actions.ts, routes.ts, messages.ts
    supabase/    server / proxy / public clients, database types
    constants/   game.ts (grid size, clue levels, scoring, colours)
    validation/  shared Zod schemas
  proxy.ts
supabase/
  migrations/    schema + RLS + publish_puzzle()
  templates/     auth email templates
tests/
  unit/          pure logic and React components
  integration/   real migrations on in-process Postgres (PGlite)
  e2e/           Playwright
scripts/create-admin.ts
```

### Database

| Table | Purpose |
| --- | --- |
| `admin_profiles` | Which Auth users may use the website (`owner`/`admin`, `is_active`) |
| `puzzles` | One row per crossword; `grid_data` is 12 strings of 12 chars (`A–Z`, `#` block, `.` empty) |
| `puzzle_words` | Extracted words: number, direction, answer, start cell, ordered cells |
| `puzzle_clues` | The three clues per word (blanks allowed in drafts) |
| `dictionary_words` | One uppercase entry per distinct word |
| `dictionary_clue_sets` | Every distinct trio of clues used for a word, with its source puzzle |
| `dictionary_word_usages` | Which puzzle used which word and clue set (usage count, last used) |
| `puzzle_publications` | Immutable JSON snapshots served to the mobile app |
| `puzzle_number_counter` | Gapless, consecutive published numbers |
| `admin_audit_logs` | Append-only log of logins, publishes, etc. |
| `daily_quotes` | Quote of the day for the app's opening screen |

`puzzle_summaries` is a view that powers the dashboard with real counts.

**Grid editor ("Done").** John types letters on a white board, and drafts are
saved automatically. `src/lib/puzzle/grid.ts` numbers squares by the
specification's rule and lists the words, across first and then down.
`finish_puzzle_grid()` then re-checks that word list against the grid on the
server (complete runs, nothing missing, correct numbering). It stores black
squares and replaces the words. Clues are carried over to words that are still
present, even if they moved, and the editor warns before any clues would be
lost. Editing the grid again clears the "finished" mark until Done is clicked
again.

**Clue editor.** After Done, each word gets a Harder (yellow, 7 points),
Medium (pink, 5) and Easier (blue, 3) clue box, labelled `1a`, `3d` as in the
specification. Each box has a live counter up to `NEXT_PUBLIC_CLUE_MAX_LENGTH`
(50). Clues are saved automatically in batches by `save_puzzle_clues()`, which
also marks the puzzle as changed, so a review that has gone stale can't be
published. Clue sets used for the same word in earlier published puzzles are
offered as "Previous clues". The clue list's **Done** gives the
specification's report ("All words are present and have 3 clues", or "Word 4d,
SASH has no clues") and marks a complete puzzle ready to publish.

**Review & publish.** `/puzzles/[id]/review` shows the finished grid with its
answers and numbers, a summary, and every clue. Its checks
(`validateForPublish`) are the same ones the Publish Server Action runs on the
server against the stored puzzle:
- the grid is finished and 12×12;
- the stored word list exactly matches the grid (answers, start squares,
  numbering, cells);
- every word has three clues within the length limit.

Publishing is refused if the puzzle changed after the review page was opened.
`publish_puzzle()` then allocates the next number and stores the snapshot
built by `buildPublishedPayload()` (schema `v1`: solution rows, black squares,
numbered squares, across/down words with `1a` labels, `R01C05` start squares,
cells and three clues, scoring rules, and the maximum score).

The snapshot includes the answers so the app can check letters offline.
Anyone who inspects a downloaded puzzle can read them. That's an accepted
limitation for a free puzzle game, not something the app can prevent.

The publish browser test only runs with `E2E_ALLOW_PUBLISH=1`, because every
publish uses up a real, permanent puzzle number. Run it only against a test
database.

**Applying new migrations.** Each build step may add a file to
`supabase/migrations/`. Run `npm run db:push`, or paste the new file into the
Supabase SQL Editor.

**Publishing policy.** `publish_puzzle()` is the only way to publish. In one
transaction it re-checks the admin, locks the puzzle, refuses stale or
incomplete puzzles, takes the next number under a row lock (so concurrent
publishes can't share a number, and failed ones don't leave gaps), stores a
write-once snapshot, adds the words and clues to the dictionary, and writes an
audit entry. After that, a published puzzle's grid, words and clues are locked
by triggers. It can be archived but not deleted, and dictionary edits never
alter a published snapshot.

## Source of truth

The client's specification, `Resources/Crossword 3 Clue #3.docx` (with
`Questions for Elias.docx`), takes priority over the mockups in `Design/`.
The mockups are only a visual style guide. Where they disagree, the
specification wins:

| Mockup shows | Specification says (and we build) |
| --- | --- |
| Clue numbers placed by hand, some mid-word | The program numbers squares: a word starts where there is no letter to the left (or above) and a letter to the right (or below), numbered left to right, top row first |
| "Add Black Square" tool | John types letters onto a clean white board. On **Done**, every square with no letter turns black. If the check fails, the black squares are removed and he returns to editing |
| Word labels "1A", "7A" | "1a", "3d" (`wordLabel`) |
| Puzzle numbers on drafts | The next serial number is allocated only when a puzzle is submitted |
| Puzzle titles | Puzzles are identified by number (the title is optional) |
| Grid-size picker, Users screen, notification bell | Not in the specification; always 12×12, single owner |
| "Drafts" + "In Progress" cards | Split by the **Done** check: "Incomplete" vs "Ready to Publish" |
| Username login | (not specified) email login, required by Supabase Auth |

Formats taken from the specification, in `src/lib/puzzle/format.ts`:
word labels `3d`, square references `R01C05`, and the **Done** report
("All words are present and have 3 clues", or "Word 4d, SASH has no clues",
"Word 7a, VALLEYS only has 2 clues"). Words up to 12 letters, clues up to 50
characters. Grid letters use Arial Rounded MT Bold and clue numbers use Arial
(Nunito is the fallback when Arial Rounded isn't installed).

The specification's **Quotes** database (date, quote, person quoting,
comment) is `daily_quotes`, and John enters quotes through the **Daily
Quotes** page.

## Decisions and open questions

Decisions taken (easy to change):
- **Clue colours:** Harder = yellow, Medium = pink, Easier = blue. The
  specification's own correction ("COLOURS SHOULD BE HARDER (YELLOW), MEDIUM
  (PINK) & EASIER (BLUE)") overrides its earlier passages and the mockups.
  These are set in one place: `src/lib/constants/game.ts`.
- **Word list is generated from the grid** (as suggested in *Questions for
  Elias*), so "every word in the matrix is in my list" always holds. The
  check that matters is that every word has 3 clues.

Needs the product owner's decision (all Phase 2 app behaviour except 3):
1. **"Show Me"**: the specification says three different things: it fills
   the next unsolved letter, the letter in the current square, or (the GREY
   area) all remaining letters of the word.
2. **"Players beaten" percentage**: the specification gives an exact
   inflation table (e.g. 74% → "beat 91%"). It is not based on other players,
   so it shouldn't be presented as a real ranking. The table is also not
   monotonic: 89% reports 96.5, but 90% reports 90.
3. **Correcting a published puzzle**: currently locked. Allow clue-only
   corrections as a new snapshot version, or require a new puzzle?

## Windows note

If `npm run dev` or `npm run build` fails with `EBUSY: resource busy or
locked` or `os error 32 … being used by another process` inside `.next`,
Windows Defender is scanning each file Next.js writes before it can be
renamed. Exclude the project folder: open **PowerShell as Administrator** and
run

```powershell
Add-MpPreference -ExclusionPath "G:\Projects\3-clue x-word"
```

(or Windows Security → Virus & threat protection → Manage settings →
Exclusions → Add a folder). Then delete the `.next` folder and start again.
Disabling Turbopack's disk cache does not help, because the dev server
renames other files in `.next` too.

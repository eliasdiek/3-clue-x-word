"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  Eraser,
  Hash,
  Keyboard,
  ListChecks,
  Lock,
  PencilLine,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { GRID_SIZE } from "@/lib/constants/game";
import { finishGrid, saveGridDraft } from "@/lib/puzzle/actions";
import { wordLabel } from "@/lib/puzzle/format";
import {
  analyzeGrid,
  cellAt,
  EMPTY_CELL,
  gridProblems,
  isGridEmpty,
  isLetter,
  matchClueCarryOver,
  toEditableGrid,
  toFinishedGrid,
  withCell,
  type GridRows,
  type GridWord,
} from "@/lib/puzzle/grid";
import type { PuzzleStatus, WordDirection } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { callAction, RETRY_DELAY_MS, wait } from "./call-action";
import { CrosswordBoard } from "./crossword-board";
import { InfoCard, SaveStatus, type SaveState } from "./editor-status";
import { PuzzleSteps } from "./puzzle-steps";
import { WordList } from "./word-list";

/** A word that currently has clue text (so the editor can warn before it is lost). */
export type WordWithClues = Pick<GridWord, "number" | "direction" | "answer" | "startRow" | "startColumn">;

export type GridEditorInitial = {
  puzzleId: string | null;
  puzzleNumber: number | null;
  status: PuzzleStatus;
  grid: GridRows;
  /** grid_finalized_at is set: Done was clicked and the word list is current. */
  finished: boolean;
  updatedAt: string | null;
  wordsWithClues: WordWithClues[];
};

type Mode = "editing" | "finished" | "locked";
type Position = { row: number; column: number };

const AUTOSAVE_DELAY_MS = 1200;
const STEP: Record<WordDirection, [number, number]> = { across: [0, 1], down: [1, 0] };
const inBounds = (row: number, column: number) => row >= 0 && column >= 0 && row < GRID_SIZE && column < GRID_SIZE;
const cellKey = (row: number, column: number) => `${row}:${column}`;

export function GridEditor({ initial }: { initial: GridEditorInitial }) {
  const initialMode: Mode =
    initial.status === "published" || initial.status === "archived" ? "locked" : initial.finished ? "finished" : "editing";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [grid, setGridState] = useState<GridRows>(() =>
    initialMode === "editing" ? toEditableGrid(initial.grid) : toFinishedGrid(initial.grid),
  );
  const [active, setActive] = useState<Position>({ row: 0, column: 0 });
  const [direction, setDirection] = useState<WordDirection>("across");
  const [puzzleId, setPuzzleId] = useState(initial.puzzleId);
  const [save, setSave] = useState<SaveState>(
    initial.updatedAt ? { state: "saved", at: new Date(initial.updatedAt) } : { state: "idle" },
  );
  const [problems, setProblems] = useState<string[]>([]);
  const [problemCells, setProblemCells] = useState<ReadonlySet<string>>(new Set());
  const [finishing, setFinishing] = useState(false);
  const [summary, setSummary] = useState<{ wordCount: number; kept: number; dropped: number; filled: number } | null>(null);
  const [wordsWithClues, setWordsWithClues] = useState(initial.wordsWithClues);
  const [confirm, setConfirm] = useState<{ kind: "clear" } | { kind: "lose-clues"; words: WordWithClues[] } | null>(null);

  // Refs hold the values async saves need, so a save never uses a stale grid.
  const gridRef = useRef(grid);
  const idRef = useRef(initial.puzzleId);
  const updatedAtRef = useRef(initial.updatedAt);
  /** The grid as the server last had it, from this page's point of view. */
  const serverGridRef = useRef<GridRows>(initial.grid);
  const editVersion = useRef(0);
  const savedVersion = useRef(0);
  const savingRef = useRef<Promise<boolean> | null>(null);
  const blockedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /** The last failure was Done (not an autosave), so "Try again" redoes Done. */
  const retryFinishRef = useRef(false);

  const analysis = useMemo(() => analyzeGrid(grid), [grid]);
  const editing = mode === "editing" && !finishing;

  const adopt = useCallback((id: string, updatedAt: string) => {
    if (!idRef.current) {
      idRef.current = id;
      setPuzzleId(id);
      // Keep the address bookmarkable without remounting the editor.
      window.history.replaceState(null, "", `/puzzles/${id}/grid`);
    }
    updatedAtRef.current = updatedAt;
  }, []);

  const persist = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) await savingRef.current;
    if (blockedRef.current) return false;
    if (editVersion.current === savedVersion.current) {
      // Nothing left to save: clear an earlier error so "Try again" is seen to work.
      setSave((s) => (s.state === "error" ? { state: "saved", at: new Date() } : s));
      return true;
    }

    const run = (async () => {
      while (editVersion.current !== savedVersion.current) {
        const version = editVersion.current;
        const current = gridRef.current;
        if (!idRef.current && isGridEmpty(current)) {
          savedVersion.current = version;
          setSave({ state: "idle" });
          return true;
        }
        setSave({ state: "saving" });
        const attempt = () =>
          callAction(() => saveGridDraft({
              puzzleId: idRef.current,
              grid: current,
              expectedUpdatedAt: updatedAtRef.current,
              baseGrid: serverGridRef.current,
            }));
        let result = await attempt();
        // A brief network problem: try once more before reporting it.
        if (!result.ok && result.reason === "error") {
          await wait(RETRY_DELAY_MS);
          result = await attempt();
        }
        if (!result.ok) {
          const blocking = result.reason === "stale" || result.reason === "locked" || result.reason === "not-found";
          blockedRef.current = blocking;
          setSave({ state: "error", message: result.message, blocking });
          return false;
        }
        adopt(result.puzzleId, result.updatedAt);
        savedVersion.current = version;
        serverGridRef.current = current;
      }
      setSave({ state: "saved", at: new Date() });
      return true;
    })();

    savingRef.current = run;
    try {
      return await run;
    } finally {
      if (savingRef.current === run) savingRef.current = null;
    }
  }, [adopt]);

  // Autosave shortly after the last change.
  useEffect(() => {
    if (save.state !== "unsaved" || mode !== "editing") return;
    const timer = setTimeout(() => void persist(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [grid, save.state, mode, persist]);

  // Warn before leaving with unsaved work.
  useEffect(() => {
    if (save.state !== "unsaved" && save.state !== "saving" && save.state !== "error") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save.state]);

  function setGrid(next: GridRows) {
    gridRef.current = next;
    setGridState(next);
  }

  function edit(next: GridRows) {
    setGrid(next);
    editVersion.current++;
    if (problems.length) setProblems([]);
    if (problemCells.size) setProblemCells(new Set());
    setSave((s) => (s.state === "saving" || (s.state === "error" && s.blocking) ? s : { state: "unsaved" }));
  }

  function moveTo(row: number, column: number) {
    if (inBounds(row, column)) setActive({ row, column });
  }

  /**
   * The square after (sign 1) or before (sign -1) the active one in the
   * typing direction. Rows wrap: after column 12 comes column 1 of the next
   * row (and down words continue at the top of the next column), so a whole
   * grid can be typed straight through, as from a 12×12 table in Word.
   */
  function stepFrom({ row, column }: Position, sign: 1 | -1): Position | null {
    const along = direction === "across" ? column : row;
    const line = direction === "across" ? row : column;
    let nextAlong = along + sign;
    let nextLine = line;
    if (nextAlong >= GRID_SIZE) {
      nextAlong = 0;
      nextLine++;
    } else if (nextAlong < 0) {
      nextAlong = GRID_SIZE - 1;
      nextLine--;
    }
    if (nextLine < 0 || nextLine >= GRID_SIZE) return null;
    return direction === "across" ? { row: nextLine, column: nextAlong } : { row: nextAlong, column: nextLine };
  }

  function step(sign: 1 | -1) {
    const next = stepFrom(active, sign);
    if (next) setActive(next);
  }

  /** Writes a letter, or a blank (EMPTY_CELL) for the space bar, and moves on. */
  function typeLetter(letter: string) {
    if (!editing) return;
    const { row, column } = active;
    if (cellAt(gridRef.current, row, column) !== letter) edit(withCell(gridRef.current, row, column, letter));
    step(1);
  }

  function clearSquare() {
    if (!editing) return;
    if (isLetter(cellAt(gridRef.current, active.row, active.column))) {
      edit(withCell(gridRef.current, active.row, active.column, EMPTY_CELL));
    }
  }

  function backspace() {
    if (!editing) return;
    const { row, column } = active;
    if (isLetter(cellAt(gridRef.current, row, column))) {
      edit(withCell(gridRef.current, row, column, EMPTY_CELL));
      return;
    }
    const prev = stepFrom(active, -1);
    if (!prev) return;
    setActive(prev);
    if (isLetter(cellAt(gridRef.current, prev.row, prev.column))) {
      edit(withCell(gridRef.current, prev.row, prev.column, EMPTY_CELL));
    }
  }

  function toggleDirection() {
    setDirection((d) => (d === "across" ? "down" : "across"));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const { row, column } = active;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight":
        event.preventDefault();
        setDirection("across");
        moveTo(row, column + (event.key === "ArrowRight" ? 1 : -1));
        return;
      case "ArrowUp":
      case "ArrowDown":
        event.preventDefault();
        setDirection("down");
        moveTo(row + (event.key === "ArrowDown" ? 1 : -1), column);
        return;
      case "Backspace":
        event.preventDefault();
        backspace();
        return;
      case "Delete":
        event.preventDefault();
        clearSquare();
        return;
      case " ":
        // A blank square (black on Done), like "Clear Square", then move on.
        event.preventDefault();
        typeLetter(EMPTY_CELL);
        return;
      case "Enter":
        event.preventDefault();
        step(1);
        return;
      case "Tab":
        event.preventDefault();
        step(event.shiftKey ? -1 : 1);
        return;
    }
    if (/^[a-z]$/i.test(event.key)) {
      event.preventDefault();
      typeLetter(event.key.toUpperCase());
    }
  }

  // On-screen keyboards (tablets, phones) often deliver keys only as input.
  function onInput(event: FormEvent<HTMLInputElement>) {
    const value = event.currentTarget.value;
    event.currentTarget.value = "";
    const key = value.slice(-1).toUpperCase();
    if (/^[A-Z]$/.test(key)) typeLetter(key);
    else if (key === " ") typeLetter(EMPTY_CELL);
  }

  // The ˄ ˅ arrows above an iPad/iPhone keyboard move to the previous/next
  // input on the page. Invisible inputs either side of the grid's input catch
  // that and step one square back or forward instead.
  function onArrowCatcherFocus(sign: 1 | -1) {
    step(sign);
    inputRef.current?.focus({ preventScroll: true });
  }

  function stepButton(sign: 1 | -1) {
    step(sign);
    inputRef.current?.focus({ preventScroll: true });
  }

  function onCellPointerDown(row: number, column: number) {
    inputRef.current?.focus({ preventScroll: true });
    if (row === active.row && column === active.column) toggleDirection();
    else setActive({ row, column });
  }

  function onDone() {
    const result = analyzeGrid(gridRef.current);
    const issues = gridProblems(result);
    if (issues.length) {
      setProblems(issues);
      setProblemCells(new Set(result.strayLetters.map(([r, c]) => cellKey(r, c))));
      return;
    }
    const { dropped } = matchClueCarryOver(wordsWithClues, result.words);
    if (dropped.length) {
      setConfirm({ kind: "lose-clues", words: dropped });
      return;
    }
    void finish();
  }

  async function finish() {
    setConfirm(null);
    setFinishing(true);
    try {
      if (savingRef.current) await savingRef.current;
      if (blockedRef.current) return;
      const current = gridRef.current;
      const version = editVersion.current;
      const result = await callAction(() =>
        finishGrid({ puzzleId: idRef.current, grid: current, expectedUpdatedAt: updatedAtRef.current, baseGrid: serverGridRef.current }),
      );
      if (!result.ok) {
        if (result.reason === "problems") setProblems(("problems" in result && result.problems) || [result.message]);
        else {
          const blocking = result.reason !== "error";
          blockedRef.current = blocking;
          retryFinishRef.current = !blocking;
          setSave({ state: "error", message: result.message, blocking });
        }
        return;
      }
      retryFinishRef.current = false;
      adopt(result.puzzleId, result.updatedAt);
      savedVersion.current = version;
      serverGridRef.current = current;
      const words = analyzeGrid(current).words;
      setWordsWithClues(matchClueCarryOver(wordsWithClues, words).kept.map((k) => k.to));
      setGrid(toFinishedGrid(current));
      setMode("finished");
      setSummary({ wordCount: result.wordCount, kept: result.keptClueCount, dropped: result.droppedClueCount, filled: result.filledClueCount });
      setSave({ state: "saved", at: new Date() });
    } finally {
      setFinishing(false);
    }
  }

  async function retry() {
    const saved = await persist();
    if (saved && retryFinishRef.current) {
      retryFinishRef.current = false;
      onDone();
    }
  }

  function editGridAgain() {
    // As the specification says: remove the black squares and return to entry.
    setGrid(toEditableGrid(gridRef.current));
    setMode("editing");
    setSummary(null);
    inputRef.current?.focus({ preventScroll: true });
  }

  function clearGrid() {
    setConfirm(null);
    edit(toEditableGrid(gridRef.current).map(() => EMPTY_CELL.repeat(GRID_SIZE)));
    setActive({ row: 0, column: 0 });
  }

  // The current word: the run of letters through the active square.
  const highlighted = useMemo(() => {
    const cells = new Set<string>();
    const { row, column } = active;
    if (mode !== "editing" && !isLetter(cellAt(grid, row, column))) return cells;
    cells.add(cellKey(row, column));
    const [dRow, dColumn] = STEP[direction];
    for (const sign of [-1, 1]) {
      let r = row + sign * dRow;
      let c = column + sign * dColumn;
      while (inBounds(r, c) && isLetter(cellAt(grid, r, c))) {
        cells.add(cellKey(r, c));
        r += sign * dRow;
        c += sign * dColumn;
      }
    }
    return cells;
  }, [active, direction, grid, mode]);

  const across = analysis.words.filter((w) => w.direction === "across").length;
  const down = analysis.words.length - across;
  const activeLetter = cellAt(grid, active.row, active.column);
  const title = initial.puzzleNumber ? `Puzzle #${initial.puzzleNumber}` : puzzleId ? "Draft Puzzle" : "Create Puzzle";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description="Crossword grid editor" />
      <PuzzleSteps
        current={1}
        completed={mode === "editing" ? 0 : 1}
        links={mode !== "editing" && puzzleId ? { 2: `/puzzles/${puzzleId}/clues` } : undefined}
      />

      {save.state === "error" ? (
        <Alert tone="error">
          <p>{save.message}</p>
          {save.blocking ? (
            <button type="button" onClick={() => window.location.reload()} className="mt-1 underline underline-offset-2">
              Reload the page
            </button>
          ) : (
            <button type="button" onClick={() => void retry()} className="mt-1 underline underline-offset-2">
              Try saving again
            </button>
          )}
        </Alert>
      ) : null}

      {problems.length ? (
        <Alert tone="error">
          <p>Please fix {problems.length === 1 ? "this" : "these"} before clicking Done:</p>
          <ul className="mt-1 list-disc pl-5 font-normal">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {mode === "finished" && summary ? (
        <Alert tone="success">
          <p>
            Done! {summary.wordCount} words found: {across} across and {down} down. Black squares and numbers have been
            added.
          </p>
          {summary.kept || summary.dropped ? (
            <p className="font-normal">
              Clues kept for {summary.kept} word{summary.kept === 1 ? "" : "s"}
              {summary.dropped
                ? `; ${summary.dropped} word${summary.dropped === 1 ? " is" : "s are"} no longer in the grid (finished clues stay in the Clue Dictionary)`
                : ""}
              .
            </p>
          ) : null}
          {summary.filled ? (
            <p className="font-normal">
              {summary.filled} word{summary.filled === 1 ? " was" : "s were"} used before, so{" "}
              {summary.filled === 1 ? "its" : "their"} most recent clues from the Clue Dictionary have been filled in. You can
              change them on the next page.
            </p>
          ) : null}
        </Alert>
      ) : null}

      {mode === "locked" ? (
        <Alert tone="info">This puzzle has been stored, so its grid is locked and can no longer be changed.</Alert>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,44rem)_minmax(16rem,1fr)]">
        <Card className="flex justify-center p-3 sm:p-6">
          <CrosswordBoard
            grid={grid}
            finished={mode !== "editing"}
            numbers={analysis.numbers}
            label={`Crossword grid, ${GRID_SIZE} by ${GRID_SIZE}`}
            onCellPointerDown={onCellPointerDown}
            cellState={(row, column) => ({
              active: row === active.row && column === active.column,
              highlighted: highlighted.has(cellKey(row, column)),
              problem: problemCells.has(cellKey(row, column)),
            })}
          >
            {editing ? (
              <input
                aria-label="Previous square"
                readOnly
                onFocus={() => onArrowCatcherFocus(-1)}
                className="absolute size-px border-0 p-0 opacity-0"
                style={{ top: `${(active.row / GRID_SIZE) * 100}%`, left: `${(active.column / GRID_SIZE) * 100}%` }}
              />
            ) : null}
            <input
              ref={inputRef}
              aria-label="Type a letter into the selected square"
              aria-describedby="grid-position grid-help"
              readOnly={!editing}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="next"
              onKeyDown={onKeyDown}
              onInput={onInput}
              className="absolute border-0 bg-transparent p-0 text-base text-transparent caret-transparent opacity-0 outline-none"
              style={{
                top: `${(active.row / GRID_SIZE) * 100}%`,
                left: `${(active.column / GRID_SIZE) * 100}%`,
                width: `${100 / GRID_SIZE}%`,
                height: `${100 / GRID_SIZE}%`,
              }}
            />
            {editing ? (
              <input
                aria-label="Next square"
                readOnly
                onFocus={() => onArrowCatcherFocus(1)}
                className="absolute size-px border-0 p-0 opacity-0"
                style={{ top: `${(active.row / GRID_SIZE) * 100}%`, left: `${(active.column / GRID_SIZE) * 100}%` }}
              />
            ) : null}
          </CrosswordBoard>
          <p id="grid-position" className="sr-only" aria-live="polite">
            {`Row ${active.row + 1}, column ${active.column + 1}, ${isLetter(activeLetter) ? activeLetter : "empty"}. Typing ${direction}.`}
          </p>
        </Card>

        <aside className="flex flex-col gap-4" aria-label="Grid tools and status">
          {mode === "editing" ? (
            <Card className="flex flex-col gap-4 p-5">
              <h2 className="text-xl font-extrabold text-navy">Grid Tools</h2>
              <div>
                <p id="direction-label" className="mb-2 text-sm font-bold text-ink-muted">
                  Typing direction
                </p>
                <div role="group" aria-labelledby="direction-label" className="grid grid-cols-2 gap-2">
                  {(["across", "down"] as const).map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      aria-pressed={direction === dir}
                      onClick={() => {
                        setDirection(dir);
                        inputRef.current?.focus({ preventScroll: true });
                      }}
                      className={cn(
                        "flex h-11 items-center justify-center gap-2 rounded-xl border-2 font-bold capitalize transition-colors",
                        direction === dir
                          ? "border-brand bg-brand text-white"
                          : "border-line-strong bg-surface text-navy hover:border-brand",
                      )}
                    >
                      {dir === "across" ? <ArrowRight aria-hidden className="size-5" /> : <ArrowDown aria-hidden className="size-5" />}
                      {dir}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" icon={<ChevronLeft aria-hidden className="size-5" />} onClick={() => stepButton(-1)} disabled={!editing}>
                  Back
                </Button>
                <Button variant="secondary" icon={<ChevronRight aria-hidden className="size-5" />} onClick={() => stepButton(1)} disabled={!editing}>
                  Forward
                </Button>
              </div>
              <div className="grid gap-2">
                <Button variant="secondary" icon={<Eraser aria-hidden className="size-5" />} onClick={clearSquare} disabled={!editing}>
                  Clear Square
                </Button>
                <Button
                  variant="secondary"
                  icon={<Trash2 aria-hidden className="size-5" />}
                  onClick={() => setConfirm({ kind: "clear" })}
                  disabled={!editing || isGridEmpty(grid)}
                >
                  Clear Grid
                </Button>
              </div>
            </Card>
          ) : null}

          <InfoCard icon={Hash} tone="brand" label="Puzzle Number">
            {initial.puzzleNumber ? `#${initial.puzzleNumber}` : "Given when stored"}
          </InfoCard>
          <InfoCard icon={mode === "locked" ? Lock : mode === "finished" ? CircleCheck : PencilLine} tone="warning" label="Status">
            {mode === "locked" ? "Stored (locked)" : mode === "finished" ? "Grid finished" : "Building the grid"}
          </InfoCard>
          <InfoCard icon={Clock3} tone="info" label="Saving">
            <SaveStatus save={save} idleText={puzzleId ? "Saved" : "Starts saving when you type"} onRetry={() => void retry()} />
          </InfoCard>

          {mode === "editing" ? (
            <details id="grid-help" className="rounded-card border border-line bg-surface p-5 text-base text-ink-muted shadow-card">
              <summary className="flex cursor-pointer items-center gap-2 font-bold text-navy">
                <Keyboard aria-hidden className="size-5" /> Keyboard tips
              </summary>
              <ul className="mt-3 list-disc space-y-1 pl-5">
                <li>Type letters; the cursor moves on by itself. After column 12 it carries on at the start of the next row.</li>
                <li>Space bar: leaves the square blank (it turns black when you click Done) and moves on.</li>
                <li>Enter, Tab or Forward: moves on a square without changing it. Back (or Shift+Tab) moves back.</li>
                <li>Backspace deletes and steps back.</li>
                <li>Click a square to select it; click it again to switch between across and down.</li>
                <li>With a keyboard, the arrow keys move around too. On an iPad, the ˄ ˅ arrows above the keyboard move back and forward.</li>
              </ul>
            </details>
          ) : null}
        </aside>
      </div>

      {mode === "editing" ? (
        <Alert tone="info">
          Type the crossword&apos;s letters into the white 12×12 board, then click <strong>Done</strong>. Empty squares turn
          black, the squares are numbered, and the word list is made for you. Work is saved automatically.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {mode === "editing" ? (
          <Button
            size="lg"
            icon={<ListChecks aria-hidden className="size-5" />}
            onClick={onDone}
            loading={finishing}
            loadingText="Checking the grid…"
            disabled={save.state === "error" && save.blocking}
          >
            Done / Generate Word List
          </Button>
        ) : null}
        {mode === "finished" ? (
          <>
            <Button variant="secondary" size="lg" icon={<RotateCcw aria-hidden className="size-5" />} onClick={editGridAgain}>
              Edit Grid
            </Button>
            {puzzleId ? (
              <ButtonLink href={`/puzzles/${puzzleId}/clues`} size="lg" icon={<ArrowRight aria-hidden className="size-5" />}>
                Next: Add Clues
              </ButtonLink>
            ) : null}
          </>
        ) : null}
        {mode === "locked" && puzzleId ? (
          <ButtonLink href={`/puzzles/${puzzleId}/review`} size="lg">
            View Stored Puzzle
          </ButtonLink>
        ) : null}
      </div>

      {mode !== "editing" && analysis.words.length ? (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-2xl font-extrabold text-navy">Word List</h2>
          <WordList words={analysis.words} />
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirm?.kind === "clear"}
        title="Clear the whole grid?"
        description="Every letter will be removed. This can't be undone."
        confirmLabel="Clear Grid"
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={clearGrid}
      />
      <ConfirmDialog
        open={confirm?.kind === "lose-clues"}
        title="Some words with clues will be removed"
        description={
          <>
            <p>
              These words are no longer in the grid, so they&apos;ll be taken out of this puzzle. Words with all three clues
              stay in the Clue Dictionary, ready for next time; unfinished clues are deleted.
            </p>
            <ul className="mt-2 list-disc pl-5 font-semibold text-ink">
              {confirm?.kind === "lose-clues"
                ? confirm.words.map((w) => (
                    <li key={`${w.direction}-${w.number}`}>
                      {wordLabel(w.number, w.direction)} {w.answer}
                    </li>
                  ))
                : null}
            </ul>
          </>
        }
        confirmLabel="Remove and Continue"
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void finish()}
      />
    </div>
  );
}


"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, CircleCheck, Clock3, Hash, ListChecks, Lock, PencilLine } from "lucide-react";
import { CLUE_LEVEL_LABELS, CLUE_LEVEL_STYLES, CLUE_LEVELS, CLUE_MAX_LENGTH, SCORING_RULES, type ClueLevel } from "@/lib/constants/game";
import { checkClues, saveClues } from "@/lib/puzzle/clue-actions";
import { ALL_CLUES_PRESENT_MESSAGE, wordLabel } from "@/lib/puzzle/format";
import { analyzeGrid, type CellPosition, type GridRows } from "@/lib/puzzle/grid";
import type { PuzzleStatus, WordDirection } from "@/lib/supabase/database.types";
import { cluesFilled } from "@/lib/validation/clues";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { callAction, RETRY_DELAY_MS, wait } from "./call-action";
import { CrosswordBoard } from "./crossword-board";
import { InfoCard, SaveStatus, type SaveState } from "./editor-status";
import { PuzzleSteps } from "./puzzle-steps";

export type ClueTexts = { harder: string; medium: string; easier: string; sourceClueSetId: string | null };

export type ClueWord = ClueTexts & {
  wordId: string;
  number: number;
  direction: WordDirection;
  answer: string;
  cells: CellPosition[];
};

/** A clue set used for the same word in an earlier published puzzle. */
export type ClueSuggestion = { id: string; harder: string; medium: string; easier: string };

export type ClueEditorInitial = {
  puzzleId: string;
  puzzleNumber: number | null;
  status: PuzzleStatus;
  /** The finished grid (black squares included). */
  grid: GridRows;
  /** False when the grid was edited after Done: the word list is out of date. */
  gridFinished: boolean;
  updatedAt: string;
  words: ClueWord[];
  suggestions: Record<string, ClueSuggestion[]>;
};

const AUTOSAVE_DELAY_MS = 1000;
const cellKey = (row: number, column: number) => `${row}:${column}`;

export function ClueEditor({ initial }: { initial: ClueEditorInitial }) {
  const locked = initial.status === "published" || initial.status === "archived";
  const editable = !locked && initial.gridFinished;

  const [clues, setClues] = useState<Record<string, ClueTexts>>(() =>
    Object.fromEntries(
      initial.words.map((w) => [
        w.wordId,
        { harder: w.harder, medium: w.medium, easier: w.easier, sourceClueSetId: w.sourceClueSetId },
      ]),
    ),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [save, setSave] = useState<SaveState>({ state: "saved", at: new Date(initial.updatedAt) });
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<{ complete: boolean; lines: string[] } | null>(null);
  const [ready, setReady] = useState(initial.status === "ready");

  const cluesRef = useRef(clues);
  const versions = useRef(new Map<string, number>());
  const savedVersions = useRef(new Map<string, number>());
  const savingRef = useRef<Promise<boolean> | null>(null);
  const blockedRef = useRef(false);
  const reportRef = useRef<HTMLDivElement>(null);
  /** The last failure was the clue check, so "Try again" redoes it. */
  const retryCheckRef = useRef(false);
  const router = useRouter();

  const analysis = useMemo(() => analyzeGrid(initial.grid), [initial.grid]);
  const wordsById = useMemo(() => new Map(initial.words.map((w) => [w.wordId, w])), [initial.words]);
  const completed = initial.words.filter((w) => cluesFilled(clues[w.wordId]) === 3).length;
  const total = initial.words.length;

  const dirtyIds = () => [...versions.current].filter(([id, v]) => savedVersions.current.get(id) !== v).map(([id]) => id);

  const persist = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) await savingRef.current;
    if (blockedRef.current) return false;
    if (dirtyIds().length === 0) {
      // Nothing left to save: clear an earlier error so "Try again" is seen to work.
      setSave((s) => (s.state === "error" ? { state: "saved", at: new Date() } : s));
      return true;
    }

    const run = (async () => {
      let ids = dirtyIds();
      while (ids.length) {
        const snapshot = ids.map((id) => [id, versions.current.get(id)!] as const);
        setSave({ state: "saving" });
        const clues = ids.map((wordId) => ({ wordId, ...cluesRef.current[wordId] }));
        const attempt = () => callAction(() => saveClues({ puzzleId: initial.puzzleId, clues }));
        let result = await attempt();
        // A brief network problem: try once more before reporting it.
        if (!result.ok && result.reason === "error") {
          await wait(RETRY_DELAY_MS);
          result = await attempt();
        }
        if (!result.ok) {
          const blocking = result.reason !== "error" && result.reason !== "invalid";
          blockedRef.current = blocking;
          setSave({ state: "error", message: result.message, blocking });
          return false;
        }
        for (const [id, version] of snapshot) savedVersions.current.set(id, version);
        if (result.completedCount < result.wordCount) setReady(false);
        ids = dirtyIds();
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
  }, [initial.puzzleId]);

  useEffect(() => {
    if (save.state !== "unsaved") return;
    const timer = setTimeout(() => void persist(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [clues, save.state, persist]);

  useEffect(() => {
    if (save.state !== "unsaved" && save.state !== "saving" && save.state !== "error") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save.state]);

  function update(wordId: string, change: Partial<ClueTexts>) {
    if (!editable) return;
    const next = { ...cluesRef.current, [wordId]: { ...cluesRef.current[wordId], ...change } };
    cluesRef.current = next;
    setClues(next);
    versions.current.set(wordId, (versions.current.get(wordId) ?? 0) + 1);
    setReport(null);
    setSave((s) => (s.state === "saving" || (s.state === "error" && s.blocking) ? s : { state: "unsaved" }));
  }

  async function onCheck() {
    setChecking(true);
    try {
      if (!(await persist())) {
        retryCheckRef.current = true;
        return;
      }
      const result = await callAction(() => checkClues({ puzzleId: initial.puzzleId }));
      if (!result.ok) {
        const blocking = result.reason !== "error";
        blockedRef.current = blocking;
        retryCheckRef.current = !blocking;
        setSave({ state: "error", message: result.message, blocking });
        return;
      }
      retryCheckRef.current = false;
      setReady(result.complete);
      if (result.complete) {
        // Every word has its clues: straight on to the last step.
        router.push(reviewHref);
        return;
      }
      setReport({ complete: result.complete, lines: result.lines });
      requestAnimationFrame(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } finally {
      setChecking(false);
    }
  }

  /** "Try again" after a failure: save, and redo the check if that failed. */
  async function retry() {
    const saved = await persist();
    if (saved && retryCheckRef.current) {
      retryCheckRef.current = false;
      await onCheck();
    }
  }

  // Clicking a square on the board jumps to the clues of a word through it.
  const wordsByCell = useMemo(() => {
    const map = new Map<string, ClueWord[]>();
    for (const word of initial.words) {
      for (const [r, c] of word.cells) map.set(cellKey(r, c), [...(map.get(cellKey(r, c)) ?? []), word]);
    }
    return map;
  }, [initial.words]);

  function onCellPointerDown(row: number, column: number) {
    const candidates = wordsByCell.get(cellKey(row, column));
    if (!candidates?.length) return;
    const current = activeId ? wordsById.get(activeId) : undefined;
    const other = candidates.find((w) => w.wordId !== activeId);
    // Clicking the current word's square again switches to the crossing word;
    // otherwise keep the direction being worked on.
    const target = candidates.some((w) => w.wordId === activeId)
      ? (other ?? candidates[0])
      : (candidates.find((w) => w.direction === current?.direction) ?? candidates[0]);
    setActiveId(target.wordId);
    setOnlyIncomplete(false);
    requestAnimationFrame(() => document.getElementById(`clue-${target.wordId}-harder`)?.focus());
  }

  const activeCells = useMemo(() => {
    const word = activeId ? wordsById.get(activeId) : undefined;
    return new Set(word?.cells.map(([r, c]) => cellKey(r, c)) ?? []);
  }, [activeId, wordsById]);

  const visibleWords = onlyIncomplete
    ? initial.words.filter((w) => cluesFilled(clues[w.wordId]) < 3 || w.wordId === activeId)
    : initial.words;

  const title = initial.puzzleNumber ? `Puzzle #${initial.puzzleNumber}` : "Draft Puzzle";
  const gridHref = `/puzzles/${initial.puzzleId}/grid`;
  const reviewHref = `/puzzles/${initial.puzzleId}/review`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description="Clue editor: add a Harder, Medium and Easier clue for every word." />
      <PuzzleSteps
        current={2}
        completed={ready || locked ? 2 : 1}
        links={{ 1: gridHref, ...(ready || locked ? { 3: reviewHref } : {}) }}
      />

      {!initial.gridFinished && !locked ? (
        <Alert tone="warning">
          The grid was changed after Done, so this word list may be out of date.{" "}
          <a href={gridHref} className="underline underline-offset-2">
            Go back to the grid and click Done
          </a>{" "}
          to update it. Your clues are kept for words that are still in the grid.
        </Alert>
      ) : null}
      {locked ? <Alert tone="info">This puzzle has been stored, so its clues are locked.</Alert> : null}
      {save.state === "error" ? (
        <Alert tone="error">
          <p>{save.message}</p>
          <button
            type="button"
            onClick={() => (save.blocking ? window.location.reload() : void retry())}
            className="mt-1 underline underline-offset-2"
          >
            {save.blocking ? "Reload the page" : "Try saving again"}
          </button>
        </Alert>
      ) : null}

      {editable && total > 0 && completed === total ? (
        <Alert tone="success">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>Every word has its three clues. Next, check the finished puzzle and store it.</p>
            <Button
              icon={<ArrowRight aria-hidden className="size-5" />}
              onClick={onCheck}
              loading={checking}
              loadingText="Checking clues…"
              disabled={save.state === "error" && save.blocking}
            >
              Next: Review &amp; Store
            </Button>
          </div>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <InfoCard icon={Hash} tone="brand" label="Words">
          {total} ({analysis.words.filter((w) => w.direction === "across").length} across,{" "}
          {analysis.words.filter((w) => w.direction === "down").length} down)
        </InfoCard>
        <InfoCard icon={completed === total ? CircleCheck : PencilLine} tone={completed === total ? "success" : "warning"} label="Clues completed">
          {completed} / {total}
        </InfoCard>
        <InfoCard icon={locked ? Lock : Clock3} tone="info" label="Saving">
          {locked ? "Locked" : <SaveStatus save={save} onRetry={() => void retry()} />}
        </InfoCard>
      </div>

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="text-xl font-extrabold text-navy">Clues</h2>
            <Checkbox
              label="Show only words that still need clues"
              checked={onlyIncomplete}
              onChange={(event) => setOnlyIncomplete(event.currentTarget.checked)}
            />
          </div>

          <div
            aria-hidden
            className="hidden grid-cols-[4.5rem_10rem_repeat(3,minmax(0,1fr))] gap-3 border-b border-line bg-canvas px-5 py-3 xl:grid"
          >
            <span className="font-bold text-navy">#</span>
            <span className="font-bold text-navy">Word</span>
            {CLUE_LEVELS.map((level) => (
              <span key={level} className={cn("rounded-lg px-3 py-1.5 text-center font-bold", CLUE_LEVEL_STYLES[level].surface, CLUE_LEVEL_STYLES[level].text)}>
                {CLUE_LEVEL_LABELS[level]} clue <span className="font-semibold">({SCORING_RULES.pointsPerLetter[level]} points)</span>
              </span>
            ))}
          </div>

          {visibleWords.length === 0 ? (
            <p className="px-5 py-10 text-center text-lg font-semibold text-success-ink">
              Every word has three clues.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {visibleWords.map((word) => (
                <ClueRow
                  key={word.wordId}
                  word={word}
                  texts={clues[word.wordId]}
                  active={word.wordId === activeId}
                  editable={editable}
                  suggestions={initial.suggestions[word.answer] ?? []}
                  onFocus={() => setActiveId(word.wordId)}
                  onChange={(change) => update(word.wordId, change)}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card className="hidden flex-col gap-3 p-5 2xl:sticky 2xl:top-6 2xl:flex">
          <h2 className="text-lg font-extrabold text-navy">Grid</h2>
          <CrosswordBoard
            grid={initial.grid}
            finished
            numbers={analysis.numbers}
            label="Crossword grid. Click a square to edit the clues of a word through it."
            onCellPointerDown={onCellPointerDown}
            cellState={(row, column) => ({ highlighted: activeCells.has(cellKey(row, column)) })}
          />
          <p className="text-sm text-ink-muted">Click a square to jump to its clues.</p>
        </Card>
      </div>

      <div ref={reportRef} className="flex flex-col gap-3">
        {report?.complete ? (
          <Alert tone="success">{ALL_CLUES_PRESENT_MESSAGE}</Alert>
        ) : report ? (
          <Alert tone="error">
            <ul className="list-disc pl-5">
              {report.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Alert>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <ButtonLink href={gridHref} variant="secondary" size="lg">
          Back to Grid
        </ButtonLink>
        {editable ? (
          <Button
            size="lg"
            icon={<ListChecks aria-hidden className="size-5" />}
            onClick={onCheck}
            loading={checking}
            loadingText="Checking clues…"
            disabled={save.state === "error" && save.blocking}
          >
            Done / Check Clues
          </Button>
        ) : null}
        {(ready || locked) && save.state !== "unsaved" && save.state !== "saving" ? (
          <ButtonLink href={reviewHref} size="lg" icon={<ArrowRight aria-hidden className="size-5" />}>
            {locked ? "View Stored Puzzle" : "Next: Review & Store"}
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}

function ClueRow({
  word,
  texts,
  active,
  editable,
  suggestions,
  onFocus,
  onChange,
}: {
  word: ClueWord;
  texts: ClueTexts;
  active: boolean;
  editable: boolean;
  suggestions: ClueSuggestion[];
  onFocus: () => void;
  onChange: (change: Partial<ClueTexts>) => void;
}) {
  const label = wordLabel(word.number, word.direction);
  const filled = cluesFilled(texts);
  return (
    <li
      onFocusCapture={onFocus}
      className={cn(
        "grid grid-cols-1 gap-3 px-5 py-4 transition-colors xl:grid-cols-[4.5rem_10rem_repeat(3,minmax(0,1fr))] xl:items-start",
        active && "bg-brand-soft",
      )}
    >
      <div className="flex items-center gap-3 xl:contents">
        <span className="text-xl font-extrabold text-brand tabular-nums xl:pt-2">{label}</span>
        <div className="xl:pt-1.5">
          <p className="font-grid text-xl font-bold tracking-wide text-navy">{word.answer}</p>
          <p className="text-sm text-ink-muted">
            {word.answer.length} letters
            {filled === 3 ? (
              <span className="ml-2 inline-flex items-center gap-1 font-semibold text-success-ink">
                <CircleCheck aria-hidden className="size-4" /> done
              </span>
            ) : null}
          </p>
          {editable && suggestions.length ? (
            <PreviousClues answer={word.answer} suggestions={suggestions} onUse={(s) => onChange(s)} />
          ) : null}
        </div>
      </div>
      {CLUE_LEVELS.map((level) => (
        <ClueInput
          key={level}
          id={`clue-${word.wordId}-${level}`}
          level={level}
          wordName={`${label} ${word.answer}`}
          value={texts[level]}
          editable={editable}
          // Keeps the link to the dictionary entry: edits are saved over it.
          onChange={(value) => onChange({ [level]: value })}
        />
      ))}
    </li>
  );
}

function ClueInput({
  id,
  level,
  wordName,
  value,
  editable,
  onChange,
}: {
  id: string;
  level: ClueLevel;
  wordName: string;
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
}) {
  const style = CLUE_LEVEL_STYLES[level];
  const length = value.length;
  const nearLimit = length >= CLUE_MAX_LENGTH - 5;
  const counterId = `${id}-count`;
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow to fit the whole clue, so long clues can be read and edited in full.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 4}px`;
  }, [value]);

  // Return moves on: Harder → Medium → Easier → the next word's Harder clue.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const fields = [...document.querySelectorAll<HTMLTextAreaElement>("textarea[data-clue-field]")];
    const next = fields[fields.indexOf(event.currentTarget) + (event.shiftKey ? -1 : 1)];
    if (next) {
      next.focus();
      next.setSelectionRange(next.value.length, next.value.length);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={cn("text-sm font-bold xl:sr-only", style.text)}>
        {CLUE_LEVEL_LABELS[level]} clue ({SCORING_RULES.pointsPerLetter[level]} points){" "}
        <span className="sr-only">for {wordName}</span>
      </label>
      <textarea
        ref={ref}
        id={id}
        data-clue-field
        rows={1}
        value={value}
        maxLength={CLUE_MAX_LENGTH}
        readOnly={!editable}
        autoComplete="off"
        enterKeyHint="next"
        aria-describedby={counterId}
        onKeyDown={onKeyDown}
        // Clues are one line: line breaks pasted from a web page become spaces.
        onChange={(event) => onChange(event.currentTarget.value.replace(/\s*[\r\n]+\s*/g, " "))}
        className={cn(
          "block min-h-12 w-full resize-none overflow-hidden rounded-xl border-2 bg-surface px-3 py-2.5 text-base leading-snug text-ink transition-colors outline-none",
          "placeholder:text-ink-muted/70 focus:ring-3 focus:ring-brand-ring",
          style.border,
          value.trim() ? "" : "bg-canvas",
          !editable && "cursor-default bg-canvas",
        )}
        placeholder={editable ? `${CLUE_LEVEL_LABELS[level]} clue` : ""}
      />
      <span
        id={counterId}
        className={cn("self-end text-xs tabular-nums", nearLimit ? "font-bold text-warning-ink" : "text-ink-muted")}
      >
        {length}/{CLUE_MAX_LENGTH}
        <span className="sr-only"> characters</span>
      </span>
    </div>
  );
}

function PreviousClues({
  answer,
  suggestions,
  onUse,
}: {
  answer: string;
  suggestions: ClueSuggestion[];
  onUse: (clues: ClueTexts) => void;
}) {
  return (
    <details className="group mt-1">
      <summary className="inline-flex cursor-pointer items-center gap-1 text-sm font-bold text-brand">
        <BookOpen aria-hidden className="size-4" />
        Previous clues ({suggestions.length})
      </summary>
      <ul className="mt-2 flex w-72 max-w-[80vw] flex-col gap-2">
        {suggestions.map((s) => (
          <li key={s.id} className="rounded-xl border border-line bg-surface p-3 text-sm shadow-card">
            <dl className="grid grid-cols-[4rem_1fr] gap-x-2 gap-y-1">
              {CLUE_LEVELS.map((level) => (
                <div key={level} className="contents">
                  <dt className={cn("font-bold", CLUE_LEVEL_STYLES[level].text)}>{CLUE_LEVEL_LABELS[level]}</dt>
                  <dd className="text-ink">{s[level]}</dd>
                </div>
              ))}
            </dl>
            <Button
              variant="secondary"
              className="mt-2 h-9 w-full text-sm"
              onClick={() => onUse({ harder: s.harder, medium: s.medium, easier: s.easier, sourceClueSetId: s.id })}
            >
              Use these clues <span className="sr-only">for {answer}</span>
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}

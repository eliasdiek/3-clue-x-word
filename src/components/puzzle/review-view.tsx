import { analyzeGrid, type GridRows } from "@/lib/puzzle/grid";
import type { StoredWord } from "@/lib/puzzle/publish";
import { cluesFilled } from "@/lib/validation/clues";
import { formatDateTime } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { ClueReviewList } from "./clue-review-list";
import { CrosswordBoard } from "./crossword-board";
import { PublishPanel } from "./publish-panel";
import { PuzzleSteps } from "./puzzle-steps";

export type ReviewViewProps = {
  puzzle: {
    id: string;
    puzzleNumber: number | null;
    grid: GridRows;
    updatedAt: string;
    publishedAt: string | null;
    words: StoredWord[];
  };
  /** From validateForPublish(), run on the server. */
  problems: string[];
  nextNumber: number | null;
  /** How many of the puzzle's answers were used in earlier puzzles. */
  reusedWordCount: number;
};

/** The Review & Publish page body: preview, summary, all clues, and Publish. */
export function ReviewView({ puzzle, problems, nextNumber, reusedWordCount }: ReviewViewProps) {
  const published = Boolean(puzzle.publishedAt);
  const analysis = analyzeGrid(puzzle.grid);
  const across = puzzle.words.filter((w) => w.direction === "across").length;
  const complete = puzzle.words.filter((w) => cluesFilled(w) === 3).length;

  const summary: [string, string][] = [
    ["Puzzle number", published ? `#${puzzle.puzzleNumber}` : nextNumber ? `Draft (will be #${nextNumber})` : "Draft"],
    ["Grid size", "12 × 12"],
    ["Across words", String(across)],
    ["Down words", String(puzzle.words.length - across)],
    ["Total words", String(puzzle.words.length)],
    ["Words with three clues", `${complete} / ${puzzle.words.length}`],
    [
      "Dictionary check",
      reusedWordCount
        ? `${reusedWordCount} word${reusedWordCount === 1 ? "" : "s"} used in earlier puzzles`
        : "All words are new",
    ],
    ["Validation", problems.length ? `${problems.length} problem${problems.length === 1 ? "" : "s"}` : "Passed"],
    ["Status", published ? `Published ${formatDateTime(puzzle.publishedAt!)}` : "Not published"],
  ];

  const base = `/puzzles/${puzzle.id}`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={puzzle.puzzleNumber ? `Puzzle #${puzzle.puzzleNumber}` : "Draft Puzzle"}
        description="Review & publish: check the finished puzzle before it goes to the app."
      />
      <PuzzleSteps
        current={3}
        completed={published ? 3 : problems.length ? 1 : 2}
        links={{ 1: `${base}/grid`, 2: `${base}/clues` }}
      />

      {published ? (
        <Alert tone="success">
          Published as puzzle #{puzzle.puzzleNumber}. Its grid and clues are locked, and it is available to the app.
        </Alert>
      ) : problems.length ? (
        <Alert tone="error">
          <p>This puzzle can&apos;t be published yet:</p>
          <ul className="mt-1 list-disc pl-5 font-normal">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      ) : (
        <Alert tone="success">All words are present and have 3 clues. This puzzle is ready to publish.</Alert>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,44rem)_minmax(18rem,1fr)]">
        <Card className="flex justify-center p-3 sm:p-6">
          <CrosswordBoard grid={puzzle.grid} finished numbers={analysis.numbers} label="Finished crossword with answers" />
        </Card>
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-xl font-extrabold text-navy">Review Summary</h2>
          <dl className="divide-y divide-line">
            {summary.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-base text-ink-muted">{label}</dt>
                <dd className="text-right text-base font-bold text-navy">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 text-2xl font-extrabold text-navy">Clues</h2>
        <ClueReviewList words={puzzle.words} />
      </Card>

      <div className="flex flex-wrap items-start justify-end gap-3">
        {published ? (
          <ButtonLink href="/puzzles" variant="secondary" size="lg">
            Back to Puzzle List
          </ButtonLink>
        ) : (
          <>
            <ButtonLink href={`${base}/grid`} variant="secondary" size="lg">
              Edit Grid
            </ButtonLink>
            <ButtonLink href={`${base}/clues`} variant="secondary" size="lg">
              Edit Clues
            </ButtonLink>
            <PublishPanel
              puzzleId={puzzle.id}
              reviewedUpdatedAt={puzzle.updatedAt}
              nextNumber={nextNumber}
              canPublish={problems.length === 0}
            />
          </>
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, CalendarCheck, CalendarPlus, Grid3x3, History, Plus, Rocket } from "lucide-react";
import { STAGES, stageHref } from "@/lib/puzzle/stages";
import type { PuzzleStage } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function SectionTitle({ icon: Icon, children, action }: { icon: typeof History; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-extrabold text-navy">
        <Icon aria-hidden className="size-6 text-brand" />
        {children}
      </h2>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

export type DraftItem = {
  id: string;
  name: string;
  stage: PuzzleStage;
  wordCount: number;
  completed: number;
  updated: string;
};

/** The most recently edited unpublished puzzles, with a Continue button. */
export function ContinueWorking({ drafts }: { drafts: DraftItem[] }) {
  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle
        icon={Grid3x3}
        action={
          <Link href="/puzzles" className="text-base font-bold text-brand hover:underline">
            All puzzles
          </Link>
        }
      >
        Continue where you left off
      </SectionTitle>
      {drafts.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-base text-ink-muted">Nothing in progress. Start a new crossword whenever you&apos;re ready.</p>
          <ButtonLink href="/puzzles/new" icon={<Plus aria-hidden className="size-5" />}>
            Create Puzzle
          </ButtonLink>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {drafts.map((d) => {
            const percent = d.stage === "grid" || d.wordCount === 0 ? 0 : Math.round((d.completed / d.wordCount) * 100);
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-48 flex-1">
                  <p className="font-bold text-navy">{d.name}</p>
                  <p className="text-sm text-ink-muted">
                    <span className={cn("mr-2 rounded-full px-2 py-0.5 font-bold", STAGES[d.stage].badge)}>
                      {STAGES[d.stage].label}
                    </span>
                    edited {d.updated}
                  </p>
                </div>
                <div className="w-40">
                  {d.stage === "grid" ? (
                    <p className="text-sm text-ink-muted">Grid not finished</p>
                  ) : (
                    <>
                      <p className="text-sm text-ink-muted">
                        Clues {d.completed}/{d.wordCount}
                      </p>
                      <div
                        role="progressbar"
                        aria-label={`Clues done for ${d.name}`}
                        aria-valuenow={percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="mt-1 h-2 overflow-hidden rounded-full bg-line"
                      >
                        <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
                      </div>
                    </>
                  )}
                </div>
                <ButtonLink href={stageHref(d.id, d.stage)} variant="secondary" className="h-10" icon={<ArrowRight aria-hidden className="size-4" />}>
                  Continue<span className="sr-only"> {d.name}</span>
                </ButtonLink>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------------- */

/** How many puzzles are ready for the app, and what's next to publish. */
export function PuzzleStock({
  published,
  ready,
  lastPublished,
  nextNumber,
}: {
  published: number;
  ready: number;
  lastPublished: { number: number; when: string } | null;
  nextNumber: number | null;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle icon={Rocket}>Puzzle stock</SectionTitle>
      <p className="text-4xl font-extrabold text-navy tabular-nums">{published}</p>
      <p className="text-base text-ink">
        published puzzle{published === 1 ? "" : "s"}: enough for <strong>{published}</strong> day{published === 1 ? "" : "s"} at one
        puzzle a day.
      </p>
      <dl className="mt-4 divide-y divide-line text-base">
        <div className="flex justify-between gap-3 py-2">
          <dt className="text-ink-muted">Ready to publish</dt>
          <dd className="font-bold text-navy">
            {ready ? (
              <Link href="/puzzles?stage=ready" className="text-brand hover:underline">
                {ready} puzzle{ready === 1 ? "" : "s"}
              </Link>
            ) : (
              "None yet"
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-3 py-2">
          <dt className="text-ink-muted">Last published</dt>
          <dd className="font-bold text-navy">{lastPublished ? `#${lastPublished.number}, ${lastPublished.when}` : "Nothing yet"}</dd>
        </div>
        <div className="flex justify-between gap-3 py-2">
          <dt className="text-ink-muted">Next number</dt>
          <dd className="font-bold text-navy">{nextNumber ? `#${nextNumber}` : "—"}</dd>
        </div>
      </dl>
    </Card>
  );
}

/* ------------------------------------------------------------------------- */

export type QuoteDayItem = { date: string; weekday: string; day: string; month: string; hasQuote: boolean; isToday: boolean };

/** The next 14 days: which have a quote, which still need one. Today's quote as the app shows it. */
export function QuotesComingUp({
  days,
  today,
}: {
  days: QuoteDayItem[];
  today: { text: string; author: string | null; comment: string | null } | null;
}) {
  const missing = days.filter((d) => !d.hasQuote).length;
  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle
        icon={CalendarCheck}
        action={
          <Link href="/quotes" className="text-base font-bold text-brand hover:underline">
            All quotes
          </Link>
        }
      >
        Quotes coming up
      </SectionTitle>

      <div className="rounded-xl bg-canvas p-4">
        <p className="text-sm font-bold text-ink-muted">Today in the app</p>
        {today ? (
          <>
            <p className="mt-1 text-base font-bold text-ink">“{today.text}”</p>
            {today.author ? <p className="text-base text-ink">{today.author}</p> : null}
            {today.comment ? <p className="mt-1 text-sm text-ink-muted">{today.comment}</p> : null}
          </>
        ) : (
          <p className="mt-1 text-base text-danger-ink">No quote for today. The app will show none.</p>
        )}
      </div>

      <p className="mt-4 mb-2 text-base text-ink">
        {missing ? `${missing} of the next ${days.length} days need a quote.` : `All of the next ${days.length} days have a quote.`}
      </p>
      <ul className="grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <li key={d.date}>
            <Link
              href={`/quotes?month=${d.month}`}
              title={`${d.weekday} ${d.day}: ${d.hasQuote ? "has a quote" : "no quote yet"}`}
              className={cn(
                "flex flex-col items-center rounded-lg border py-1.5 text-center transition-colors",
                d.hasQuote ? "border-success-ink/20 bg-success/60 text-success-ink" : "border-warning-ink/30 bg-warning text-warning-ink hover:border-warning-ink",
                d.isToday && "ring-2 ring-brand",
              )}
            >
              <span className="text-xs font-semibold">{d.weekday}</span>
              <span className="text-base font-extrabold tabular-nums">{d.day}</span>
              {d.hasQuote ? (
                <CalendarCheck aria-hidden className="size-4" />
              ) : (
                <CalendarPlus aria-hidden className="size-4" />
              )}
              <span className="sr-only">{d.hasQuote ? "has a quote" : "no quote yet"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------------- */

export type ActivityItem = { id: string; text: string; when: string; href: string | null };

/** The latest actions from the audit log, in plain English. */
export function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <Card className="p-5 sm:p-6">
      <SectionTitle icon={History}>Recent activity</SectionTitle>
      {items.length === 0 ? (
        <p className="text-base text-ink-muted">Nothing yet. Your work will appear here.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-4">
              <span className="text-base text-ink">
                {item.href ? (
                  <Link href={item.href} className="hover:text-brand hover:underline">
                    {item.text}
                  </Link>
                ) : (
                  item.text
                )}
              </span>
              <span className="shrink-0 text-sm text-ink-muted">{item.when}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

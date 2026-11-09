import { Suspense } from "react";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { DASHBOARD_ACTIONS, describeActivity } from "@/lib/dashboard/activity";
import { countStages, relativeTime } from "@/lib/dashboard/stats";
import { stageHref } from "@/lib/puzzle/stages";
import { addDays, todayIn } from "@/lib/quotes/dates";
import { formatDateTime } from "@/lib/utils";
import {
  ContinueWorking,
  PuzzleStock,
  QuotesComingUp,
  RecentActivity,
  type ActivityItem,
  type DraftItem,
  type QuoteDayItem,
} from "@/components/dashboard/sections";
import { StageCards, StageCardsSkeleton } from "@/components/dashboard/stage-cards";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

const QUOTE_DAYS = 14;
const DRAFTS_SHOWN = 5;
const ACTIVITY_SHOWN = 10;

/**
 * The heading and actions are static, so they appear the moment the page is
 * opened; everything else is real data, loaded together (one round trip)
 * behind a skeleton of the same shape.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Your puzzles at a glance."
        actions={
          <ButtonLink href="/puzzles/new" size="lg" icon={<Plus aria-hidden className="size-5" />}>
            Create New Puzzle
          </ButtonLink>
        }
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

const puzzleName = (p: { puzzle_number: number | null; title: string | null }) =>
  p.puzzle_number ? `Puzzle #${p.puzzle_number}` : (p.title ?? "Untitled draft");

async function DashboardContent() {
  await requireAdmin();
  const supabase = await createClient();
  const today = todayIn();
  const lastDay = addDays(today, QUOTE_DAYS - 1);

  const [summaries, lastPublished, nextNumber, quotes, audit] = await Promise.all([
    supabase
      .from("puzzle_summaries")
      .select("id, puzzle_number, title, stage, word_count, completed_clue_count, updated_at")
      .order("updated_at", { ascending: false }),
    supabase
      .from("puzzles")
      .select("puzzle_number, published_at")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc("next_puzzle_number"),
    supabase.from("daily_quotes").select("quote_date, quote_text, author, commentary").gte("quote_date", today).lte("quote_date", lastDay),
    supabase
      .from("admin_audit_logs")
      .select("id, action, resource_id, metadata, created_at")
      .in("action", [...DASHBOARD_ACTIONS])
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_SHOWN * 2),
  ]);
  if (summaries.error) {
    console.error("[dashboard] failed to load puzzle summaries:", summaries.error.message);
    throw new Error("We couldn't load your puzzles. Please refresh the page.");
  }

  const rows = summaries.data ?? [];
  const counts = countStages(rows);
  const now = new Date();
  const when = (value: string) => relativeTime(value, now, (d) => formatDateTime(d));

  const drafts: DraftItem[] = rows
    .filter((r) => r.stage === "grid" || r.stage === "clues" || r.stage === "ready")
    .slice(0, DRAFTS_SHOWN)
    .map((r) => ({
      id: r.id,
      name: puzzleName(r),
      stage: r.stage,
      wordCount: r.word_count,
      completed: r.completed_clue_count,
      updated: when(r.updated_at),
    }));

  const quoteByDate = new Map((quotes.data ?? []).map((q) => [q.quote_date, q]));
  const days: QuoteDayItem[] = Array.from({ length: QUOTE_DAYS }, (_, i) => {
    const date = addDays(today, i);
    const d = new Date(`${date}T00:00:00Z`);
    return {
      date,
      weekday: new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "UTC" }).format(d),
      day: String(d.getUTCDate()),
      month: date.slice(0, 7),
      hasQuote: quoteByDate.has(date),
      isToday: i === 0,
    };
  });
  const todays = quoteByDate.get(today);

  // Name the puzzles mentioned in the activity log (they may no longer be in `rows` if deleted).
  const byId = new Map(rows.map((r) => [r.id, r]));
  const names = new Map(rows.map((r) => [r.id, r.puzzle_number ? `puzzle #${r.puzzle_number}` : r.title ? `“${r.title}”` : "a draft"]));
  const activity: ActivityItem[] = [];
  for (const entry of audit.data ?? []) {
    const text = describeActivity({ action: entry.action, resourceId: entry.resource_id, metadata: entry.metadata }, names);
    if (!text) continue;
    const row = entry.resource_id ? byId.get(entry.resource_id) : undefined;
    activity.push({
      id: entry.id,
      text,
      when: when(entry.created_at),
      href: row ? stageHref(row.id, row.stage) : entry.action.startsWith("quote.") ? "/quotes" : null,
    });
    if (activity.length === ACTIVITY_SHOWN) break;
  }

  return (
    <>
      <StageCards counts={counts} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <ContinueWorking drafts={drafts} />
          <RecentActivity items={activity} />
        </div>
        <div className="flex flex-col gap-6">
          <PuzzleStock
            published={counts.published}
            ready={counts.ready}
            lastPublished={
              lastPublished.data?.puzzle_number && lastPublished.data.published_at
                ? { number: lastPublished.data.puzzle_number, when: when(lastPublished.data.published_at) }
                : null
            }
            nextNumber={nextNumber.data ?? null}
          />
          <QuotesComingUp
            days={days}
            today={todays ? { text: todays.quote_text, author: todays.author, comment: todays.commentary } : null}
          />
        </div>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Loading your dashboard…</span>
      <StageCardsSkeleton />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <div className="h-80 rounded-card bg-brand-soft skeleton-pulse" />
          <div className="h-64 rounded-card bg-brand-soft skeleton-pulse" />
        </div>
        <div className="flex flex-col gap-6">
          <div className="h-64 rounded-card bg-brand-soft skeleton-pulse" />
          <div className="h-80 rounded-card bg-brand-soft skeleton-pulse" />
        </div>
      </div>
    </div>
  );
}

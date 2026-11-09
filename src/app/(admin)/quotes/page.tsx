import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { addDays, daysInMonth, formatDay, formatMonth, shiftMonth, todayIn } from "@/lib/quotes/dates";
import { QuoteDay } from "@/components/quotes/quote-day";
import { Alert } from "@/components/ui/alert";
import { Card, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Daily Quotes" };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const LOOKAHEAD_DAYS = 14;

type SearchParams = Promise<{ month?: string }>;

export default function QuotesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Daily Quotes"
        description="The quote shown on the app's opening screen each day: the quote, the person quoting, and a comment."
      />
      <Suspense fallback={<QuotesSkeleton />}>
        <QuotesMonth searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function QuotesMonth({ searchParams }: { searchParams: SearchParams }) {
  const { month: monthParam } = await searchParams;
  await requireAdmin();
  const today = todayIn();
  const month = monthParam && MONTH.test(monthParam) ? monthParam : today.slice(0, 7);
  const days = daysInMonth(month);

  const supabase = await createClient();
  const lookaheadEnd = addDays(today, LOOKAHEAD_DAYS - 1);
  const [{ data: quotes, error }, { data: upcoming }] = await Promise.all([
    supabase
      .from("daily_quotes")
      .select("quote_date, quote_text, author, commentary")
      .gte("quote_date", days[0])
      .lte("quote_date", days[days.length - 1]),
    supabase.from("daily_quotes").select("quote_date").gte("quote_date", today).lte("quote_date", lookaheadEnd),
  ]);
  if (error) throw new Error("We couldn't load the quotes. Please refresh the page.");

  const byDate = new Map((quotes ?? []).map((q) => [q.quote_date, q]));
  const covered = new Set((upcoming ?? []).map((q) => q.quote_date));
  const missing = Array.from({ length: LOOKAHEAD_DAYS }, (_, i) => addDays(today, i)).filter((d) => !covered.has(d));

  return (
    <>
      {missing.length ? (
        <Alert tone="warning">
          {missing.length === LOOKAHEAD_DAYS
            ? `There are no quotes for the next ${LOOKAHEAD_DAYS} days.`
            : `${missing.length} of the next ${LOOKAHEAD_DAYS} days have no quote: ${missing.map(formatDay).join(", ")}.`}
        </Alert>
      ) : (
        <Alert tone="success">Every day for the next {LOOKAHEAD_DAYS} days has a quote.</Alert>
      )}

      <Card className="overflow-hidden">
        <nav aria-label="Months" className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <MonthLink month={shiftMonth(month, -1)} label="Previous month">
            <ChevronLeft aria-hidden className="size-5" />
          </MonthLink>
          <h2 className="text-xl font-extrabold text-navy">{formatMonth(month)}</h2>
          <MonthLink month={shiftMonth(month, 1)} label="Next month">
            <ChevronRight aria-hidden className="size-5" />
          </MonthLink>
        </nav>
        <ul className="divide-y divide-line">
          {days.map((date) => {
            const q = byDate.get(date);
            return (
              <QuoteDay
                key={date}
                date={date}
                label={formatDay(date)}
                isToday={date === today}
                quote={q ? { text: q.quote_text, author: q.author ?? "", comment: q.commentary ?? "" } : null}
              />
            );
          })}
        </ul>
      </Card>
    </>
  );
}

function MonthLink({ month, label, children }: { month: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={`/quotes?month=${month}`}
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-xl border-2 border-line-strong bg-surface text-navy hover:border-brand hover:text-brand"
    >
      {children}
    </Link>
  );
}

function QuotesSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Loading quotes…</span>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-16 rounded-xl bg-brand-soft skeleton-pulse" />
      ))}
    </div>
  );
}

import type { NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { fail, ok, resolveQuoteDate } from "@/lib/api/v1";
import { quoteDatesFor } from "@/lib/quotes/dates";

/**
 * GET /api/v1/quotes/today?date=2026-11-09
 * The quote for the player's own calendar date (send the device's local
 * date). Without `date`, Brisbane's today is used.
 */
export async function GET(request: NextRequest) {
  const date = resolveQuoteDate(request.nextUrl.searchParams.get("date"));
  if (!date) return fail(400, "invalid-date", "`date` must be today's date as YYYY-MM-DD.");

  const dates = quoteDatesFor(date);
  const { data, error } = await createPublicClient()
    .from("daily_quotes")
    .select("quote_date, quote_text, author, commentary")
    .in("quote_date", dates);
  if (error) return fail(503, "unavailable", "Quotes are unavailable right now. Please try again later.");

  const rows = (data ?? []) as { quote_date: string; quote_text: string; author: string | null; commentary: string | null }[];
  const found = dates.map((d) => rows.find((r) => r.quote_date === d)).find((r) => r !== undefined);
  if (!found) return fail(404, "no-quote", `There is no quote for ${date}.`);
  return ok({
    // `date` is the day asked for; `from` is the day the quote was written for.
    quote: { date, from: found.quote_date, text: found.quote_text, author: found.author, comment: found.commentary },
  });
}

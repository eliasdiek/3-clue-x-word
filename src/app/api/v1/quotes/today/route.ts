import type { NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { fail, ok, resolveQuoteDate } from "@/lib/api/v1";

/**
 * GET /api/v1/quotes/today?date=2026-11-09
 * The quote for the player's own calendar date (send the device's local
 * date). Without `date`, Brisbane's today is used.
 */
export async function GET(request: NextRequest) {
  const date = resolveQuoteDate(request.nextUrl.searchParams.get("date"));
  if (!date) return fail(400, "invalid-date", "`date` must be today's date as YYYY-MM-DD.");

  const { data, error } = await createPublicClient()
    .from("daily_quotes")
    .select("quote_date, quote_text, author, commentary")
    .eq("quote_date", date)
    .maybeSingle();
  if (error) return fail(503, "unavailable", "Quotes are unavailable right now. Please try again later.");
  if (!data) return fail(404, "no-quote", `There is no quote for ${date}.`);
  return ok({
    quote: { date: data.quote_date, text: data.quote_text, author: data.author, comment: data.commentary },
  });
}

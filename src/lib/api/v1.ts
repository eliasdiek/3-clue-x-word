import "server-only";
import { addDays, isValidDate, todayIn } from "@/lib/quotes/dates";

/**
 * Helpers for the public mobile API (version 1). Responses are JSON with a
 * stable shape: { apiVersion: "v1", ... } on success and
 * { apiVersion: "v1", error: { code, message } } on failure.
 */

export const API_VERSION = "v1";

const BASE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Published puzzles never change, so they may be cached. Lists and "next"
 * change when John publishes, so they are cached only briefly.
 */
export const CACHE = {
  immutable: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  short: "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
} as const;

export function ok<T extends object>(body: T, cache: string = CACHE.short): Response {
  return Response.json({ apiVersion: API_VERSION, ...body }, { headers: { ...BASE_HEADERS, "Cache-Control": cache } });
}

export function fail(status: number, code: string, message: string): Response {
  return Response.json(
    { apiVersion: API_VERSION, error: { code, message } },
    { status, headers: { ...BASE_HEADERS, "Cache-Control": "no-store" } },
  );
}

/** A positive whole number from a query or path value, or null. */
export function parsePuzzleNumber(value: string | null | undefined): number | null {
  if (value == null || !/^\d{1,9}$/.test(value)) return null;
  const n = Number(value);
  return n >= 0 ? n : null;
}

/**
 * The quote date the app asks for (the player's own calendar date), or the
 * administrator's today when none is given. Accepted only within a day of
 * the server's UTC date, the range real time zones can be in.
 */
export function resolveQuoteDate(requested: string | null, now: Date = new Date()): string | null {
  if (!requested) return todayIn(undefined, now);
  if (!isValidDate(requested)) return null;
  const utcToday = now.toISOString().slice(0, 10);
  if (requested < addDays(utcToday, -1) || requested > addDays(utcToday, 1)) return null;
  return requested;
}

import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Times are shown in the administrator's time zone (John is in Brisbane), so
 * the server (UTC on Vercel) and the browser always show the same time.
 * Override with NEXT_PUBLIC_ADMIN_TIME_ZONE.
 */
export const ADMIN_TIME_ZONE = process.env.NEXT_PUBLIC_ADMIN_TIME_ZONE || "Australia/Brisbane";

const dateTimeFormat = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: ADMIN_TIME_ZONE,
});

export function formatDateTime(value: string | Date): string {
  return dateTimeFormat.format(typeof value === "string" ? new Date(value) : value);
}

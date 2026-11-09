"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/dal";
import { writeAuditLog } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { isValidDate } from "./dates";

/** Daily quote edits (the specification's "Quotes" database). */

export type QuoteActionResult = { ok: true } | { ok: false; message: string; field?: "text" | "author" | "comment" };

const optional = (max: number, label: string) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().max(max, `${label} can be up to ${max} characters.`));

const quoteSchema = z.object({
  date: z.string().refine(isValidDate, "That date isn't valid."),
  text: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Please enter the quote.").max(1000, "The quote can be up to 1,000 characters.")),
  author: optional(200, "The person's name"),
  comment: optional(2000, "The comment"),
});
export type QuoteInput = z.input<typeof quoteSchema>;

export async function saveQuote(input: QuoteInput): Promise<QuoteActionResult> {
  const admin = await requireAdmin();
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return {
      ok: false,
      message: issue?.message ?? "Please check the quote.",
      field: field === "text" || field === "author" || field === "comment" ? field : undefined,
    };
  }
  const { date, text, author, comment } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("daily_quotes")
    .upsert({ quote_date: date, quote_text: text, author: author || null, commentary: comment || null }, { onConflict: "quote_date" });
  if (error) {
    console.error("[quotes] save failed:", error.message);
    return { ok: false, message: "The quote couldn't be saved. Please try again." };
  }
  await writeAuditLog(supabase, { adminId: admin.adminId, action: "quote.saved", resourceType: "daily_quote", metadata: { date } });
  return { ok: true };
}

export async function deleteQuote(date: string): Promise<QuoteActionResult> {
  const admin = await requireAdmin();
  if (!isValidDate(date)) return { ok: false, message: "That date isn't valid." };
  const supabase = await createClient();
  const { error } = await supabase.from("daily_quotes").delete().eq("quote_date", date);
  if (error) {
    console.error("[quotes] delete failed:", error.message);
    return { ok: false, message: "The quote couldn't be removed. Please try again." };
  }
  await writeAuditLog(supabase, { adminId: admin.adminId, action: "quote.deleted", resourceType: "daily_quote", metadata: { date } });
  return { ok: true };
}

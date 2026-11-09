"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilLine, Plus, Trash2 } from "lucide-react";
import { deleteQuote, saveQuote } from "@/lib/quotes/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export type Quote = { text: string; author: string; comment: string };

/**
 * One day's quote: shown as on the app's opening screen (quote in bold,
 * the person in regular type, the comment in grey), or edited in place.
 */
export function QuoteDay({
  date,
  label,
  isToday,
  quote,
}: {
  date: string;
  label: string;
  isToday: boolean;
  quote: Quote | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Quote>(quote ?? { text: "", author: "", comment: "" });
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveQuote({ date, ...draft });
      if (!result.ok) return setError(result);
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteQuote(date);
      setConfirmDelete(false);
      if (!result.ok) return setError(result);
      setDraft({ text: "", author: "", comment: "" });
      router.refresh();
    });
  }

  const ids = { text: `${date}-text`, author: `${date}-author`, comment: `${date}-comment` };

  return (
    <li className={cn("grid gap-3 px-5 py-4 sm:grid-cols-[9rem_1fr_auto]", isToday && "bg-brand-soft/50")}>
      <p className="font-bold text-navy">
        {label}
        {isToday ? <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs text-white">Today</span> : null}
      </p>

      {editing ? (
        <div className="flex flex-col gap-3">
          <Field id={ids.text} label="Quote" error={error?.field === "text" ? error.message : undefined}>
            <textarea
              id={ids.text}
              rows={2}
              maxLength={1000}
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.currentTarget.value })}
              className="w-full rounded-xl border-2 border-line-strong bg-surface px-3 py-2 text-base font-bold outline-none focus:border-brand"
            />
          </Field>
          <Field id={ids.author} label="Person quoting">
            <input
              id={ids.author}
              maxLength={200}
              value={draft.author}
              onChange={(e) => setDraft({ ...draft, author: e.currentTarget.value })}
              className="h-11 w-full rounded-xl border-2 border-line-strong bg-surface px-3 text-base outline-none focus:border-brand"
            />
          </Field>
          <Field id={ids.comment} label="Comment (optional)">
            <textarea
              id={ids.comment}
              rows={2}
              maxLength={2000}
              value={draft.comment}
              onChange={(e) => setDraft({ ...draft, comment: e.currentTarget.value })}
              className="w-full rounded-xl border-2 border-line-strong bg-surface px-3 py-2 text-base text-ink-muted outline-none focus:border-brand"
            />
          </Field>
          {error && !error.field ? (
            <p role="alert" className="text-sm font-semibold text-danger-ink">
              {error.message}
            </p>
          ) : null}
        </div>
      ) : quote ? (
        <div>
          <p className="text-base font-bold text-ink">“{quote.text}”</p>
          {quote.author ? <p className="text-base text-ink">{quote.author}</p> : null}
          {quote.comment ? <p className="mt-1 text-sm text-ink-muted">{quote.comment}</p> : null}
        </div>
      ) : (
        <p className="text-base text-ink-muted italic">No quote yet</p>
      )}

      <div className="flex items-start gap-2 sm:justify-end">
        {editing ? (
          <>
            <Button
              variant="secondary"
              className="h-10"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setDraft(quote ?? { text: "", author: "", comment: "" });
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button className="h-10" onClick={save} loading={pending}>
              Save
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              className="h-10"
              icon={quote ? <PencilLine aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
              onClick={() => setEditing(true)}
            >
              {quote ? "Edit" : "Add"}
              <span className="sr-only"> quote for {label}</span>
            </Button>
            {quote ? (
              <Button
                variant="secondary"
                className="h-10"
                icon={<Trash2 aria-hidden className="size-4" />}
                onClick={() => setConfirmDelete(true)}
              >
                <span className="sr-only">Remove quote for {label}</span>
              </Button>
            ) : null}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Remove the quote for ${label}?`}
        description="The app will show no quote on this day unless you add another."
        confirmLabel="Remove"
        tone="danger"
        loading={pending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </li>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold text-ink-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

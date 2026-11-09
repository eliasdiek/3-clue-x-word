"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilLine, Trash2 } from "lucide-react";
import { CLUE_LEVEL_LABELS, CLUE_LEVEL_STYLES, CLUE_LEVELS, CLUE_MAX_LENGTH, type ClueLevel } from "@/lib/constants/game";
import { deleteClueSet, updateClueSet } from "@/lib/dictionary/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Clues = Record<ClueLevel, string>;

/** One clue set for a dictionary word, with Edit and Remove. */
export function ClueSetCard({ id, word, clues, usedIn }: { id: string; word: string; clues: Clues; usedIn: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Clues>(clues);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateClueSet({ id, ...draft });
      if (!result.ok) return setError(result.message);
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteClueSet(id);
      setConfirmDelete(false);
      if (!result.ok) return setError(result.message);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      {editing ? (
        <div className="grid gap-3 md:grid-cols-3">
          {CLUE_LEVELS.map((level) => (
            <label key={level} className="flex flex-col gap-1">
              <span className={cn("text-sm font-bold", CLUE_LEVEL_STYLES[level].text)}>{CLUE_LEVEL_LABELS[level]}</span>
              <input
                value={draft[level]}
                maxLength={CLUE_MAX_LENGTH}
                onChange={(event) => setDraft({ ...draft, [level]: event.currentTarget.value })}
                className={cn("h-11 rounded-xl border-2 bg-surface px-3 text-base outline-none focus:ring-3 focus:ring-brand-ring", CLUE_LEVEL_STYLES[level].border)}
                aria-label={`${CLUE_LEVEL_LABELS[level]} clue for ${word}`}
              />
            </label>
          ))}
        </div>
      ) : (
        <dl className="grid gap-3 md:grid-cols-3">
          {CLUE_LEVELS.map((level) => (
            <div key={level} className={cn("rounded-lg border-l-4 bg-canvas px-3 py-2", CLUE_LEVEL_STYLES[level].border)}>
              <dt className={cn("text-xs font-bold", CLUE_LEVEL_STYLES[level].text)}>{CLUE_LEVEL_LABELS[level]}</dt>
              <dd className="text-base text-ink">{clues[level]}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">{usedIn}</p>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button
                variant="secondary"
                className="h-10"
                onClick={() => {
                  setEditing(false);
                  setDraft(clues);
                  setError(null);
                }}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button className="h-10" onClick={save} loading={pending}>
                Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" className="h-10" icon={<PencilLine aria-hidden className="size-4" />} onClick={() => setEditing(true)}>
                Edit<span className="sr-only"> clues for {word}</span>
              </Button>
              <Button variant="secondary" className="h-10" icon={<Trash2 aria-hidden className="size-4" />} onClick={() => setConfirmDelete(true)}>
                Remove<span className="sr-only"> clue set for {word}</span>
              </Button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <p className="mt-2 text-sm text-ink-muted">
          Changes only affect suggestions for future puzzles. Published puzzles keep the clues they were published with.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger-ink">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        title={`Remove this clue set for ${word}?`}
        description="It will no longer be suggested for new puzzles. Published puzzles keep their clues."
        confirmLabel="Remove"
        tone="danger"
        loading={pending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
      />
    </div>
  );
}

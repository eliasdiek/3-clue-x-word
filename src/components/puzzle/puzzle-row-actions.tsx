"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, Eye, PencilLine, Trash2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { archivePuzzle, deletePuzzle, duplicatePuzzle, restorePuzzle } from "@/lib/puzzle/list-actions";
import { stageHref } from "@/lib/puzzle/stages";
import type { PuzzleStage } from "@/lib/supabase/database.types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

type Pending = "archive" | "restore" | "delete" | null;

/** Open, review, copy, archive/restore and delete for one puzzle. */
export function PuzzleRowActions({
  id,
  name,
  stage,
  everPublished,
}: {
  id: string;
  /** e.g. "puzzle #12" or "the draft" — used in labels and confirmations. */
  name: string;
  stage: PuzzleStage;
  everPublished: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message?: string; puzzleId?: string }>, after?: (id?: string) => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      setConfirm(null);
      if (!result.ok) {
        setError(result.message ?? "That didn't work. Please try again.");
        return;
      }
      if (after) after(result.puzzleId);
      else router.refresh();
    });
  }

  const archived = stage === "archived";
  const canEdit = stage === "grid" || stage === "clues" || stage === "ready";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <IconLink href={stageHref(id, stage)} icon={canEdit ? PencilLine : Eye} label={`${canEdit ? "Edit" : "View"} ${name}`} />
        {canEdit && stage !== "grid" ? (
          <IconLink href={`/puzzles/${id}/review`} icon={Eye} label={`Review ${name}`} />
        ) : null}
        <IconButton
          icon={Copy}
          label={`Copy ${name} into a new draft`}
          disabled={pending}
          onClick={() => run(() => duplicatePuzzle(id), (newId) => router.push(`/puzzles/${newId}/grid`))}
        />
        {archived ? (
          <IconButton icon={ArchiveRestore} label={`Restore ${name}`} disabled={pending} onClick={() => setConfirm("restore")} />
        ) : (
          <IconButton icon={Archive} label={`Archive ${name}`} disabled={pending} onClick={() => setConfirm("archive")} />
        )}
        {!everPublished ? (
          <IconButton icon={Trash2} label={`Delete ${name}`} tone="danger" disabled={pending} onClick={() => setConfirm("delete")} />
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger-ink">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirm === "archive"}
        title={`Archive ${name}?`}
        description={
          everPublished
            ? "It will be withdrawn from the app. Its number, grid and clues are kept, and you can restore it later."
            : "It will be moved out of the active list. You can restore it later."
        }
        confirmLabel="Archive"
        loading={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => archivePuzzle(id))}
      />
      <ConfirmDialog
        open={confirm === "restore"}
        title={`Restore ${name}?`}
        description={everPublished ? "It will be available in the app again." : "It will go back to the active list."}
        confirmLabel="Restore"
        loading={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => restorePuzzle(id))}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title={`Delete ${name}?`}
        description="Its grid and clues will be deleted for good. This can't be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => deletePuzzle(id))}
      />
    </div>
  );
}

const iconClasses =
  "flex size-10 items-center justify-center rounded-xl border-2 border-line-strong bg-surface text-navy transition-colors hover:border-brand hover:text-brand disabled:opacity-50";

function IconLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link href={href} className={iconClasses} title={label} aria-label={label}>
      <Icon aria-hidden className="size-5" />
    </Link>
  );
}

function IconButton({
  icon: Icon,
  label,
  tone,
  ...props
}: { icon: LucideIcon; label: string; tone?: "danger" } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(iconClasses, tone === "danger" && "hover:border-danger-strong hover:text-danger-strong")}
      {...props}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}

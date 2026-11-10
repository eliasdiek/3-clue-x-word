"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { publishPuzzle } from "@/lib/puzzle/publish-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * The Publish button with its confirmation. The real number is allocated by
 * the database; `nextNumber` is only what it will be if nobody else
 * publishes first.
 */
export function PublishPanel({
  puzzleId,
  reviewedUpdatedAt,
  nextNumber,
  canPublish,
}: {
  puzzleId: string;
  reviewedUpdatedAt: string;
  nextNumber: number | null;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; problems?: string[] } | null>(null);
  const [published, setPublished] = useState<number | null>(null);

  function publish() {
    setError(null);
    startTransition(async () => {
      const result = await publishPuzzle({ puzzleId, reviewedUpdatedAt });
      setConfirming(false);
      if (!result.ok) {
        setError({ message: result.message, problems: result.problems });
        return;
      }
      setPublished(result.puzzleNumber);
      // Show the published (locked) version of the page.
      router.refresh();
    });
  }

  if (published) {
    return (
      <Alert tone="success">
        Stored as puzzle #{published}. It is now locked and available to the app.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col items-end gap-3">
      {error ? (
        <Alert tone="error" className="w-full">
          <p>{error.message}</p>
          {error.problems?.length ? (
            <ul className="mt-1 list-disc pl-5 font-normal">
              {error.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
      <Button
        size="lg"
        icon={<Send aria-hidden className="size-5" />}
        disabled={!canPublish}
        onClick={() => setConfirming(true)}
      >
        Store Puzzle
      </Button>
      {!canPublish ? <p className="text-sm text-ink-muted">Fix the problems above to store it.</p> : null}

      <ConfirmDialog
        open={confirming}
        title={nextNumber ? `Store as puzzle #${nextNumber}?` : "Store this puzzle?"}
        description={
          <>
            <p>
              It gets the next puzzle number{nextNumber ? ` (#${nextNumber}, unless another puzzle is stored first)` : ""}{" "}
              and players get it automatically, in number order, after the puzzles before it.
            </p>
            <p className="mt-2">
              Once stored, its grid and clues are <strong>locked</strong> and can&apos;t be changed.
            </p>
          </>
        }
        confirmLabel="Store"
        loading={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={publish}
      />
    </div>
  );
}

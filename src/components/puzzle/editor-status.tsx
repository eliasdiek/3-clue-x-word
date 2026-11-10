import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";

/** Autosave state shared by the grid and clue editors. */
export type SaveState =
  | { state: "idle" }
  | { state: "unsaved" }
  | { state: "saving" }
  | { state: "saved"; at: Date }
  | { state: "error"; message: string; blocking: boolean };

export function SaveStatus({
  save,
  idleText = "Saved",
  onRetry,
}: {
  save: SaveState;
  idleText?: string;
  /** Shown as a "try again" button after a failure that can be retried. */
  onRetry?: () => void;
}) {
  switch (save.state) {
    case "saving":
      return <>Saving…</>;
    case "unsaved":
      return <>Unsaved changes…</>;
    case "error":
      return onRetry && !save.blocking ? (
        <button type="button" onClick={onRetry} className="text-left text-danger-ink underline underline-offset-2">
          Not saved: try again
        </button>
      ) : (
        <span className="text-danger-ink">Not saved</span>
      );
    case "saved":
      // Formatted in the viewer's time zone, which can differ from the server's.
      return <time suppressHydrationWarning>Saved {formatDateTime(save.at)}</time>;
    default:
      return <>{idleText}</>;
  }
}

const INFO_TONES = {
  brand: "bg-brand-soft/60 border-brand/15 text-brand",
  warning: "bg-warning/70 border-warning-ink/15 text-warning-ink",
  info: "bg-easier/40 border-easier-ink/15 text-easier-ink",
  success: "bg-success/60 border-success-ink/15 text-success-ink",
} as const;

export function InfoCard({
  icon: Icon,
  tone,
  label,
  children,
}: {
  icon: LucideIcon;
  tone: keyof typeof INFO_TONES;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-4 rounded-card border p-4", INFO_TONES[tone])}>
      <Icon aria-hidden className="size-8 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-ink-muted">{label}</p>
        <p className="text-lg font-bold text-navy">{children}</p>
      </div>
    </div>
  );
}

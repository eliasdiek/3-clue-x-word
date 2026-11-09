import Link from "next/link";
import { Archive, CircleCheck, Grid3x3, ListChecks, PencilLine, type LucideIcon } from "lucide-react";
import type { StageCounts } from "@/lib/dashboard/stats";
import type { PuzzleStage } from "@/lib/supabase/database.types";
import { STAGES } from "@/lib/puzzle/stages";
import { cn } from "@/lib/utils";

const CARDS: { stage: PuzzleStage; icon: LucideIcon; box: string; iconClass: string }[] = [
  { stage: "grid", icon: Grid3x3, box: "bg-warning/60 border-warning-ink/15", iconClass: "text-warning-ink" },
  { stage: "clues", icon: PencilLine, box: "bg-easier/40 border-easier-ink/15", iconClass: "text-easier-ink" },
  { stage: "ready", icon: ListChecks, box: "bg-brand-soft/70 border-brand/15", iconClass: "text-brand" },
  { stage: "published", icon: CircleCheck, box: "bg-success/60 border-success-ink/15", iconClass: "text-success-ink" },
  { stage: "archived", icon: Archive, box: "bg-line/50 border-ink-muted/15", iconClass: "text-ink-muted" },
];

/** The workflow from left to right; each card opens the Puzzle List filtered to that stage. */
export function StageCards({ counts }: { counts: StageCounts }) {
  return (
    <nav aria-label="Puzzles by stage">
      <ol className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {CARDS.map(({ stage, icon: Icon, box, iconClass }) => (
          <li key={stage}>
            <Link
              href={`/puzzles?stage=${stage}`}
              className={cn(
                "flex h-full items-center gap-3 rounded-card border p-4 shadow-card transition-shadow hover:shadow-pop",
                box,
              )}
            >
              <Icon aria-hidden className={cn("size-9 shrink-0", iconClass)} strokeWidth={2} />
              <span className="flex flex-col">
                <span className="text-3xl font-extrabold text-navy tabular-nums">{counts[stage]}</span>
                <span className="text-base font-semibold text-ink">{STAGES[stage].label}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function StageCardsSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {CARDS.map(({ stage, box }) => (
        <div key={stage} className={cn("flex h-24 items-center gap-3 rounded-card border p-4", box)}>
          <div className="size-9 rounded-xl bg-white/60 skeleton-pulse" />
          <div className="flex flex-col gap-2">
            <div className="h-7 w-10 rounded-md bg-white/60 skeleton-pulse" />
            <div className="h-4 w-24 rounded-md bg-white/60 skeleton-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

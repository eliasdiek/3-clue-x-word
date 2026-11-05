import { CircleCheck, Grid3x3, ListChecks, PencilLine, type LucideIcon } from "lucide-react";
import type { DashboardStats } from "@/lib/dashboard/stats";
import { cn } from "@/lib/utils";

const CARDS: { key: keyof DashboardStats; label: string; icon: LucideIcon; box: string; iconClass: string }[] = [
  { key: "total", label: "Total Puzzles", icon: Grid3x3, box: "bg-brand-soft/60 border-brand/15", iconClass: "text-brand" },
  { key: "published", label: "Published", icon: CircleCheck, box: "bg-success/60 border-success-ink/15", iconClass: "text-success-ink" },
  { key: "incomplete", label: "Incomplete", icon: PencilLine, box: "bg-warning/70 border-warning-ink/15", iconClass: "text-warning-ink" },
  { key: "ready", label: "Ready to Publish", icon: ListChecks, box: "bg-easier/40 border-easier-ink/15", iconClass: "text-easier-ink" },
];

/** Same footprint as <StatCards>, so nothing jumps when the figures arrive. */
export function StatCardsSkeleton() {
  return (
    <div role="status" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <span className="sr-only">Loading puzzle figures…</span>
      {CARDS.map(({ key, box }) => (
        <div key={key} aria-hidden className={cn("flex items-center gap-4 rounded-card border p-5 shadow-card", box)}>
          <div className="size-11 shrink-0 rounded-xl bg-white/60 skeleton-pulse" />
          <div className="flex flex-col gap-2">
            <div className="h-8 w-14 rounded-md bg-white/60 skeleton-pulse" />
            <div className="h-5 w-28 rounded-md bg-white/60 skeleton-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatCards({ stats }: { stats: DashboardStats }) {
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {CARDS.map(({ key, label, icon: Icon, box, iconClass }) => (
        <div key={key} className={cn("flex items-center gap-4 rounded-card border p-5 shadow-card", box)}>
          <Icon aria-hidden className={cn("size-11 shrink-0", iconClass)} strokeWidth={2} />
          <div className="flex flex-col-reverse">
            <dt className="text-lg font-semibold text-ink">{label}</dt>
            <dd className="text-3xl font-extrabold text-navy tabular-nums">{stats[key]}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

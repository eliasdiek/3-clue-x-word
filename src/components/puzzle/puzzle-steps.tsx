import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Build Grid", "Add Clues", "Review & Publish"] as const;

/** The three stages of making a puzzle. `current` is 1-based. */
export function PuzzleSteps({ current, completed = 0 }: { current: 1 | 2 | 3; completed?: number }) {
  return (
    <nav aria-label="Puzzle steps">
      <ol className="flex flex-wrap items-center gap-2 sm:gap-3">
        {STEPS.map((label, index) => {
          const step = index + 1;
          const isCurrent = step === current;
          const isDone = step <= completed && !isCurrent;
          return (
            <li key={label} className="flex items-center gap-2 sm:gap-3">
              {index > 0 ? <span aria-hidden className="hidden h-0.5 w-8 rounded bg-line-strong sm:block" /> : null}
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-base font-bold",
                  isCurrent ? "bg-brand text-white" : "bg-brand-soft/70 text-navy",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-sm",
                    isCurrent ? "bg-white text-brand" : "border-2 border-navy/30 bg-surface",
                  )}
                >
                  {isDone ? <Check aria-hidden className="size-4" strokeWidth={3} /> : step}
                </span>
                {label}
                {isDone ? <span className="sr-only">(done)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

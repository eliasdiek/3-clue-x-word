import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Build Grid", "Add Clues", "Review & Store"] as const;
type Step = 1 | 2 | 3;

/**
 * The three stages of making a puzzle. `current` is 1-based; steps listed in
 * `links` (other than the current one) can be clicked to go there.
 */
export function PuzzleSteps({
  current,
  completed = 0,
  links,
}: {
  current: Step;
  completed?: number;
  links?: Partial<Record<Step, string>>;
}) {
  return (
    <nav aria-label="Puzzle steps">
      <ol className="flex flex-wrap items-center gap-2 sm:gap-3">
        {STEPS.map((label, index) => {
          const step = (index + 1) as Step;
          const isCurrent = step === current;
          const isDone = step <= completed && !isCurrent;
          const href = isCurrent ? undefined : links?.[step];
          const className = cn(
            "flex items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-base font-bold",
            isCurrent ? "bg-brand text-white" : "bg-brand-soft/70 text-navy",
            href && "transition-colors hover:bg-brand-soft hover:text-brand",
          );
          const content = (
            <>
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
            </>
          );
          return (
            <li key={label} className="flex items-center gap-2 sm:gap-3">
              {index > 0 ? <span aria-hidden className="hidden h-0.5 w-8 rounded bg-line-strong sm:block" /> : null}
              {href ? (
                <Link href={href} className={className}>
                  {content}
                </Link>
              ) : (
                <span aria-current={isCurrent ? "step" : undefined} className={className}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

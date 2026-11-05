import { cn } from "@/lib/utils";

/**
 * A faint full ring with a rounded arc turning steadily around it. Colour
 * comes from `currentColor`; animation from `.spinner` in globals.css.
 */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <>
      <svg aria-hidden viewBox="0 0 24 24" fill="none" className={cn("spinner shrink-0", className)}>
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}

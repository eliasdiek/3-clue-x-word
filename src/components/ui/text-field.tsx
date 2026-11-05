"use client";

import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type FieldProps = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  /** Hide the label visually (it stays available to screen readers). */
  hideLabel?: boolean;
  error?: string;
  hint?: string;
  icon?: ReactNode;
  /** Extra control rendered inside the right edge of the input. */
  trailing?: ReactNode;
};

/** Accessible labelled input with inline error and hint text. */
export function TextField({ label, hideLabel, error, hint, icon, trailing, className, ...props }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={cn("text-sm font-bold text-ink", hideLabel && "sr-only")}>
        {label}
      </label>
      <div className="relative">
        {icon ? (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-ink-muted">
            {icon}
          </span>
        ) : null}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-13 w-full rounded-xl border-2 bg-surface text-base text-ink placeholder:text-ink-muted/80",
            "transition-colors focus:border-brand focus:outline-none focus-visible:outline-none",
            "focus:ring-4 focus:ring-brand-soft",
            icon ? "pl-12" : "pl-4",
            trailing ? "pr-14" : "pr-4",
            error ? "border-danger-strong" : "border-line hover:border-line-strong",
          )}
          {...props}
        />
        {trailing ? <span className="absolute inset-y-0 right-2 flex items-center">{trailing}</span> : null}
      </div>
      {hint && !error ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm font-semibold text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Password input with a show/hide toggle. */
export function PasswordField(props: Omit<FieldProps, "type" | "trailing">) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="flex size-10 items-center justify-center rounded-lg text-ink-muted hover:bg-brand-soft hover:text-brand"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
        </button>
      }
    />
  );
}

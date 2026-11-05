import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-60 select-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-sm hover:bg-brand-hover",
  secondary: "border-2 border-line-strong bg-surface text-navy hover:border-brand hover:text-brand",
  ghost: "text-navy hover:bg-brand-soft",
  danger: "bg-danger-strong text-white shadow-sm hover:bg-danger-ink",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-base",
  lg: "h-13 px-6 text-lg",
};

type StyleProps = { variant?: Variant; size?: Size; fullWidth?: boolean };

export function buttonClasses({ variant = "primary", size = "md", fullWidth }: StyleProps = {}) {
  return cn(base, variants[variant], sizes[size], fullWidth && "w-full");
}

type ButtonProps = ComponentProps<"button"> &
  StyleProps & {
    loading?: boolean;
    loadingText?: string;
    icon?: ReactNode;
  };

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  loadingText,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-5" /> : icon}
      <span>{loading && loadingText ? loadingText : children}</span>
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & StyleProps & { icon?: ReactNode };

export function ButtonLink({ variant, size, fullWidth, icon, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={cn(buttonClasses({ variant, size, fullWidth }), className)} {...props}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}

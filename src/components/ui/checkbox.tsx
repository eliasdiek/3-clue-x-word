"use client";

import { useId, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Checkbox({ label, className, ...props }: Omit<ComponentProps<"input">, "type" | "id"> & { label: string }) {
  const id = useId();
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <input
        id={id}
        type="checkbox"
        className="size-5 cursor-pointer rounded-md border-2 border-line-strong accent-brand"
        {...props}
      />
      <label htmlFor={id} className="cursor-pointer text-base text-ink">
        {label}
      </label>
    </div>
  );
}

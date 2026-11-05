"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, UserRound, UserRoundCog } from "lucide-react";
import { signOut } from "@/lib/auth/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

export function AccountMenu({ displayName, email }: { displayName: string; email: string | null }) {
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [pending, startTransition] = useTransition();
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-base font-semibold text-ink hover:bg-brand-soft focus-visible:bg-brand-soft";

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-full py-1 pr-2 pl-1 hover:bg-brand-soft/70"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-brand-soft text-navy">
          <UserRound aria-hidden className="size-6" />
        </span>
        <span className="hidden text-lg font-bold text-navy md:inline">{displayName}</span>
        <span className="sr-only md:hidden">Account menu for {displayName}</span>
        <ChevronDown aria-hidden className={cn("size-5 text-navy transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          id={menuId}
          className="absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-line bg-surface p-2 shadow-pop"
        >
          <div className="border-b border-line px-3 pt-2 pb-3">
            <p className="font-bold text-navy">{displayName}</p>
            {email ? <p className="truncate text-sm text-ink-muted">{email}</p> : null}
          </div>
          <ul className="pt-2">
            <li>
              <Link href="/settings" className={itemClass} onClick={() => setOpen(false)}>
                <UserRoundCog aria-hidden className="size-5 text-ink-muted" />
                Account settings
              </Link>
            </li>
            <li>
              <button
                type="button"
                className={itemClass}
                onClick={() => {
                  setOpen(false);
                  setConfirmLogout(true);
                }}
              >
                <LogOut aria-hidden className="size-5 text-ink-muted" />
                Log out
              </button>
            </li>
          </ul>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmLogout}
        title="Log out?"
        description="Any changes you have saved are kept. Unsaved changes on an open page will be lost."
        confirmLabel="Log out"
        loading={pending}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => startTransition(() => signOut())}
      />
    </div>
  );
}

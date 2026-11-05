"use client";

import { RotateCcw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex max-w-2xl flex-col gap-5 py-10">
      <h1 className="text-3xl font-extrabold text-navy">Something went wrong</h1>
      <Alert tone="error">
        {error.message && !error.digest
          ? error.message
          : "This page couldn't be loaded. Your saved work is safe. Please try again."}
      </Alert>
      <div>
        <Button onClick={reset} icon={<RotateCcw aria-hidden className="size-5" />}>
          Try again
        </Button>
      </div>
    </div>
  );
}

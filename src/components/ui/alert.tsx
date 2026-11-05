import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "error" | "info";

const tones: Record<Tone, { box: string; Icon: typeof Info; label: string }> = {
  success: { box: "bg-success text-success-ink border-success-ink/20", Icon: CircleCheck, label: "Success" },
  warning: { box: "bg-warning text-warning-ink border-warning-ink/20", Icon: TriangleAlert, label: "Warning" },
  error: { box: "bg-danger text-danger-ink border-danger-ink/20", Icon: CircleAlert, label: "Error" },
  info: { box: "bg-info text-info-ink border-info-ink/20", Icon: Info, label: "Note" },
};

/**
 * Status message. Always pairs colour with an icon and a hidden text label
 * so meaning never depends on colour alone.
 */
export function Alert({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  const { box, Icon, label } = tones[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-base font-semibold", box, className)}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div>
        <span className="sr-only">{label}: </span>
        {children}
      </div>
    </div>
  );
}

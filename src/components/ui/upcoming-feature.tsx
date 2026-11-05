import { Construction } from "lucide-react";
import { Card, PageHeader } from "./card";

/**
 * Honest placeholder for pages scheduled in a later build step, so
 * navigation works without pretending a feature exists.
 */
export function UpcomingFeature({ title, step, summary }: { title: string; step: number; summary: string }) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={title} />
      <Card className="flex items-start gap-4 p-6">
        <Construction aria-hidden className="mt-1 size-7 shrink-0 text-warning-ink" />
        <div>
          <p className="text-lg font-bold text-navy">Not built yet — scheduled for build step {step}.</p>
          <p className="mt-1 text-base text-ink-muted">{summary}</p>
        </div>
      </Card>
    </div>
  );
}

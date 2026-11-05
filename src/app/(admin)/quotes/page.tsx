import type { Metadata } from "next";
import { UpcomingFeature } from "@/components/ui/upcoming-feature";

export const metadata: Metadata = { title: "Daily Quotes" };

export default function QuotesPage() {
  return (
    <UpcomingFeature
      title="Daily Quotes"
      step={9}
      summary="Enter the quote shown on the app's opening screen for each date: the quote, the person quoted and a comment."
    />
  );
}

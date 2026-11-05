import type { Metadata } from "next";
import { UpcomingFeature } from "@/components/ui/upcoming-feature";

export const metadata: Metadata = { title: "Clue Dictionary" };

export default function DictionaryPage() {
  return (
    <UpcomingFeature
      title="Clue Dictionary"
      step={7}
      summary="A searchable library of every published word and its clue sets, filled in automatically when puzzles are published."
    />
  );
}

import type { Metadata } from "next";
import { UpcomingFeature } from "@/components/ui/upcoming-feature";

export const metadata: Metadata = { title: "Create Puzzle" };

export default function NewPuzzlePage() {
  return (
    <UpcomingFeature
      title="Create Puzzle"
      step={5}
      summary="The 12×12 grid editor with automatic word detection and clue numbering."
    />
  );
}

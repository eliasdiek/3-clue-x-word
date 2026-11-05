import type { Metadata } from "next";
import { UpcomingFeature } from "@/components/ui/upcoming-feature";

export const metadata: Metadata = { title: "Puzzle List" };

export default function PuzzleListPage() {
  return (
    <UpcomingFeature
      title="Puzzle List"
      step={4}
      summary="Search, filter and sort every puzzle, with open, preview, duplicate, publish, archive and delete actions."
    />
  );
}

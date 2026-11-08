import { CLUE_LEVEL_LABELS, CLUE_LEVEL_STYLES, CLUE_LEVELS } from "@/lib/constants/game";
import { wordLabel } from "@/lib/puzzle/format";
import type { StoredWord } from "@/lib/puzzle/publish";
import { cn } from "@/lib/utils";

/** Read-only list of every word and its three clues, across then down. */
export function ClueReviewList({ words }: { words: StoredWord[] }) {
  const groups = [
    { title: "Across", words: words.filter((w) => w.direction === "across") },
    { title: "Down", words: words.filter((w) => w.direction === "down") },
  ];
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.title} aria-labelledby={`review-${group.title}`}>
          <h3 id={`review-${group.title}`} className="mb-3 text-xl font-extrabold text-navy">
            {group.title}
          </h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {group.words.map((w) => (
              <li key={`${w.direction}-${w.number}`} className="grid gap-3 px-4 py-3 lg:grid-cols-[9rem_repeat(3,minmax(0,1fr))]">
                <div>
                  <span className="mr-2 font-extrabold text-brand">{wordLabel(w.number, w.direction)}</span>
                  <span className="font-grid text-lg font-bold tracking-wide text-navy">{w.answer}</span>
                </div>
                {CLUE_LEVELS.map((level) => {
                  const text = w[level].trim();
                  return (
                    <p
                      key={level}
                      className={cn(
                        "rounded-lg border-l-4 px-3 py-1.5 text-base",
                        CLUE_LEVEL_STYLES[level].border,
                        text ? "bg-canvas text-ink" : "bg-danger font-semibold text-danger-ink",
                      )}
                    >
                      <span className={cn("block text-xs font-bold", CLUE_LEVEL_STYLES[level].text)}>
                        {CLUE_LEVEL_LABELS[level]}
                      </span>
                      {text || "Missing"}
                    </p>
                  );
                })}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

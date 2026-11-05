import type { GridWord } from "@/lib/puzzle/grid";
import { squareRef, wordLabel } from "@/lib/puzzle/format";

/** The words found on Done, across then down, labelled like the specification ("3d"). */
export function WordList({ words }: { words: GridWord[] }) {
  const groups = [
    { title: "Across", words: words.filter((w) => w.direction === "across") },
    { title: "Down", words: words.filter((w) => w.direction === "down") },
  ];
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {groups.map((group) => (
        <section key={group.title} aria-labelledby={`words-${group.title}`}>
          <h3 id={`words-${group.title}`} className="mb-2 text-lg font-extrabold text-navy">
            {group.title} <span className="font-semibold text-ink-muted">({group.words.length})</span>
          </h3>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {group.words.map((word) => (
              <li key={`${word.direction}-${word.number}`} className="flex items-baseline gap-3 px-4 py-2">
                <span className="w-10 shrink-0 font-bold text-brand tabular-nums">{wordLabel(word.number, word.direction)}</span>
                <span className="font-grid text-lg font-bold tracking-wide text-ink">{word.answer}</span>
                <span className="ml-auto text-sm text-ink-muted">
                  {word.answer.length} letters · {squareRef(word.startRow, word.startColumn)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

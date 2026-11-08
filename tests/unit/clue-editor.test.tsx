// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClueEditor, type ClueEditorInitial } from "@/components/puzzle/clue-editor";
import { CLUE_MAX_LENGTH } from "@/lib/constants/game";
import { emptyGrid, toFinishedGrid } from "@/lib/puzzle/grid";

const saveClues = vi.fn();
const checkClues = vi.fn();
vi.mock("@/lib/puzzle/clue-actions", () => ({
  saveClues: (...args: unknown[]) => saveClues(...args),
  checkClues: (...args: unknown[]) => checkClues(...args),
}));

const CAT = "11111111-1111-4111-8111-111111111111";
const COW = "22222222-2222-4222-8222-222222222222";

const INITIAL: ClueEditorInitial = {
  puzzleId: "33333333-3333-4333-8333-333333333333",
  puzzleNumber: null,
  status: "draft",
  grid: toFinishedGrid(["CAT.........", "O...........", "W...........", ...emptyGrid().slice(3)]),
  gridFinished: true,
  updatedAt: "2026-11-08T10:00:00Z",
  words: [
    {
      wordId: CAT,
      number: 1,
      direction: "across",
      answer: "CAT",
      cells: [
        [0, 0],
        [0, 1],
        [0, 2],
      ],
      harder: "Feline",
      medium: "",
      easier: "",
      sourceClueSetId: null,
    },
    {
      wordId: COW,
      number: 1,
      direction: "down",
      answer: "COW",
      cells: [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      harder: "",
      medium: "",
      easier: "",
      sourceClueSetId: null,
    },
  ],
  suggestions: { COW: [{ id: "44444444-4444-4444-8444-444444444444", harder: "Bovine", medium: "Moo maker", easier: "Farm animal" }] },
};

// jsdom doesn't implement scrolling.
Element.prototype.scrollIntoView ??= () => {};

beforeEach(() => {
  saveClues.mockReset().mockResolvedValue({ ok: true, updatedAt: "2026-11-08T10:01:00Z", wordCount: 2, completedCount: 1 });
  checkClues.mockReset();
});

const field = (level: "Harder" | "Medium" | "Easier", word: string) =>
  screen.getByRole("textbox", { name: new RegExp(`^${level} clue .* for ${word}$`) });

describe("ClueEditor", () => {
  it("lists every word with its label and three coloured clue boxes", () => {
    render(<ClueEditor initial={INITIAL} />);
    expect(screen.getByText("1a")).toBeInTheDocument();
    expect(screen.getByText("1d")).toBeInTheDocument();
    expect(field("Harder", "1a CAT")).toHaveValue("Feline");
    expect(field("Easier", "1d COW")).toHaveValue("");
    expect(screen.getByText("Clues completed").nextSibling).toHaveTextContent("0 / 2");
  });

  it("counts characters and stops at the limit", async () => {
    const user = userEvent.setup();
    render(<ClueEditor initial={INITIAL} />);
    const input = field("Medium", "1a CAT");
    await user.type(input, "x".repeat(CLUE_MAX_LENGTH + 5));
    expect(input).toHaveValue("x".repeat(CLUE_MAX_LENGTH));
    expect(screen.getAllByText(`${CLUE_MAX_LENGTH}/${CLUE_MAX_LENGTH}`).length).toBeGreaterThan(0);
  });

  it("autosaves only the words that changed", async () => {
    const user = userEvent.setup();
    render(<ClueEditor initial={INITIAL} />);
    await user.type(field("Medium", "1a CAT"), "Pet");
    await waitFor(() => expect(saveClues).toHaveBeenCalled(), { timeout: 3000 });
    const [{ clues }] = saveClues.mock.calls.at(-1)!;
    expect(clues).toEqual([{ wordId: CAT, harder: "Feline", medium: "Pet", easier: "", sourceClueSetId: null }]);
    expect(await screen.findByText(/^Saved /)).toBeInTheDocument();
  });

  it("offers clues used before for the same word", async () => {
    const user = userEvent.setup();
    render(<ClueEditor initial={INITIAL} />);
    await user.click(screen.getByText("Previous clues (1)"));
    await user.click(screen.getByRole("button", { name: "Use these clues for COW" }));
    expect(field("Harder", "1d COW")).toHaveValue("Bovine");
    expect(field("Easier", "1d COW")).toHaveValue("Farm animal");
    await waitFor(() => expect(saveClues).toHaveBeenCalled(), { timeout: 3000 });
    expect(saveClues.mock.calls.at(-1)![0].clues[0].sourceClueSetId).toBe("44444444-4444-4444-8444-444444444444");
  });

  it("reports missing clues in the specification's words", async () => {
    checkClues.mockResolvedValue({
      ok: true,
      complete: false,
      lines: ["Word 1a, CAT only has 1 clue", "Word 1d, COW has no clues"],
    });
    const user = userEvent.setup();
    render(<ClueEditor initial={INITIAL} />);
    await user.click(screen.getByRole("button", { name: "Done / Check Clues" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Word 1d, COW has no clues")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Next: Review/ })).toBeNull();
  });

  it("confirms a complete puzzle and offers the next step", async () => {
    checkClues.mockResolvedValue({ ok: true, complete: true, lines: ["All words are present and have 3 clues"] });
    const user = userEvent.setup();
    render(<ClueEditor initial={INITIAL} />);
    await user.click(screen.getByRole("button", { name: "Done / Check Clues" }));
    expect(await screen.findByText("All words are present and have 3 clues")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next: Review/ })).toBeInTheDocument();
  });

  it("filters to the words that still need clues", async () => {
    const user = userEvent.setup();
    render(<ClueEditor initial={{ ...INITIAL, words: [{ ...INITIAL.words[0], medium: "m", easier: "e" }, INITIAL.words[1]] }} />);
    await user.click(screen.getByLabelText("Show only words that still need clues"));
    expect(screen.queryByText("CAT")).toBeNull();
    expect(screen.getByText("COW")).toBeInTheDocument();
  });

  it("is read-only when the grid changed after Done, and explains why", () => {
    render(<ClueEditor initial={{ ...INITIAL, gridFinished: false }} />);
    expect(screen.getByText(/grid was changed after Done/)).toBeInTheDocument();
    expect(field("Harder", "1a CAT")).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Done / Check Clues" })).toBeNull();
  });
});

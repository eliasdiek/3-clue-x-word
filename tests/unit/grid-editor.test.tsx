// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GridEditor, type GridEditorInitial } from "@/components/puzzle/grid-editor";
import { emptyGrid, toFinishedGrid } from "@/lib/puzzle/grid";

const saveGridDraft = vi.fn();
const finishGrid = vi.fn();
vi.mock("@/lib/puzzle/actions", () => ({
  saveGridDraft: (...args: unknown[]) => saveGridDraft(...args),
  finishGrid: (...args: unknown[]) => finishGrid(...args),
}));

beforeAll(() => {
  // jsdom has no modal <dialog> support.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  saveGridDraft.mockReset().mockResolvedValue({ ok: true, puzzleId: "p-1", updatedAt: "2026-11-05T10:00:00Z" });
  finishGrid.mockReset();
  vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
});

const NEW_PUZZLE: GridEditorInitial = {
  puzzleId: null,
  puzzleNumber: null,
  status: "draft",
  grid: emptyGrid(),
  finished: false,
  updatedAt: null,
  wordsWithClues: [],
};

const cell = (row: number, column: number) =>
  screen.getByRole("gridcell", { name: new RegExp(`^Row ${row}, column ${column}:`) });
const input = () => screen.getByLabelText("Type a letter into the selected square");

async function setup(initial: GridEditorInitial = NEW_PUZZLE) {
  const user = userEvent.setup();
  render(<GridEditor initial={initial} />);
  await user.click(input());
  return user;
}

describe("GridEditor typing", () => {
  it("starts with a clean white 12×12 board", () => {
    render(<GridEditor initial={NEW_PUZZLE} />);
    expect(screen.getAllByRole("gridcell")).toHaveLength(144);
    expect(screen.queryAllByRole("gridcell", { name: /black square/ })).toHaveLength(0);
  });

  it("types across and moves on by itself", async () => {
    const user = await setup();
    await user.keyboard("cat");
    expect(cell(1, 1)).toHaveAccessibleName("Row 1, column 1: C");
    expect(cell(1, 2)).toHaveAccessibleName("Row 1, column 2: A");
    expect(cell(1, 3)).toHaveAccessibleName("Row 1, column 3: T");
    expect(cell(1, 4)).toHaveAttribute("aria-selected", "true");
  });

  it("switches to down with the toggle", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "down" }));
    await user.click(input());
    await user.keyboard("dog");
    expect(cell(3, 1)).toHaveAccessibleName("Row 3, column 1: G");
    await user.click(screen.getByRole("button", { name: "across" }));
    expect(screen.getByRole("button", { name: "across" })).toHaveAttribute("aria-pressed", "true");
  });

  it("the space bar leaves a blank square and moves on, clearing any letter", async () => {
    const user = await setup();
    await user.keyboard("c a{ArrowLeft}{ArrowLeft}{ArrowLeft} ");
    expect(cell(1, 1)).toHaveAccessibleName("Row 1, column 1: empty");
    expect(cell(1, 2)).toHaveAccessibleName("Row 1, column 2: empty");
    expect(cell(1, 3)).toHaveAccessibleName("Row 1, column 3: A");
    expect(cell(1, 2)).toHaveAttribute("aria-selected", "true");
  });

  it("carries on at the start of the next row after column 12", async () => {
    const user = await setup();
    await user.keyboard("abcdefghijklmn");
    expect(cell(1, 12)).toHaveAccessibleName("Row 1, column 12: L");
    expect(cell(2, 1)).toHaveAccessibleName("Row 2, column 1: M");
    expect(cell(2, 2)).toHaveAccessibleName("Row 2, column 2: N");
    await user.keyboard("{Backspace}{Backspace}{Backspace}");
    expect(cell(1, 12)).toHaveAccessibleName("Row 1, column 12: empty");
  });

  it("Enter, Tab and the Forward/Back buttons move without changing letters", async () => {
    const user = await setup();
    await user.keyboard("cat{ArrowLeft}{ArrowLeft}{ArrowLeft}{Enter}{Tab}");
    expect(cell(1, 3)).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(cell(1, 2)).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(cell(1, 1)).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Forward" }));
    expect(cell(1, 2)).toHaveAttribute("aria-selected", "true");
    expect(cell(1, 1)).toHaveAccessibleName("Row 1, column 1: C");
    expect(cell(1, 2)).toHaveAccessibleName("Row 1, column 2: A");
  });

  it("the iPad's previous/next field arrows step back and forward", async () => {
    const user = await setup();
    await user.keyboard("ca");
    screen.getByLabelText("Previous square").focus();
    await waitFor(() => expect(cell(1, 2)).toHaveAttribute("aria-selected", "true"));
    expect(input()).toHaveFocus();
    screen.getByLabelText("Next square").focus();
    await waitFor(() => expect(cell(1, 3)).toHaveAttribute("aria-selected", "true"));
  });

  it("deletes with Backspace and steps back", async () => {
    const user = await setup();
    await user.keyboard("cat{Backspace}");
    expect(cell(1, 3)).toHaveAccessibleName("Row 1, column 3: empty");
    expect(cell(1, 3)).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Backspace}");
    expect(cell(1, 2)).toHaveAccessibleName("Row 1, column 2: empty");
  });

  it("moves with the arrow keys", async () => {
    const user = await setup();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}");
    expect(cell(3, 2)).toHaveAttribute("aria-selected", "true");
  });

  it("autosaves, creating the draft on the first save", async () => {
    const user = await setup();
    await user.keyboard("cat");
    await waitFor(() => expect(saveGridDraft).toHaveBeenCalled(), { timeout: 3000 });
    const [{ puzzleId, grid }] = saveGridDraft.mock.calls[0];
    expect(puzzleId).toBeNull();
    expect(grid[0]).toBe("CAT.........");
    await waitFor(() => expect(window.history.replaceState).toHaveBeenCalledWith(null, "", "/puzzles/p-1/grid"));
    expect(await screen.findByText(/^Saved /)).toBeInTheDocument();
  });
});

describe("GridEditor Done", () => {
  it("explains stray letters instead of finishing", async () => {
    const user = await setup();
    await user.keyboard("cat{ArrowDown}{ArrowDown}{ArrowDown}q");
    await user.click(screen.getByRole("button", { name: "Done / Generate Word List" }));
    expect(screen.getByRole("alert")).toHaveTextContent("R04C04");
    expect(finishGrid).not.toHaveBeenCalled();
  });

  it("adds black squares, numbers and the word list", async () => {
    finishGrid.mockResolvedValue({
      ok: true,
      puzzleId: "p-1",
      updatedAt: "2026-11-05T10:01:00Z",
      wordCount: 2,
      keptClueCount: 0,
      droppedClueCount: 0,
    });
    const user = await setup();
    await user.keyboard("cat{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    await user.keyboard("{ArrowDown}ow");
    await user.click(screen.getByRole("button", { name: "Done / Generate Word List" }));

    expect(await screen.findByText(/Done! 2 words found: 1 across and 1 down/)).toBeInTheDocument();
    expect(cell(1, 4)).toHaveAccessibleName("Row 1, column 4: black square");
    const list = screen.getByRole("heading", { name: "Word List" }).parentElement!;
    expect(within(list).getByText("1a")).toBeInTheDocument();
    expect(within(list).getByText("1d")).toBeInTheDocument();
    expect(within(list).getByText("COW")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Grid" })).toBeInTheDocument();
  });

  it("says how many words got their clues from the Clue Dictionary", async () => {
    finishGrid.mockResolvedValue({
      ok: true,
      puzzleId: "p-1",
      updatedAt: "2026-11-05T10:01:00Z",
      wordCount: 2,
      keptClueCount: 0,
      droppedClueCount: 0,
      filledClueCount: 2,
    });
    const user = await setup();
    await user.keyboard("cat{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowDown}ow");
    await user.click(screen.getByRole("button", { name: "Done / Generate Word List" }));
    expect(await screen.findByText(/2 words were used before/)).toBeInTheDocument();
  });

  it("sends the grid it last saved, so clue saves elsewhere aren't mistaken for grid changes", async () => {
    const start = toFinishedGrid(["CAT.........", ...emptyGrid().slice(1)]);
    const user = userEvent.setup();
    render(
      <GridEditor
        initial={{ ...NEW_PUZZLE, puzzleId: "p-1", updatedAt: "2026-11-05T10:00:00Z", finished: true, grid: start }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit Grid" }));
    await user.pointer({ keys: "[MouseLeft>]", target: cell(1, 5) });
    await user.keyboard("s");
    await waitFor(() => expect(saveGridDraft).toHaveBeenCalled(), { timeout: 3000 });
    expect(saveGridDraft.mock.calls[0][0].baseGrid).toEqual(start);
    expect(saveGridDraft.mock.calls[0][0].expectedUpdatedAt).toBe("2026-11-05T10:00:00Z");
  });

  it("warns before clues are lost", async () => {
    const user = userEvent.setup();
    render(
      <GridEditor
        initial={{
          ...NEW_PUZZLE,
          puzzleId: "p-1",
          updatedAt: "2026-11-05T10:00:00Z",
          finished: true,
          grid: toFinishedGrid(["CAT.DOG.....", ...emptyGrid().slice(1)]),
          wordsWithClues: [{ number: 2, direction: "across", answer: "DOG", startRow: 0, startColumn: 4 }],
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit Grid" }));
    await user.pointer({ keys: "[MouseLeft>]", target: cell(1, 5) });
    await user.keyboard("{Delete}");
    await user.click(screen.getByRole("button", { name: "Done / Generate Word List" }));

    const dialog = screen.getByRole("dialog", { hidden: true, name: "Some words with clues will be removed" });
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveTextContent("2a DOG");
    expect(finishGrid).not.toHaveBeenCalled();
  });

  it("shows a published puzzle read-only", () => {
    render(
      <GridEditor
        initial={{
          ...NEW_PUZZLE,
          puzzleId: "p-1",
          puzzleNumber: 7,
          status: "published",
          finished: true,
          updatedAt: "2026-11-05T10:00:00Z",
          grid: toFinishedGrid(["CAT.........", ...emptyGrid().slice(1)]),
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Puzzle #7" })).toBeInTheDocument();
    expect(screen.getByText(/grid is locked/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Grid" })).toBeNull();
    expect(input()).toHaveAttribute("readonly");
  });
});

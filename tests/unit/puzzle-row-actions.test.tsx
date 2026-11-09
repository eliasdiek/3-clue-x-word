// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PuzzleRowActions } from "@/components/puzzle/puzzle-row-actions";

const actions = {
  archivePuzzle: vi.fn(),
  restorePuzzle: vi.fn(),
  deletePuzzle: vi.fn(),
  duplicatePuzzle: vi.fn(),
};
const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("@/lib/puzzle/list-actions", () => ({
  archivePuzzle: (id: string) => actions.archivePuzzle(id),
  restorePuzzle: (id: string) => actions.restorePuzzle(id),
  deletePuzzle: (id: string) => actions.deletePuzzle(id),
  duplicatePuzzle: (id: string) => actions.duplicatePuzzle(id),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  Object.values(actions).forEach((a) => a.mockReset().mockResolvedValue({ ok: true }));
  router.refresh.mockReset();
  router.push.mockReset();
});

describe("PuzzleRowActions", () => {
  it("never offers Delete for a puzzle that was published", () => {
    render(<PuzzleRowActions id="p1" name="puzzle #3" stage="published" everPublished />);
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
    expect(screen.getByRole("link", { name: "View puzzle #3" })).toHaveAttribute("href", "/puzzles/p1/review");
  });

  it("archives after confirmation, explaining a published puzzle leaves the app", async () => {
    const user = userEvent.setup();
    render(<PuzzleRowActions id="p1" name="puzzle #3" stage="published" everPublished />);
    await user.click(screen.getByRole("button", { name: "Archive puzzle #3" }));
    expect(screen.getByRole("dialog", { hidden: true, name: "Archive puzzle #3?" })).toHaveTextContent("withdrawn from the app");
    await user.click(screen.getByRole("button", { name: "Archive", hidden: true }));
    expect(actions.archivePuzzle).toHaveBeenCalledWith("p1");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("deletes a draft only after confirmation", async () => {
    const user = userEvent.setup();
    render(<PuzzleRowActions id="p2" name="this draft" stage="clues" everPublished={false} />);
    await user.click(screen.getByRole("button", { name: "Delete this draft" }));
    expect(actions.deletePuzzle).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete", hidden: true }));
    expect(actions.deletePuzzle).toHaveBeenCalledWith("p2");
  });

  it("opens the copy after duplicating", async () => {
    actions.duplicatePuzzle.mockResolvedValue({ ok: true, puzzleId: "copy-1" });
    const user = userEvent.setup();
    render(<PuzzleRowActions id="p2" name="this draft" stage="ready" everPublished={false} />);
    await user.click(screen.getByRole("button", { name: "Copy this draft into a new draft" }));
    expect(router.push).toHaveBeenCalledWith("/puzzles/copy-1/grid");
  });

  it("shows why an action failed", async () => {
    actions.restorePuzzle.mockResolvedValue({ ok: false, message: "The puzzle couldn't be restored." });
    const user = userEvent.setup();
    render(<PuzzleRowActions id="p3" name="this draft" stage="archived" everPublished={false} />);
    await user.click(screen.getByRole("button", { name: "Restore this draft" }));
    await user.click(screen.getByRole("button", { name: "Restore", hidden: true }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't be restored");
  });
});

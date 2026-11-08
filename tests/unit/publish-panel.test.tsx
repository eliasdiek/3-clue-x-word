// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublishPanel } from "@/components/puzzle/publish-panel";

const publishPuzzle = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/puzzle/publish-actions", () => ({ publishPuzzle: (...args: unknown[]) => publishPuzzle(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  publishPuzzle.mockReset();
  refresh.mockReset();
});

const PROPS = { puzzleId: "p-1", reviewedUpdatedAt: "2026-11-08T10:00:00Z", nextNumber: 12, canPublish: true };

describe("PublishPanel", () => {
  it("asks for confirmation, naming the expected number and the lock", async () => {
    const user = userEvent.setup();
    render(<PublishPanel {...PROPS} />);
    await user.click(screen.getByRole("button", { name: "Publish Puzzle" }));
    const dialog = screen.getByRole("dialog", { hidden: true, name: "Publish as puzzle #12?" });
    expect(dialog).toHaveTextContent("locked");
    expect(publishPuzzle).not.toHaveBeenCalled();
  });

  it("publishes the reviewed version and shows the number the server gave", async () => {
    publishPuzzle.mockResolvedValue({ ok: true, puzzleNumber: 13, publishedAt: "2026-11-08T10:05:00Z" });
    const user = userEvent.setup();
    render(<PublishPanel {...PROPS} />);
    await user.click(screen.getByRole("button", { name: "Publish Puzzle" }));
    await user.click(screen.getByRole("button", { name: "Publish", hidden: true }));
    expect(publishPuzzle).toHaveBeenCalledWith({ puzzleId: "p-1", reviewedUpdatedAt: "2026-11-08T10:00:00Z" });
    expect(await screen.findByText(/Published as puzzle #13/)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("explains why publishing was refused", async () => {
    publishPuzzle.mockResolvedValue({
      ok: false,
      reason: "problems",
      message: "This puzzle can't be published yet:",
      problems: ["Word 4d, SASH has no clues"],
    });
    const user = userEvent.setup();
    render(<PublishPanel {...PROPS} />);
    await user.click(screen.getByRole("button", { name: "Publish Puzzle" }));
    await user.click(screen.getByRole("button", { name: "Publish", hidden: true }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Word 4d, SASH has no clues");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("can't be clicked while there are problems", () => {
    render(<PublishPanel {...PROPS} canPublish={false} />);
    expect(screen.getByRole("button", { name: "Publish Puzzle" })).toBeDisabled();
  });
});

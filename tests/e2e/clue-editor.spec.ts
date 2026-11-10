import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

test.skip(!adminEmail || !adminPassword, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run");

async function logIn(page: Page, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill(adminEmail!);
  await page.getByLabel("Password", { exact: true }).fill(adminPassword!);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page).toHaveURL(new RegExp(next.replace(/\//g, "\\/")));
}

const clue = (page: Page, level: "Harder" | "Medium" | "Easier", word: string) =>
  page.getByRole("textbox", { name: new RegExp(`^${level} clue .*for ${word}$`) });

test("add clues, see the report, and finish", async ({ page }) => {
  // A two-word grid: CAT across, COW down.
  await logIn(page, "/puzzles/new");
  await page.getByRole("gridcell", { name: /^Row 1, column 1:/ }).click();
  await page.keyboard.type("CAT");
  await page.getByRole("gridcell", { name: /^Row 2, column 1:/ }).click();
  await page.getByRole("button", { name: "down" }).click();
  await page.keyboard.type("OW");
  await expect(page).toHaveURL(/\/puzzles\/[0-9a-f-]{36}\/grid$/);
  await page.getByRole("button", { name: "Done / Generate Word List" }).click();
  await page.getByRole("link", { name: "Next: Add Clues" }).click();
  await expect(page).toHaveURL(/\/clues$/);

  // Partly filled: the report names what's missing, in the specification's words.
  await clue(page, "Harder", "1a CAT").fill("Feline");
  await page.getByRole("button", { name: "Done / Check Clues" }).click();
  await expect(page.getByRole("alert")).toContainText("Word 1a, CAT only has 1 clue");
  await expect(page.getByRole("alert")).toContainText("Word 1d, COW has no clues");

  // Complete it.
  await clue(page, "Medium", "1a CAT").fill("Pet that purrs");
  await clue(page, "Easier", "1a CAT").fill("Kitty");
  await clue(page, "Harder", "1d COW").fill("Bovine");
  await clue(page, "Medium", "1d COW").fill("It says moo");
  await clue(page, "Easier", "1d COW").fill("Farm animal");
  // Complete: straight on to Review & Store, ready to store (but don't store here).
  await page.getByRole("button", { name: "Next: Review & Store" }).click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByText("This puzzle is ready to store")).toBeVisible();
  await expect(page.getByRole("button", { name: "Store Puzzle" })).toBeEnabled();

  // Saved: going back shows the clues.
  await page.getByRole("link", { name: "Edit Clues" }).click();
  await expect(clue(page, "Easier", "1d COW")).toHaveValue("Farm animal");
  await expect(page.getByText("2 / 2")).toBeVisible();
});

/**
 * Publishing uses up the next real puzzle number, and numbers never go back.
 * Only run this against a test database: set E2E_ALLOW_PUBLISH=1.
 */
test("publish a reviewed puzzle", async ({ page }) => {
  test.skip(process.env.E2E_ALLOW_PUBLISH !== "1", "Set E2E_ALLOW_PUBLISH=1 (test databases only)");
  await logIn(page, "/puzzles");
  const readyRow = page.getByRole("row").filter({ hasText: "Ready to store" }).first();
  await readyRow.getByRole("link", { name: /^Open/ }).click();
  await page.getByRole("link", { name: "Next: Review & Store" }).click();
  await page.getByRole("button", { name: "Store Puzzle" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Store" }).click();
  await expect(page.getByText(/Stored as puzzle #\d+/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /^Puzzle #\d+$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Store Puzzle" })).toHaveCount(0);
});

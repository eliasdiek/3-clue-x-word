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
  await page.keyboard.press("Space");
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
  await page.getByRole("button", { name: "Done / Check Clues" }).click();
  await expect(page.getByText("All words are present and have 3 clues")).toBeVisible();

  // Saved: a reload shows the clues.
  await page.reload();
  await expect(clue(page, "Easier", "1d COW")).toHaveValue("Farm animal");
  await expect(page.getByText("2 / 2")).toBeVisible();
});

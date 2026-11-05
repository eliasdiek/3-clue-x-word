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

const cell = (page: Page, row: number, column: number) =>
  page.getByRole("gridcell", { name: new RegExp(`^Row ${row}, column ${column}:`) });

test("build a grid, autosave it, click Done and reopen it", async ({ page }) => {
  await logIn(page, "/puzzles/new");
  await expect(page.getByRole("heading", { name: "Create Puzzle" })).toBeVisible();

  // CAT across from R01C01, then COW down from the same C.
  await cell(page, 1, 1).click();
  await page.keyboard.type("CAT");
  await cell(page, 1, 1).click();
  await cell(page, 1, 1).click(); // second click switches to down
  await page.keyboard.press("ArrowDown");
  await page.keyboard.type("OW");

  // Autosave creates the draft and moves to its own address.
  await expect(page).toHaveURL(/\/puzzles\/[0-9a-f-]{36}\/grid$/);
  await expect(page.getByText(/^Saved /)).toBeVisible();

  await page.getByRole("button", { name: "Done / Generate Word List" }).click();
  await expect(page.getByText(/2 words found: 1 across and 1 down/)).toBeVisible();
  await expect(cell(page, 1, 4)).toHaveAccessibleName("Row 1, column 4: black square");

  // The finished grid is stored: reload shows it finished.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Word List" })).toBeVisible();
  await expect(page.getByText("COW")).toBeVisible();

  // It appears in the puzzle list.
  await page.getByRole("link", { name: "Puzzle List" }).click();
  await expect(page.getByRole("heading", { name: "Puzzle List" })).toBeVisible();
  await expect(page.getByText("0 / 2").first()).toBeVisible();
});

test("stray letters are reported instead of finishing", async ({ page }) => {
  await logIn(page, "/puzzles/new");
  await cell(page, 1, 1).click();
  await page.keyboard.type("AT");
  await cell(page, 5, 5).click();
  await page.keyboard.type("Q");
  await page.getByRole("button", { name: "Done / Generate Word List" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "R05C05" })).toBeVisible();
});

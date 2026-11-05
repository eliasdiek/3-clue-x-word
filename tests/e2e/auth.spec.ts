import { expect, test } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

test.describe("protected routes", () => {
  for (const path of ["/dashboard", "/puzzles", "/dictionary", "/quotes", "/settings"]) {
    test(`${path} requires login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: "Admin Login" })).toBeVisible();
    });
  }

  test("returns to the requested page after login", async ({ page }) => {
    await page.goto("/puzzles/new");
    await expect(page).toHaveURL(/\/login\?next=%2Fpuzzles%2Fnew/);
  });

  test("the reset-password page needs a valid reset link", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page).toHaveURL(/notice=reset-link-expired/);
    await expect(page.getByRole("status")).toContainText("expired");
  });

  test("an invalid reset link is rejected safely", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=bogus&type=recovery&next=/reset-password");
    await expect(page).toHaveURL(/notice=reset-link-expired/);
  });

  test("admin data is not reachable through the public API prefix", async ({ request }) => {
    const response = await request.get("/api/admin/puzzles");
    expect(response.status()).toBe(404);
  });
});

test.describe("login page", () => {
  test("matches the design elements", async ({ page }, testInfo) => {
    await page.goto("/login");
    await expect(page.getByRole("img", { name: "3-Clue X-Word" })).toBeVisible();
    await expect(page.getByText("Puzzle Administration")).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Remember me")).toBeChecked();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log In" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("login.png"), fullPage: true });
  });

  test("validates the form in plain English", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("john");
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page.getByText("Please enter a valid email address")).toBeVisible();
    await expect(page.getByText("Please enter your password.")).toBeVisible();
  });

  test("shows and hides the password", async ({ page }) => {
    await page.goto("/login");
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("secret words");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("links to the forgot-password flow", async ({ page }, testInfo) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("forgot-password.png"), fullPage: true });
    await page.getByRole("link", { name: "Back to login" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("without a reachable database", () => {
  test.skip(Boolean(adminEmail), "Runs only against the placeholder Supabase URL");

  test("a failed login shows a friendly message, not a crash", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("john@example.com");
    await page.getByLabel("Password", { exact: true }).fill("any password");
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Something went wrong" })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("signed in", () => {
  test.skip(!adminEmail || !adminPassword, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run");

  test("valid login, dashboard, logout", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(adminEmail!);
    await page.getByLabel("Password", { exact: true }).fill(adminPassword!);
    await page.getByRole("button", { name: "Log In" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Total Puzzles")).toBeVisible();

    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole("button", { name: /account menu|John|Ward/i }).first().click();
    await page.getByRole("button", { name: "Log out" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/notice=signed-out/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("invalid password is rejected", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(adminEmail!);
    await page.getByLabel("Password", { exact: true }).fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "don't match" })).toBeVisible();
  });
});

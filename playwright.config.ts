import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * End-to-end tests.
 *
 * Without E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD the app runs against an
 * unreachable Supabase URL, which exercises routing, validation and error
 * handling. Provide real credentials (and a real .env.local) to also run the
 * signed-in tests.
 */
const useRealSupabase = Boolean(process.env.E2E_ADMIN_EMAIL);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  // A real Supabase project is a network round trip away (several calls per
  // login), so allow slower responses when testing against one.
  timeout: useRealSupabase ? 120_000 : 30_000,
  expect: { timeout: useRealSupabase ? 45_000 : 5_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 } } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: useRealSupabase
      ? {}
      : {
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-placeholder-key",
          NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`,
        },
  },
});

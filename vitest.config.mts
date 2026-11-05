import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/support/setup.ts"],
    // PGlite boots a full Postgres in-process; give integration tests room.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

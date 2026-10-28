import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["accounts.spec.ts", "roster-management.spec.ts"],
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:3101",
    headless: true,
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "npm run dev -- --webpack --port 3101",
    url: "http://127.0.0.1:3101/login",
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://accounts-test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_fixture_only",
      NEXT_PUBLIC_DEMO_MODE: "false",
    },
  },
});

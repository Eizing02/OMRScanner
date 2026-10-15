import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "score-integration.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3102",
    headless: true,
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3102",
    url: "http://127.0.0.1:3102/login",
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://accounts-test.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_fixture_only",
      NEXT_PUBLIC_DEMO_MODE: "false",
      SCORE_INTEGRATION_ENABLED: "false",
      MATHQUEST_RECEIVER_VERIFIED: "false",
    },
  },
});

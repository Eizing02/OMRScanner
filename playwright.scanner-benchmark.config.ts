import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "scanner-performance.spec.ts",
  timeout: 120_000,
});

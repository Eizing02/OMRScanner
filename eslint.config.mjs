import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    ".agent/**",
    ".agents/**",
    ".gemini/**",
    "vendor/**",
    ".impeccable/**",
    "public/omr-assets/opencv.js", // Unmodified upstream build, not application source.
  ]),
]);

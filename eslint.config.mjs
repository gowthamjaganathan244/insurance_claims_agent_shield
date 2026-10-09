import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    "work/**",
    "outputs/**",
    ".next/**",
    ".sites-runtime/**",
    ".vite/**",
    ".vinext/**",
    ".wrangler/**",
    "test-results/**",
    "playwright-report/**",
    "docs/reference/**",
  ]),
]);

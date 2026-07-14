import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    ".agents/**",
    ".claude/**",
    ".cursor/**",
    ".gemini/**",
    ".impeccable/**",
    ".vercel/**",
    "**/._*",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scripts/**",
    "tests/**",
    "types/**"
  ])
]);

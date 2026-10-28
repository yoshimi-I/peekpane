import js from "@eslint/js";
import globals from "globals";
export default [
  { ignores: ["assets/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.cjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
  },
];

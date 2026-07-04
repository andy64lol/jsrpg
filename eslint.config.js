import js from "@eslint/js";

export default [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        URL: "readonly",
        Audio: "readonly",
        Image: "readonly",
        Promise: "readonly",
        ArrayBuffer: "readonly",
        Uint8Array: "readonly",
        clearTimeout: "readonly",
        setTimeout: "readonly"
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off"
    }
  }
];

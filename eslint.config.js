import js from "@eslint/js";

export default [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        URL: "readonly",
        Blob: "readonly",
        Audio: "readonly",
        Image: "readonly",
        Promise: "readonly",
        ArrayBuffer: "readonly",
        Uint8Array: "readonly",
        clearTimeout: "readonly",
        setTimeout: "readonly",
        requestAnimationFrame: "readonly",
        HTMLImageElement: "readonly",
        HTMLCanvasElement: "readonly"
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      "eqeqeq": ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
      "curly": ["error", "all"],
      "no-fallthrough": "error"
    }
  }
];

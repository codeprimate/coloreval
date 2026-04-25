import { defineConfig } from "vitest/config";

/** @type {import("vite").UserConfig} */
export default defineConfig({
  root: ".",
  /** Relative asset URLs so `dist/` works from subpaths and from `file://` where the browser allows modules. */
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    setupFiles: ["tests/setup.js"],
  },
});

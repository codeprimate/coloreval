import { defineConfig } from "vitest/config";
import { APP_VERSION } from "./src/version.js";

const BUILD_VERSION_COMMENT = `coloreval v${APP_VERSION}`;

/** @type {import("vite").UserConfig} */
export default defineConfig({
  root: ".",
  /** Relative asset URLs so `dist/` works from subpaths and from `file://` where the browser allows modules. */
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  plugins: [
    {
      name: "version-comment",
      apply: "build",
      transformIndexHtml(html) {
        return html.replace("</head>", `  <!-- ${BUILD_VERSION_COMMENT} -->\n  </head>`);
      },
      generateBundle(_, bundle) {
        for (const item of Object.values(bundle)) {
          if (item.type !== "chunk" || !item.fileName.endsWith(".js")) continue;
          item.code = `/* ${BUILD_VERSION_COMMENT} */\n${item.code}`;
        }
      },
    },
  ],
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    setupFiles: ["tests/setup.js"],
  },
});

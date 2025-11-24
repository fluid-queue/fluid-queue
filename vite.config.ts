/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { version } from "./src/version.js";
import { glob } from "tinyglobby";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { getLicenseFileText } from "generate-license-file";
import path from "node:path";

const extensions = await glob("src/extensions/**.ts");
const buildVersion = version();
const buildTag = "vite";

const banner = `/*! ${buildVersion} (${buildTag}) */`;

const licenseFileText: string = await getLicenseFileText("./package.json");

const footer = `/*! \n${licenseFileText}\n */`;

export default defineConfig({
  build: {
    ssr: true,
    target: "node24",
    minify: true,
    outDir: "./dist",
    sourcemap: "inline",

    rolldownOptions: {
      input: ["./src/index.ts", ...extensions],
      output: {
        chunkFileNames: "shared/[name]-[hash].mjs",
        format: "esm",
        banner,
        footer,

        inlineDynamicImports: true,

        entryFileNames({ exports, name }) {
          if (exports.includes("setup")) {
            return `extensions/${name}.mjs`;
          }
          return `${name}.mjs`;
        },
        legalComments: "inline",
      },
      treeshake: true,
    },
    copyPublicDir: false,
  },
  ssr: {
    external: true,
  },
  define: {
    __build_version: JSON.stringify(buildVersion),
    __build_tag: JSON.stringify(buildTag),
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "./locales",
          dest: ".",
        },
      ],
    }),
  ],
  test: {
    fakeTimers: {
      shouldAdvanceTime: false,
      shouldClearNativeTimers: true,
      ignoreMissingTimers: false,
      loopLimit: Number.MAX_SAFE_INTEGER - 1,
      now: new Date("2022-04-21T00:00:00Z"),
    },
  },
  resolve: {
    alias: {
      "fluid-queue": path.join(__dirname, "src"),
    },
  },
  experimental: {
    // FIXME: otherwise tests do not run
    enableNativePlugin: false,
  },
});

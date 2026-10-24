/// <reference types="vitest/config" />
import { defineConfig, Plugin } from "vite";
import { version } from "./src/version.js";
import { glob } from "tinyglobby";
import ignore from "ignore";
import {
  getLicenseFileText,
  GetLicenseFileTextOptions,
} from "generate-license-file";
import path from "node:path";
import { promises as fsPromises } from "node:fs";
import packageJson from "./package.json" with { type: "json" };

const extensions = await glob("src/extensions/**.ts");
const buildVersion = version();
const buildTag = "vite";
const buildTarget = {
  packageJson: {
    node: ">=24.0.0",
  },
  vite: "node24",
};

const banner = `/*! ${buildVersion} (${buildTag}) */`;

const packageJsonPlugin = (): Plugin => {
  let outputDir = "dist";
  return {
    name: "copy-plugin",
    enforce: "post",
    apply: "build",
    outputOptions(options) {
      outputDir = options.dir ?? "dist";
    },
    async writeBundle() {
      await this.fs.writeFile(
        path.join(outputDir, "package.json"),
        JSON.stringify(
          {
            name: packageJson.name,
            version: packageJson.version,
            description: packageJson.description,
            homepage: packageJson.homepage,
            bugs: packageJson.bugs,
            license: packageJson.license,
            main: "index.mjs",
            type: "module",
            repository: packageJson.repository,
            dependencies: {},
            scripts: {
              run: "node --enable-source-maps ./index.mjs",
            },
            devDependencies: {},
            engines: buildTarget.packageJson,
          },
          null,
          2,
        ),
        {
          encoding: "utf8",
        },
      );
    },
  };
};

const licensePlugin = (options: GetLicenseFileTextOptions): Plugin => {
  let outputDir = "dist";
  return {
    name: "copy-plugin",
    enforce: "post",
    apply: "build",
    outputOptions(options) {
      outputDir = options.dir ?? "dist";
    },
    async writeBundle() {
      const licenseFileText: string = await getLicenseFileText(
        "./package.json",
        options,
      );
      await this.fs.writeFile(
        path.join(outputDir, "COPYING"),
        licenseFileText,
        {
          encoding: "utf8",
        },
      );
    },
  };
};

const copyPlugin = ({
  patterns,
}: {
  patterns: string | readonly string[];
}): Plugin => {
  let outputDir = "dist";
  return {
    name: "copy-plugin",
    enforce: "post",
    apply: "build",
    outputOptions(options) {
      outputDir = options.dir ?? "dist";
    },
    async writeBundle() {
      // use .gitignore to make sure to not distribute any secrets
      const filter = ignore()
        .add(
          await fsPromises.readFile(".gitignore", {
            encoding: "utf8",
          }),
        )
        .createFilter();
      const files = await glob(patterns, {
        followSymbolicLinks: false,
      });
      const dirs: Set<string> = new Set();
      for (const file of files) {
        const parentDir = path.join(outputDir, path.dirname(file));
        if (!dirs.has(parentDir)) {
          // directory might not exist
          try {
            if (!(await fsPromises.stat(parentDir)).isDirectory()) {
              throw new Error(
                `${parentDir} already exists and is not a directory`,
              );
            }
          } catch {
            // directory does not exist
            await this.fs.mkdir(parentDir, {
              recursive: true,
            });
          }
          // checks succeeded
          dirs.add(parentDir);
        }
        if (filter(file)) {
          await this.fs.copyFile(file, path.join(outputDir, file));
        }
      }
    },
  };
};

export default defineConfig({
  publicDir: false,
  server: {
    hmr: false,
  },
  build: {
    ssr: true,
    target: buildTarget.vite,
    minify: true,
    outDir: "./dist",
    sourcemap: "inline",
    rolldownOptions: {
      platform: "node",
      input: ["./src/index.ts", ...extensions],
      output: {
        chunkFileNames: "shared/[name]-[hash].mjs",
        format: "es",
        banner,
        entryFileNames({ exports, name }) {
          if (exports.includes("setup")) {
            return `extensions/${name}.mjs`;
          }
          return `${name}.mjs`;
        },
        comments: {
          legal: true,
          annotation: true,
          jsdoc: false,
        },
      },
      treeshake: true,
    },
  },
  ssr: {
    noExternal: true,
  },
  define: {
    __build_version: JSON.stringify(buildVersion),
    __build_tag: JSON.stringify(buildTag),
    // FIXME: this needs to be set, because node_modules/write-file-atomic/lib/index.js uses this
    //        using an invalid file name to cause errors if other code uses __filename and expects it to work
    __filename: JSON.stringify("\0"),
  },
  plugins: [
    packageJsonPlugin(),
    licensePlugin({
      lineEnding: "lf",
      append: ["./LICENSE"],
    }),
    copyPlugin({
      patterns: [
        "locales/**/*.json",
        "settings/*.example.*",
        "CHANGELOG.md",
        "README.md",
        "SECURITY.md",
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
    server: {
      deps: {
        external: ["parjs", "parjs/combinators"],
      },
    },
  },
  resolve: {
    alias: {
      "fluid-queue": path.join(import.meta.dirname, "src"),
    },
  },
});

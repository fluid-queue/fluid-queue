#!/usr/bin/env -S node --loader @swc-node/register/esm
import * as esbuild from "esbuild";
import { glob } from "glob";
import { version } from "./src/version.js";
import { BuildSettings } from "./src/settings-type.js";

const extensions = await glob("src/extensions/**.ts");
const buildVersion = version();
const buildTag = "esbuild";
const buildSettings: BuildSettings = {
  publicClientId: process.env.PUBLIC_CLIENT_ID,
};

console.log(`Compiling version: ${buildVersion} (${buildTag})`);
console.log(`Compiling extensions: ${extensions.join(", ")}`);

await esbuild.build({
  tsconfig: "tsconfig.json",
  entryPoints: ["src/index.ts"].concat(extensions),
  bundle: true,
  outdir: "build/",
  format: "esm",
  target: "node20.9.0",
  platform: "node",
  banner: {
    js: `
    import { fileURLToPath as topLevelFileURLToPath } from 'url';
    import { createRequire as topLevelCreateRequire } from 'module';
    import path from 'path';
    const require = topLevelCreateRequire(import.meta.url);
    const __filename = topLevelFileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    globalThis.__build_version = ${JSON.stringify(buildVersion)};
    globalThis.__build_tag = ${JSON.stringify(buildTag)};
    globalThis.__build_settings = ${JSON.stringify(buildSettings)};
    `,
  },
  minify: true,
  sourcemap: "linked",
});

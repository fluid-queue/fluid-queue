#!/usr/bin/env node
import * as esbuild from "esbuild";
import { glob } from "glob";

const extensions = await glob("src/extensions/**.ts");

console.log(`Compiling extensions: ${extensions}`);

await esbuild.build({
  entryPoints: ["src/index.ts"].concat(extensions),
  bundle: true,
  outdir: "build/",
  format: "esm",
  target: "node16.14.0",
  platform: "node",
  banner: {
    js: `
    import { fileURLToPath as topLevelFileURLToPath } from 'url';
    import { createRequire as topLevelCreateRequire } from 'module';
    import path from 'path';
    const require = topLevelCreateRequire(import.meta.url);
    const __filename = topLevelFileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    `,
  },
  minify: true,
  sourcemap: true,
});

#!/usr/bin/env -S node --loader @swc-node/register/esm
import fse from "fs-extra";
const { mkdtemp, copySync, mkdirpSync } = fse;
import { rimraf } from "rimraf";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import tar from "tar";

console.log(`Packaging for distribution...`);

const version = process.env.npm_package_version;
if (version == null) {
  throw new Error("Package version undefined.");
}

const srcDir = dirname(fileURLToPath(import.meta.url));

// Set up a temporary directory
mkdtemp(join(tmpdir(), "fluidqueue-"), async (err, directory) => {
  if (err) {
    throw err;
  }

  console.log(
    `Packaging fluid-queue-${version} in directory "${directory}"...`
  );
  const workingName = `fluid-queue-${version}`;
  const working = join(directory, workingName);

  mkdirpSync(working);
  // package.json is necessary
  copySync(join(srcDir, "package.json"), join(working, "package.json"));

  // We probably want the docs
  copySync(join(srcDir, "README.md"), join(working, "README.md"));
  copySync(join(srcDir, "SECURITY.md"), join(working, "SECURITY.md"));
  copySync(join(srcDir, "LICENSE"), join(working, "LICENSE"));

  // We definitely want the build and the locales
  mkdirpSync(join(working, "build"));
  mkdirpSync(join(working, "locales"));
  copySync(join(srcDir, "build"), join(working, "build"));
  copySync(join(srcDir, "locales"), join(working, "locales"));

  // Everything's copied over, now tar it up
  const distDir = join(srcDir, "dist");
  mkdirpSync(distDir);
  await tar.c(
    {
      gzip: true,
      file: join(distDir, `fluid-queue-${version}.tar.gz`),
      cwd: directory,
    },
    [workingName] // We set cwd to the temp directory and pass the relative path so that the final archive paths are correct
  );

  // If we don't throw an error, everything finished successfully
  console.log(`Removing working directory ${directory}`);
  rimraf.sync(directory);

  // Closing messages
  console.log("Remember to sign and hash the tarball before publishing it:");
  console.log(
    `\x1b[1mcd dist && \\\ngpg -u 0x9C1286A6 --armor --output fluid-queue-${version}.tar.gz.asc --detach-sig fluid-queue-${version}.tar.gz && \\\nsha512sum -b * > fluid-queue-${version}.sha512sums && \\\ncd ..\x1b[0m`
  );
});

#!/usr/bin/env -S node --loader @swc-node/register/esm
import fse from "fs-extra";
const { mkdtemp, copySync, mkdirpSync } = fse;
import { rimraf } from "rimraf";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import archiver from "archiver";
import { execFileSync } from "child_process";

console.log(`Packaging for distribution...`);

const version = process.env.npm_package_version;
if (version == null) {
  throw new Error("Package version undefined.");
}

const srcDir = dirname(fileURLToPath(import.meta.url));

// Try to generate attribution.
// This requires `oss-attribution-generator`, which has to be globally installed (it adds 124 packages, including obsolete versions of ones we use).
execFileSync("generate-attribution");

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
  copySync(join(srcDir, "CHANGELOG.md"), join(working, "CHANGELOG.md"));
  copySync(join(srcDir, "SECURITY.md"), join(working, "SECURITY.md"));

  // Also the sample settings files
  mkdirpSync(join(working, "settings"));
  copySync(
    join(srcDir, "settings/settings.example.json"),
    join(working, "settings/settings.example.json")
  );
  copySync(
    join(srcDir, "settings/tokens.example.json"),
    join(working, "settings/tokens.example.json")
  );

  // Copy the license and the attribution
  copySync(join(srcDir, "LICENSE"), join(working, "LICENSE"));
  mkdirpSync(join(working, "oss-attribution"));
  copySync(join(srcDir, "oss-attribution"), join(working, "oss-attribution"));

  // We definitely want the build and the locales
  mkdirpSync(join(working, "build"));
  mkdirpSync(join(working, "locales"));
  copySync(join(srcDir, "build"), join(working, "build"));
  copySync(join(srcDir, "locales"), join(working, "locales"));

  // Everything's copied over, now tar and zip it up
  const distDir = join(srcDir, "dist");
  mkdirpSync(distDir);
  const tarOutput = fse.createWriteStream(
    join(distDir, `fluid-queue-${version}.tar.gz`)
  );
  const zipOutput = fse.createWriteStream(
    join(distDir, `fluid-queue-${version}.zip`)
  );
  const tarArchive = archiver("tar", {
    gzip: true,
  });
  const zipArchive = archiver("zip");

  // Set up error handling
  // @ts-expect-error TS7006 This causes an error with tsc-files, and can't be type annotated because the annotation causes other errors. *This* causes an error in VS Code, but that error can be safely ignored.
  const onErr = (err) => {
    throw err;
  };
  tarArchive.on("warning", onErr);
  zipArchive.on("warning", onErr);
  tarArchive.on("error", onErr);
  zipArchive.on("error", onErr);

  // Create the output files
  tarArchive.pipe(tarOutput);
  zipArchive.pipe(zipOutput);

  // Put the files in
  tarArchive.directory(working, workingName);
  zipArchive.directory(working, workingName);

  // Finalize the archives
  await tarArchive.finalize();
  await zipArchive.finalize();

  // If we don't throw an error, everything finished successfully
  console.log(`Removing working directory ${directory}`);
  rimraf.sync(directory);

  // Closing messages
  console.log("Remember to sign and hash the tarball before publishing it:");
  console.log(
    `\x1b[1mcd dist && \\\ngpg -u 0x9C1286A6 --armor --output fluid-queue-${version}.tar.gz.asc --detach-sig fluid-queue-${version}.tar.gz && \\\ngpg -u 0x9C1286A6 --armor --output fluid-queue-${version}.zip.asc --detach-sig fluid-queue-${version}.zip &&\\\nsha512sum -b * > fluid-queue-${version}.sha512sums && \\\ncd ..\x1b[0m`
  );
});

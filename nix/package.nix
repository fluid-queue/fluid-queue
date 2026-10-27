{
  lib,
  nodejs_26,
  buildNpmPackage,
  makeBinaryWrapper,
  copyDesktopItems,
  makeDesktopItem,
  inkscape,
  imagemagick,
}:
let
  fs = lib.fileset;
  packageJson = builtins.fromJSON (builtins.readFile ./../package.json);
in
buildNpmPackage (finalAttrs: {
  strictDeps = true;
  __structuredAttrs = true;
  nodejs = nodejs_26;
  pname = packageJson.name;
  inherit (packageJson) version;
  npmDepsHash = "sha256-i2kxyrbsDFvooWSHGepD7sZy36VGcJMCHSVXcA6dkSo=";
  nativeBuildInputs = [
    copyDesktopItems
    inkscape
    imagemagick
    makeBinaryWrapper
  ];
  outputs = [
    "out"
    "dist"
  ];
  src = fs.toSource {
    root = ./..;
    fileset = fs.intersection (fs.gitTracked ./..) (
      fs.unions (
        [
          ./../assets/fluid-queue.svg
          ./../locales
          ./../src
          ./../.gitignore
          ./../LICENSE
          ./../package-lock.json
          ./../package.json
          ./../tsconfig.json
          ./../vite.config.ts
        ]
        ++ lib.optionals finalAttrs.doCheck [
          ./../tests
          ./../eslint.config.mjs
          ./../vitest.setup.ts
        ]
      )
    );
  };
  doCheck = true;
  preInstall = ''
    # only package dist
    cp -r ./dist "$dist"
    cd ./dist

    # workaround for non-existent node_modules folder
    mkdir -p "$out/lib/node_modules/fluid-queue/node_modules"
  '';
  dontNpmPrune = true;
  makeWrapperArgs = [
    "--set-default"
    "NODE_OPTIONS"
    "--enable-source-maps"
  ];
  postInstall = ''
    # workaround for non-existent node_modules folder
    rm -rf "$out/lib/node_modules/fluid-queue/node_modules"

    # create icons
    mkdir -p $out/share/icons/hicolor/256x256/apps
    for size in 16 24 32 48 64 128 256 512; do
      mkdir -p "$out"/share/icons/hicolor/"$size"x"$size"/apps
      inkscape ${lib.escapeShellArg finalAttrs.src}/assets/fluid-queue.svg \
        -w "$size" -h "$size" \
        --export-png-use-dithering=false \
        --export-png-antialias=3 \
        --export-png-compression=9 \
        --export-type=png \
        -o "$out"/share/icons/hicolor/"$size"x"$size"/apps/fluid-queue.png
    done
    ln -s "$out"/share/icons/hicolor/512x512/apps/fluid-queue.png "$out/share/icons/fluid-queue.png"
  '';
  checkPhase = ''
    runHook preCheck
    npm run check
    npm run test
    runHook postCheck
  '';
  desktopItems = [
    (makeDesktopItem {
      type = "Application";
      name = "fluid-queue";
      desktopName = "fluid-queue";
      genericName = "Queue System";
      comment = packageJson.description;
      exec = "fluid-queue --desktop";
      icon = "fluid-queue";
      terminal = true;
      categories = [
        "Utility"
      ];
    })
  ];
  meta = {
    mainProgram = "fluid-queue";
  };
})

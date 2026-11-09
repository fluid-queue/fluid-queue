{
  lib,
  stdenv,
  fluid-queue,
  nix-appimage,
  cacert,
}:
nix-appimage.lib.${stdenv.system}.mkAppImage {
  program = lib.getExe (
    fluid-queue.overrideAttrs (oldAttrs: {
      makeWrapperArgs = (oldAttrs.makeWrapperArgs or [ ]) ++ [
        "--set"
        "NODE_EXTRA_CA_CERTS"
        "${cacert}/etc/ssl/certs/ca-no-trust-rules-bundle.crt"
      ];
    })
  );
}

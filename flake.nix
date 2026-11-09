{
  description = "A queue system for Super Mario Maker 2 levels";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    flakelight.url = "github:nix-community/flakelight";
    flakelight.inputs.nixpkgs.follows = "nixpkgs";
    nix-appimage.url = "github:ralismark/nix-appimage";
    nix-appimage.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    { flakelight, ... }@inputs:
    flakelight ./. {
      inherit inputs;
      devShell = pkgs: {
        overrideShell = pkgs.callPackage ./nix/shell.nix { };
      };
      packages = {
        fluid-queue-container = pkgs: pkgs.callPackage ./nix/container.nix { };
        fluid-queue-appimage =
          pkgs: pkgs.callPackage ./nix/appimage.nix { nix-appimage = inputs.nix-appimage; };
        fluid-queue = pkgs: pkgs.default;
      };
    };
}

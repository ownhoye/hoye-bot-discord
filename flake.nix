{
  description = "LoliCord - Everything Discord doesn't build, we create";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };

        lolicordPkg = pkgs.callPackage ./default.nix { };

        # Wraps official Discord binaries with LoliCord desktop patcher
        wrapDiscord = discordPkg: pkgs.runCommand "${discordPkg.name}-lolicord" {
          nativeBuildInputs = [ pkgs.makeWrapper ];
          meta = discordPkg.meta // {
            description = "${discordPkg.meta.description or "Discord"} (with LoliCord mod)";
            mainProgram = discordPkg.meta.mainProgram or "discord";
          };
        } ''
          mkdir -p $out
          cp -rs --no-preserve=mode,ownership ${discordPkg}/* $out/

          for res in $out/opt/*/resources $out/share/*/resources $out/opt/discord*/resources $out/lib/*/resources; do
            if [ -d "$res" ]; then
              rm -rf "$res/app"
              mkdir -p "$res/app"
              cat << 'EOF' > "$res/app/package.json"
{
  "name": "discord",
  "main": "index.js"
}
EOF
              echo 'require("${lolicordPkg}/share/lolicord/patcher.js");' > "$res/app/index.js"
            fi
          done
        '';
      in rec {
        packages = {
          # The core LoliCord compiled desktop JS/CSS files
          lolicord = lolicordPkg;

          # Pre-wrapped Discord clients
          discord-lolicord = wrapDiscord pkgs.discord;
          discord-ptb-lolicord = wrapDiscord pkgs.discord-ptb;
          discord-canary-lolicord = wrapDiscord pkgs.discord-canary;

          # Default runnable package
          default = packages.discord-lolicord;
        };

        apps = rec {
          default = discord;
          discord = flake-utils.lib.mkApp {
            drv = packages.discord-lolicord;
          };
          discord-ptb = flake-utils.lib.mkApp {
            drv = packages.discord-ptb-lolicord;
          };
          discord-canary = flake-utils.lib.mkApp {
            drv = packages.discord-canary-lolicord;
          };
        };
      }
    ) // {
      overlays.default = final: prev: {
        lolicord = final.callPackage ./default.nix { };

        discord-lolicord = final.runCommand "discord-lolicord" {
          nativeBuildInputs = [ final.makeWrapper ];
        } ''
          mkdir -p $out
          cp -rs --no-preserve=mode,ownership ${final.discord}/* $out/
          for res in $out/opt/*/resources $out/share/*/resources $out/opt/discord*/resources $out/lib/*/resources; do
            if [ -d "$res" ]; then
              rm -rf "$res/app"
              mkdir -p "$res/app"
              echo '{"name":"discord","main":"index.js"}' > "$res/app/package.json"
              echo 'require("${final.lolicord}/share/lolicord/patcher.js");' > "$res/app/index.js"
            fi
          done
        '';

        # Default discord package override
        discord = final.discord-lolicord;
      };

      nixosModules.default = { config, lib, pkgs, ... }:
        let
          cfg = config.programs.lolicord;
        in {
          options.programs.lolicord = {
            enable = lib.mkEnableOption "LoliCord Discord client mod";
            channel = lib.mkOption {
              type = lib.types.enum [ "stable" "ptb" "canary" ];
              default = "stable";
              description = "The Discord release channel to use with LoliCord.";
            };
            package = lib.mkOption {
              type = lib.types.package;
              default =
                if cfg.channel == "canary" then self.packages.${pkgs.system}.discord-canary-lolicord
                else if cfg.channel == "ptb" then self.packages.${pkgs.system}.discord-ptb-lolicord
                else self.packages.${pkgs.system}.discord-lolicord;
              description = "The LoliCord-wrapped Discord package to install.";
            };
          };

          config = lib.mkIf cfg.enable {
            environment.systemPackages = [ cfg.package ];
          };
        };

      homeManagerModules.default = { config, lib, pkgs, ... }:
        let
          cfg = config.programs.lolicord;
        in {
          options.programs.lolicord = {
            enable = lib.mkEnableOption "LoliCord Discord client mod";
            channel = lib.mkOption {
              type = lib.types.enum [ "stable" "ptb" "canary" ];
              default = "stable";
              description = "The Discord release channel to use with LoliCord.";
            };
            package = lib.mkOption {
              type = lib.types.package;
              default =
                if cfg.channel == "canary" then self.packages.${pkgs.system}.discord-canary-lolicord
                else if cfg.channel == "ptb" then self.packages.${pkgs.system}.discord-ptb-lolicord
                else self.packages.${pkgs.system}.discord-lolicord;
              description = "The LoliCord-wrapped Discord package to install.";
            };
          };

          config = lib.mkIf cfg.enable {
            home.packages = [ cfg.package ];
          };
        };
    };
}

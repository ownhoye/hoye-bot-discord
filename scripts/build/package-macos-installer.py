#!/usr/bin/env python3
"""
LoliCord macOS Installer Packager
Packages LoliCord Installer.app into LoliCord-darwin-arm64.zip and LoliCord-darwin-x64.zip
with correct Unix permissions for macOS.
"""

import os
import shutil
import zipfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
INSTALLER_OUT = ROOT_DIR / "release" / "installer"
ASSETS_DIR = ROOT_DIR / "installer-src" / "assets"
ICON_PATH = ASSETS_DIR / "icon.icns"
DIST_ZIP = INSTALLER_OUT / "lolicord-dist.zip"

INSTALLER_SCRIPT = """#!/usr/bin/env bash
#
# LoliCord Installer for macOS
# Copyright (c) 2026 Vendicated and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
#

set -e

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
RESOURCES_DIR="$APP_DIR/Contents/Resources"
GITEA_API="https://api.github.com/repos/ownhoye/hoye-bot-discord"
FALLBACK_URL="https://raw.githubusercontent.com/ownhoye/hoye-bot-discord/main/dist"

IS_GUI=1
if [ -t 0 ]; then
    IS_GUI=0
fi

find_discords() {
    local candidates=(
        "Discord (Stable):/Applications/Discord.app/Contents/Resources"
        "Discord Canary:/Applications/Discord Canary.app/Contents/Resources"
        "Discord PTB:/Applications/Discord PTB.app/Contents/Resources"
        "Discord Development:/Applications/Discord Development.app/Contents/Resources"
        "User Discord:$HOME/Applications/Discord.app/Contents/Resources"
        "User Discord Canary:$HOME/Applications/Discord Canary.app/Contents/Resources"
    )

    FOUND_NAMES=()
    FOUND_PATHS=()

    for item in "${candidates[@]}"; do
        IFS=":" read -r name path <<< "$item"
        if [ -d "$path" ]; then
            FOUND_NAMES+=("$name")
            FOUND_PATHS+=("$path")
        fi
    done
}

download_lolicord() {
    local work_dir="$1"
    mkdir -p "$work_dir/extracted"

    if [ -f "$RESOURCES_DIR/lolicord-dist.zip" ]; then
        unzip -q -o "$RESOURCES_DIR/lolicord-dist.zip" -d "$work_dir/extracted"
        return 0
    fi

    local tag
    tag="$(curl -sSL "$GITEA_API/releases/latest" 2>/dev/null | grep -o '"tag_name": *"[^"]*"' | cut -d'"' -f4 || echo "latest")"
    if [ -z "$tag" ]; then tag="latest"; fi

    local dl_url="https://github.com/ownhoye/hoye-bot-discord/releases/download/$tag"

    if curl -sSL "$dl_url/lolicord-dist.zip" -o "$work_dir/lolicord-dist.zip" 2>/dev/null && [ -s "$work_dir/lolicord-dist.zip" ]; then
        unzip -q -o "$work_dir/lolicord-dist.zip" -d "$work_dir/extracted"
    elif curl -sSL "$dl_url/lolicordDesktop.asar" -o "$work_dir/lolicordDesktop.asar" 2>/dev/null && [ -s "$work_dir/lolicordDesktop.asar" ]; then
        cp "$work_dir/lolicordDesktop.asar" "$work_dir/extracted/lolicordDesktop.asar"
    else
        mkdir -p "$work_dir/extracted"
        curl -sSL "$FALLBACK_URL/desktop/patcher.js" -o "$work_dir/extracted/patcher.js"
        curl -sSL "$FALLBACK_URL/desktop/preload.js" -o "$work_dir/extracted/preload.js"
        curl -sSL "$FALLBACK_URL/desktop/renderer.js" -o "$work_dir/extracted/renderer.js"
        curl -sSL "$FALLBACK_URL/desktop/renderer.css" -o "$work_dir/extracted/renderer.css"
    fi
}

inject_into() {
    local resources_path="$1"
    local app_dir="$resources_path/app"

    mkdir -p "$app_dir"

    for mod in vencord.asar equicord.asar betterdiscord.asar; do
        if [ -f "$resources_path/$mod" ]; then
            rm -f "$resources_path/$mod"
        fi
    done

    if [ -f "$TMP_DIR/extracted/lolicordDesktop.asar" ]; then
        cp "$TMP_DIR/extracted/lolicordDesktop.asar" "$app_dir/lolicordDesktop.asar"
        cat << 'EOF' > "$app_dir/index.js"
/* LoliCord Loader */
require("./lolicordDesktop.asar");
EOF
    elif [ -f "$TMP_DIR/extracted/patcher.js" ]; then
        cp -r "$TMP_DIR/extracted/"* "$app_dir/"
        cat << 'EOF' > "$app_dir/index.js"
/* LoliCord Loader */
require("./patcher.js");
EOF
    fi

    cat << 'EOF' > "$app_dir/package.json"
{
  "name": "discord",
  "main": "index.js"
}
EOF
}

uninject_from() {
    local resources_path="$1"
    local app_dir="$resources_path/app"
    if [ -d "$app_dir" ]; then
        rm -rf "$app_dir"
    fi
}

gui_flow() {
    local action
    action="$(osascript << 'EOF'
tell application "System Events"
    activate
    set theResp to button returned of (display dialog "Welcome to the LoliCord Installer for macOS.\n\nLoliCord brings plugins, themes, and enhanced functionality to your Discord client.\n\nChoose an action to proceed:" with title "LoliCord Installer" buttons {"Uninstall", "Cancel", "Install"} default button "Install")
end tell
return theResp
EOF
)"

    if [ "$action" = "Cancel" ] || [ -z "$action" ]; then
        exit 0
    fi

    find_discords

    if [ ${#FOUND_PATHS[@]} -eq 0 ]; then
        osascript << 'EOF'
tell application "System Events"
    activate
    display alert "Discord not found" message "No Discord installation was found in /Applications or ~/Applications.\n\nPlease install Discord from https://discord.com first." as critical buttons {"OK"} default button "OK"
end tell
EOF
        exit 1
    fi

    if [ "$action" = "Uninstall" ]; then
        for path in "${FOUND_PATHS[@]}"; do
            uninject_from "$path"
        done
        osascript << 'EOF'
tell application "System Events"
    activate
    display dialog "LoliCord has been uninstalled successfully from your Discord installation(s)." with title "LoliCord Installer" buttons {"OK"} default button "OK"
end tell
EOF
        exit 0
    fi

    local target_paths=()
    if [ ${#FOUND_PATHS[@]} -gt 1 ]; then
        local menu_items=""
        for name in "${FOUND_NAMES[@]}"; do
            if [ -n "$menu_items" ]; then menu_items="$menu_items, "; fi
            menu_items="$menu_items\"$name\""
        done
        menu_items="$menu_items, \"All Installations\""

        local chosen
        chosen="$(osascript << EOF
tell application "System Events"
    activate
    set selected to choose from list {$menu_items} with title "LoliCord Installer" with prompt "Select the Discord client to patch:" default items {"${FOUND_NAMES[0]}"} without multiple selections allowed and empty selection allowed
end tell
if selected is false then
    return "CANCEL"
else
    return item 1 of selected
end if
EOF
)"
        if [ "$chosen" = "CANCEL" ] || [ -z "$chosen" ]; then
            exit 0
        fi

        if [ "$chosen" = "All Installations" ]; then
            target_paths=("${FOUND_PATHS[@]}")
        else
            for i in "${!FOUND_NAMES[@]}"; do
                if [ "${FOUND_NAMES[$i]}" = "$chosen" ]; then
                    target_paths+=("${FOUND_PATHS[$i]}")
                    break
                fi
            done
        fi
    else
        target_paths+=("${FOUND_PATHS[0]}")
    fi

    if pgrep -x "Discord" >/dev/null || pgrep -f "Discord.app/Contents/MacOS/Discord" >/dev/null; then
        local kill_choice
        kill_choice="$(osascript << 'EOF'
tell application "System Events"
    activate
    set theResp to button returned of (display dialog "Discord is currently running.\n\nIt needs to be closed to apply LoliCord modifications." with title "LoliCord Installer" buttons {"Cancel", "Close Discord"} default button "Close Discord")
end tell
return theResp
EOF
)"
        if [ "$kill_choice" = "Close Discord" ]; then
            killall "Discord" 2>/dev/null || true
            killall "Discord Canary" 2>/dev/null || true
            killall "Discord PTB" 2>/dev/null || true
            sleep 1
        else
            exit 0
        fi
    fi

    TMP_DIR="$(mktemp -d /tmp/lolicord-install-XXXXXX)"
    trap 'rm -rf "$TMP_DIR"' EXIT

    download_lolicord "$TMP_DIR"

    for tp in "${target_paths[@]}"; do
        inject_into "$tp"
    done

    local finish_btn
    finish_btn="$(osascript << 'EOF'
tell application "System Events"
    activate
    set theResp to button returned of (display dialog "LoliCord has been installed successfully!\n\nWould you like to open Discord now?" with title "LoliCord Installer" buttons {"Later", "Open Discord"} default button "Open Discord")
end tell
return theResp
EOF
)"

    if [ "$finish_btn" = "Open Discord" ]; then
        open -a "Discord" 2>/dev/null || open -a "Discord Canary" 2>/dev/null || open -a "Discord PTB" 2>/dev/null || true
    fi
}

cli_flow() {
    echo "======================================================"
    echo "            LOLICORD INSTALLER FOR MACOS             "
    echo "======================================================"
    echo ""

    find_discords

    if [ ${#FOUND_PATHS[@]} -eq 0 ]; then
        echo "Error: No Discord installation found on your Mac."
        echo "Please install Discord first from https://discord.com"
        exit 1
    fi

    echo "Found Discord installations:"
    for i in "${!FOUND_NAMES[@]}"; do
        echo "  [$((i+1))] ${FOUND_NAMES[$i]} (${FOUND_PATHS[$i]})"
    done
    if [ ${#FOUND_PATHS[@]} -gt 1 ]; then
        echo "  [$(( ${#FOUND_PATHS[@]} + 1 ))] All installations"
    fi
    echo "  [u] Uninstall LoliCord"
    echo ""
    read -r -p "Your choice: " CHOICE < /dev/tty || CHOICE="1"

    if [ "$CHOICE" = "u" ] || [ "$CHOICE" = "U" ]; then
        for path in "${FOUND_PATHS[@]}"; do
            uninject_from "$path"
            echo "Uninstalled LoliCord from $path"
        done
        echo "LoliCord has been uninstalled."
        exit 0
    fi

    TMP_DIR="$(mktemp -d /tmp/lolicord-install-XXXXXX)"
    trap 'rm -rf "$TMP_DIR"' EXIT

    echo "Downloading LoliCord bundle..."
    download_lolicord "$TMP_DIR"

    local max_idx=$(( ${#FOUND_PATHS[@]} + 1 ))
    if [ "$CHOICE" -eq "$max_idx" ]; then
        for p in "${FOUND_PATHS[@]}"; do
            inject_into "$p"
            echo "Injected into $p"
        done
    else
        local sel_idx=$((CHOICE - 1))
        inject_into "${FOUND_PATHS[$sel_idx]}"
        echo "Injected into ${FOUND_PATHS[$sel_idx]}"
    fi

    echo ""
    echo "LoliCord successfully installed on macOS!"
    echo "Restart Discord to activate LoliCord."
}

if [ "$IS_GUI" -eq 1 ]; then
    gui_flow
else
    cli_flow
fi
"""

INFO_PLIST = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>LoliCord Installer</string>
    <key>CFBundleDisplayName</key>
    <string>LoliCord Installer</string>
    <key>CFBundleIdentifier</key>
    <string>app.lolicord.installer</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>CFBundleExecutable</key>
    <string>LoliCord Installer</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.10</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
"""

def create_mac_zip(zip_path: Path):
    INSTALLER_OUT.mkdir(parents=True, exist_ok=True)
    
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # Directories
        dirs = [
            "LoliCord Installer.app/",
            "LoliCord Installer.app/Contents/",
            "LoliCord Installer.app/Contents/MacOS/",
            "LoliCord Installer.app/Contents/Resources/",
        ]
        for d in dirs:
            zi = zipfile.ZipInfo(d)
            zi.create_system = 3  # Unix
            zi.external_attr = 0o40755 << 16  # drwxr-xr-x
            zf.writestr(zi, "")

        # Info.plist
        plist_info = zipfile.ZipInfo("LoliCord Installer.app/Contents/Info.plist")
        plist_info.create_system = 3
        plist_info.external_attr = 0o100644 << 16  # -rw-r--r--
        zf.writestr(plist_info, INFO_PLIST.encode("utf-8"))

        # Executable bash script (LF newlines!)
        exec_script = INSTALLER_SCRIPT.replace("\r\n", "\n").encode("utf-8")
        exec_info = zipfile.ZipInfo("LoliCord Installer.app/Contents/MacOS/LoliCord Installer")
        exec_info.create_system = 3
        exec_info.external_attr = 0o100755 << 16  # -rwxr-xr-x (CRITICAL FOR MACOS)
        zf.writestr(exec_info, exec_script)

        # Icon
        if ICON_PATH.exists():
            icon_data = ICON_PATH.read_bytes()
            icon_info = zipfile.ZipInfo("LoliCord Installer.app/Contents/Resources/icon.icns")
            icon_info.create_system = 3
            icon_info.external_attr = 0o100644 << 16
            zf.writestr(icon_info, icon_data)

        # Optional bundled dist for offline install
        if DIST_ZIP.exists():
            dist_data = DIST_ZIP.read_bytes()
            dist_info = zipfile.ZipInfo("LoliCord Installer.app/Contents/Resources/lolicord-dist.zip")
            dist_info.create_system = 3
            dist_info.external_attr = 0o100644 << 16
            zf.writestr(dist_info, dist_data)

    print(f"Created {zip_path.name} ({zip_path.stat().st_size / (1024*1024):.2f} MB)")

def main():
    print("Packaging native LoliCord macOS Installers...")
    for arch in ["arm64", "x64"]:
        out_zip = INSTALLER_OUT / f"LoliCord-darwin-{arch}.zip"
        create_mac_zip(out_zip)
    print("LoliCord macOS Installers packaged successfully!")

if __name__ == "__main__":
    main()

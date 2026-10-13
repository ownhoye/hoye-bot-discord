/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { onceDefined } from "@shared/onceDefined";
import electron, { app, BrowserWindowConstructorOptions, Menu, session } from "electron";
import { existsSync as fsExistsSync, statSync as fsStatSync } from "original-fs";
import { dirname, join } from "path";

import { makeLinksOpenExternally } from "./utils/externalLinks";
import { RendererSettings } from "./settings";
import { patchTrayMenu } from "./trayMenu";
import { applyPendingUpdateOnStartup } from "./updater/pendingUpdate";
import { IS_VANILLA } from "./utils/constants";

console.log("[LoliCord] Starting up...");

// Our injector file inside app.asar / app/index.js
const injectorPath = require.main!.filename;

// The original app.asar (discord_app.asar is immune to Squirrel cleaner, _app.asar fallback)
const _primaryAsar = join(dirname(injectorPath), "..", "discord_app.asar");
const _secondaryAsar = join(dirname(injectorPath), "..", "_app.asar");
const _resourcesPrimary = join(process.resourcesPath, "discord_app.asar");
const _resourcesSecondary = join(process.resourcesPath, "_app.asar");

const asarPath = (fsExistsSync(_primaryAsar) && !fsStatSync(_primaryAsar).isDirectory())
    ? _primaryAsar
    : (fsExistsSync(_secondaryAsar) && !fsStatSync(_secondaryAsar).isDirectory())
        ? _secondaryAsar
        : (fsExistsSync(_resourcesPrimary) && !fsStatSync(_resourcesPrimary).isDirectory())
            ? _resourcesPrimary
            : _resourcesSecondary;

const discordPkg = require(join(asarPath, "package.json"));
require.main!.filename = join(asarPath, discordPkg.main);
if (IS_VESKTOP || IS_EQUIBOP) require.main!.filename = join(dirname(injectorPath), "..", "..", "package.json");

// @ts-expect-error Untyped method
app.setAppPath(asarPath);

// Apply any staged LoliCord updates AFTER the asar path is resolved and set,
// so that copying new files cannot corrupt the currently-loading module chain.
applyPendingUpdateOnStartup();

if (!IS_VANILLA) {
    const settings = RendererSettings.store;

    patchTrayMenu();

    /*
     * re-apply the patch when discord ships a new host version. skipped
     * on vesktop and equibop because they manage their own updates.
     */
    if (!IS_VESKTOP && !IS_EQUIBOP) {
        try {
            require("./hostUpdateHook").installHostUpdateHook();
        } catch (err) {
            console.error("[LoliCord] Failed to install host update hook", err);
        }
    }

    // Repatch after host updates on Windows and Linux
    if (process.platform === "win32" || process.platform === "linux") {
        require("./persistAfterDiscordUpdates");
    }

    if (process.platform === "win32" && settings.winCtrlQ) {
        const originalBuild = Menu.buildFromTemplate;
        Menu.buildFromTemplate = function (template) {
            if (template[0]?.label === "&File") {
                const { submenu } = template[0];
                if (Array.isArray(submenu)) {
                    submenu.push({
                        label: "Quit (Hidden)",
                        visible: false,
                        acceleratorWorksWhenHidden: true,
                        accelerator: "Control+Q",
                        click: () => app.quit()
                    });
                }
            }
            return originalBuild.call(this, template);
        };
    }

    class BrowserWindow extends electron.BrowserWindow {
        constructor(options: BrowserWindowConstructorOptions) {
            if (!options?.webPreferences?.preload || !options.title) {
                super(options);
                return;
            }

            const original = options.webPreferences.preload;
            const isMainWindow = options.title === "Discord";

            if (!isMainWindow) {
                super(options);
                return;
            }

            options.webPreferences.preload = join(__dirname, "preload.js");
            options.webPreferences.sandbox = false;
            options.webPreferences.backgroundThrottling = false;

            if (settings.mainWindowFrameless && isMainWindow) {
                options.frame = false;
            } else if (settings.frameless) {
                options.frame = false;
            } else if (process.platform === "win32" && settings.winNativeTitleBar) {
                delete options.frame;
            }

            if (settings.disableMinSize) {
                options.minWidth = 0;
                options.minHeight = 0;
            }

            if (settings.transparent) {
                options.transparent = true;
                options.backgroundColor = "#00000000";
            }
            if (process.platform === "darwin" && settings.macosVibrancyStyle) {
                options.vibrancy = settings.macosVibrancyStyle;
                options.backgroundColor = "#00000000";
            }
            if (process.platform === "win32" && settings.windowMaterial && settings.windowMaterial !== "none") {
                options.backgroundMaterial = settings.windowMaterial as any;
                options.backgroundColor = "#00000000";
            }

            process.env.DISCORD_PRELOAD = original;

            super(options);

            if (isMainWindow) {
                makeLinksOpenExternally(this);
            }

            if (settings.streamProof) {
                try {
                    this.setContentProtection(true);
                } catch (e) {
                    console.error("Failed to set content protection on startup:", e);
                }
            }

            if (settings.disableMinSize) {
                this.setMinimumSize = (_width: number, _height: number) => { };
            }
        }
    }
    Object.assign(BrowserWindow, electron.BrowserWindow);
    Object.defineProperty(BrowserWindow, "name", { value: "BrowserWindow", configurable: true });

    const electronPath = require.resolve("electron");
    delete require.cache[electronPath]!.exports;
    require.cache[electronPath]!.exports = {
        ...electron,
        BrowserWindow
    };

    onceDefined(global, "appSettings", s => {
        s.set("DANGEROUS_ENABLE_DEVTOOLS_ONLY_ENABLE_IF_YOU_KNOW_WHAT_YOURE_DOING", true);
    });

    process.env.DATA_DIR = join(app.getPath("userData"), "..", "LoliCord");

    // Auto-recover session data if it was accidentally redirected to app/Data
    try {
        const strayDataDir = join(process.resourcesPath, "..", "Data");
        const straySession = join(strayDataDir, "sessionData");
        const officialUserData = app.getPath("userData");
        if (fsExistsSync(straySession) && officialUserData) {
            const { cpSync, rmSync } = require("fs");
            for (const item of ["Local Storage", "IndexedDB", "Network", "Preferences"]) {
                const src = join(straySession, item);
                const dst = join(officialUserData, item);
                if (fsExistsSync(src)) {
                    try {
                        cpSync(src, dst, { recursive: true, force: true });
                    } catch { }
                }
            }
            try {
                rmSync(strayDataDir, { recursive: true, force: true });
            } catch { }
            console.log("[LoliCord] Restored session data to official userData directory");
        }
    } catch (e) {
        console.error("[LoliCord] Session migration failed:", e);
    }
} else {
    console.log("[LoliCord] Running in vanilla mode. Not loading LoliCord");
}

console.log("[LoliCord] Loading original Discord app.asar");
require(require.main!.filename);

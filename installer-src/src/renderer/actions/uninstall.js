/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {progress, status} from "../stores/installation";
import {promises as fs} from "fs";
import path from "path";
import {killDiscord, startDiscord} from "./utils/kill";
import {log, lognewline} from "./utils/log";

const DELETE_SHIM_PROGRESS = 85;
const RESTART_DISCORD_PROGRESS = 100;

const safeExists = async (p) => {
    try { await fs.access(p); return true; } catch { return false; }
};

const safeStat = async (p) => {
    try { return await fs.stat(p); } catch { return null; }
};

const safeDelete = async (p) => {
    try {
        await fs.rm(p, { recursive: true, force: true });
    } catch {
        try { await fs.unlink(p); } catch {}
    }
};

async function shouldAutoRestart() {
    try {
        const prefsPath = path.join(process.env.APPDATA, "LoliCord", "settings", "installer-prefs.json");
        const raw = JSON.parse(await fs.readFile(prefsPath, "utf-8"));
        return raw.autoRestart !== false;
    } catch { return true; }
}

async function safeMoveOrCopy(src, dest) {
    if (await safeExists(dest)) await safeDelete(dest);
    for (let i = 0; i < 10; i++) {
        try {
            await fs.rename(src, dest);
            return true;
        } catch (err) {
            try {
                await fs.copyFile(src, dest);
                await safeDelete(src);
                return true;
            } catch (_) {}
            await new Promise(r => setTimeout(r, 300));
        }
    }
    return false;
}

async function deleteShims(paths) {
    process.noAsar = true;
    const progressPerLoop = (DELETE_SHIM_PROGRESS - progress.value) / paths.length;
    for (const resPath of paths) {
        log(`Removing LoliCord from: ${resPath}`);
        try {
            const appDir = path.join(resPath, "app");
            const backup = path.join(resPath, "_app.asar");
            const appAsar = path.join(resPath, "app.asar");

            log("Closing Discord...");
            await killDiscord(resPath, log);

            log("1. Removing injected loader...");
            if (await safeExists(appDir)) {
                try { await fs.rm(appDir, { recursive: true, force: true }); } catch {}
            }

            log("2. Restoring original Discord files...");
            if (await safeExists(backup)) {
                if (await safeExists(appAsar)) {
                    try { await safeDelete(appAsar); } catch {}
                }
                await safeMoveOrCopy(backup, appAsar);
            }

            log("3. Cleaning up assets...");
            const appBase = path.dirname(resPath);
            
            const buildInfoPath = path.join(resPath, "build_info.json");
            if (await safeExists(buildInfoPath)) {
                try {
                    let json = await fs.readFile(buildInfoPath, "utf-8");
                    if (json.includes('"localModulesRoot"')) {
                        json = json.replace(/,\s*"localModulesRoot"\s*:\s*"modules"\s*/, "");
                        await fs.writeFile(buildInfoPath, json);
                    }
                } catch {}
            }

            const filesToClean = ["node.exe", "yt-dlp.exe", "ffmpeg.exe"];
            for (const f of filesToClean) {
                await safeDelete(path.join(appBase, f));
            }

            const dirsToClean = ["mac", "multi-instance-icons", "ghost-server"];
            for (const dir of dirsToClean) {
                const p = path.join(appBase, dir);
                if (await safeExists(p)) {
                    try { await fs.rm(p, { recursive: true, force: true }); } catch {}
                }
            }

            if (await shouldAutoRestart()) {
                log("4. Restarting Discord...");
                startDiscord(resPath);
            } else {
                log("4. Skipping Discord restart (disabled in options).");
            }

            log("[Success] Uninstallation successful!");
            progress.set(progress.value + progressPerLoop);
        } catch (err) {
            log(`[Error] Could not remove LoliCord from ${resPath}`);
            log(`[Error] ${err.message}`);
            return err;
        }
    }
}

export default async function(paths) {
    try {
        log("Starting Uninstall...");
        lognewline("Deleting LoliCord loader and restoring files...");
        
        const err = await deleteShims(Object.values(paths));
        if (err) return false;

        progress.set(RESTART_DISCORD_PROGRESS);
        lognewline("Uninstall complete!");
        return true;
    } catch (err) {
        lognewline("[Error] Uninstallation failed");
        log(`[Error] ${err.message}`);
        return false;
    }
}

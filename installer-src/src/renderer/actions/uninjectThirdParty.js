/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {progress, status} from "../stores/installation";
import {promises as fs} from "fs";
import path from "path";
import {execSync} from "child_process";
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

const safeRemove = async (p) => {
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

async function isLoaderAsar(appAsarPath, stat) {
    if (!stat) return false;
    if (stat.isDirectory()) return true;
    if (stat.size < 1000000) return true;

    try {
        const fd = await fs.open(appAsarPath, "r");
        const buf = Buffer.alloc(Math.min(stat.size, 16384));
        await fd.read(buf, 0, buf.length, 0);
        await fd.close();
        const content = buf.toString("utf-8").toLowerCase();
        if (
            content.includes("equicord") ||
            content.includes("vencord") ||
            content.includes("lolicord") ||
            content.includes("openasar") ||
            (content.includes("require(") && content.includes("package.json"))
        ) {
            return true;
        }
    } catch {}

    return false;
}

async function safeRestoreAsar(src, dest) {
    if (await safeExists(dest)) {
        const tmp = `${dest}.old.${Date.now()}`;
        try {
            await fs.rename(dest, tmp);
            await safeRemove(tmp);
        } catch {
            await safeRemove(dest);
        }
    }

    for (let i = 0; i < 10; i++) {
        try {
            await fs.rename(src, dest);
            return true;
        } catch (_) {
            try {
                await fs.copyFile(src, dest);
                await safeRemove(src);
                return true;
            } catch (_) {}
            await new Promise(r => setTimeout(r, 250));
        }
    }

    return false;
}

async function recoverFromNupkg(resPath, targetAppAsar) {
    try {
        const localAppData = process.env.LOCALAPPDATA || "";
        const appVersionDir = path.dirname(resPath);
        const channelDir = path.dirname(appVersionDir);
        const packagesDir = path.join(channelDir, "packages");

        if (!(await safeExists(packagesDir))) return false;

        const files = await fs.readdir(packagesDir).catch(() => []);
        const nupkgs = files.filter(f => f.endsWith(".nupkg") && f.includes("-full"));
        if (!nupkgs.length) {
            nupkgs.push(...files.filter(f => f.endsWith(".nupkg")));
        }

        for (const pkg of nupkgs) {
            const pkgPath = path.join(packagesDir, pkg);
            const tempDir = path.join(localAppData, "Temp", `discord_nupkg_${Date.now()}`);
            try {
                await fs.mkdir(tempDir, { recursive: true });
                const normPkg = pkgPath.replace(/\\/g, "/");
                const normTemp = tempDir.replace(/\\/g, "/");

                execSync(`tar -xf "${normPkg}" -C "${normTemp}" lib/net45/resources/app.asar`, { stdio: "ignore" });

                const extracted = path.join(tempDir, "lib", "net45", "resources", "app.asar");
                const stat = await safeStat(extracted);
                if (stat && stat.size > 1000000) {
                    if (await safeExists(targetAppAsar)) {
                        await safeRemove(targetAppAsar);
                    }
                    await fs.copyFile(extracted, targetAppAsar);
                    await safeRemove(tempDir);
                    return true;
                }
            } catch (_) {}
            try { await safeRemove(tempDir); } catch (_) {}
        }
    } catch (_) {}

    return false;
}

async function cleanModulePatches(resPath) {
    try {
        const appBase = path.dirname(resPath);
        const modulesSearchPaths = [
            path.join(appBase, "modules"),
            path.join(resPath, "modules")
        ];

        for (const modulesDir of modulesSearchPaths) {
            if (!(await safeExists(modulesDir))) continue;

            const entries = await fs.readdir(modulesDir).catch(() => []);
            for (const entry of entries) {
                if (!entry.startsWith("discord_desktop_core")) continue;
                const corePath = path.join(modulesDir, entry, "discord_desktop_core");
                if (!(await safeExists(corePath))) continue;

                const patchedFiles = [
                    path.join(corePath, "index.js"),
                    path.join(corePath, "app", "app_bootstrap", "splashScreen.js"),
                    path.join(corePath, "app", "app_bootstrap", "index.js")
                ];

                for (const pf of patchedFiles) {
                    if (!(await safeExists(pf))) continue;
                    const content = await fs.readFile(pf, "utf-8").catch(() => "");
                    const isPatched = content.toLowerCase().includes("vencord") ||
                                      content.toLowerCase().includes("equicord") ||
                                      content.includes("equilotl");
                    if (!isPatched) continue;

                    const backupExts = [".orig", ".bak", ".vanilla"];
                    let restored = false;
                    for (const ext of backupExts) {
                        const bk = pf + ext;
                        if (await safeExists(bk)) {
                            await fs.copyFile(bk, pf);
                            await safeRemove(bk);
                            restored = true;
                            break;
                        }
                    }
                    if (!restored) {
                        try {
                            const cleaned = content.replace(/require\(["'][^"']*(?:vencord|equicord|lolicord)[^"']*["']\);?/gi, "");
                            await fs.writeFile(pf, cleaned, "utf-8");
                        } catch {}
                    }
                }

                const innerAppDir = path.join(corePath, "app");
                if (await safeExists(innerAppDir)) {
                    const innerPkg = path.join(innerAppDir, "package.json");
                    if (await safeExists(innerPkg)) {
                        const pkgContent = await fs.readFile(innerPkg, "utf-8").catch(() => "");
                        if (pkgContent.toLowerCase().includes("vencord") || pkgContent.toLowerCase().includes("equicord") || pkgContent.toLowerCase().includes("openasar")) {
                            try { await safeRemove(innerAppDir); } catch {}
                        }
                    }
                }
            }
        }
    } catch (e) {
        log(`Notice while cleaning module patches: ${e.message}`);
    }
}

async function cleanAppDataMods() {
    const appData = process.env.APPDATA || "";
    if (!appData) return;

    const filesToClean = [
        path.join(appData, "Equicord", "equicord.asar"),
        path.join(appData, "EquicordData", "equicord.asar"),
        path.join(appData, "Vencord", "vencord.asar"),
        path.join(appData, "Vencord", "dist", "vencord.asar")
    ];

    for (const f of filesToClean) {
        if (await safeExists(f)) {
            log(`Cleaning client mod payload: ${f}`);
            await safeRemove(f);
        }
    }
}

async function unpatchSingleResources(resPath) {
    const appDir = path.join(resPath, "app");
    const appAsar = path.join(resPath, "app.asar");
    const backupAsar = path.join(resPath, "_app.asar");
    const discordAppAsar = path.join(resPath, "discord_app.asar");

    // 1. Remove injected loader directory (app/)
    if (await safeExists(appDir)) {
        log("Removing app/ directory...");
        await safeRemove(appDir);
    }

    // 2. Remove third-party mod asars from resources
    const modAsars = ["vencord.asar", "equicord.asar", "betterdiscord.asar", "openasar.asar"];
    for (const mod of modAsars) {
        const modPath = path.join(resPath, mod);
        if (await safeExists(modPath)) {
            log(`Removing ${mod}...`);
            await safeRemove(modPath);
        }
    }

    // 3. Find valid backups (> 1MB)
    const backupCandidates = [
        backupAsar,
        discordAppAsar,
        path.join(resPath, "app.asar.backup"),
        path.join(resPath, "original_app.asar"),
        path.join(resPath, "app.asar.bak"),
        path.join(resPath, "app.asar.original"),
        path.join(resPath, "app.asar.orig")
    ];

    let validBackup = null;
    for (const cand of backupCandidates) {
        const s = await safeStat(cand);
        if (s && !s.isDirectory() && s.size > 1000000) {
            validBackup = cand;
            break;
        }
    }

    const curStat = await safeStat(appAsar);
    const isLoader = await isLoaderAsar(appAsar, curStat);

    if (validBackup) {
        if (isLoader || !curStat || curStat.size < 1000000) {
            log(`Restoring original app.asar from ${path.basename(validBackup)}...`);
            const ok = await safeRestoreAsar(validBackup, appAsar);
            if (!ok) throw new Error(`Failed to restore ${path.basename(validBackup)} to app.asar`);
            log("Restored stock app.asar.");
        } else {
            log("Stock app.asar is already active.");
        }

        // Clean up remaining stale backups so Discord is 100% vanilla
        for (const cand of backupCandidates) {
            if (cand !== appAsar && (await safeExists(cand))) {
                const current = await safeStat(appAsar);
                if (current && current.size > 1000000) {
                    await safeRemove(cand);
                }
            }
        }
    } else if (isLoader || !curStat || curStat.size < 1000000) {
        log("No local backup file found. Recovering stock app.asar from installation package...");
        const ok = await recoverFromNupkg(resPath, appAsar);
        if (!ok) {
            throw new Error(`Could not restore original Discord app.asar in ${resPath}.`);
        }
        log("Stock app.asar successfully recovered from package.");
    } else {
        log("Stock app.asar is already intact.");
    }

    // 4. Clean module patches
    await cleanModulePatches(resPath);
}

async function getAllResourcesDirs(initialPaths) {
    const all = new Set(initialPaths);
    for (const p of initialPaths) {
        try {
            const channelDir = path.dirname(path.dirname(p));
            if (await safeExists(channelDir)) {
                const entries = await fs.readdir(channelDir, { withFileTypes: true }).catch(() => []);
                for (const entry of entries) {
                    if (entry.isDirectory() && entry.name.startsWith("app-")) {
                        const siblingRes = path.join(channelDir, entry.name, "resources");
                        if (await safeExists(siblingRes)) {
                            all.add(siblingRes);
                        }
                    }
                }
            }
        } catch {}
    }
    return [...all];
}

async function removeThirdPartyMods(paths) {
    process.noAsar = true;
    const allPaths = await getAllResourcesDirs(paths);
    const progressPerLoop = (DELETE_SHIM_PROGRESS - progress.value) / Math.max(1, allPaths.length);

    for (const resPath of allPaths) {
        log(`Unpatching Vencord / Equicord from: ${resPath}`);
        try {
            log("Closing Discord...");
            await killDiscord(resPath, log);

            await unpatchSingleResources(resPath);

            progress.set(progress.value + progressPerLoop);
        } catch (err) {
            log(`[Error] Could not remove Vencord/Equicord from ${resPath}: ${err.message}`);
            return err;
        }
    }

    await cleanAppDataMods();

    for (const resPath of paths) {
        if (await shouldAutoRestart()) {
            log("Restarting Discord...");
            startDiscord(resPath);
        } else {
            log("Skipping Discord restart (disabled in options).");
        }
        break;
    }

    log("[Success] Vencord / Equicord uninstalled successfully!");
}

export default async function(paths) {
    try {
        log("Starting Vencord/Equicord Uninstallation...");
        lognewline("Cleaning Vencord & Equicord files and restoring original Discord...");

        const err = await removeThirdPartyMods(Object.values(paths));
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

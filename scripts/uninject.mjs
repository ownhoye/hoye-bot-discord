/*
 * LoliCord — Local un-injector for Discord Desktop
 * Annule l'injection en :
 * 1. Supprimant le dossier app/ et le loader app.asar
 * 2. Restaurant _app.asar → app.asar officiel
 *
 * Usage: pnpm uninject   (ou: node scripts/uninject.mjs)
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./checkNodeVersion.js";

import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "fs";
import { join } from "path";

// ── Locate Discord installations ─────────────────────────────────────────────
function findAllDiscordResources() {
    const platform = process.platform;
    const candidates = [];

    if (platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA || "";

        for (const channel of ["Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"]) {
            const base = join(localAppData, channel);
            if (!existsSync(base)) continue;
            try {
                const versions = readdirSync(base)
                    .filter(d => /^app-\d+\.\d+\.\d+$/.test(d))
                    .sort()
                    .reverse();
                for (const ver of versions) {
                    candidates.push(join(base, ver, "resources"));
                }
            } catch { }
        }
    } else if (platform === "darwin") {
        const home = process.env.HOME || "";
        const appBases = [
            "/Applications",
            join(home, "Applications")
        ];
        const appNames = [
            "Discord.app",
            "Discord PTB.app",
            "Discord Canary.app",
            "Discord Development.app"
        ];

        for (const base of appBases) {
            for (const app of appNames) {
                candidates.push(join(base, app, "Contents", "Resources"));
            }
        }
    } else if (platform === "linux") {
        const home = process.env.HOME || "";

        const channels = ["discord", "discord-ptb", "discord-canary", "discord-development", "Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"];
        for (const prefix of ["/usr/share", "/usr/lib", "/usr/lib64", "/opt"]) {
            for (const ch of channels) {
                candidates.push(join(prefix, ch, "resources"));
            }
        }

        for (const ch of channels) {
            candidates.push(join(home, ".local/share", ch, "resources"));
            candidates.push(join(home, ".local/bin", ch, "resources"));
        }

        const flatpakAppIds = [
            "com.discordapp.Discord",
            "com.discordapp.DiscordCanary",
            "com.discordapp.DiscordPTB",
            "com.discordapp.DiscordDevelopment"
        ];
        for (const appId of flatpakAppIds) {
            const discordFolder = appId.replace("com.discordapp.", "").toLowerCase();
            candidates.push(join(home, ".local/share/flatpak/app", appId, "current/active/files", discordFolder, "resources"));
            candidates.push(join("/var/lib/flatpak/app", appId, "current/active/files", discordFolder, "resources"));
            candidates.push(join(home, ".var/app", appId, "data", discordFolder, "resources"));
        }

        for (const ch of ["discord", "discord-canary", "discord-ptb"]) {
            candidates.push(join("/snap", ch, "current/usr/share", ch, "resources"));
        }

        for (const base of ["/opt/discord", "/opt/Discord", join(home, ".local/share/discord"), join(home, ".dvm")]) {
            if (existsSync(base)) {
                try {
                    const entries = readdirSync(base);
                    for (const entry of entries) {
                        if (entry.startsWith("app-")) {
                            candidates.push(join(base, entry, "resources"));
                        }
                    }
                } catch { }
            }
        }
    }

    return [...new Set(candidates)].filter(p => {
        if (!existsSync(p)) return false;
        return existsSync(join(p, "app")) || existsSync(join(p, "_app.asar"));
    });
}

// ── Uninject ─────────────────────────────────────────────────────────────────
function uninject(resourcesDir) {
    const appDirPath = join(resourcesDir, "app");
    const backupPath = join(resourcesDir, "_app.asar");
    const appAsarPath = join(resourcesDir, "app.asar");

    // Supprimer le dossier app/
    if (existsSync(appDirPath)) {
        try {
            rmSync(appDirPath, { recursive: true, force: true });
            console.log(`[LoliCord] Dossier app/ supprimé dans : ${resourcesDir}`);
        } catch (e) {
            console.warn(`[LoliCord] Erreur suppression app/ : ${e.message}`);
        }
    }

    // Restaurer le backup _app.asar → app.asar
    if (existsSync(backupPath)) {
        try {
            if (existsSync(appAsarPath)) {
                rmSync(appAsarPath, { recursive: true, force: true });
            }
            console.log("[LoliCord] Restauration _app.asar → app.asar...");
            renameSync(backupPath, appAsarPath);
        } catch (e) {
            console.warn(`[LoliCord] Erreur restauration asar : ${e.message}`);
        }
    }

    console.log(`\x1b[32m[LoliCord] Désinjection réussie depuis : ${resourcesDir}\x1b[0m`);
    return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const allResources = findAllDiscordResources();

if (allResources.length === 0) {
    console.log("\x1b[33m[LoliCord] Aucune injection active à désinjecter.\x1b[0m");
    process.exit(0);
}

let uninjectCount = 0;
for (const res of allResources) {
    console.log(`\n[LoliCord] Traitement : ${res}`);
    if (uninject(res)) uninjectCount++;
}

console.log(`\n\x1b[32m[LoliCord] ${uninjectCount}/${allResources.length} installation(s) désinjectée(s) avec succès.\x1b[0m`);
console.log("\x1b[36m[LoliCord] Redémarrez Discord pour appliquer les changements.\x1b[0m");

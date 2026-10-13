/*
 * LoliCord — Local injector for Discord Desktop
 * Injecte LoliCord dans une installation Discord existante :
 * 1. Trouve le répertoire resources de Discord
 * 2. Garantit la présence et l'intégrité de _app.asar (auto-restauration depuis nupkg si nécessaire)
 * 3. Crée resources/app/ (package.json + index.js) — Electron préfère app/ sur app.asar,
 *    ce qui évite tout remplacement binaire et toute perte de session (comptes, paramètres vocaux).
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./checkNodeVersion.js";

import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { recoverOriginalAsar } from "./recoverAsar.mjs";

const BASE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(BASE_DIR, "dist", "desktop");


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

        // Standard system / package manager paths
        const channels = ["discord", "discord-ptb", "discord-canary", "discord-development", "Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"];
        for (const prefix of ["/usr/share", "/usr/lib", "/usr/lib64", "/opt"]) {
            for (const ch of channels) {
                candidates.push(join(prefix, ch, "resources"));
            }
        }

        // User local paths
        for (const ch of channels) {
            candidates.push(join(home, ".local/share", ch, "resources"));
            candidates.push(join(home, ".local/bin", ch, "resources"));
        }

        // Flatpak paths
        const flatpakAppIds = [
            "com.discordapp.Discord",
            "com.discordapp.DiscordCanary",
            "com.discordapp.DiscordPTB",
            "com.discordapp.DiscordDevelopment"
        ];
        for (const appId of flatpakAppIds) {
            const discordFolder = appId.replace("com.discordapp.", "").toLowerCase();
            candidates.push(join(home, ".local/share/flatpak/app", appId, "current/active/files", discordFolder, "resources"));
            candidates.push(join(home, ".local/share/flatpak/app", appId, "current/active/files/share", discordFolder, "resources"));
            candidates.push(join("/var/lib/flatpak/app", appId, "current/active/files", discordFolder, "resources"));
            candidates.push(join("/var/lib/flatpak/app", appId, "current/active/files/share", discordFolder, "resources"));
            candidates.push(join(home, ".var/app", appId, "data", discordFolder, "resources"));
        }

        // Snap paths
        for (const ch of ["discord", "discord-canary", "discord-ptb"]) {
            candidates.push(join("/snap", ch, "current/usr/share", ch, "resources"));
            candidates.push(join("/snap", ch, "current/opt", ch, "resources"));
        }

        // Dynamic / app-X.Y.Z folders
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

    return [...new Set(candidates)].filter(p => existsSync(p));
}

// ── Check dist/ exists ───────────────────────────────────────────────────────
function checkBuild() {
    const patcherPath = join(DIST_DIR, "patcher.js");
    if (!existsSync(patcherPath)) {
        console.error("\x1b[31m[LoliCord] dist/desktop/patcher.js introuvable !\x1b[0m");
        console.error("\x1b[33m           Lancez 'pnpm build' d'abord, puis réessayez.\x1b[0m");
        process.exit(1);
    }
}

// ── Inject ───────────────────────────────────────────────────────────────────
function inject(resourcesDir) {
    const appDirPath = join(resourcesDir, "app");

    // Nettoyer les fichiers de mods tiers et anciens dossiers factices app.asar
    for (const modAsar of ["vencord.asar", "equicord.asar", "betterdiscord.asar"]) {
        const p = join(resourcesDir, modAsar);
        if (existsSync(p)) {
            try { rmSync(p, { force: true }); } catch {}
        }
    }

    const appAsarPath = join(resourcesDir, "app.asar");
    if (existsSync(appAsarPath)) {
        try {
            const stat = statSync(appAsarPath);
            if (stat.isDirectory()) {
                rmSync(appAsarPath, { recursive: true, force: true });
            }
        } catch {}
    }

    // Étape 1 : Garantir la présence de _app.asar original (> 1MB)
    const hasOriginal = recoverOriginalAsar(resourcesDir);
    if (!hasOriginal) {
        console.error(`\x1b[31m[LoliCord] Impossible de localiser ou d'extraire l'archive originale Discord pour ${resourcesDir} !\x1b[0m`);
        return false;
    }

    // Récupérer le nom de package Discord
    let appPkgName = "discord";
    try {
        const lowerRes = resourcesDir.toLowerCase();
        if (lowerRes.includes("canary")) appPkgName = "discordcanary";
        else if (lowerRes.includes("ptb")) appPkgName = "discordptb";
        else if (lowerRes.includes("development")) appPkgName = "discorddevelopment";
    } catch {}

    const patcherPath = join(DIST_DIR, "patcher.js");

    // Étape 2 : Créer le dossier app/ avec package.json + index.js
    // Electron préfère app/ sur app.asar — pas de remplacement binaire,
    // pas de rechargement de session, pas de perte de comptes ou paramètres vocaux.
    try {
        mkdirSync(appDirPath, { recursive: true });
    } catch (e) {
        console.error(`\x1b[31m[LoliCord] Impossible de créer app/ : ${e.message}\x1b[0m`);
        return false;
    }

    const packageJson = JSON.stringify({ name: appPkgName, main: "index.js" }, null, 2);
    const normalizedPatcher = patcherPath.replace(/\\/g, "/");
    const indexJs = `// LoliCord loader — generated by pnpm inject\nrequire(${JSON.stringify(normalizedPatcher)});\n`;

    try {
        writeFileSync(join(appDirPath, "package.json"), packageJson, "utf-8");
        writeFileSync(join(appDirPath, "index.js"), indexJs, "utf-8");
    } catch (e) {
        console.error(`\x1b[31m[LoliCord] Écriture app/ échouée : ${e.message}\x1b[0m`);
        return false;
    }

    console.log(`\x1b[32m[LoliCord] Injecté avec succès dans : ${resourcesDir}\x1b[0m`);
    return true;
}


// ── Main ─────────────────────────────────────────────────────────────────────
checkBuild();

const allResources = findAllDiscordResources();
if (allResources.length === 0) {
    console.error("\x1b[31m[LoliCord] Aucune installation Discord trouvée !\x1b[0m");
    process.exit(1);
}

console.log(`[LoliCord] ${allResources.length} installation(s) Discord trouvée(s) :`);
let injectedCount = 0;
for (const res of allResources) {
    console.log(`\n  → ${res}`);
    if (inject(res)) injectedCount++;
}
console.log(`\n\x1b[32m[LoliCord] ${injectedCount}/${allResources.length} injection(s) réussie(s).\x1b[0m`);
console.log("\x1b[36m[LoliCord] Lancez Discord pour démarrer LoliCord.\x1b[0m");

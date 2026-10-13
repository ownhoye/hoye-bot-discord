import fs from "fs";
import path from "path";

async function main() {
    console.log("Fetching video list from repository API...");
    const res = await fetch("https://source.nightcord.st/api/v1/repos/nightcord/nightcord-tutorials/contents/videos");
    if (!res.ok) {
        throw new Error(`Failed to fetch videos: ${res.status} ${res.statusText}`);
    }
    const files = await res.json();
    const videoFiles = files
        .filter(f => f.name.endsWith(".mp4"))
        .map(f => f.name.slice(0, -4));

    console.log(`Found ${videoFiles.length} video tutorials.`);

    // Find all plugin names in the codebase
    const pluginsDir = path.resolve("src/plugins");
    const lolicordPluginsDir = path.resolve("src/lolicordplugins");

    const pluginDirs = [
        ...fs.readdirSync(pluginsDir).map(p => ({ dir: pluginsDir, name: p })),
        ...fs.readdirSync(lolicordPluginsDir).map(p => ({ dir: lolicordPluginsDir, name: p }))
    ];

    const pluginNames = new Set();

    for (const p of pluginDirs) {
        const fullPath = path.join(p.dir, p.name);
        const stat = fs.statSync(fullPath);
        let content = "";
        if (stat.isDirectory()) {
            const indexTsx = path.join(fullPath, "index.tsx");
            const indexTs = path.join(fullPath, "index.ts");
            if (fs.existsSync(indexTsx)) content = fs.readFileSync(indexTsx, "utf8");
            else if (fs.existsSync(indexTs)) content = fs.readFileSync(indexTs, "utf8");
        } else if (p.name.endsWith(".tsx") || p.name.endsWith(".ts")) {
            content = fs.readFileSync(fullPath, "utf8");
        }

        const match = content.match(/name:\s*["']([^"']+)["']/);
        if (match) {
            pluginNames.add(match[1]);
        }
    }

    const mapping = new Map();

    for (const video of videoFiles) {
        // Find exact or case-insensitive matching plugin
        let matchedPlugin = null;
        for (const pName of pluginNames) {
            if (pName.toLowerCase() === video.toLowerCase()) {
                matchedPlugin = pName;
                break;
            }
        }

        if (!matchedPlugin) {
            // Also check aliases or normalized names
            for (const pName of pluginNames) {
                const normP = pName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
                const normV = video.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
                if (normP === normV) {
                    matchedPlugin = pName;
                    break;
                }
            }
        }

        if (matchedPlugin) {
            mapping.set(matchedPlugin, video);
        } else {
            mapping.set(video, video);
        }
    }

    // Sort by key alphabetically
    const sortedEntries = Array.from(mapping.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    const lines = [
        "/*",
        " * LoliCord, a Discord client mod",
        " * Copyright (c) 2026 Vendicated and contributors",
        " * SPDX-License-Identifier: GPL-3.0-or-later",
        " *",
        " * AUTO-GENERATED — do not edit by hand.",
        " * Update by running: node scripts/updateTutorialList.mjs",
        " */",
        "",
        "/**",
        " * Maps a plugin's `name` to the basename (without extension) of its tutorial",
        " * video in https://source.nightcord.st/nightcord/nightcord-tutorials/src/branch/main/videos",
        " */",
        "export const TUTORIAL_VIDEOS: ReadonlyMap<string, string> = new Map([",
        ...sortedEntries.map(([k, v]) => `    [${JSON.stringify(k)}, ${JSON.stringify(v)}],`),
        "]);",
        "",
        "export const TUTORIAL_PLUGIN_NAMES = new Set(TUTORIAL_VIDEOS.keys());",
        "",
        "export function hasTutorial(pluginName: string): boolean {",
        "    return TUTORIAL_VIDEOS.has(pluginName);",
        "}",
        "",
        "export function getTutorialVideoName(pluginName: string): string | undefined {",
        "    return TUTORIAL_VIDEOS.get(pluginName);",
        "}",
        ""
    ];

    const outPath = path.resolve("src/components/settings/tabs/plugins/tutorialList.ts");
    fs.writeFileSync(outPath, lines.join("\n"), "utf8");
    console.log(`Successfully generated ${sortedEntries.length} tutorial mappings in ${outPath}`);
}

main().catch(console.error);

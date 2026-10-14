/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * Command-line companion:
 *   lolarchive pack <archive.lol> <files...> [--password <pw>] [--level store|fast|normal|max]
 *   lolarchive list <archive.lol> [--password <pw>]
 *   lolarchive unpack <archive.lol> <destination> [--password <pw>]
 * The password can also come from the LOLARCHIVE_PASSWORD environment variable.
 */

import { closeArchive, CompressionPreset, createArchive, extractArchive, openArchive } from "./core";

function parseArgs(argv: string[]) {
    const positional: string[] = [];
    const flags: Record<string, string> = {};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i] ?? "";
        else positional.push(argv[i]);
    }
    return { positional, flags };
}

async function main() {
    const [command, ...rest] = process.argv.slice(2);
    const { positional, flags } = parseArgs(rest);
    const password = flags.password ?? process.env.LOLARCHIVE_PASSWORD ?? undefined;

    switch (command) {
        case "pack": {
            const [output, ...sources] = positional;
            if (!output || !sources.length) throw new Error("Usage: pack <archive> <fichiers...>");
            const level = (flags.level ?? "normal") as CompressionPreset;
            if (!["store", "fast", "normal", "max"].includes(level)) throw new Error("Niveau inconnu.");
            const r = await createArchive({ sources, output, password, compression: level });
            console.log(`${r.entries} entrées, ${r.bytes} octets -> ${output}`);
            break;
        }
        case "list": {
            const a = await openArchive(positional[0], password);
            for (const e of a.index.entries) console.log(`${e.type === "dir" ? "d" : "-"} ${String(e.size).padStart(12)}  ${e.path}`);
            closeArchive(a);
            break;
        }
        case "unpack": {
            const [archive, destination] = positional;
            if (!archive || !destination) throw new Error("Usage: unpack <archive> <dossier>");
            const a = await openArchive(archive, password);
            try {
                await extractArchive(a, { destination });
            } finally {
                closeArchive(a);
            }
            console.log(`Extrait dans ${destination}`);
            break;
        }
        default:
            console.log("Commandes : pack, list, unpack");
            process.exitCode = command ? 1 : 0;
    }
}

main().catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
});

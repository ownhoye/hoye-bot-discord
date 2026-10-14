/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/renderer", { recursive: true });

const node = { bundle: true, platform: "node", format: "cjs", target: "node22", external: ["electron"], logLevel: "warning" };

await Promise.all([
    build({ ...node, entryPoints: ["src/main/main.ts"], outfile: "dist/main.js" }),
    build({ ...node, entryPoints: ["src/main/preload.ts"], outfile: "dist/preload.js" }),
    build({ ...node, entryPoints: ["src/core/index.ts"], outfile: "dist/core.js" }),
    build({ ...node, entryPoints: ["src/cli.ts"], outfile: "dist/cli.js", banner: { js: "#!/usr/bin/env node" } }),
    build({ bundle: true, platform: "browser", format: "iife", target: "chrome130", entryPoints: ["src/renderer/app.ts"], outfile: "dist/renderer/app.js", logLevel: "warning" })
]);

cpSync("src/renderer/index.html", "dist/renderer/index.html");
cpSync("src/renderer/styles.css", "dist/renderer/styles.css");
console.log("[lolarchive] build OK");

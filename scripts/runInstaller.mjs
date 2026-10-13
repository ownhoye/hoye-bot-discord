/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./checkNodeVersion.js";

import { fork } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const argStart = process.argv.indexOf("--");
const args = argStart === -1 ? process.argv.slice(2) : process.argv.slice(argStart + 1);

const isUninstall = args.includes("--uninstall") || args.includes("-uninstall");
const targetScript = isUninstall
    ? join(BASE_DIR, "scripts", "uninject.mjs")
    : join(BASE_DIR, "scripts", "inject.mjs");

const child = fork(targetScript, args, { stdio: "inherit" });
child.on("exit", code => process.exit(code ?? 0));

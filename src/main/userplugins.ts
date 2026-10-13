/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch } from "fs";
import { join, resolve } from "path";
import ts from "typescript";

import { DATA_DIR } from "./utils/constants";

export function getUserPluginsDir(): string {
    let docs = "";
    try {
        docs = app.getPath("documents");
    } catch {
        docs = process.env.USERPROFILE || process.env.HOME || "";
    }
    const standardDir = join(docs, "LoliCord", "userplugins");
    return standardDir;
}

const USERPLUGINS_DIR = getUserPluginsDir();
const FALLBACK_DIR = join(DATA_DIR, "userplugins");

try {
    mkdirSync(USERPLUGINS_DIR, { recursive: true });
} catch {}

try {
    mkdirSync(FALLBACK_DIR, { recursive: true });
} catch {}

export interface DynamicPluginEntry {
    id: string;
    name: string;
    filePath: string;
    isDir: boolean;
    ext: string;
    hasCss: boolean;
}

export interface DynamicCompileResult {
    id: string;
    name: string;
    code: string;
    css?: string;
    filePath: string;
    error?: string | null;
}

export function listUserPlugins(): DynamicPluginEntry[] {
    const results: DynamicPluginEntry[] = [];
    const dirs = [USERPLUGINS_DIR];
    if (existsSync(FALLBACK_DIR) && FALLBACK_DIR !== USERPLUGINS_DIR) {
        dirs.push(FALLBACK_DIR);
    }

    const seenNames = new Set<string>();

    for (const dir of dirs) {
        if (!existsSync(dir)) continue;

        let entries: string[] = [];
        try {
            entries = readdirSync(dir);
        } catch {
            continue;
        }

        for (const item of entries) {
            if (item.startsWith(".") || item.startsWith("_")) continue;

            const fullPath = join(dir, item);
            let isDir = false;
            try {
                isDir = statSync(fullPath).isDirectory();
            } catch {
                continue;
            }

            if (isDir) {
                // Folder plugin: look for index.tsx, index.ts, index.jsx, index.js
                let entryFile: string | null = null;
                for (const entryCandidate of ["index.tsx", "index.ts", "index.jsx", "index.js"]) {
                    const candPath = join(fullPath, entryCandidate);
                    if (existsSync(candPath)) {
                        entryFile = candPath;
                        break;
                    }
                }

                if (!entryFile) continue;

                const name = item;
                if (seenNames.has(name)) continue;
                seenNames.add(name);

                const hasCss = existsSync(join(fullPath, "style.css")) || existsSync(join(fullPath, "styles.css"));

                results.push({
                    id: name,
                    name,
                    filePath: entryFile,
                    isDir: true,
                    ext: entryFile.slice(entryFile.lastIndexOf(".")),
                    hasCss
                });
            } else {
                // Single-file plugin
                const extMatch = item.match(/\.(tsx?|jsx?|css)$/i);
                if (!extMatch) continue;

                const ext = extMatch[1].toLowerCase();
                const name = item.slice(0, -extMatch[0].length);

                if (seenNames.has(name)) continue;
                seenNames.add(name);

                const hasCss = ext === "css" || existsSync(join(dir, `${name}.css`));

                results.push({
                    id: name,
                    name,
                    filePath: fullPath,
                    isDir: false,
                    ext: `.${ext}`,
                    hasCss
                });
            }
        }
    }

    return results;
}

export function compileUserPluginByEntry(entry: DynamicPluginEntry): DynamicCompileResult {
    const { id, name, filePath, ext, isDir } = entry;

    try {
        if (!existsSync(filePath)) {
            return {
                id,
                name,
                filePath,
                code: "",
                error: `File not found: ${filePath}`
            };
        }

        let cssContent: string | undefined;
        if (isDir) {
            const dir = resolve(filePath, "..");
            for (const c of ["style.css", "styles.css"]) {
                const cand = join(dir, c);
                if (existsSync(cand)) {
                    try { cssContent = readFileSync(cand, "utf-8"); } catch {}
                    break;
                }
            }
        } else if (ext === ".css") {
            try {
                const rawCss = readFileSync(filePath, "utf-8");
                return {
                    id,
                    name,
                    filePath,
                    code: `
                        "use strict";
                        Object.defineProperty(exports, "__esModule", { value: true });
                        var types = require("@utils/types");
                        exports.default = (0, types.default)({
                            name: ${JSON.stringify(name)},
                            description: "Custom CSS theme plugin",
                            authors: [{ name: "User", id: 0n }],
                            managedStyle: ${JSON.stringify(rawCss)}
                        });
                    `,
                    css: rawCss
                };
            } catch (e: any) {
                return { id, name, filePath, code: "", error: e?.message || String(e) };
            }
        }

        const rawCode = readFileSync(filePath, "utf-8");

        // Transpile TypeScript / JSX to CommonJS JavaScript
        const transpileResult = ts.transpileModule(rawCode, {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                jsx: ts.JsxEmit.React,
                target: ts.ScriptTarget.ES2022,
                removeComments: false,
                sourceMap: false
            },
            fileName: filePath
        });

        return {
            id,
            name,
            filePath,
            code: transpileResult.outputText,
            css: cssContent
        };
    } catch (e: any) {
        return {
            id,
            name,
            filePath,
            code: "",
            error: e?.message || String(e)
        };
    }
}

export function compileAllUserPlugins(): DynamicCompileResult[] {
    const plugins = listUserPlugins();
    return plugins.map(compileUserPluginByEntry);
}

let _watcher: any = null;
let _watchDebounce: ReturnType<typeof setTimeout> | undefined;

function broadcastChange() {
    if (_watchDebounce) clearTimeout(_watchDebounce);
    _watchDebounce = setTimeout(() => {
        _watchDebounce = undefined;
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
                win.webContents.send(IpcEvents.USERPLUGINS_CHANGED);
            }
        }
    }, 300);
}

export function initUserPluginsWatcher() {
    if (_watcher) return;

    if (existsSync(USERPLUGINS_DIR)) {
        try {
            _watcher = watch(USERPLUGINS_DIR, { recursive: true }, () => {
                broadcastChange();
            });
        } catch {}
    }
}

export function registerUserPluginsIpcHandlers() {
    ipcMain.handle(IpcEvents.GET_USERPLUGINS, () => {
        return listUserPlugins();
    });

    ipcMain.handle(IpcEvents.COMPILE_USERPLUGIN, (_, name: string) => {
        const plugins = listUserPlugins();
        const entry = plugins.find(p => p.id === name || p.name === name);
        if (!entry) {
            return {
                id: name,
                name,
                filePath: "",
                code: "",
                error: `User plugin ${name} not found in userplugins folder.`
            };
        }
        return compileUserPluginByEntry(entry);
    });

    ipcMain.handle(IpcEvents.COMPILE_ALL_USERPLUGINS, () => {
        return compileAllUserPlugins();
    });

    ipcMain.handle(IpcEvents.OPEN_USERPLUGINS_FOLDER, () => {
        if (existsSync(USERPLUGINS_DIR)) {
            shell.openPath(USERPLUGINS_DIR);
            return true;
        }
        return false;
    });

    initUserPluginsWatcher();
}

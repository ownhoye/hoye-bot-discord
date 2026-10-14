/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent, Menu, shell } from "electron";
import { existsSync } from "fs";
import { lstat, open, readdir, rm, stat } from "fs/promises";
import { basename, extname, join, resolve } from "path";

import {
    closeArchive, CompressionPreset, CorruptArchiveError, createArchive, extractArchive, MAGIC, openArchive, OpenedArchive,
    PasswordRequiredError, Progress, WrongPasswordError
} from "../core";

const ARCHIVE_EXTENSIONS = ["lol", "xxx"];
const PRESETS: CompressionPreset[] = ["store", "fast", "normal", "max"];

let win: BrowserWindow | null = null;
let opened: OpenedArchive | null = null;
let job: AbortController | null = null;
let pendingPath: string | null = findArchiveArg(process.argv);
const revealable = new Set<string>();

function findArchiveArg(argv: string[]): string | null {
    for (const arg of argv.slice(1)) {
        if (arg.startsWith("-")) continue;
        const ext = extname(arg).slice(1).toLowerCase();
        if (ARCHIVE_EXTENSIONS.includes(ext) && existsSync(arg)) return resolve(arg);
    }
    return null;
}

function sendOpenPath(path: string) {
    if (win && !win.webContents.isLoading()) win.webContents.send("open-path", path);
    else pendingPath = path;
}

async function isArchive(path: string): Promise<boolean> {
    try {
        const fh = await open(path, "r");
        try {
            const buf = Buffer.alloc(MAGIC.length);
            const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
            return bytesRead === buf.length && buf.equals(MAGIC);
        } finally {
            await fh.close();
        }
    } catch {
        return false;
    }
}

async function pathSize(path: string, budget = { files: 20000 }): Promise<number> {
    const st = await lstat(path);
    if (st.isSymbolicLink()) return 0;
    if (!st.isDirectory()) return st.size;
    let total = 0;
    for (const child of await readdir(path)) {
        if (--budget.files < 0) break;
        total += await pathSize(join(path, child), budget);
    }
    return total;
}

async function uniqueDir(parent: string, name: string): Promise<string> {
    let candidate = join(parent, name);
    for (let i = 2; existsSync(candidate); i++) candidate = join(parent, `${name} (${i})`);
    return candidate;
}

function progressSender(event: IpcMainInvokeEvent) {
    let last = 0;
    return (p: Progress) => {
        const now = Date.now();
        if (now - last < 80 && p.done < p.total) return;
        last = now;
        if (!event.sender.isDestroyed()) event.sender.send("progress", p);
    };
}

function describeError(err: unknown): string {
    if (err instanceof Error) {
        if (err.name === "AbortError") return "Opération annulée.";
        return err.message;
    }
    return String(err);
}

function isStringArray(v: unknown): v is string[] {
    return Array.isArray(v) && v.every(x => typeof x === "string");
}

function closeOpened() {
    if (opened) closeArchive(opened);
    opened = null;
}

function registerIpc() {
    ipcMain.handle("pick-files", async () => {
        const r = await dialog.showOpenDialog(win!, { properties: ["openFile", "multiSelections"], title: "Ajouter des fichiers" });
        return r.canceled ? [] : r.filePaths;
    });

    ipcMain.handle("pick-folders", async () => {
        const r = await dialog.showOpenDialog(win!, { properties: ["openDirectory", "multiSelections"], title: "Ajouter un dossier" });
        return r.canceled ? [] : r.filePaths;
    });

    ipcMain.handle("pick-archive", async () => {
        const r = await dialog.showOpenDialog(win!, {
            title: "Ouvrir une archive",
            properties: ["openFile"],
            filters: [
                { name: "Archives LolArchive", extensions: ARCHIVE_EXTENSIONS },
                { name: "Tous les fichiers", extensions: ["*"] }
            ]
        });
        return r.canceled ? null : r.filePaths[0];
    });

    ipcMain.handle("describe-paths", async (_e, paths: unknown) => {
        if (!isStringArray(paths)) return [];
        const out = [];
        for (const p of paths) {
            try {
                const st = await stat(p);
                out.push({ path: p, name: basename(p), isDir: st.isDirectory(), size: await pathSize(p), isArchive: !st.isDirectory() && await isArchive(p) });
            } catch { /* vanished or unreadable: skip */ }
        }
        return out;
    });

    ipcMain.handle("take-pending-path", () => {
        const p = pendingPath;
        pendingPath = null;
        return p;
    });

    ipcMain.handle("create", async (event, raw: unknown) => {
        const req = raw as { sources?: unknown; name?: unknown; extension?: unknown; password?: unknown; compression?: unknown; } | null;
        if (!req || !isStringArray(req.sources) || !req.sources.length) return { ok: false, error: "Aucun fichier à ajouter." };
        const ext = typeof req.extension === "string" ? req.extension.replace(/^\./, "") : "";
        if (!/^[a-z0-9]{1,12}$/i.test(ext)) return { ok: false, error: "Extension invalide (lettres et chiffres uniquement)." };
        const name = (typeof req.name === "string" ? req.name : "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim() || "archive";
        const compression = PRESETS.includes(req.compression as CompressionPreset) ? req.compression as CompressionPreset : "normal";
        const password = typeof req.password === "string" && req.password.length ? req.password : undefined;

        const save = await dialog.showSaveDialog(win!, {
            title: "Enregistrer l'archive",
            defaultPath: join(app.getPath("documents"), `${name}.${ext}`),
            filters: [{ name: `Archive .${ext}`, extensions: [ext] }]
        });
        if (save.canceled || !save.filePath) return { ok: false, canceled: true };
        let output = save.filePath;
        if (extname(output).toLowerCase() !== `.${ext.toLowerCase()}`) output += `.${ext}`;

        job = new AbortController();
        try {
            const r = await createArchive({ sources: req.sources, output, password, compression, onProgress: progressSender(event), signal: job.signal });
            revealable.add(output);
            return { ok: true, output, entries: r.entries, bytes: r.bytes, size: (await stat(output)).size };
        } catch (err) {
            return { ok: false, error: describeError(err) };
        } finally {
            job = null;
        }
    });

    ipcMain.handle("open", async (_e, path: unknown, password: unknown) => {
        if (typeof path !== "string") return { ok: false, error: "Chemin invalide." };
        closeOpened();
        try {
            const a = await openArchive(path, typeof password === "string" && password.length ? password : undefined);
            opened = a;
            return {
                ok: true,
                path,
                name: basename(path),
                encrypted: a.header.encrypted,
                compression: a.header.compression === 0 ? "store" : "brotli",
                createdAt: a.index.createdAt,
                entries: a.index.entries,
                totalSize: a.totalSize,
                fileSize: (await stat(path)).size
            };
        } catch (err) {
            if (err instanceof PasswordRequiredError) return { ok: false, needsPassword: true };
            if (err instanceof WrongPasswordError) return { ok: false, needsPassword: true, wrongPassword: true };
            if (err instanceof CorruptArchiveError) return { ok: false, error: err.message };
            return { ok: false, error: describeError(err) };
        }
    });

    ipcMain.handle("close-archive", () => closeOpened());

    ipcMain.handle("extract", async (event, only: unknown) => {
        const a = opened;
        if (!a) return { ok: false, error: "Aucune archive ouverte." };
        const r = await dialog.showOpenDialog(win!, { title: "Extraire vers...", properties: ["openDirectory", "createDirectory"] });
        if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };

        const base = basename(a.path, extname(a.path)) || "archive";
        const dest = await uniqueDir(r.filePaths[0], base);
        job = new AbortController();
        try {
            await extractArchive(a, { destination: dest, only: isStringArray(only) && only.length ? only : undefined, onProgress: progressSender(event), signal: job.signal });
            revealable.add(dest);
            return { ok: true, destination: dest };
        } catch (err) {
            // The destination folder was created by us just now, so removing it on failure is safe.
            await rm(dest, { recursive: true, force: true }).catch(() => { });
            return { ok: false, error: describeError(err) };
        } finally {
            job = null;
        }
    });

    ipcMain.handle("cancel", () => job?.abort());

    ipcMain.handle("reveal", (_e, path: unknown) => {
        if (typeof path !== "string" || !revealable.has(path)) return;
        shell.showItemInFolder(path);
    });
}

function createWindow() {
    win = new BrowserWindow({
        width: 1000,
        height: 680,
        minWidth: 760,
        minHeight: 520,
        title: "LolArchive",
        backgroundColor: "#313338",
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            preload: join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    win.once("ready-to-show", () => win?.show());
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", e => e.preventDefault());
    win.on("closed", () => {
        win = null;
        closeOpened();
    });
    win.loadFile(join(__dirname, "renderer", "index.html"));
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", (_e, argv) => {
        const p = findArchiveArg(argv);
        if (p) sendOpenPath(p);
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });

    app.on("open-file", (e, path) => {
        e.preventDefault();
        sendOpenPath(path);
    });

    app.whenReady().then(() => {
        Menu.setApplicationMenu(null);
        registerIpc();
        createWindow();
    });

    app.on("window-all-closed", () => {
        job?.abort();
        app.quit();
    });
}

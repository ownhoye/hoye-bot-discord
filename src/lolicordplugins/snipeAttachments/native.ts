/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Nightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, dialog, IpcMainInvokeEvent, shell } from "electron";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import * as path from "node:path";
import * as https from "node:https";
import * as http from "node:http";
import { createWriteStream } from "node:fs";

function sanitizeName(name: string): string {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim().slice(0, 100) || "unnamed";
}

export async function getDefaultSaveDirectory(_event: IpcMainInvokeEvent): Promise<string> {
    try {
        const docs = app.getPath("documents") || app.getPath("userData");
        const defaultPath = path.join(docs, "LoliCord_SnipeAttachments");
        await mkdir(defaultPath, { recursive: true });
        return defaultPath;
    } catch {
        return path.join(process.cwd(), "LoliCord_SnipeAttachments");
    }
}

export async function selectSaveDirectory(_event: IpcMainInvokeEvent): Promise<string | null> {
    const res = await dialog.showOpenDialog({
        title: "Select SnipeAttachments Save Folder",
        properties: ["openDirectory", "createDirectory"]
    });

    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
}

export async function openInFolder(_event: IpcMainInvokeEvent, targetPath: string): Promise<void> {
    if (targetPath) {
        shell.showItemInFolder(targetPath);
    }
}

export async function openFolder(_event: IpcMainInvokeEvent, dirPath: string): Promise<void> {
    if (dirPath) {
        shell.openPath(dirPath);
    }
}

export async function downloadAndSaveMedia(
    _event: IpcMainInvokeEvent,
    data: {
        url: string;
        filename: string;
        guildName?: string;
        channelName?: string;
        authorName?: string;
        customDir?: string;
    }
): Promise<{ savedPath: string; size: number; }> {
    let baseDir = data.customDir?.trim();
    if (!baseDir) {
        const docs = app.getPath("documents") || app.getPath("userData");
        baseDir = path.join(docs, "LoliCord_SnipeAttachments");
    }

    const guildFolder = sanitizeName(data.guildName || "DirectMessages");
    const channelFolder = sanitizeName(data.channelName || "General");
    const targetDir = path.join(baseDir, guildFolder, channelFolder);

    await mkdir(targetDir, { recursive: true });

    let cleanFilename = sanitizeName(data.filename || "file");
    if (!path.extname(cleanFilename)) {
        // Try to deduce from url
        try {
            const urlPath = new URL(data.url).pathname;
            const ext = path.extname(urlPath);
            if (ext) cleanFilename += ext;
        } catch { }
    }

    const datePrefix = new Date().toISOString().slice(0, 10);
    const authorPrefix = sanitizeName(data.authorName || "User");
    const uniqueId = Date.now().toString(36).slice(-4);
    const finalFilename = `${datePrefix}_${authorPrefix}_${uniqueId}_${cleanFilename}`;
    const fullPath = path.join(targetDir, finalFilename);

    return new Promise((resolve, reject) => {
        const requestUrl = new URL(data.url);
        const getter = requestUrl.protocol === "https:" ? https : http;

        const req = getter.get(data.url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        }, (res) => {
            // Handle redirects
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                downloadAndSaveMedia(_event, { ...data, url: res.headers.location })
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (res.statusCode && res.statusCode >= 400) {
                return reject(new Error(`Download failed with status ${res.statusCode}`));
            }

            const fileStream = createWriteStream(fullPath);
            let downloadedBytes = 0;

            res.on("data", (chunk) => {
                downloadedBytes += chunk.length;
            });

            res.pipe(fileStream);

            fileStream.on("finish", () => {
                fileStream.close();
                resolve({ savedPath: fullPath, size: downloadedBytes });
            });

            fileStream.on("error", (err) => {
                fileStream.close();
                unlink(fullPath).catch(() => { });
                reject(err);
            });
        });

        req.on("error", (err) => {
            reject(err);
        });

        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error("Download timeout"));
        });
    });
}

export async function deleteSavedFile(_event: IpcMainInvokeEvent, targetPath: string): Promise<boolean> {
    try {
        await unlink(targetPath);
        return true;
    } catch {
        return false;
    }
}

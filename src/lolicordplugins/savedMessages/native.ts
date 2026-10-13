/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, shell } from "electron";
import * as fs from "fs";
import * as path from "path";

function getStorageDirectory(): string {
    let baseDir = "";
    try {
        const appData = app.getPath("appData");
        if (appData) baseDir = path.join(appData, "LoliCord", "saved_messages");
    } catch { }

    if (!baseDir) {
        try {
            const userData = app.getPath("userData");
            if (userData) baseDir = path.join(userData, "saved_messages");
        } catch { }
    }

    if (!baseDir) {
        baseDir = path.join(process.cwd(), "saved_messages");
    }

    try {
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
        const mediaDir = path.join(baseDir, "media");
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }
    } catch (e) {
        console.error("[SavedMessagesNative] Failed to create directories:", e);
    }

    return baseDir;
}

export async function getStoragePath(_: any): Promise<string> {
    return getStorageDirectory();
}

export async function writeVaultFile(_: any, content: string): Promise<boolean> {
    try {
        const dir = getStorageDirectory();
        const targetPath = path.join(dir, "vault.json");
        const tmpPath = path.join(dir, "vault.json.tmp");

        fs.writeFileSync(tmpPath, content, "utf8");
        fs.renameSync(tmpPath, targetPath);
        return true;
    } catch (e) {
        console.error("[SavedMessagesNative] writeVaultFile error:", e);
        return false;
    }
}

export async function readVaultFile(_: any): Promise<string | null> {
    try {
        const dir = getStorageDirectory();
        const jsonPath = path.join(dir, "vault.json");
        if (fs.existsSync(jsonPath)) {
            return fs.readFileSync(jsonPath, "utf8");
        }
        const encPath = path.join(dir, "vault.enc");
        if (fs.existsSync(encPath)) {
            return fs.readFileSync(encPath, "utf8");
        }
        return null;
    } catch (e) {
        console.error("[SavedMessagesNative] readVaultFile error:", e);
        return null;
    }
}

export async function saveMediaFile(_: any, filename: string, base64Data: string): Promise<{ ok: boolean; path?: string; error?: string; }> {
    try {
        const dir = getStorageDirectory();
        const mediaDir = path.join(dir, "media");
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }

        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fullPath = path.join(mediaDir, safeName);
        let cleanB64 = base64Data;
        const commaIdx = cleanB64.indexOf(",");
        if (commaIdx !== -1) cleanB64 = cleanB64.slice(commaIdx + 1);
        cleanB64 = cleanB64.replace(/\s+/g, "");

        const buffer = Buffer.from(cleanB64, "base64");
        fs.writeFileSync(fullPath, buffer);
        return { ok: true, path: fullPath };
    } catch (e: any) {
        console.error("[SavedMessagesNative] saveMediaFile error:", e);
        return { ok: false, error: e?.message || String(e) };
    }
}

export async function readMediaFile(_: any, filename: string): Promise<string | null> {
    try {
        const dir = getStorageDirectory();
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fullPath = path.join(dir, "media", safeName);

        if (fs.existsSync(fullPath)) {
            const buf = fs.readFileSync(fullPath);
            return buf.toString("base64");
        }
        const directPath = path.join(dir, "media", filename);
        if (fs.existsSync(directPath)) {
            const buf = fs.readFileSync(directPath);
            return buf.toString("base64");
        }
        return null;
    } catch (e) {
        console.error("[SavedMessagesNative] readMediaFile error:", e);
        return null;
    }
}

export async function deleteMediaFile(_: any, filename: string): Promise<boolean> {
    try {
        const dir = getStorageDirectory();
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fullPath = path.join(dir, "media", safeName);

        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            return true;
        }
        const directPath = path.join(dir, "media", filename);
        if (fs.existsSync(directPath)) {
            fs.unlinkSync(directPath);
            return true;
        }
        return false;
    } catch (e) {
        console.error("[SavedMessagesNative] deleteMediaFile error:", e);
        return false;
    }
}

export async function openStorageFolder(_: any): Promise<void> {
    try {
        const dir = getStorageDirectory();
        shell.openPath(dir);
    } catch (e) {
        console.error("[SavedMessagesNative] openStorageFolder error:", e);
    }
}

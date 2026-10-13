/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fetchBuffer, fetchJson } from "@main/utils/http";
import { IpcEvents } from "@shared/IpcEvents";
import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { execFile } from "child_process";
import { app, ipcMain } from "electron";
import { existsSync, mkdirSync, promises as fsp, rmSync } from "original-fs";
import { join } from "path";
import { serializeErrors } from "./common";
import { copyDirectorySync } from "./pendingUpdate";

const API_BASE = "https://api.github.com/repos/ownhoye/hoye-bot-discord";
const REPO_URL = "https://github.com/ownhoye/hoye-bot-discord";
declare const VERSION: string;
const CURRENT_VERSION = `v${VERSION}`;
const ZIP_FILE = "lolicord-dist.zip";

/**
 * Marker file written into __dirname when an update has been staged.
 * patcher.ts reads it on next startup and re-applies the staged files.
 */
export const PENDING_UPDATE_MARKER = join(__dirname, "lolicord-pending-update.json");
const STAGING_DIR = join(app.getPath("temp"), "lolicord-pending-update");

let pendingDownloadUrl: string | null = null;
let pendingVersion: string | null = null;
let isApplying = false;

async function githubGet<T = any>(endpoint: string): Promise<T> {
    return fetchJson<T>(API_BASE + endpoint, {
        headers: {
            Accept: "application/json",
            "User-Agent": VENCORD_USER_AGENT
        }
    });
}

function isNewer(a: string, b: string): boolean {
    const parse = (v: string) => v.replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
    const av = parse(a), bv = parse(b);
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
        if ((bv[i] ?? 0) > (av[i] ?? 0)) return true;
        if ((bv[i] ?? 0) < (av[i] ?? 0)) return false;
    }
    return false;
}

async function fetchUpdates(): Promise<boolean> {
    const data = await githubGet("/releases/latest");
    const latestTag: string = data.tag_name ?? "";

    if (!latestTag || !isNewer(CURRENT_VERSION, latestTag)) return false;

    const asset = (data.assets as any[])?.find(
        (a: any) => a.name === ZIP_FILE
    );
    if (!asset) return false;

    pendingDownloadUrl = asset.browser_download_url;
    pendingVersion = latestTag;
    return true;
}

async function getUpdates() {
    const outdated = await fetchUpdates();
    if (!outdated) return [];
    return [{
        hash: pendingVersion ?? "new",
        author: "LoliCord",
        message: `Nouvelle version disponible : ${pendingVersion}`
    }];
}

function runFile(file: string, args: string[]) {
    return new Promise<void>((resolve, reject) => {
        execFile(file, args, { windowsHide: true }, err => err ? reject(err) : resolve());
    });
}

async function extractZip(zipPath: string, destDir: string) {
    if (process.platform !== "win32") return runFile("unzip", ["-o", "-q", zipPath, "-d", destDir]);

    const quote = (p: string) => `'${p.replace(/'/g, "''")}'`;
    try {
        await runFile("powershell.exe", [
            "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command",
            `Expand-Archive -LiteralPath ${quote(zipPath)} -DestinationPath ${quote(destDir)} -Force`
        ]);
    } catch {
        // tar.exe ships with Windows 10 1803+ and works where PowerShell is restricted
        await runFile("tar.exe", ["-xf", zipPath, "-C", destDir]);
    }
}

/**
 * Downloads the release zip, extracts it, and copies it over the running install.
 * Files that cannot be replaced now are re-applied on next startup through the marker.
 * Throws with a readable reason on any failure, so the UI never reports a fake success.
 */
async function stageUpdate(): Promise<boolean> {
    if (isApplying) throw new Error("An update is already being installed.");
    isApplying = true;

    const zipPath = join(app.getPath("temp"), `lolicord-update-${Date.now()}.zip`);
    try {
        if (!pendingDownloadUrl && !(await fetchUpdates())) {
            throw new Error("No update is available.");
        }

        const data = await fetchBuffer(pendingDownloadUrl!);
        if (data.length < 1024) throw new Error("The downloaded update is empty.");
        await fsp.writeFile(zipPath, data);

        try { rmSync(STAGING_DIR, { recursive: true, force: true }); } catch { }
        mkdirSync(STAGING_DIR, { recursive: true });

        try {
            await extractZip(zipPath, STAGING_DIR);
        } catch (err: any) {
            throw new Error("Could not extract the update: " + (err?.message ?? err));
        }

        if (!existsSync(join(STAGING_DIR, "patcher.js"))) {
            throw new Error("The update package is invalid (patcher.js missing).");
        }

        if (!copyDirectorySync(STAGING_DIR, __dirname)) {
            throw new Error(`Could not copy the update into ${__dirname}.`);
        }

        // Re-applied by patcher.ts on next startup for any file that was locked now
        await fsp.writeFile(PENDING_UPDATE_MARKER, JSON.stringify({
            version: pendingVersion,
            stagingDir: STAGING_DIR,
            destDir: __dirname,
            createdAt: Date.now()
        }));

        pendingDownloadUrl = null;
        pendingVersion = null;
        return true;
    } finally {
        try { rmSync(zipPath, { force: true }); } catch { }
        isApplying = false;
    }
}

ipcMain.handle(IpcEvents.GET_REPO, serializeErrors(() => REPO_URL));
ipcMain.handle(IpcEvents.GET_UPDATES, serializeErrors(getUpdates));
ipcMain.handle(IpcEvents.UPDATE, serializeErrors(fetchUpdates));
// BUILD is now "stage update" — actual file swap happens on next startup via lolicord-index.js
ipcMain.handle(IpcEvents.BUILD, serializeErrors(stageUpdate));

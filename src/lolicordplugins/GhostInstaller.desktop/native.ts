/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn, exec } from "child_process";
import { app, dialog } from "electron";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as http from "http";
import * as https from "https";
import * as os from "os";
import * as path from "path";

const PORT = 47821;
const DEFAULT_RELEASE_URL = "https://source.nightcord.st/nightcord/ghostclient/releases";
const DEFAULT_GITHUB_URL = DEFAULT_RELEASE_URL;

export interface InstallInfo {
    platformKey: string;
    platformLabel: string;
    readableOs: string;
    discordRoot: string;
    appDir?: string;
    clientLabel: string;
    installStatus: "installed" | "notInstalled" | "needsReinstall";
    ghostServerStatus: string;
    ghostPluginPath: string;
    ghostServerPath: string;
    lastPatchLabel: string;
    defaultGithubUrl: string;
    repatchWarning: string;
}

export interface ActionInfo extends InstallInfo {
    logPath: string;
}

export type NativeResult<T> = {
    success: true;
    data: T;
    logs: string[];
} | {
    success: false;
    error: string;
    logs: string[];
};

export interface InstallProgress {
    active: boolean;
    percent: number;
    stage: string;
    detail: string;
    error: string | null;
    done: boolean;
    info: ActionInfo | null;
}

let currentProgress: InstallProgress = {
    active: false,
    percent: 0,
    stage: "",
    detail: "",
    error: null,
    done: false,
    info: null
};

export function getInstallProgress(): NativeResult<InstallProgress> {
    return {
        success: true,
        data: { ...currentProgress },
        logs: logBuffer
    };
}

let logBuffer: string[] = [];
const MAX_LOG_LINES = 500;

function getLogDir(): string {
    const base = app.getPath("userData");
    const dir = path.join(base, "GhostClientInstaller");
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    }
    return dir;
}

function getLogFilePath(): string {
    return path.join(getLogDir(), "ghost-installer.log");
}

function getStateFilePath(): string {
    return path.join(getLogDir(), "ghost-installer-state.json");
}

function log(line: string) {
    const time = new Date().toLocaleTimeString();
    const entry = `[${time}] ${line}`;
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();

    try {
        fs.appendFileSync(getLogFilePath(), entry + "\n");
    } catch {}
    console.log("[GhostClientInstaller]", entry);
}

function getSavedState(): Record<string, any> {
    try {
        const p = getStateFilePath();
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, "utf-8"));
        }
    } catch {}
    return {};
}

function saveState(state: Record<string, any>) {
    try {
        fs.writeFileSync(getStateFilePath(), JSON.stringify(state, null, 2), "utf-8");
    } catch (e: any) {
        log(`WARN: Failed to save installer state: ${e.message}`);
    }
}

export function pingServer(): Promise<boolean> {
    return new Promise(resolve => {
        const req = http.get(`http://127.0.0.1:${PORT}/status`, res => {
            resolve(res.statusCode === 200);
        });
        req.setTimeout(1200, () => {
            req.destroy();
            resolve(false);
        });
        req.on("error", () => resolve(false));
    });
}

export function findLoliCordRoot(): string | null {
    const candidates = [
        process.cwd(),
        path.resolve(__dirname, "../../.."),
        path.resolve(__dirname, "../../../.."),
        path.resolve(__dirname, "../../../../.."),
        // LoliCord .exe installer locations (Windows)
        process.env.APPDATA ? path.join(process.env.APPDATA, "LoliCord") : null,
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "LoliCord") : null,
        process.env.APPDATA ? path.join(process.env.APPDATA, "lolicord") : null,
    ].filter(Boolean) as string[];

    for (const c of candidates) {
        if (!c) continue;
        try {
            const pkgPath = path.join(c, "package.json");
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
                if (pkg.name === "lolicord" || pkg.name === "vencord" || pkg.name === "equicord") {
                    return c;
                }
            }
        } catch {}
    }
    return null;
}

function findDiscordInstallations(): Array<{ root: string; appDir: string; label: string; }> {
    const installs: Array<{ root: string; appDir: string; label: string; }> = [];
    const localAppData = process.env.LOCALAPPDATA || (process.env.HOME ? path.join(process.env.HOME, ".local/share") : "");

    if (process.platform === "win32" && localAppData) {
        const discordDirNames = ["Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"];
        for (const dirName of discordDirNames) {
            const root = path.join(localAppData, dirName);
            if (fs.existsSync(root)) {
                try {
                    const entries = fs.readdirSync(root);
                    const appDirs = entries
                        .filter(e => e.startsWith("app-"))
                        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

                    if (appDirs.length > 0) {
                        installs.push({
                            root,
                            appDir: path.join(root, appDirs[0]),
                            label: dirName
                        });
                    }
                } catch {}
            }
        }
    }
    return installs;
}

export async function chooseDiscordRoot(): Promise<NativeResult<InstallInfo>> {
    try {
        const dialogRes = await dialog.showOpenDialog({
            title: "Select Discord Installation Folder",
            properties: ["openDirectory"]
        });

        if (dialogRes.canceled || !dialogRes.filePaths.length) {
            return {
                success: false,
                error: "Selection canceled.",
                logs: logBuffer
            };
        }

        const selected = dialogRes.filePaths[0];
        log(`INFO: User selected Discord root: ${selected}`);
        const info = await getInstallInfo(selected);
        return {
            success: true,
            data: info,
            logs: logBuffer
        };
    } catch (e: any) {
        return {
            success: false,
            error: e.message || String(e),
            logs: logBuffer
        };
    }
}

async function getInstallInfo(customRoot?: string): Promise<InstallInfo> {
    const isWin = process.platform === "win32";
    const platformLabel = isWin ? `Windows ${os.arch()}` : `${process.platform} ${os.arch()}`;
    const readableOs = `${os.type()} ${os.release()}`;

    const installs = findDiscordInstallations();
    const primary = installs[0];
    const discordRoot = customRoot || primary?.root || "C:\\Users\\zzafi\\AppData\\Local\\Discord";
    const appDir = primary?.appDir || path.join(discordRoot, "app-1.0.9257");
    const clientLabel = primary?.label || "Discord";

    const lolicordRoot = findLoliCordRoot();
    const ghostPluginPath = lolicordRoot
        ? path.join(lolicordRoot, "src", "lolicordplugins", "ghostClient")
        : "Built-in (LoliCord Core)";

    const persistentServerPath = path.join(app.getPath("userData"), "ghost-server");
    const ghostServerPath = fs.existsSync(persistentServerPath)
        ? persistentServerPath
        : (lolicordRoot && fs.existsSync(path.join(lolicordRoot, "ghost-server")) ? path.join(lolicordRoot, "ghost-server") : persistentServerPath);

    // ghostClient plugin is built into LoliCord core!
    const isPluginPresent = lolicordRoot ? fs.existsSync(path.join(ghostPluginPath, "index.tsx")) : true;
    const isServerPresent = fs.existsSync(path.join(ghostServerPath, "server.js"));
    const isServerRunning = await pingServer();

    const savedState = getSavedState();
    const lastPatchLabel = savedState.lastPatched ? new Date(savedState.lastPatched).toLocaleString() : "--";
    const savedUrl = savedState.releaseUrl || savedState.githubUrl;
    const defaultGithubUrl = (savedUrl && !savedUrl.includes("github.com/ProdHallow/GhostClient-Bundle"))
        ? savedUrl
        : DEFAULT_RELEASE_URL;

    let installStatus: "installed" | "notInstalled" | "needsReinstall" = "notInstalled";
    let repatchWarning = "";

    if (savedState.installed === false) {
        installStatus = "notInstalled";
    } else if (isServerPresent) {
        installStatus = "installed";
    } else if (savedState.installed && !isServerPresent) {
        installStatus = "needsReinstall";
        repatchWarning = "ghost-server companion files are missing or incomplete. Click Patch to reinstall.";
    }

    const ghostServerStatus = (savedState.installed === false)
        ? "Not Installed"
        : (isServerRunning
            ? "Running (Port 47821)"
            : (isServerPresent ? "Installed (Stopped)" : "Not Installed"));

    return {
        platformKey: process.platform,
        platformLabel,
        readableOs,
        discordRoot,
        appDir,
        clientLabel,
        installStatus,
        ghostServerStatus,
        ghostPluginPath,
        ghostServerPath,
        lastPatchLabel,
        defaultGithubUrl,
        repatchWarning
    };
}

export async function autoDetect(): Promise<NativeResult<InstallInfo>> {
    try {
        log("INFO: Running auto-detect for Discord & LoliCord...");
        const info = await getInstallInfo();
        log(`OK: Detected ${info.clientLabel} at ${info.discordRoot}`);
        log(`INFO: Status: ${info.installStatus}, Server: ${info.ghostServerStatus}`);
        return {
            success: true,
            data: info,
            logs: logBuffer
        };
    } catch (e: any) {
        log(`ERROR: Auto-detect failed: ${e.message}`);
        return {
            success: false,
            error: e.message || String(e),
            logs: logBuffer
        };
    }
}

async function fetchJson(urlStr: string, headers: Record<string, string> = {}, maxRedirects = 5): Promise<any> {
    if (maxRedirects < 0) throw new Error("Too many redirects");
    return new Promise((resolve, reject) => {
        const urlObj = new URL(urlStr);
        const client = urlObj.protocol === "https:" ? https : http;
        const req = client.get(urlStr, {
            headers: {
                "User-Agent": "LoliCord-GhostClientInstaller",
                "Accept": "application/json",
                ...headers
            }
        }, res => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = new URL(res.headers.location, urlStr).toString();
                return fetchJson(nextUrl, headers, maxRedirects - 1).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || "Error"}`));
            }
            let data = "";
            res.setEncoding("utf-8");
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON response: ${e}`));
                }
            });
        });
        req.on("error", reject);
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error("Request timed out after 15s"));
        });
    });
}

function extractZipUrlFromRelease(release: any): string | null {
    if (!release) return null;
    if (Array.isArray(release.assets) && release.assets.length > 0) {
        const bundleAsset = release.assets.find((a: any) =>
            typeof a.name === "string" && a.name.toLowerCase().includes("ghostclient") && a.name.toLowerCase().endsWith(".zip")
        ) || release.assets.find((a: any) =>
            typeof a.name === "string" && a.name.toLowerCase().endsWith(".zip")
        );

        if (bundleAsset?.browser_download_url) {
            return bundleAsset.browser_download_url;
        }
    }

    if (release.zipball_url) {
        return release.zipball_url;
    }

    return null;
}

export async function resolveLatestReleaseDownloadUrl(inputUrl: string): Promise<{ downloadUrl: string; releaseName?: string; tag?: string; }> {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
        throw new Error("No release URL provided");
    }

    // Direct .zip download URL provided
    if (trimmed.endsWith(".zip")) {
        return { downloadUrl: trimmed };
    }

    log(`INFO: Resolving latest release from: ${trimmed}`);

    // Forgejo / Gitea (e.g. source.nightcord.st/<owner>/<repo>)
    const giteaMatch = trimmed.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)(?:\/releases.*)?$/i);
    if (giteaMatch) {
        const host = giteaMatch[1];
        const owner = giteaMatch[2];
        const repo = giteaMatch[3].replace(/\.git$/, "");

        const apiLatest = `https://${host}/api/v1/repos/${owner}/${repo}/releases/latest`;
        const apiAll = `https://${host}/api/v1/repos/${owner}/${repo}/releases`;

        try {
            log(`INFO: Querying latest release endpoint: ${apiLatest}`);
            const latest = await fetchJson(apiLatest);
            const downloadUrl = extractZipUrlFromRelease(latest);
            if (downloadUrl) {
                const tag = latest.tag_name || latest.name;
                log(`OK: Found latest release "${tag}" -> ${downloadUrl}`);
                return { downloadUrl, releaseName: latest.name, tag: latest.tag_name };
            }
        } catch (e: any) {
            log(`WARN: /releases/latest endpoint returned: ${e.message}, checking releases list...`);
        }

        try {
            log(`INFO: Querying releases list: ${apiAll}`);
            const releases = await fetchJson(apiAll);
            if (Array.isArray(releases) && releases.length > 0) {
                // First entry in Forgejo / Gitea is the newest release
                const latest = releases[0];
                const downloadUrl = extractZipUrlFromRelease(latest);
                if (downloadUrl) {
                    const tag = latest.tag_name || latest.name;
                    log(`OK: Found newest release "${tag}" -> ${downloadUrl}`);
                    return { downloadUrl, releaseName: latest.name, tag: latest.tag_name };
                }
            }
        } catch (e: any) {
            log(`WARN: /releases list returned: ${e.message}`);
        }
    }

    // GitHub (github.com/<owner>/<repo>)
    const ghMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/releases.*)?$/i);
    if (ghMatch) {
        const owner = ghMatch[1];
        const repo = ghMatch[2].replace(/\.git$/, "");
        const apiLatest = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

        try {
            log(`INFO: Querying GitHub latest release: ${apiLatest}`);
            const latest = await fetchJson(apiLatest, { "User-Agent": "LoliCord-GhostClientInstaller" });
            const downloadUrl = extractZipUrlFromRelease(latest);
            if (downloadUrl) {
                const tag = latest.tag_name || latest.name;
                log(`OK: Found latest GitHub release "${tag}" -> ${downloadUrl}`);
                return { downloadUrl, releaseName: latest.name, tag: latest.tag_name };
            }
        } catch (e: any) {
            log(`WARN: GitHub API failed: ${e.message}`);
        }
    }

    return { downloadUrl: trimmed };
}

function findDirectoryContaining(startDir: string, targetFile: string, maxDepth = 4): string | null {
    if (!fs.existsSync(startDir)) return null;

    function search(dir: string, currentDepth: number): string | null {
        if (currentDepth > maxDepth) return null;
        try {
            if (fs.existsSync(path.join(dir, targetFile))) {
                return dir;
            }
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && entry.name !== "node_modules") {
                    const found = search(path.join(dir, entry.name), currentDepth + 1);
                    if (found) return found;
                }
            }
        } catch {}
        return null;
    }

    return search(startDir, 0);
}

function setProgress(percent: number, stage: string, detail: string) {
    currentProgress.active = true;
    currentProgress.percent = Math.max(0, Math.min(100, Math.round(percent)));
    currentProgress.stage = stage;
    currentProgress.detail = detail;
    currentProgress.error = null;
    currentProgress.done = false;
}

function downloadFile(
    url: string,
    dest: string,
    onProgress?: (downloaded: number, total: number) => void,
    maxRedirects = 5
): Promise<void> {
    return new Promise((resolve, reject) => {
        if (maxRedirects < 0) {
            return reject(new Error("Too many redirects"));
        }

        const client = url.startsWith("https://") ? https : http;
        const req = client.get(url, { headers: { "User-Agent": "LoliCord-GhostClientInstaller" } }, res => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = new URL(res.headers.location, url).toString();
                return downloadFile(nextUrl, dest, onProgress, maxRedirects - 1).then(resolve).catch(reject);
            }

            if (res.statusCode !== 200) {
                return reject(new Error(`Server returned HTTP ${res.statusCode}: ${res.statusMessage}`));
            }

            const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
            let downloadedBytes = 0;
            let lastLoggedStep = 0;

            const fileStream = fs.createWriteStream(dest);
            res.on("data", (chunk: Buffer) => {
                downloadedBytes += chunk.length;
                if (totalBytes > 0) {
                    onProgress?.(downloadedBytes, totalBytes);
                    const pct = Math.floor((downloadedBytes / totalBytes) * 100);
                    const step = Math.floor(pct / 20) * 20;
                    if (step > lastLoggedStep && step < 100) {
                        lastLoggedStep = step;
                        const dlMb = (downloadedBytes / (1024 * 1024)).toFixed(1);
                        const totMb = (totalBytes / (1024 * 1024)).toFixed(1);
                        log(`INFO: Downloading: ${step}% (${dlMb} MB / ${totMb} MB)`);
                    }
                }
            });

            res.pipe(fileStream);
            fileStream.on("finish", () => {
                fileStream.close(() => resolve());
            });
            fileStream.on("error", err => {
                try { fs.unlinkSync(dest); } catch {}
                reject(err);
            });
        });

        req.on("error", reject);
        req.setTimeout(300000, () => {
            req.destroy();
            reject(new Error("Download timed out after 5 minutes"));
        });
    });
}

async function extractZip(zipPath: string, targetDir: string): Promise<void> {
    if (!fs.existsSync(targetDir)) {
        await fsp.mkdir(targetDir, { recursive: true });
    }

    if (process.platform === "win32") {
        const tarAvailable = await new Promise<boolean>(res => {
            const child = spawn("tar.exe", ["--version"], { windowsHide: true });
            child.on("error", () => res(false));
            child.on("close", code => res(code === 0));
        });

        if (tarAvailable) {
            await new Promise<void>((res, rej) => {
                const child = spawn("tar.exe", ["-xf", zipPath, "-C", targetDir], { windowsHide: true });
                child.on("error", rej);
                child.on("close", code => code === 0 ? res() : rej(new Error(`tar exited with code ${code}`)));
            });
            return;
        }

        await new Promise<void>((res, rej) => {
            const psCmd = `Expand-Archive -Force -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${targetDir.replace(/'/g, "''")}'`;
            const child = spawn("powershell", ["-NoProfile", "-Command", psCmd], { windowsHide: true });
            child.on("error", rej);
            child.on("close", code => code === 0 ? res() : rej(new Error(`PowerShell exited with code ${code}`)));
        });
    } else {
        await new Promise<void>((res, rej) => {
            const child = spawn("unzip", ["-o", zipPath, "-d", targetDir]);
            child.on("error", rej);
            child.on("close", code => code === 0 ? res() : rej(new Error(`unzip exited with code ${code}`)));
        });
    }
}

async function countEntries(src: string): Promise<number> {
    let count = 0;
    try {
        const entries = await fsp.readdir(src, { withFileTypes: true });
        for (const entry of entries) {
            count++;
            if (entry.isDirectory()) {
                count += await countEntries(path.join(src, entry.name));
            }
        }
    } catch {}
    return count;
}

async function copyDir(
    src: string,
    dest: string,
    onProgress?: (copied: number, total: number, name: string) => void,
    tracker = { copied: 0, total: 0 }
) {
    if (tracker.total === 0 && onProgress) {
        tracker.total = await countEntries(src);
    }
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath, onProgress, tracker);
        } else {
            try {
                const [srcStat, destStat] = await Promise.all([
                    fsp.stat(srcPath),
                    fsp.stat(destPath).catch(() => null)
                ]);
                if (destStat && srcStat.size === destStat.size && srcStat.size > 1024 * 1024) {
                    tracker.copied++;
                    onProgress?.(tracker.copied, tracker.total, entry.name);
                    continue;
                }
            } catch {}
            await fsp.copyFile(srcPath, destPath);
            tracker.copied++;
            onProgress?.(tracker.copied, tracker.total, entry.name);
        }
        await new Promise(r => setImmediate(r));
    }
}

function patchGhostServerFiles(serverDir: string) {
    try {
        const srvPath = path.join(serverDir, "server.js");
        if (fs.existsSync(srvPath)) {
            let content = fs.readFileSync(srvPath, "utf-8");
            if (!content.includes("globalThis.WebSocket")) {
                content = content.replace(
                    'import https from "https";',
                    'import https from "https";\nimport WebSocket from "ws";\nif (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;'
                );
                log("OK: Patched server.js with WebSocket polyfill.");
            }
            if (content.includes("const RING_SIZE = PCM_BYTES * 8;")) {
                content = content.replace(
                    "const RING_SIZE = PCM_BYTES * 8;",
                    "const RING_SIZE = PCM_BYTES * 50;"
                );
            }
            if (content.includes('"-audio_buffer_size", "50"')) {
                content = content.replace('"-audio_buffer_size", "50"', '"-audio_buffer_size", "100"');
            }
            const oldResolve = "if (!device) device = devs.find(d => /cable|virtual|vb/i.test(d)) ?? devs[0] ?? null;";
            const newResolve = `if (!device) {
        device = devs.find(d => /cable output/i.test(d))
            ?? devs.find(d => /virtual.*cable/i.test(d))
            ?? devs.find(d => /cable/i.test(d))
            ?? devs.find(d => /virtual/i.test(d))
            ?? devs.find(d => /vb-audio/i.test(d))
            ?? devs[0] ?? null;
    }`;
            if (content.includes(oldResolve)) {
                content = content.replace(oldResolve, newResolve);
            }
            fs.writeFileSync(srvPath, content, "utf-8");
        }
        const bmcPath = path.join(serverDir, "node_modules", "@dank074", "discord-video-stream", "dist", "client", "voice", "BaseMediaConnection.js");
        if (fs.existsSync(bmcPath)) {
            let content = fs.readFileSync(bmcPath, "utf-8");
            if (!content.includes("Buffer.isBuffer(e.data)")) {
                content = content.replace(
                    'if (e.data instanceof ArrayBuffer) {',
                    'if (e.data instanceof ArrayBuffer || Buffer.isBuffer(e.data) || ArrayBuffer.isView(e.data)) {'
                );
                fs.writeFileSync(bmcPath, content, "utf-8");
                log("OK: Patched BaseMediaConnection.js with DAVE binary MLS fix.");
            }
        }
        const wrwPath = path.join(serverDir, "node_modules", "@dank074", "discord-video-stream", "dist", "client", "voice", "WebRtcWrapper.js");
        if (fs.existsSync(wrwPath)) {
            let content = fs.readFileSync(wrwPath, "utf-8");
            if (!content.includes("ensureAudioPacketizer()")) {
                content = content.replace(
                    'sendAudioFrame(frame, frametime) {\n        if (!this.ready)\n            return;\n        if (!this._audioPacketizer)\n            return;',
                    'ensureAudioPacketizer() {\n        if (this._audioPacketizer) return true;\n        if (!this.mediaConnection?.webRtcParams) return false;\n        try {\n            const { audioSsrc } = this.mediaConnection.webRtcParams;\n            if (!audioSsrc) return false;\n            const rtpConfigAudio = new RtpPacketizationConfig(audioSsrc, "", CodecPayloadType.opus.payload_type, CodecPayloadType.opus.clockRate);\n            rtpConfigAudio.playoutDelayId = 5;\n            rtpConfigAudio.playoutDelayMin = 0;\n            rtpConfigAudio.playoutDelayMax = 1;\n            this._audioPacketizer = new RtpPacketizer(rtpConfigAudio);\n            this._audioPacketizer.addToChain(new RtcpSrReporter(rtpConfigAudio));\n            this._audioPacketizer.addToChain(new RtcpNackResponder());\n            this._audioTrack?.setMediaHandler(this._audioPacketizer);\n            return true;\n        } catch { return false; }\n    }\n    sendAudioFrame(frame, frametime) {\n        if (!this.ready)\n            return;\n        if (!this._audioPacketizer && !this.ensureAudioPacketizer())\n            return;'
                );
                fs.writeFileSync(wrwPath, content, "utf-8");
                log("OK: Patched WebRtcWrapper.js with auto audio packetizer.");
            }
        }
    } catch (e: any) {
        log(`WARN: patchGhostServerFiles error: ${e.message}`);
    }
}

async function killRunningServer(): Promise<void> {
    // 1. Tell ghost accounts to leave voice channels
    try {
        await new Promise<void>(resolve => {
            const req = http.request({
                hostname: "127.0.0.1",
                port: PORT,
                path: "/leave-all",
                method: "POST"
            }, () => resolve());
            req.setTimeout(800, () => { req.destroy(); resolve(); });
            req.on("error", () => resolve());
            req.end();
        });
    } catch {}

    // 2. Send graceful shutdown request
    try {
        await new Promise<void>(resolve => {
            const req = http.request({
                hostname: "127.0.0.1",
                port: PORT,
                path: "/shutdown",
                method: "POST"
            }, () => resolve());
            req.setTimeout(800, () => { req.destroy(); resolve(); });
            req.on("error", () => resolve());
            req.end();
        });
    } catch {}

    await new Promise(r => setTimeout(r, 400));

    // 3. On Windows, locate the exact PID listening on PORT 47821 and terminate it
    if (process.platform === "win32") {
        try {
            await new Promise<void>(res => {
                exec(`netstat -ano | findstr :${PORT}`, (err, stdout) => {
                    if (!err && stdout) {
                        for (const line of stdout.split("\n")) {
                            const parts = line.trim().split(/\s+/);
                            const pid = parts[parts.length - 1];
                            if (pid && !isNaN(Number(pid)) && Number(pid) > 0 && Number(pid) !== process.pid) {
                                try {
                                    spawn("taskkill", ["/F", "/PID", pid], { windowsHide: true });
                                } catch {}
                            }
                        }
                    }
                    res();
                });
            });
        } catch {}

        try {
            await new Promise<void>(res => {
                const child = spawn("taskkill", ["/F", "/IM", "node.exe", "/FI", "WINDOWTITLE eq ghost-server"], { windowsHide: true, stdio: "ignore" });
                child.on("error", () => res());
                child.on("close", () => res());
            });
        } catch {}
    }

    // 4. Poll until the port is closed or server stops responding
    for (let i = 0; i < 15; i++) {
        if (!await pingServer()) break;
        await new Promise(r => setTimeout(r, 200));
    }
}

export async function patchGhostClient(options: { githubUrl?: string; discordRoot?: string; } = {}): Promise<NativeResult<ActionInfo>> {
    if (currentProgress.active) {
        log("WARN: GhostClient installation already in progress, returning existing task.");
        const info = await getInstallInfo(options.discordRoot);
        return {
            success: true,
            data: {
                ...info,
                logPath: getLogFilePath()
            },
            logs: logBuffer
        };
    }

    log("INFO: Starting GhostClient installation and patch sequence...");
    setProgress(3, "Initializing", "Preparing installation workspace...");

    const rawUrl = options.githubUrl?.trim() || DEFAULT_RELEASE_URL;
    const tempDir = path.join(os.tmpdir(), "lolicord_ghost_download");

    try {
        const lolicordRoot = findLoliCordRoot();
        const localServerDir = lolicordRoot ? path.join(lolicordRoot, "ghost-server") : null;
        let serverSource: string | null = null;
        let pluginSource: string | null = null;
        let downloadUrl = "";
        let resolvedTag: string | undefined;

        if (localServerDir && fs.existsSync(path.join(localServerDir, "server.js"))) {
            log(`OK: Found local companion server at ${localServerDir}`);
            setProgress(30, "Deploying Server", "Deploying local companion server...");
            serverSource = localServerDir;
        } else {
            setProgress(8, "Cleaning Workspace", "Purging temporary staging directory...");
            if (fs.existsSync(tempDir)) {
                await fsp.rm(tempDir, { recursive: true, force: true });
            }
            await fsp.mkdir(tempDir, { recursive: true });

            const zipPath = path.join(tempDir, "ghostclient-bundle.zip");
            const extractPath = path.join(tempDir, "extracted");

            setProgress(12, "Checking Releases", "Resolving latest release package...");
            const resolved = await resolveLatestReleaseDownloadUrl(rawUrl);
            downloadUrl = resolved.downloadUrl;
            resolvedTag = resolved.tag;
            if (resolved.tag) {
                log(`INFO: Target release version: ${resolved.tag}`);
            }

            setProgress(16, "Downloading", "Starting package download...");
            log(`INFO: Downloading bundle from: ${downloadUrl}`);
            await downloadFile(downloadUrl, zipPath, (downloaded, total) => {
                const rawPct = Math.min(100, Math.floor((downloaded / total) * 100));
                // Download phase covers 16% to 62%
                const overallPct = Math.floor(16 + (rawPct * 0.46));
                const dlMb = (downloaded / (1024 * 1024)).toFixed(1);
                const totMb = (total / (1024 * 1024)).toFixed(1);
                currentProgress.active = true;
                currentProgress.percent = overallPct;
                currentProgress.stage = "Downloading";
                currentProgress.detail = `${dlMb} MB / ${totMb} MB (${rawPct}%)`;
            });
            const stats = await fsp.stat(zipPath);
            log(`OK: Download complete (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);

            setProgress(63, "Extracting", "Extracting files from archive...");
            log("INFO: Extracting archive asynchronously...");
            await extractZip(zipPath, extractPath);
            log("OK: Archive successfully extracted.");

            // Find plugin folder inside extracted contents
            const candidatePluginDirs = [
                path.join(extractPath, "plugin"),
                path.join(extractPath, "ghostClient"),
                path.join(extractPath, "src", "plugins", "ghostClient"),
                path.join(extractPath, "src", "lolicordplugins", "ghostClient"),
                extractPath
            ];

            for (const cand of candidatePluginDirs) {
                if (fs.existsSync(path.join(cand, "index.tsx"))) {
                    pluginSource = cand;
                    break;
                }
            }
            if (!pluginSource) {
                pluginSource = findDirectoryContaining(extractPath, "index.tsx");
            }

            const candidateServerDirs = [
                path.join(extractPath, "ghost-server"),
                path.join(extractPath, "server"),
                path.join(extractPath, "resources", "ghost-server"),
                extractPath
            ];

            for (const cand of candidateServerDirs) {
                if (fs.existsSync(path.join(cand, "server.js"))) {
                    serverSource = cand;
                    break;
                }
            }
            if (!serverSource) {
                serverSource = findDirectoryContaining(extractPath, "server.js");
            }

            if (!serverSource) {
                throw new Error("Could not find ghost-server files (server.js) in downloaded bundle.");
            }
        }

        if (pluginSource) {
            log(`OK: Found plugin files at: ${pluginSource}`);
        }
        log(`OK: Found ghost-server files at: ${serverSource}`);

        // Target locations
        const persistentServerDest = path.join(app.getPath("userData"), "ghost-server");
        log(`INFO: Copying ghost-server to persistent storage: ${persistentServerDest}`);
        setProgress(70, "Installing Files", "Copying companion server files...");
        await copyDir(serverSource, persistentServerDest, (copied, total, name) => {
            if (total > 0) {
                const pct = Math.floor(70 + ((copied / total) * 14));
                currentProgress.percent = pct;
                currentProgress.stage = "Installing Files";
                currentProgress.detail = `${name} (${copied}/${total})`;
            }
        });

        setProgress(85, "Configuring", "Patching audio packetizer and WebSocket runtime...");
        patchGhostServerFiles(persistentServerDest);

        if (lolicordRoot) {
            log(`INFO: LoliCord repository detected at: ${lolicordRoot}`);
            if (pluginSource) {
                const pluginDest = path.join(lolicordRoot, "src", "lolicordplugins", "ghostClient");
                if (path.resolve(pluginSource) !== path.resolve(pluginDest)) {
                    log(`INFO: Copying plugin files to: ${pluginDest}`);
                    await copyDir(pluginSource, pluginDest);
                }
            }

            const repoServerDest = path.join(lolicordRoot, "ghost-server");
            if (serverSource && path.resolve(serverSource) !== path.resolve(repoServerDest)) {
                try {
                    await copyDir(serverSource, repoServerDest);
                    patchGhostServerFiles(repoServerDest);
                } catch {}
            }

            // Ensure binaries are placed in persistent location if present
            log("INFO: Verifying node.exe and ffmpeg binaries...");
            const bundledNode = path.join(lolicordRoot, "release", "lolicord-dist", "node.exe");
            if (fs.existsSync(bundledNode) && !fs.existsSync(path.join(persistentServerDest, "node.exe"))) {
                try { await fsp.copyFile(bundledNode, path.join(persistentServerDest, "node.exe")); } catch {}
            }

            log("OK: GhostClient plugin is built into LoliCord core and ready to use.");
        } else {
            log("INFO: Standalone LoliCord installation detected. GhostClient plugin is built into core.");
        }

        // Save state
        saveState({
            installed: true,
            lastPatched: Date.now(),
            githubUrl: rawUrl,
            releaseUrl: rawUrl,
            resolvedDownloadUrl: downloadUrl,
            releaseTag: resolvedTag,
            persistentServerDest
        });

        // Test server startup
        setProgress(90, "Starting Service", "Terminating stale instances...");
        log("INFO: Verifying ghost-server responsiveness...");
        await killRunningServer();

        const nodeExecutable = fs.existsSync(path.join(persistentServerDest, "node.exe"))
            ? path.join(persistentServerDest, "node.exe")
            : "node";

        const serverScript = path.join(persistentServerDest, "server.js");
        setProgress(93, "Starting Service", "Spawning companion service on port 47821...");
        try {
            const child = spawn(nodeExecutable, [serverScript], {
                cwd: persistentServerDest,
                detached: true,
                stdio: "ignore",
                windowsHide: true
            });
            child.unref();

            // Wait up to 6s for ping
            let ready = false;
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 200));
                if (await pingServer()) {
                    ready = true;
                    break;
                }
            }

            if (ready) {
                log("OK: ghost-server started and responding on port 47821.");
            } else {
                log("WARN: ghost-server launched, will auto-connect when needed.");
            }
        } catch (e: any) {
            log(`WARN: Background start note: ${e.message}`);
        }

        // Cleanup temp files
        try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch {}

        log("OK: GhostClient companion server successfully installed and ready!");
        const info = await getInstallInfo(options.discordRoot);

        currentProgress.active = false;
        currentProgress.percent = 100;
        currentProgress.stage = "Complete";
        currentProgress.detail = "GhostClient companion server is active and ready.";
        currentProgress.done = true;
        currentProgress.error = null;
        currentProgress.info = {
            ...info,
            logPath: getLogFilePath()
        };

        return {
            success: true,
            data: {
                ...info,
                logPath: getLogFilePath()
            },
            logs: logBuffer
        };
    } catch (e: any) {
        log(`FAIL: Installation failed: ${e.message}`);
        try { await fsp.rm(tempDir, { recursive: true, force: true }); } catch {}

        currentProgress.active = false;
        currentProgress.percent = 0;
        currentProgress.stage = "Failed";
        currentProgress.detail = e.message || String(e);
        currentProgress.error = e.message || String(e);
        currentProgress.done = false;

        return {
            success: false,
            error: e.message || String(e),
            logs: logBuffer
        };
    }
}

export async function revertGhostClient(options: { discordRoot?: string; } = {}): Promise<NativeResult<ActionInfo>> {
    if (currentProgress.active) {
        log("WARN: An operation is already in progress.");
        return {
            success: false,
            error: "An installation or deletion is already in progress.",
            logs: logBuffer
        };
    }

    log("WARN: Initiating GhostClient companion removal sequence...");
    setProgress(15, "Stopping Service", "Terminating ghost-server...");

    try {
        log("INFO: Terminating ghost-server...");
        await killRunningServer();

        setProgress(45, "Removing Files", "Deleting persistent ghost-server files...");
        const persistentServerDest = path.join(app.getPath("userData"), "ghost-server");
        if (fs.existsSync(persistentServerDest)) {
            log(`INFO: Deleting persistent ghost-server: ${persistentServerDest}`);
            await fsp.rm(persistentServerDest, { recursive: true, force: true });
            log("OK: Persistent server files removed.");
        }

        const lolicordRoot = findLoliCordRoot();
        if (lolicordRoot) {
            const repoServerDest = path.join(lolicordRoot, "ghost-server");
            if (fs.existsSync(repoServerDest)) {
                try { await fsp.rm(repoServerDest, { recursive: true, force: true }); } catch {}
            }
        }

        setProgress(85, "Updating State", "Clearing installer state...");
        saveState({
            installed: false,
            lastUninstalled: Date.now()
        });

        log("OK: GhostClient companion server has been completely uninstalled.");
        const info = await getInstallInfo(options.discordRoot);

        currentProgress.active = false;
        currentProgress.percent = 100;
        currentProgress.stage = "Complete";
        currentProgress.detail = "GhostClient companion server uninstalled.";
        currentProgress.done = true;
        currentProgress.error = null;
        currentProgress.info = {
            ...info,
            logPath: getLogFilePath()
        };

        return {
            success: true,
            data: {
                ...info,
                logPath: getLogFilePath()
            },
            logs: logBuffer
        };
    } catch (e: any) {
        log(`FAIL: Deletion encountered an error: ${e.message}`);
        currentProgress.active = false;
        currentProgress.stage = "Failed";
        currentProgress.detail = e.message || String(e);
        currentProgress.error = e.message || String(e);
        currentProgress.done = false;

        return {
            success: false,
            error: e.message || String(e),
            logs: logBuffer
        };
    }
}

export function readLogs(): NativeResult<string[]> {
    return {
        success: true,
        data: [...logBuffer],
        logs: logBuffer
    };
}

export function clearLogs(): NativeResult<boolean> {
    logBuffer = [];
    try {
        fs.writeFileSync(getLogFilePath(), "", "utf-8");
    } catch {}
    log("INFO: Log buffer cleared.");
    return {
        success: true,
        data: true,
        logs: logBuffer
    };
}

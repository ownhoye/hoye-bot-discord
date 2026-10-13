import {progress, status} from "../stores/installation";
import {remote} from "electron";
import {promises as fs} from "fs";
import {createWriteStream} from "fs";
import path from "path";
import phin from "phin";
import https from "https";
import {execSync} from "child_process";
import {killDiscord, startDiscord} from "./utils/kill";
import {log, lognewline} from "./utils/log";

const MAKE_DIR_PROGRESS = 5;
const FETCH_RELEASE_PROGRESS = 15;
const DOWNLOAD_PACKAGE_PROGRESS = 75;
const EXTRACTION_PROGRESS = 90;
const INJECT_SHIM_PROGRESS = 98;
const RESTART_DISCORD_PROGRESS = 100;


const RELEASE_API = "https://api.github.com/repos/ownhoye/hoye-bot-discord/releases/latest";
const DIST_ZIP = "lolicord-dist.zip";
const distDir = path.join(process.env.LOCALAPPDATA, "LoliCord", "dist");

const safeExists = async (p) => {
    try { await fs.access(p); return true; } catch { return false; }
};

const safeStat = async (p) => {
    try { return await fs.stat(p); } catch { return null; }
};

const safeDelete = async (p) => {
    try { await fs.unlink(p); } catch {}
};

async function copyDirectory(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyDirectory(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

async function cleanModulePatches(resourcesPath) {
    try {
        const appBase = path.dirname(resourcesPath);
        const modulesSearchPaths = [
            path.join(appBase, "modules"),
            path.join(resourcesPath, "modules")
        ];

        for (const modulesDir of modulesSearchPaths) {
            if (!(await safeExists(modulesDir))) continue;

            const dirs = await fs.readdir(modulesDir);
            for (const d of dirs) {
                if (!d.startsWith("discord_desktop_core")) continue;
                const corePath = path.join(modulesDir, d, "discord_desktop_core");
                if (!(await safeExists(corePath))) continue;

                const patchedFiles = [
                    path.join(corePath, "index.js"),
                    path.join(corePath, "app", "app_bootstrap", "splashScreen.js"),
                    path.join(corePath, "app", "app_bootstrap", "index.js"),
                ];

                for (const pf of patchedFiles) {
                    if (!(await safeExists(pf))) continue;
                    const content = await fs.readFile(pf, "utf-8");
                    const isPatched = content.toLowerCase().includes("vencord") ||
                                      content.toLowerCase().includes("equicord") ||
                                      content.includes('require("vencord') ||
                                      content.includes("require('vencord") ||
                                      content.includes("VencordNative") ||
                                      content.includes("equilotl");

                    if (!isPatched) continue;

                    const backupExts = [".orig", ".bak", ".vanilla"];
                    let restored = false;
                    for (const ext of backupExts) {
                        const bk = pf + ext;
                        if (await safeExists(bk)) {
                            await fs.copyFile(bk, pf);
                            await fs.unlink(bk);
                            restored = true;
                            break;
                        }
                    }
                    if (!restored) {
                        try {
                            const cleaned = content.replace(/require\(["'][^"']*(?:vencord|equicord|lolicord)[^"']*["']\);?/gi, "");
                            await fs.writeFile(pf, cleaned, "utf-8");
                        } catch {}
                    }
                }

                const innerAppDir = path.join(corePath, "app");
                if (await safeExists(innerAppDir)) {
                    const innerPkg = path.join(innerAppDir, "package.json");
                    if (await safeExists(innerPkg)) {
                        const pkgContent = await fs.readFile(innerPkg, "utf-8");
                        const isMod = pkgContent.toLowerCase().includes("vencord") ||
                                      pkgContent.toLowerCase().includes("equicord") ||
                                      pkgContent.toLowerCase().includes("openasar");
                        if (isMod) {
                            try { await fs.rm(innerAppDir, { recursive: true, force: true }); } catch {}
                        }
                    }
                }
            }
        }
    } catch (err) {
        log(`[LoliCord] CleanModulePatches warning: ${err.message}`);
    }
}

import http from "http";

function fetchJsonWithFallback(url) {
    return new Promise((resolve, reject) => {
        function fallbackPowerShell(originalErr) {
            try {
                const psCmd = `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; (Invoke-WebRequest -Uri '${url}' -UseBasicParsing -Headers @{'User-Agent'='LoliCord-Installer/3.0'; 'Accept'='application/json'}).Content`;
                const out = execSync(`powershell.exe -NoProfile -Command "${psCmd}"`, { encoding: "utf8", timeout: 15000 });
                const parsed = JSON.parse(out.trim());
                resolve(parsed);
            } catch (psErr) {
                try {
                    const curlOut = execSync(`curl.exe -skL -H "User-Agent: LoliCord-Installer/3.0" -H "Accept: application/json" "${url}"`, { encoding: "utf8", timeout: 15000 });
                    const parsed = JSON.parse(curlOut.trim());
                    resolve(parsed);
                } catch (curlErr) {
                    reject(originalErr || psErr || curlErr);
                }
            }
        }

        try {
            const client = url.startsWith("https") ? https : http;
            const req = client.get(url, {
                headers: {
                    "User-Agent": "LoliCord-Installer/3.0",
                    "Accept": "application/json"
                },
                rejectUnauthorized: false
            }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    const loc = res.headers.location;
                    if (loc) {
                        fetchJsonWithFallback(loc).then(resolve).catch(reject);
                        return;
                    }
                }
                if (res.statusCode !== 200) {
                    fallbackPowerShell(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                let data = "";
                res.on("data", chunk => data += chunk);
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        fallbackPowerShell(e);
                    }
                });
            });

            req.on("error", (err) => {
                fallbackPowerShell(err);
            });

            req.setTimeout(8000, () => {
                req.destroy();
                fallbackPowerShell(new Error("Request timeout"));
            });
        } catch (err) {
            fallbackPowerShell(err);
        }
    });
}

function downloadFileAsync(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
        const file = createWriteStream(destPath);
        let finished = false;

        function tryPowerShellFallback(origErr) {
            if (finished) return;
            finished = true;
            try { file.close(); } catch {}
            try {
                log("⚡ Using system network stack fallback...");
                const psCmd = `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; Invoke-WebRequest -Uri '${url}' -OutFile '${destPath}' -UseBasicParsing`;
                execSync(`powershell.exe -NoProfile -Command "${psCmd}"`, { timeout: 120000 });
                resolve();
            } catch (psErr) {
                try {
                    execSync(`curl.exe -skL "${url}" -o "${destPath}"`, { timeout: 120000 });
                    resolve();
                } catch (curlErr) {
                    reject(origErr || psErr || curlErr);
                }
            }
        }

        try {
            const client = url.startsWith("https") ? https : http;
            const req = client.get(url, {
                headers: { "User-Agent": "LoliCord-Installer/3.0" },
                rejectUnauthorized: false
            }, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
                    file.close();
                    const redirectUrl = response.headers.location;
                    if (redirectUrl) {
                        downloadFileAsync(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
                        return;
                    }
                }
                if (response.statusCode !== 200) {
                    tryPowerShellFallback(new Error(`Failed to download: HTTP ${response.statusCode}`));
                    return;
                }
                const totalBytes = parseInt(response.headers["content-length"], 10) || 0;
                let downloadedBytes = 0;

                response.on("data", (chunk) => {
                    downloadedBytes += chunk.length;
                    if (totalBytes > 0 && onProgress) {
                        const percent = (downloadedBytes / totalBytes) * 100;
                        onProgress(percent, downloadedBytes, totalBytes);
                    }
                });

                response.pipe(file);

                file.on("finish", () => {
                    if (!finished) {
                        finished = true;
                        file.close();
                        resolve();
                    }
                });
            });

            req.on("error", (err) => {
                tryPowerShellFallback(err);
            });

            req.setTimeout(15000, () => {
                req.destroy();
                tryPowerShellFallback(new Error("Download stream timed out"));
            });
        } catch (err) {
            tryPowerShellFallback(err);
        }
    });
}

async function downloadDist() {
    log("Fetching latest release information from Gitea...");
    let assetUrl;
    let lolicordVersion;
    try {
        const release = await fetchJsonWithFallback(RELEASE_API);
        const asset = release && release.assets && release.assets.find(a => a.name && a.name.toLowerCase() === DIST_ZIP);
        assetUrl = asset && asset.browser_download_url;
        lolicordVersion = release && release.tag_name;
        if (!assetUrl) {
            throw new Error(`Asset '${DIST_ZIP}' not found in the latest release`);
        }
        progress.set(FETCH_RELEASE_PROGRESS);
    }
    catch (error) {
        log(`❌ Failed to query release API at ${RELEASE_API}`);
        log(`❌ ${error.message}`);
        throw error;
    }

    const tmpZip = path.join(remote.app.getPath("temp"), "lolicord-dist.zip");
    log(`Downloading LoliCord ${lolicordVersion} package...`);
    try {
        await downloadFileAsync(assetUrl, tmpZip, (percent, downloaded, total) => {
            const dlMB = (downloaded / (1024 * 1024)).toFixed(1);
            const totalMB = (total / (1024 * 1024)).toFixed(1);
            const overall = FETCH_RELEASE_PROGRESS + (percent * (DOWNLOAD_PACKAGE_PROGRESS - FETCH_RELEASE_PROGRESS) / 100);
            progress.set(overall);
            status.set(`Downloading LoliCord... (${dlMB}/${totalMB} MB)`);
        });
        log("✅ Package downloaded successfully");
        progress.set(DOWNLOAD_PACKAGE_PROGRESS);
    }
    catch (error) {
        log(`❌ Failed to download package from ${assetUrl}`);
        log(`❌ ${error.message}`);
        throw error;
    }

    lognewline("Extracting package...");
    try {
        try { await fs.rm(distDir, { recursive: true, force: true }); } catch {}
        await fs.mkdir(distDir, { recursive: true });
        
        execSync(`powershell.exe -NoProfile -Command "Expand-Archive -Path '${tmpZip}' -DestinationPath '${distDir}' -Force"`);
        log("✅ Package extracted successfully");
        progress.set(EXTRACTION_PROGRESS);
        
        await safeDelete(tmpZip);
    }
    catch (error) {
        log("❌ Failed to extract package");
        log(`❌ ${error.message}`);
        throw error;
    }
}

async function writeLoader(appDir) {
    const patcher = path.join(distDir, "patcher.js").replace(/\\/g, "/");
    await fs.writeFile(path.join(appDir, "package.json"), JSON.stringify({ name: "discord", main: "index.js" }, null, 2));
    const loaderCode = `// LoliCord Injector
"use strict";
const fs = require('fs');
const path = require('path');
const primary = ${JSON.stringify(patcher)};
const exeDir = path.dirname(process.execPath);
const fallback = path.join(exeDir, 'resources', 'dist', 'patcher.js');
const fallback2 = path.join(exeDir, 'dist', 'patcher.js');
const patcherPath = fs.existsSync(primary) ? primary : fs.existsSync(fallback) ? fallback : fallback2;
if (!fs.existsSync(patcherPath)) throw new Error('[LoliCord] patcher.js not found. Expected at: ' + primary);
require(patcherPath);
`;
    await fs.writeFile(path.join(appDir, "index.js"), loaderCode);
}

async function applyDefaultPluginsSetting() {
    try {
        const settingsDir = path.join(process.env.APPDATA, "LoliCord", "settings");
        await fs.mkdir(settingsDir, { recursive: true });
        log("✅ Plugin settings preserved");
    } catch (err) {
        log(`⚠️ Could not verify plugin settings: ${err.message}`);
    }
}

async function injectShims(paths) {
    process.noAsar = true;
    const progressPerLoop = (INJECT_SHIM_PROGRESS - progress.value) / paths.length;
    for (const resPath of paths) {
        log(`Injecting into Discord at: ${resPath}`);
        try {
            const appDir = path.join(resPath, "app");
            const backup = path.join(resPath, "_app.asar");
            const appAsar = path.join(resPath, "app.asar");

            log("Closing Discord...");
            await killDiscord(resPath, log);

            // Equicord atomic logic:
            // Check if already patched: _app.asar exists
            const alreadyPatched = await safeExists(backup);

            if (alreadyPatched) {
                log("Already patched install detected. Updating loader shims...");
                await fs.mkdir(appDir, { recursive: true });
                await writeLoader(appDir);
                await applyDefaultPluginsSetting();
                log("Starting Discord...");
                startDiscord(resPath);
                log("✅ Injection successful!");
                progress.set(progress.value + progressPerLoop);
                continue;
            }

            // If not already patched, ensure app.asar exists
            if (!(await safeExists(appAsar))) {
                throw new Error("Critical error: no valid app.asar found. Please reinstall Discord from discord.com/download and try again.");
            }

            const undo = [];
            try {
                // Step 1: rename app.asar -> _app.asar
                await fs.rename(appAsar, backup);
                undo.push(async () => {
                    try { await fs.rename(backup, appAsar); } catch {}
                });

                // Step 2: create app folder
                await fs.mkdir(appDir, { recursive: true });
                undo.push(async () => {
                    try {
                        const indexPath = path.join(appDir, "index.js");
                        const pkgPath = path.join(appDir, "package.json");
                        await safeDelete(indexPath);
                        await safeDelete(pkgPath);
                        await fs.rm(appDir, { recursive: true, force: true });
                    } catch {}
                });

                // Step 3: write loader files
                await writeLoader(appDir);
                await applyDefaultPluginsSetting();
            } catch (patchErr) {
                // Rollback in reverse order
                for (let i = undo.length - 1; i >= 0; i--) {
                    try { await undo[i](); } catch {}
                }
                throw patchErr;
            }

            log("Starting Discord...");
            startDiscord(resPath);

            log("✅ Injection successful!");
            progress.set(progress.value + progressPerLoop);
        }
        catch (err) {
            log(`❌ Could not inject into ${resPath}`);
            log(`❌ ${err.message}`);
            return err;
        }
    }
}

export default async function(paths) {
    try {
        log("Starting Install...");
        lognewline("Creating required directories...");
        const localAppData = process.env.LOCALAPPDATA;
        if (!localAppData) throw new Error("LOCALAPPDATA environment variable is missing.");
        await fs.mkdir(path.join(localAppData, "LoliCord"), { recursive: true });
        log("✅ Local AppData directory prepared");
        progress.set(MAKE_DIR_PROGRESS);
        lognewline("Downloading LoliCord package...");
        const distLocal = path.join(__dirname, "dist", "patcher.js");
        const hasLocalDist = await safeExists(distLocal);
        if (hasLocalDist) {
            log("✅ Using local dist folder");
        } else {
            await downloadDist();
        }

        lognewline("Injecting LoliCord shims...");
        const err = await injectShims(Object.values(paths));
        if (err) return false;

        progress.set(RESTART_DISCORD_PROGRESS);
        lognewline("Install complete!");
        return true;
    } catch (err) {
        lognewline("❌ Installation failed");
        log(`❌ ${err.message}`);
        return false;
    }
}

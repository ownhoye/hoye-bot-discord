/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// ─── Environment detection ────────────────────────────────────────────────────
// Works in Electron (Discord desktop) AND browser extensions (Chrome/Firefox)

const IS_ELECTRON = typeof process !== "undefined" && process.versions?.electron;

let _electronNet: typeof import("electron")["net"] | null = null;
let _BrowserWindow: typeof import("electron")["BrowserWindow"] | null = null;

if (IS_ELECTRON) {
    try {
        const electron = require("electron");
        _electronNet = electron.net;
        _BrowserWindow = electron.BrowserWindow;
    } catch { }
}

// ─── Unified fetch (Electron net OR browser fetch) ────────────────────────────

async function netGet(url: string, headers?: Record<string, string>): Promise<string> {
    const defaultHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Referer": "https://soundcloud.com/",
        ...(headers ?? {}),
    };

    if (_electronNet) {
        const resp = await _electronNet.fetch(url, { headers: defaultHeaders });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.text();
    }

    // Browser extension mode: use standard fetch
    // SoundCloud API supports CORS for api-v2.soundcloud.com endpoints
    const resp = await fetch(url, { headers: defaultHeaders });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.text();
}

// ─── Fetch dynamique du client_id SoundCloud ─────────────────────────────────
// Même logique que sc_fetch_client_id / sc_parse_js_for_clientid en C :
//   Étape 1 : GET soundcloud.com → extraire les <script src="...">
//   Étape 2 : GET le dernier bundle JS → chercher client_id:"XXXXXXXX"

export async function fetchSoundCloudClientId(_?: any): Promise<string | null> {
    try {
        // Étape 1 : charger soundcloud.com
        const html = await netGet("https://soundcloud.com/", {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        });

        // Extraire les URLs des bundles JS
        const scriptUrls: string[] = [];
        const re = /<script[^>]+src="(https:\/\/[^"]+\.js[^"]*)"[^>]*>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html)) !== null) {
            const url = m[1];
            if (!url.includes("cookielaw") && !url.includes("analytics") && !url.includes("st-f"))
                scriptUrls.push(url);
        }

        if (scriptUrls.length === 0) return null;

        // Étape 2 : tester les bundles JS (on cherche dans les plus récents)
        for (const jsUrl of scriptUrls.slice(-5).reverse()) {
            try {
                const js = await netGet(jsUrl);

                // Patterns mis à jour pour 2024/2025
                const patterns = [
                    /client_id\s*:\s*"([a-zA-Z0-9]{32})"/,
                    /client_id\s*=\s*"([a-zA-Z0-9]{32})"/,
                    /client_id\s*:\s*'([a-zA-Z0-9]{32})'/,
                    /client_id\s*=\s*'([a-zA-Z0-9]{32})'/,
                    /"client_id"\s*:\s*"([a-zA-Z0-9]{32})"/,
                ];
                for (const pat of patterns) {
                    const match = js.match(pat);
                    if (match?.[1]) return match[1];
                }
            } catch { /* essayer le suivant */ }
        }

        return null;
    } catch (e: any) {
        console.error("[SoundCloudPlayer] fetchClientId error:", e?.message);
        return null;
    }
}

// ─── Recherche de pistes ──────────────────────────────────────────────────────

export async function searchSoundCloud(
    _: any,
    query: string,
    clientId: string,
    offset = 0,
    limit = 50
): Promise<string | null> {
    try {
        const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=${limit}&offset=${offset}`;
        return await netGet(url);
    } catch (e: any) {
        // Retourner le code HTTP pour détecter l'expiration du client_id
        throw new Error(e?.message ?? String(e));
    }
}

export async function fetchLyrics(
    _: any,
    title: string,
    artist: string,
    durationMs: number
): Promise<string | null> {
    try {
        const cleanTitle = title
            .replace(/\s*[\(\[](official\s*(video|audio|music\s*video)|lyrics?|visualizer|remix|edit|prod\.[^\)\]]+)[\)\]]/gi, "")
            .replace(/\s*feat\..*$/i, "")
            .replace(/\s*ft\..*$/i, "")
            .trim();

        const durationSec = Math.round((durationMs || 0) / 1000);

        // 1. Essayer la correspondance exacte
        try {
            const exactUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(artist)}&duration=${durationSec}`;
            const res = await netGet(exactUrl, { "User-Agent": "LoliCord/1.26.2 (https://github.com/Vendicated/Vencord)" });
            if (res) {
                const parsed = JSON.parse(res);
                if (parsed?.plainLyrics || parsed?.syncedLyrics) {
                    return res;
                }
            }
        } catch { }

        // 2. Recherche générale
        try {
            const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${artist}`)}`;
            const res = await netGet(searchUrl, { "User-Agent": "LoliCord/1.26.2 (https://github.com/Vendicated/Vencord)" });
            if (res) {
                const list = JSON.parse(res);
                if (Array.isArray(list) && list.length > 0) {
                    const match = list.find((item: any) => item.plainLyrics || item.syncedLyrics) || list[0];
                    if (match?.plainLyrics || match?.syncedLyrics) {
                        return JSON.stringify(match);
                    }
                }
            }
        } catch { }

        return null;
    } catch {
        return null;
    }
}



// ─── Résolution de l'URL de stream ───────────────────────────────────────────

export async function resolveStreamUrl(_: any, url: string, clientId: string): Promise<string | null> {
    try {
        const streamUrl = new URL(url);
        streamUrl.searchParams.set("client_id", clientId);

        const fetchHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Referer": "https://soundcloud.com/",
        };

        let resp: Response;
        if (_electronNet) {
            resp = await _electronNet.fetch(streamUrl.toString(), { redirect: "follow", headers: fetchHeaders });
        } else {
            resp = await fetch(streamUrl.toString(), { redirect: "follow", headers: fetchHeaders });
        }

        if (!resp.ok) {
            console.error(`[SoundCloudNative] Stream resolution failed: ${resp.status}`);
            return null;
        }

        const text = await resp.text();
        try {
            const json = JSON.parse(text);
            return json.url || null;
        } catch {
            return resp.url;
        }
    } catch (e: any) {
        console.error("[SoundCloudNative] resolveStreamUrl error:", e?.message);
        return null;
    }
}

export async function resolveTrack(
    _: any,
    trackId: string,
    clientId: string
): Promise<string | null> {
    try {
        const url = `https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${clientId}`;
        return await netGet(url);
    } catch (e: any) {
        throw new Error(e?.message ?? String(e));
    }
}

export async function fetchSoundCloudUser(
    _: any,
    userId: string,
    clientId: string
): Promise<string | null> {
    try {
        const url = `https://api-v2.soundcloud.com/users/${userId}?client_id=${clientId}`;
        return await netGet(url);
    } catch (e: any) {
        throw new Error(e?.message ?? String(e));
    }
}

export async function fetchSoundCloudUserTracks(
    _: any,
    userId: string,
    clientId: string,
    offset = 0,
    limit = 50
): Promise<string | null> {
    try {
        const url = `https://api-v2.soundcloud.com/users/${userId}/tracks?client_id=${clientId}&limit=${limit}&offset=${offset}`;
        return await netGet(url);
    } catch (e: any) {
        throw new Error(e?.message ?? String(e));
    }
}

// ─── SoundCloud Account Authentication (OAuth / Session) ──────────────────────────

// ─── Read oauth_token from browser (Chrome / Edge / Brave) ────────────────────
// Uses PowerShell + winsqlite3.dll (ships with Windows 10+) – zero external deps.

export async function getBrowserSoundCloudToken(_?: any): Promise<{
    token: string;
    cookies: string;
    browser: string;
} | null> {
    if (!IS_ELECTRON) return null;
    if (process.platform !== "win32") return null;
    try {
        const { spawnSync } = require("child_process") as typeof import("child_process");

        const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Security
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinSQLite3Sc {
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    public static extern int sqlite3_open(string file, out IntPtr db);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    public static extern int sqlite3_prepare_v2(IntPtr db, string sql, int n, out IntPtr stmt, IntPtr tail);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    public static extern int sqlite3_step(IntPtr stmt);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    public static extern IntPtr sqlite3_column_blob(IntPtr stmt, int col);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    public static extern int sqlite3_column_bytes(IntPtr stmt, int col);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    public static extern IntPtr sqlite3_column_text(IntPtr stmt, int col);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    public static extern void sqlite3_finalize(IntPtr stmt);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    public static extern int sqlite3_close(IntPtr db);
}
"@ -ErrorAction SilentlyContinue

function Get-MasterKey($lsp) {
    try {
        $ls = Get-Content $lsp -Raw | ConvertFrom-Json
        $enc = [Convert]::FromBase64String($ls.os_crypt.encrypted_key)
        $enc = $enc[5..($enc.Length-1)]
        return [System.Security.Cryptography.ProtectedData]::Unprotect($enc, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    } catch { return $null }
}

function Decrypt-Val($bytes, $mk) {
    if ($bytes.Length -lt 32) { return $null }
    $pfx = [System.Text.Encoding]::ASCII.GetString($bytes[0..2])
    if ($pfx -ne 'v10' -and $pfx -ne 'v11') { return $null }
    $nonce = $bytes[3..14]
    $rest  = $bytes[15..($bytes.Length-1)]
    $tag   = $rest[($rest.Length-16)..($rest.Length-1)]
    $ct    = $rest[0..($rest.Length-17)]
    try {
        $aes   = [System.Security.Cryptography.AesGcm]::new([byte[]]$mk)
        $plain = New-Object byte[] $ct.Length
        $aes.Decrypt([byte[]]$nonce,[byte[]]$ct,[byte[]]$tag,$plain)
        $aes.Dispose()
        return [System.Text.Encoding]::UTF8.GetString($plain)
    } catch { return $null }
}

$browsers = @(
    [pscustomobject]@{n='Chrome'; p="$env:LOCALAPPDATA\Google\Chrome\User Data"},
    [pscustomobject]@{n='Edge';   p="$env:LOCALAPPDATA\Microsoft\Edge\User Data"},
    [pscustomobject]@{n='Brave';  p="$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data"}
)

foreach ($br in $browsers) {
    $lsp = "$($br.p)\Local State"
    if (-not (Test-Path $lsp)) { continue }
    $mk = Get-MasterKey $lsp
    if (-not $mk) { continue }
    foreach ($pf in @('Default','Profile 1','Profile 2','Profile 3')) {
        $cp = "$($br.p)\$pf\Network\Cookies"
        if (-not (Test-Path $cp)) { $cp = "$($br.p)\$pf\Cookies" }
        if (-not (Test-Path $cp)) { continue }
        $tmp = "$env:TEMP\sc_ck_$(Get-Random).db"
        try { Copy-Item $cp $tmp -Force } catch { continue }
        $db = [IntPtr]::Zero
        if ([WinSQLite3Sc]::sqlite3_open($tmp,[ref]$db) -ne 0) { Remove-Item $tmp -Force -EA 0; continue }
        $stmt = [IntPtr]::Zero
        $sql = "SELECT name,encrypted_value FROM cookies WHERE host_key LIKE '%soundcloud%' ORDER BY name"
        [WinSQLite3Sc]::sqlite3_prepare_v2($db,$sql,-1,[ref]$stmt,[IntPtr]::Zero) | Out-Null
        $tok = $null; $pairs = @()
        while ([WinSQLite3Sc]::sqlite3_step($stmt) -eq 100) {
            $nptr = [WinSQLite3Sc]::sqlite3_column_text($stmt,0)
            $name = [System.Runtime.InteropServices.Marshal]::PtrToStringAnsi($nptr)
            $bptr = [WinSQLite3Sc]::sqlite3_column_blob($stmt,1)
            $blen = [WinSQLite3Sc]::sqlite3_column_bytes($stmt,1)
            if ($blen -gt 0 -and $bptr -ne [IntPtr]::Zero) {
                $b2 = New-Object byte[] $blen
                [System.Runtime.InteropServices.Marshal]::Copy($bptr,$b2,0,$blen)
                $v = Decrypt-Val $b2 $mk
                if ($v) { $pairs += "$name=$v"; if ($name -eq 'oauth_token') { $tok = $v } }
            }
        }
        [WinSQLite3Sc]::sqlite3_finalize($stmt) | Out-Null
        [WinSQLite3Sc]::sqlite3_close($db) | Out-Null
        Remove-Item $tmp -Force -EA 0
        if ($tok) {
            [ordered]@{token=$tok; cookies=($pairs -join '; '); browser=$br.n} | ConvertTo-Json -Compress
            exit 0
        }
    }
}
Write-Output 'NOT_FOUND'
`;

        const result = spawnSync("powershell", [
            "-NoProfile", "-NonInteractive", "-Command", psScript
        ], { encoding: "utf8", timeout: 15000 });

        const out = (result.stdout || "").trim();
        if (!out || out === "NOT_FOUND") return null;

        try {
            const parsed = JSON.parse(out);
            if (parsed?.token) return parsed as { token: string; cookies: string; browser: string; };
        } catch { }

        return null;
    } catch (e: any) {
        console.error("[SoundCloudNative] getBrowserSoundCloudToken error:", e?.message);
        return null;
    }
}

export async function openSoundCloudAuthWindow(
    _?: any,
    initialEmail?: string,
    initialPassword?: string
): Promise<{ token: string; } | null> {
    if (!IS_ELECTRON || !_BrowserWindow) {
        return null;
    }

    try {
        const electron = require("electron") as typeof import("electron");
        const { BrowserWindow } = electron;

        // Use a stable persistent partition so Cloudflare/DataDome recognizes genuine browser storage
        const authPartition = "persist:soundcord-sc-session";
        const authSession = electron.session.fromPartition(authPartition);

        const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

        return new Promise<{ token: string; } | null>(resolve => {
            let resolved = false;
            let childWindows: Electron.BrowserWindow[] = [];

            const authWin = new BrowserWindow({
                width: 920,
                height: 780,
                center: true,
                title: "SoundCloud - Log In",
                autoHideMenuBar: true,
                webPreferences: {
                    partition: authPartition,
                    nodeIntegration: false,
                    contextIsolation: true,
                },
            });

            authWin.webContents.setUserAgent(CHROME_UA);

            // Strip webdriver flag to prevent bot detection
            authWin.webContents.on("dom-ready", async () => {
                try {
                    await authWin.webContents.executeJavaScript(`
                        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                    `);
                } catch { }
            });

            authWin.webContents.on("dom-ready", async () => {
                try {
                    await authWin.webContents.insertCSS(`
                        html, body {
                            overflow-x: hidden !important;
                            background: #111214 !important;
                        }
                        .header, .announcement, .l-container, .stream {
                            max-width: 100% !important;
                        }
                        .modal, .dialog, .signinForm {
                            margin: 0 auto !important;
                        }
                    `);
                } catch { }
            });

            const finishWithToken = async (token: string) => {
                if (resolved) return;
                resolved = true;
                clearInterval(interval);

                // Copy token to defaultSession so all subsequent background requests can use it
                try {
                    await electron.session.defaultSession.cookies.set({
                        url: "https://soundcloud.com",
                        name: "oauth_token",
                        value: token,
                        domain: ".soundcloud.com",
                        path: "/",
                        secure: true,
                        httpOnly: false,
                    });
                } catch { }

                childWindows.forEach(w => {
                    try { if (!w.isDestroyed()) w.close(); } catch { }
                });
                try { if (!authWin.isDestroyed()) authWin.close(); } catch { }
                resolve({ token });
            };

            const checkCookies = async () => {
                if (resolved) return;
                try {
                    const cookies = await authSession.cookies.get({});
                    const oauthCookie = cookies.find(c => (c.domain.includes("soundcloud") || c.domain.includes("sndcdn")) && c.name === "oauth_token" && c.value);
                    if (oauthCookie && oauthCookie.value) {
                        await finishWithToken(oauthCookie.value);
                        return;
                    }
                } catch { }
            };

            // Intercept headers for any OAuth token in this partition
            const headerFilter = { urls: ["*://*.soundcloud.com/*"] };
            const onSendHeadersListener = (details: any) => {
                if (resolved) return;
                const authHeader = details.requestHeaders?.["Authorization"] || details.requestHeaders?.["authorization"];
                if (authHeader && typeof authHeader === "string") {
                    const match = authHeader.match(/^OAuth\s+([a-zA-Z0-9\-_]+)/i);
                    if (match?.[1]) {
                        finishWithToken(match[1]);
                    }
                }
            };

            try {
                authSession.webRequest.onSendHeaders(headerFilter, onSendHeadersListener);
            } catch { }

            // Allow Google / Apple / Facebook OAuth popups
            authWin.webContents.setWindowOpenHandler(() => {
                return {
                    action: "allow",
                    overrideBrowserWindowOptions: {
                        parent: authWin,
                        modal: false,
                        width: 520,
                        height: 680,
                        autoHideMenuBar: true,
                        webPreferences: {
                            partition: authPartition,
                            nodeIntegration: false,
                            contextIsolation: true,
                        },
                    },
                };
            });

            authWin.webContents.on("did-create-window", childWin => {
                childWin.webContents.setUserAgent(CHROME_UA);
                childWindows.push(childWin);
                childWin.webContents.on("did-navigate", checkCookies);
                childWin.webContents.on("did-navigate-in-page", checkCookies);
                childWin.on("closed", () => {
                    childWindows = childWindows.filter(w => w !== childWin);
                    checkCookies();
                });
            });

            const interval = setInterval(checkCookies, 500);

            authWin.webContents.on("did-navigate", checkCookies);
            authWin.webContents.on("did-navigate-in-page", checkCookies);

            authWin.on("closed", () => {
                clearInterval(interval);
                childWindows.forEach(w => {
                    try { if (!w.isDestroyed()) w.close(); } catch { }
                });
                if (!resolved) {
                    resolved = true;
                    checkCookies().then(res => {
                        if (!res) resolve(null);
                    }).catch(() => resolve(null));
                }
            });

            authWin.loadURL("https://soundcloud.com/signin");
        });
    } catch (e: any) {
        console.error("[SoundCloudNative] openSoundCloudAuthWindow error:", e?.message);
        return null;
    }
}

export async function loginSoundCloudWithCredentials(
    _: any,
    identifier: string,
    pass: string
): Promise<{ token?: string; error?: string; }> {
    if (!IS_ELECTRON || !_BrowserWindow) {
        return { error: "Electron required" };
    }

    try {
        const electron = require("electron") as typeof import("electron");
        const { session, BrowserWindow } = electron;

        const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

        return new Promise(resolve => {
            let resolved = false;
            const win = new BrowserWindow({
                width: 600,
                height: 700,
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                },
            });

            win.webContents.setUserAgent(CHROME_UA);

            const finishWithToken = (token: string) => {
                if (resolved) return;
                resolved = true;
                clearInterval(interval);
                try { if (!win.isDestroyed()) win.close(); } catch { }
                resolve({ token });
            };

            const checkCookies = async () => {
                if (resolved) return;
                try {
                    const cookies = await session.defaultSession.cookies.get({ domain: ".soundcloud.com" });
                    const oauthCookie = cookies.find(c => c.name === "oauth_token");
                    if (oauthCookie && oauthCookie.value) {
                        finishWithToken(oauthCookie.value);
                        return;
                    }
                    const cookies2 = await session.defaultSession.cookies.get({ domain: "soundcloud.com" });
                    const oauthCookie2 = cookies2.find(c => c.name === "oauth_token");
                    if (oauthCookie2 && oauthCookie2.value) {
                        finishWithToken(oauthCookie2.value);
                        return;
                    }
                } catch { }
            };

            const interval = setInterval(checkCookies, 500);

            // Intercept headers for any OAuth token
            const headerFilter = { urls: ["*://*.soundcloud.com/*"] };
            const onSendHeadersListener = (details: any) => {
                if (resolved) return;
                const authHeader = details.requestHeaders?.["Authorization"] || details.requestHeaders?.["authorization"];
                if (authHeader && typeof authHeader === "string") {
                    const match = authHeader.match(/^OAuth\s+([a-zA-Z0-9\-_]+)/i);
                    if (match?.[1]) {
                        finishWithToken(match[1]);
                    }
                }
            };

            try {
                session.defaultSession.webRequest.onSendHeaders(headerFilter, onSendHeadersListener);
            } catch { }

            const tryFillForm = async () => {
                if (resolved) return;
                try {
                    await win.webContents.executeJavaScript(`
                        (async () => {
                            // Step 1: fill email / username
                            const emailInput = document.querySelector('input[name="username"], input[type="email"], #sign_in_username, input[placeholder*="email" i], input[placeholder*="profile" i]');
                            if (emailInput && !emailInput.dataset.filled) {
                                emailInput.dataset.filled = "true";
                                emailInput.focus();
                                emailInput.value = ${JSON.stringify(identifier)};
                                emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                                emailInput.dispatchEvent(new Event('change', { bubbles: true }));
                                
                                await new Promise(r => setTimeout(r, 400));
                                const submitBtn = document.querySelector('button[type="submit"], .signinForm__submit, button.sc-button-cta');
                                if (submitBtn) submitBtn.click();
                            }

                            // Step 2: fill password if visible
                            await new Promise(r => setTimeout(r, 600));
                            const passInput = document.querySelector('input[name="password"], input[type="password"], #sign_in_password');
                            if (passInput && !passInput.dataset.filled) {
                                passInput.dataset.filled = "true";
                                passInput.focus();
                                passInput.value = ${JSON.stringify(pass)};
                                passInput.dispatchEvent(new Event('input', { bubbles: true }));
                                passInput.dispatchEvent(new Event('change', { bubbles: true }));
                                
                                await new Promise(r => setTimeout(r, 400));
                                const submitBtn = document.querySelector('button[type="submit"], .signinForm__submit, button.sc-button-cta');
                                if (submitBtn) submitBtn.click();
                            }
                        })();
                    `);
                } catch { }
            };

            win.webContents.on("did-finish-load", () => {
                tryFillForm();
                setTimeout(tryFillForm, 1000);
                setTimeout(tryFillForm, 2500);
            });

            win.webContents.on("did-navigate-in-page", () => {
                tryFillForm();
            });

            setTimeout(() => {
                clearInterval(interval);
                if (!resolved) {
                    resolved = true;
                    try { if (!win.isDestroyed()) win.close(); } catch { }
                    resolve({ error: "Invalid credentials or login verification required." });
                }
            }, 25000);

            win.loadURL("https://soundcloud.com/signin");
        });
    } catch (e: any) {
        return { error: e?.message || "Login failed" };
    }
}

export async function fetchSoundCloudSuggestions(_: any, clientId: string, query: string): Promise<string[]> {
    if (!query || !query.trim()) return [];
    try {
        const url = `https://api-v2.soundcloud.com/search/queries?q=${encodeURIComponent(query.trim())}&client_id=${clientId}&limit=10`;
        const headers = {
            "Accept": "application/json",
            "Referer": "https://soundcloud.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        };
        const raw = await netGet(url, headers);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        const list = parsed?.collection || (Array.isArray(parsed) ? parsed : []);
        const suggestions: string[] = [];
        for (const item of list) {
            const text = item?.output || item?.query || item?.title || (typeof item === "string" ? item : null);
            if (text && typeof text === "string" && !suggestions.includes(text)) {
                suggestions.push(text);
            }
        }
        return suggestions;
    } catch {
        return [];
    }
}

export async function fetchSoundCloudMe(_: any, token: string, clientId: string): Promise<string | null> {
    try {
        const url = `https://api-v2.soundcloud.com/me?client_id=${clientId}`;
        const headers = {
            "Authorization": `OAuth ${token}`,
            "Accept": "application/json",
            "Referer": "https://soundcloud.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        };
        return await netGet(url, headers);
    } catch (e: any) {
        console.error("[SoundCloudNative] fetchSoundCloudMe error:", e?.message);
        throw new Error(e?.message ?? String(e));
    }
}

function nodeHttpRequest(
    urlStr: string,
    options: {
        method?: string;
        headers?: Record<string, string>;
        body?: Buffer | string;
    } = {}
): Promise<{ status: number; headers: any; body: string; ok: boolean }> {
    return new Promise((resolve, reject) => {
        try {
            const https = require("https") as typeof import("https");
            const http = require("http") as typeof import("http");
            const parsedUrl = new URL(urlStr);
            const lib = parsedUrl.protocol === "http:" ? http : https;

            const req = lib.request(
                parsedUrl,
                {
                    method: options.method || "GET",
                    headers: options.headers || {},
                },
                res => {
                    const chunks: Buffer[] = [];
                    res.on("data", chunk => chunks.push(Buffer.from(chunk)));
                    res.on("end", () => {
                        const buf = Buffer.concat(chunks);
                        const body = buf.toString("utf-8");
                        const status = res.statusCode || 0;
                        resolve({
                            status,
                            headers: res.headers,
                            body,
                            ok: (status >= 200 && status < 300) || status === 201 || status === 204,
                        });
                    });
                }
            );

            req.on("error", err => reject(err));
            if (options.body) {
                req.write(options.body);
            }
            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

function buildMultipartPayload(
    fields: Record<string, string>,
    files: Array<{ fieldName: string; fileName: string; contentType: string; data: Buffer }>
): { buffer: Buffer; contentType: string } {
    const boundary = "----LoliCordBoundary" + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const chunks: Buffer[] = [];

    // Form fields
    for (const [name, val] of Object.entries(fields)) {
        chunks.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${val}\r\n`
        ));
    }

    // Files
    for (const file of files) {
        chunks.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
        ));
        chunks.push(file.data);
        chunks.push(Buffer.from("\r\n"));
    }

    chunks.push(Buffer.from(`--${boundary}--\r\n`));

    const buffer = Buffer.concat(chunks);
    return {
        buffer,
        contentType: `multipart/form-data; boundary=${boundary}`,
    };
}

async function uploadBufferToS3(
    s3Url: string,
    policyData: any,
    dataBuffer: Buffer,
    fileName: string,
    mimeType: string,
    userAgent: string
): Promise<void> {
    const isPresignedDirect = s3Url.includes("X-Amz-") || s3Url.includes("?");

    if (isPresignedDirect) {
        // AWS SigV4 Pre-signed direct binary upload
        const s3Headers: Record<string, string> = {
            "Content-Length": String(dataBuffer.length),
            "User-Agent": userAgent,
        };

        const headersObj = policyData.headers || policyData.fields || {};
        for (const [k, v] of Object.entries(headersObj)) {
            if (k.toLowerCase().startsWith("x-amz-") || k.toLowerCase().startsWith("content-")) {
                s3Headers[k.toLowerCase()] = String(v ?? "");
            }
        }

        // Try POST first (as indicated in AWS CanonicalRequest), then PUT
        const postResp = await nodeHttpRequest(s3Url, {
            method: "POST",
            headers: s3Headers,
            body: dataBuffer,
        });

        if (postResp.ok || postResp.status === 200 || postResp.status === 201 || postResp.status === 204) {
            return;
        }

        const putResp = await nodeHttpRequest(s3Url, {
            method: "PUT",
            headers: s3Headers,
            body: dataBuffer,
        });

        if (putResp.ok || putResp.status === 200 || putResp.status === 201 || putResp.status === 204) {
            return;
        }

        throw new Error(`S3 direct upload failed (${postResp.status}): ${postResp.body || putResp.body}`);
    } else {
        // Standard Multipart Form S3 Policy upload
        const fields = policyData.fields || {};
        const { buffer: s3Body, contentType: s3ContentType } = buildMultipartPayload(
            fields,
            [{
                fieldName: "file",
                fileName: fileName,
                contentType: mimeType,
                data: dataBuffer,
            }]
        );

        const s3Resp = await nodeHttpRequest(s3Url, {
            method: "POST",
            headers: {
                "Content-Type": s3ContentType,
                "Content-Length": String(s3Body.length),
                "User-Agent": userAgent,
            },
            body: s3Body,
        });

        if (!s3Resp.ok && s3Resp.status !== 201 && s3Resp.status !== 204 && s3Resp.status !== 200) {
            throw new Error(`S3 audio upload failed (${s3Resp.status}): ${s3Resp.body}`);
        }
    }
}

export async function uploadSoundCloudTrack(
    _: any,
    payload: {
        token: string;
        clientId: string;
        title: string;
        genre?: string;
        description?: string;
        sharing?: "public" | "private";
        tags?: string;
        audioBase64: string;
        audioFileName: string;
        audioMime?: string;
        artworkBase64?: string;
        artworkFileName?: string;
        artworkMime?: string;
        browserCookies?: string;
    }
): Promise<string | null> {
    let win: any = null;

    try {
        if (!IS_ELECTRON) throw new Error("Upload requires Electron environment.");

        const electron = require("electron") as typeof import("electron");
        const { BrowserWindow, session: electronSession } = electron;
        const scSession = electronSession.fromPartition("persist:soundcord-sc-session");
        const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

        // Inject any fresh browser cookies provided
        if (payload.browserCookies) {
            for (const pair of payload.browserCookies.split(";")) {
                const idx = pair.indexOf("=");
                if (idx > 0) {
                    const name = pair.slice(0, idx).trim();
                    const value = pair.slice(idx + 1).trim();
                    if (name && value) {
                        try {
                            await scSession.cookies.set({
                                url: "https://soundcloud.com",
                                name,
                                value,
                                domain: ".soundcloud.com",
                                path: "/",
                                secure: true,
                            });
                        } catch { }
                    }
                }
            }
        }

        // ── Helper: DataDome interactive Captcha Solver ───────────────────────
        const handleCaptchaChallenge = async (captchaUrl: string): Promise<boolean> => {
            console.log("[SoundCloudNative] DataDome CAPTCHA challenge detected, opening verification window:", captchaUrl);
            return new Promise<boolean>((resolve) => {
                const captchaWin = new BrowserWindow({
                    width: 480,
                    height: 640,
                    center: true,
                    title: "SoundCloud Security Verification",
                    autoHideMenuBar: true,
                    alwaysOnTop: true,
                    webPreferences: {
                        session: scSession,
                        nodeIntegration: false,
                        contextIsolation: true,
                        sandbox: false,
                    },
                });

                captchaWin.webContents.setUserAgent(CHROME_UA);
                captchaWin.loadURL(captchaUrl);

                let resolved = false;

                const interval = setInterval(async () => {
                    try {
                        if (captchaWin.isDestroyed()) {
                            clearInterval(interval);
                            if (!resolved) {
                                resolved = true;
                                resolve(true);
                            }
                            return;
                        }
                        const currentUrl = captchaWin.webContents.getURL();
                        if (currentUrl && !currentUrl.includes("captcha-delivery.com")) {
                            clearInterval(interval);
                            if (!resolved) {
                                resolved = true;
                                try { captchaWin.close(); } catch { }
                                resolve(true);
                            }
                            return;
                        }

                        // Check if DataDome displayed the success checkmark / completed message
                        try {
                            const isDone = await captchaWin.webContents.executeJavaScript(`
                                (function() {
                                    const text = document.body ? document.body.innerText : '';
                                    return text.includes("Vérification de l'appareil") || 
                                           text.includes("disponible après vérification") ||
                                           text.includes("Device check") ||
                                           document.querySelector(".captcha-success, .success, .check") !== null;
                                })()
                            `);
                            if (isDone) {
                                clearInterval(interval);
                                setTimeout(() => {
                                    if (!resolved) {
                                        resolved = true;
                                        try { captchaWin.close(); } catch { }
                                        resolve(true);
                                    }
                                }, 1200);
                            }
                        } catch { }
                    } catch { }
                }, 500);

                captchaWin.on("closed", () => {
                    clearInterval(interval);
                    if (!resolved) {
                        resolved = true;
                        resolve(true);
                    }
                });
            });
        };

        // ── Open ONE background window on soundcloud.com/upload ───────────────
        win = new BrowserWindow({
            show: false,
            width: 1280,
            height: 800,
            webPreferences: {
                session: scSession,
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false,
                backgroundThrottling: false,
            },
        });

        win.webContents.setUserAgent(CHROME_UA);

        win.webContents.on("dom-ready", async () => {
            try {
                await win.webContents.executeJavaScript(`
                    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                `);
            } catch { }
        });

        await new Promise<void>((resolve) => {
            const t = setTimeout(() => resolve(), 15000);
            win.webContents.once("did-finish-load", () => { clearTimeout(t); resolve(); });
            win.webContents.once("did-fail-load", () => { clearTimeout(t); resolve(); });
            win.loadURL("https://soundcloud.com/upload");
        });

        // Poll until DataDome sets its cookie (usually 1-4s after page load)
        const ddStart = Date.now();
        while (Date.now() - ddStart < 12000) {
            const cookies = await scSession.cookies.get({ name: "datadome" });
            if (cookies.length > 0) break;
            await new Promise(r => setTimeout(r, 400));
        }

        // ── Helper: run fetch() inside the real soundcloud.com renderer ───────
        const scFetch = async (
            url: string,
            method: string,
            body?: string
        ): Promise<{ ok: boolean; status: number; body: string }> => {
            const h = JSON.stringify({
                "Authorization": `OAuth ${payload.token}`,
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/json",
                "Origin": "https://soundcloud.com",
                "Referer": "https://soundcloud.com/upload",
            });

            const executeScript = async () => {
                const script = `(async () => {
                    try {
                        const r = await fetch(${JSON.stringify(url)}, {
                            method: ${JSON.stringify(method)},
                            headers: ${h},
                            ${body !== undefined ? `body: ${JSON.stringify(body)},` : ""}
                            credentials: "include",
                            mode: "cors",
                        });
                        const t = await r.text();
                        return { ok: r.ok, status: r.status, body: t };
                    } catch(e) {
                        return { ok: false, status: 0, body: String(e) };
                    }
                })()`;
                const res = await win.webContents.executeJavaScript(script, true);
                return res as { ok: boolean; status: number; body: string };
            };

            let result = await executeScript();

            // If challenged with DataDome captcha, show the solver modal and retry
            if (result.status === 403 && result.body.includes("captcha-delivery.com")) {
                let captchaUrl = "";
                try {
                    const parsed = JSON.parse(result.body);
                    captchaUrl = parsed.url;
                } catch { }

                if (captchaUrl) {
                    await handleCaptchaChallenge(captchaUrl);
                    await new Promise(r => setTimeout(r, 1000));
                    result = await executeScript();
                }
            }

            return result;
        };

        const audioBuffer = Buffer.from(payload.audioBase64, "base64");

        // ── Step 1: Get upload policy ─────────────────────────────────────────
        const policyUrl = `https://api-v2.soundcloud.com/uploads/track-upload-policy?client_id=${encodeURIComponent(payload.clientId)}`;
        const policyBody = JSON.stringify({
            filename: payload.audioFileName || "track.mp3",
            filesize: audioBuffer.length,
        });

        const policyResp = await scFetch(policyUrl, "POST", policyBody);
        console.log("[SoundCloudNative] Policy response:", policyResp.status, policyResp.body.slice(0, 300));

        if (!policyResp.ok) {
            throw new Error(`Failed to initialize track upload with SoundCloud API (Policy error: ${policyResp.status} ${policyResp.body})`);
        }

        const policyData = JSON.parse(policyResp.body);
        const s3Url = policyData.url || policyData.s3_url || policyData.post_url;
        const uploadUid = policyData.uid || policyData.id;

        if (!s3Url || !uploadUid) throw new Error("Invalid upload policy received from SoundCloud.");

        // ── Step 2: Upload audio to S3 (no DataDome — it's AWS) ───────────────
        const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
        await uploadBufferToS3(s3Url, policyData, audioBuffer, payload.audioFileName || "track.mp3", payload.audioMime || "audio/mpeg", ua);

        // ── Step 3: Trigger transcoding ───────────────────────────────────────
        try {
            const transcodeUrl = `https://api-v2.soundcloud.com/uploads/${encodeURIComponent(uploadUid)}/track-transcoding?client_id=${encodeURIComponent(payload.clientId)}`;
            await scFetch(transcodeUrl, "POST", "{}");
        } catch (e) {
            console.warn("[SoundCloudNative] Transcoding trigger note:", e);
        }

        // ── Step 4: Create track metadata ─────────────────────────────────────
        const createTrackUrl = `https://api-v2.soundcloud.com/tracks?client_id=${encodeURIComponent(payload.clientId)}`;
        const exactTrackPayload: any = {
            track: {
                title: payload.title,
                sharing: payload.sharing || "public",
                genre: payload.genre || "",
                description: payload.description || "",
                tag_list: payload.tags || "",
                original_filename: payload.audioFileName || "track.mp3",
                uid: uploadUid,
            }
        };

        if (payload.artworkBase64) {
            const mime = payload.artworkMime || "image/jpeg";
            exactTrackPayload.track.artwork_data = `data:${mime};base64,${payload.artworkBase64}`;
        }

        const createBody = JSON.stringify(exactTrackPayload);
        const createResp = await scFetch(createTrackUrl, "POST", createBody);
        console.log("[SoundCloudNative] Create track response:", createResp.status, createResp.body.slice(0, 300));

        let createdTrackBody = createResp.body;
        let createdTrack: any = null;
        try { createdTrack = JSON.parse(createdTrackBody); } catch { }

        if (!createResp.ok) {
            const minPayload: any = {
                track: {
                    title: payload.title,
                    sharing: payload.sharing || "public",
                    uid: uploadUid
                }
            };
            if (payload.artworkBase64) {
                const mime = payload.artworkMime || "image/jpeg";
                minPayload.track.artwork_data = `data:${mime};base64,${payload.artworkBase64}`;
            }
            const minBody = JSON.stringify(minPayload);
            const minResp = await scFetch(createTrackUrl, "POST", minBody);
            if (!minResp.ok) throw new Error(`Failed to create track (${createResp.status}: ${createResp.body})`);
            createdTrackBody = minResp.body;
            try { createdTrack = JSON.parse(createdTrackBody); } catch { }
        }

        // ── Step 5: Artwork upload (Multi-endpoint retry) ─────────────────────
        if (payload.artworkBase64 && (createdTrack?.id || createdTrack?.urn)) {
            try {
                const trackId = createdTrack.id;
                const trackUrn = createdTrack.urn || `soundcloud:tracks:${trackId}`;
                const mime = payload.artworkMime || "image/jpeg";
                const b64 = payload.artworkBase64;
                const dataUri = `data:${mime};base64,${b64}`;

                const artScript = `(async () => {
                    try {
                        const b64 = ${JSON.stringify(b64)};
                        const mime = ${JSON.stringify(mime)};
                        const dataUri = ${JSON.stringify(dataUri)};
                        const byteChars = atob(b64);
                        const byteNums = new Array(byteChars.length);
                        for (let i = 0; i < byteChars.length; i++) {
                            byteNums[i] = byteChars.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNums);
                        const blob = new Blob([byteArray], { type: mime });

                        const formData = new FormData();
                        formData.append("track[artwork_data]", blob, "cover.jpg");

                        // 1. PUT /tracks/:id with FormData
                        let r = await fetch("https://api-v2.soundcloud.com/tracks/" + ${JSON.stringify(trackId)} + "?client_id=" + ${JSON.stringify(encodeURIComponent(payload.clientId))}, {
                            method: "PUT",
                            headers: {
                                "Authorization": "OAuth " + ${JSON.stringify(payload.token)},
                                "Accept": "application/json, text/plain, */*"
                            },
                            body: formData,
                            credentials: "include"
                        });

                        // 2. POST /tracks/:urn/artwork with FormData
                        if (!r.ok) {
                            const formData2 = new FormData();
                            formData2.append("image_data", blob, "cover.jpg");
                            r = await fetch("https://api-v2.soundcloud.com/tracks/" + encodeURIComponent(${JSON.stringify(trackUrn)}) + "/artwork?client_id=" + ${JSON.stringify(encodeURIComponent(payload.clientId))}, {
                                method: "POST",
                                headers: {
                                    "Authorization": "OAuth " + ${JSON.stringify(payload.token)},
                                    "Accept": "application/json, text/plain, */*"
                                },
                                body: formData2,
                                credentials: "include"
                            });
                        }

                        // 3. PUT /tracks/:urn/artwork with JSON dataUri
                        if (!r.ok) {
                            r = await fetch("https://api-v2.soundcloud.com/tracks/" + encodeURIComponent(${JSON.stringify(trackUrn)}) + "/artwork?client_id=" + ${JSON.stringify(encodeURIComponent(payload.clientId))}, {
                                method: "PUT",
                                headers: {
                                    "Authorization": "OAuth " + ${JSON.stringify(payload.token)},
                                    "Accept": "application/json, text/plain, */*",
                                    "Content-Type": "application/json"
                                },
                                body: JSON.stringify({ image_data: dataUri }),
                                credentials: "include"
                            });
                        }

                        // 4. PUT /tracks/:id with JSON track.artwork_data
                        if (!r.ok) {
                            r = await fetch("https://api-v2.soundcloud.com/tracks/" + ${JSON.stringify(trackId)} + "?client_id=" + ${JSON.stringify(encodeURIComponent(payload.clientId))}, {
                                method: "PUT",
                                headers: {
                                    "Authorization": "OAuth " + ${JSON.stringify(payload.token)},
                                    "Accept": "application/json, text/plain, */*",
                                    "Content-Type": "application/json"
                                },
                                body: JSON.stringify({ track: { artwork_data: dataUri } }),
                                credentials: "include"
                            });
                        }

                        const t = await r.text();
                        return { ok: r.ok, status: r.status, body: t };
                    } catch(e) {
                        return { ok: false, status: 0, body: String(e) };
                    }
                })()`;

                const artResp = await win.webContents.executeJavaScript(artScript, true);
                console.log("[SoundCloudNative] Artwork upload result:", artResp.status, artResp.body?.slice(0, 200));
                if (artResp.ok && artResp.body) {
                    createdTrackBody = artResp.body;
                }
            } catch (artErr: any) {
                console.warn("[SoundCloudNative] Artwork update note:", artErr?.message);
            }
        }

        return createdTrackBody;
    } catch (e: any) {
        console.error("[SoundCloudNative] uploadSoundCloudTrack error:", e?.message);
        throw new Error(e?.message ?? String(e));
    } finally {
        try { if (win && !win.isDestroyed()) win.close(); } catch { }
    }
}

// ─── Listening Together ─────────────────────────────────────────────────────────────────
// Electron : intercept navigation events on BrowserWindow
// Browser extension : intercept clicks on <a> tags pointing to the LoliCord listen link

// Opens the LoliCord download page for people without LoliCord
const LISTEN_URL_PREFIX = "https://github.com/ownhoye/hoye-bot-discord/releases/latest?listen=1&";

export function setupListeningTogetherHandler(_?: any): void {
    // no-op
}

let _listenerInstalled = false;

function _dispatchListenEvent(url: string) {
    try {
        const params = new URL(url).searchParams;
        const scId = params.get("sc_id") ?? "";
        const start = params.get("start") ?? "";
        const userId = params.get("userId") ?? "";
        window.dispatchEvent(new CustomEvent("soundcord-listen-together", { detail: { scId, start, userId } }));
    } catch { }
}

// Browser extension: intercept anchor clicks
function _browserClickHandler(e: MouseEvent) {
    const target = (e.target as HTMLElement)?.closest("a") as HTMLAnchorElement | null;
    if (!target) return;
    const href = target.href || "";
    if (!href.startsWith(LISTEN_URL_PREFIX)) return;
    e.preventDefault();
    e.stopPropagation();
    _dispatchListenEvent(href);
}

export function installListeningTogetherIntercept(_?: any): void {
    if (_listenerInstalled) return;
    _listenerInstalled = true;

    if (IS_ELECTRON && _BrowserWindow) {
        const electron = require("electron") as typeof import("electron");

        // Override shell.openExternal to catch profile button link clicks
        const originalOpenExternal = electron.shell.openExternal;
        electron.shell.openExternal = (url: string, options?: any) => {
            if (typeof url === "string" && url.startsWith(LISTEN_URL_PREFIX)) {
                try {
                    const params = new URL(url).searchParams;
                    const scId = params.get("sc_id") ?? "";
                    const start = params.get("start") ?? "";
                    const userId = params.get("userId") ?? "";
                    electron.BrowserWindow.getAllWindows().forEach(w => {
                        try {
                            const safeId = JSON.stringify(scId);
                            const safeStart = JSON.stringify(start);
                            const safeUserId = JSON.stringify(userId);
                            w.webContents.executeJavaScript(
                                `window.dispatchEvent(new CustomEvent('soundcord-listen-together', { detail: { scId: ${safeId}, start: ${safeStart}, userId: ${safeUserId} } }))`
                            ).catch(() => {});
                        } catch { }
                    });
                } catch { }
                return Promise.resolve();
            }
            return originalOpenExternal.call(electron.shell, url, options);
        };

        // Electron mode: hook BrowserWindow navigation events
        const hook = (win: Electron.BrowserWindow) => {
            win.webContents.on("will-navigate" as any, (event: any, url: string) => {
                if (!url.startsWith(LISTEN_URL_PREFIX)) return;
                event.preventDefault();
                try {
                    const params = new URL(url).searchParams;
                    const scId = params.get("sc_id") ?? "";
                    const start = params.get("start") ?? "";
                    const userId = params.get("userId") ?? "";
                    _BrowserWindow!.getAllWindows().forEach(w => {
                        try {
                            const safeId = JSON.stringify(scId);
                            const safeStart = JSON.stringify(start);
                            const safeUserId = JSON.stringify(userId);
                            w.webContents.executeJavaScript(
                                `window.dispatchEvent(new CustomEvent('soundcord-listen-together', { detail: { scId: ${safeId}, start: ${safeStart}, userId: ${safeUserId} } }))`
                            ).catch(() => {});
                        } catch { }
                    });
                } catch { }
            });
            win.webContents.on("new-window" as any, (event: any, url: string) => {
                if (!url.startsWith(LISTEN_URL_PREFIX)) return;
                event.preventDefault();
                try {
                    const params = new URL(url).searchParams;
                    const scId = params.get("sc_id") ?? "";
                    const start = params.get("start") ?? "";
                    const userId = params.get("userId") ?? "";
                    _BrowserWindow!.getAllWindows().forEach(w => {
                        try {
                            const safeId = JSON.stringify(scId);
                            const safeStart = JSON.stringify(start);
                            const safeUserId = JSON.stringify(userId);
                            w.webContents.executeJavaScript(
                                `window.dispatchEvent(new CustomEvent('soundcord-listen-together', { detail: { scId: ${safeId}, start: ${safeStart}, userId: ${safeUserId} } }))`
                            ).catch(() => {});
                        } catch { }
                    });
                } catch { }
            });
        };
        _BrowserWindow.getAllWindows().forEach(hook);
        electron.app.on("browser-window-created" as any, (_e: any, win: Electron.BrowserWindow) => hook(win));
    } else {
        // Browser extension mode: intercept anchor clicks at document level
        document.addEventListener("click", _browserClickHandler, true);
    }
}


export async function fetchSoundCloudUserOwnTracks(
    _: any,
    payload: {
        token: string;
        clientId: string;
        userId: number | string;
        limit?: number;
    }
): Promise<string | null> {
    try {
        let cookieHeader = "";
        if (IS_ELECTRON) {
            try {
                const electron = require("electron") as typeof import("electron");
                const cookies1 = await electron.session.defaultSession.cookies.get({ domain: "soundcloud.com" });
                const cookies2 = await electron.session.defaultSession.cookies.get({ domain: ".soundcloud.com" });
                const allCookies = [...cookies1, ...cookies2];
                const cookieMap = new Map<string, string>();
                for (const c of allCookies) {
                    cookieMap.set(c.name, c.value);
                }
                cookieHeader = Array.from(cookieMap.entries())
                    .map(([k, v]) => `${k}=${v}`)
                    .join("; ");
            } catch { }
        }

        const authHeaders: Record<string, string> = {
            "Authorization": `OAuth ${payload.token}`,
            "Accept": "application/json, text/plain, */*",
            "Cookie": cookieHeader,
            "Origin": "https://soundcloud.com",
            "Referer": "https://soundcloud.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        };

        const url = `https://api-v2.soundcloud.com/users/${encodeURIComponent(payload.userId)}/tracks?client_id=${encodeURIComponent(payload.clientId)}&limit=${payload.limit || 50}`;
        const resp = await nodeHttpRequest(url, {
            method: "GET",
            headers: authHeaders,
        });

        return resp.body;
    } catch (e: any) {
        console.error("[SoundCloudNative] fetchSoundCloudUserTracks error:", e?.message);
        throw new Error(e?.message ?? String(e));
    }
}

export async function deleteSoundCloudTrack(
    _: any,
    payload: {
        token: string;
        clientId: string;
        trackId: number | string;
    }
): Promise<boolean> {
    try {
        let cookieHeader = "";
        if (IS_ELECTRON) {
            try {
                const electron = require("electron") as typeof import("electron");
                const cookies1 = await electron.session.defaultSession.cookies.get({ domain: "soundcloud.com" });
                const cookies2 = await electron.session.defaultSession.cookies.get({ domain: ".soundcloud.com" });
                const allCookies = [...cookies1, ...cookies2];
                const cookieMap = new Map<string, string>();
                for (const c of allCookies) {
                    cookieMap.set(c.name, c.value);
                }
                cookieHeader = Array.from(cookieMap.entries())
                    .map(([k, v]) => `${k}=${v}`)
                    .join("; ");
            } catch { }
        }

        const authHeaders: Record<string, string> = {
            "Authorization": `OAuth ${payload.token}`,
            "Accept": "application/json, text/plain, */*",
            "Cookie": cookieHeader,
            "Origin": "https://soundcloud.com",
            "Referer": "https://soundcloud.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        };

        const deleteUrl = `https://api-v2.soundcloud.com/tracks/${encodeURIComponent(payload.trackId)}?client_id=${encodeURIComponent(payload.clientId)}`;
        const resp = await nodeHttpRequest(deleteUrl, {
            method: "DELETE",
            headers: authHeaders,
        });

        return resp.ok || resp.status === 200 || resp.status === 204;
    } catch (e: any) {
        console.error("[SoundCloudNative] deleteSoundCloudTrack error:", e?.message);
        throw new Error(e?.message ?? String(e));
    }
}


export async function clearSoundCloudSession(_?: any): Promise<boolean> {
    if (!IS_ELECTRON) return true;
    try {
        const electron = require("electron") as typeof import("electron");
        const sessions = [
            electron.session.defaultSession,
            electron.session.fromPartition("persist:soundcord-sc-session"),
        ];

        for (const session of sessions) {
            try {
                const cookies = await session.cookies.get({});
                for (const c of cookies) {
                    if (c.domain.includes("soundcloud") || c.domain.includes("sndcdn")) {
                        const protocol = c.secure ? "https://" : "http://";
                        const domain = c.domain.startsWith(".") ? c.domain.slice(1) : c.domain;
                        const url = `${protocol}${domain}${c.path}`;
                        try {
                            await session.cookies.remove(url, c.name);
                        } catch { }
                    }
                }
                await session.clearStorageData({
                    storages: ["cookies", "localstorage", "sessionstorage", "indexdb", "websql", "serviceworkers", "cachestorage"],
                });
                try { await session.clearCache(); } catch { }
                try { await session.clearAuthCache(); } catch { }
            } catch { }
        }
        return true;
    } catch (e: any) {
        console.error("[SoundCloudNative] clearSoundCloudSession error:", e?.message);
        return false;
    }
}

/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { API_BASE } from "./OAuth2";

/** Route a request through Electron main process to bypass CORS. Falls back to renderer fetch if unavailable. */
async function netFetch(url: string, opts?: { method?: string; headers?: Record<string, string>; body?: string; }) {
    const nf = (window as any).VencordNative?.lolicord?.netFetch;
    if (typeof nf === "function") {
        return nf(url, { method: opts?.method, headers: opts?.headers, body: opts?.body });
    }
    // Web fallback — renderer fetch (may fail due to CORS but nothing we can do)
    const res = await fetch(url, { method: opts?.method ?? "GET", headers: opts?.headers, body: opts?.body });
    return res.ok ? { ok: true, status: res.status, data: await res.json() } : { ok: false, status: res.status, data: null };
}

export async function getOwnPluginConfig(pluginName: string, token: string) {
    const res = await netFetch(`${API_BASE}/api/sync/${encodeURIComponent(pluginName)}?token=${encodeURIComponent(token)}`);
    if (!res?.ok) throw new Error("Failed to load plugin config");
    return res.data;
}

export async function saveOwnPluginConfig(pluginName: string, token: string, settings: Record<string, unknown>) {
    // private must be sent both at top-level and inside settings so the server
    // always treats this config as public (visible via /public endpoint).
    const isPrivate = settings.private === true ? true : false;
    const res = await netFetch(`${API_BASE}/api/sync/${encodeURIComponent(pluginName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, private: isPrivate, settings: { ...settings, private: isPrivate } })
    });

    if (!res?.ok) throw new Error("Failed to save plugin config");
    return res.data;
}

// No in-memory cache here — caching is handled by callers (e.g. publicProfilesCache in customProfile)
export async function getPublicPluginConfig(pluginName: string, userId: string) {
    try {
        const nativeFetch = (window as any).VencordNative?.pluginHelpers?.MultiInstance?.fetchPublicConfig;
        if (nativeFetch) {
            const raw = await nativeFetch(pluginName, userId);
            if (!raw) return null;
            return JSON.parse(raw);
        }

        const res = await netFetch(`${API_BASE}/api/sync/${encodeURIComponent(pluginName)}/public?userId=${encodeURIComponent(userId)}`);
        if (!res?.ok) return null;
        return res.data;
    } catch (e) {
        console.error(`Failed to load public config for ${pluginName}/${userId}:`, e);
        return null;
    }
}

export function clearPublicProfileCache() {}

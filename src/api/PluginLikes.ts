/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { API_BASE, getStoredToken } from "./OAuth2";

export interface PluginLikeData {
    likes: number;
    likedByMe: boolean;
}

export interface PluginRatings {
    [pluginName: string]: PluginLikeData;
}

let ratingsCache: PluginRatings | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

// Circuit breaker: if the API is unreachable (CORS/network), skip all subsequent calls this session
let networkBlocked = false;

/** Route a request through Electron main process to bypass CORS. */
async function netFetch(url: string, opts?: { method?: string; headers?: Record<string, string>; body?: string; }) {
    const nf = (window as any).VencordNative?.lolicord?.netFetch;
    if (typeof nf === "function") {
        return nf(url, { method: opts?.method, headers: opts?.headers, body: opts?.body });
    }
    const res = await fetch(url, { method: opts?.method ?? "GET", headers: opts?.headers, body: opts?.body });
    return res.ok ? { ok: true, status: res.status, data: await res.json() } : { ok: false, status: res.status, data: null };
}

/**
 * Fetch all plugin like counts + whether the current user liked each one.
 * Results are cached for CACHE_TTL ms.
 */
export async function fetchPluginRatings(forceRefresh = false): Promise<PluginRatings> {
    if (networkBlocked) return ratingsCache ?? {};

    if (!forceRefresh && ratingsCache && Date.now() - cacheTime < CACHE_TTL) {
        return ratingsCache;
    }

    try {
        const token = await getStoredToken();
        const url = new URL(`${API_BASE}/api/plugins/ratings`);
        if (token) url.searchParams.set("token", token);

        const res = await netFetch(url.toString());
        if (!res?.ok || !res.data) return ratingsCache ?? {};

        ratingsCache = res.data as PluginRatings;
        cacheTime = Date.now();
        return ratingsCache;
    } catch {
        // Silently block further attempts this session (CORS/network unreachable)
        networkBlocked = true;
        return ratingsCache ?? {};
    }
}

/**
 * Toggle like for a plugin (like if not liked, unlike if already liked).
 * Returns updated like data, or null on failure.
 */
export async function togglePluginLike(pluginName: string): Promise<PluginLikeData | null> {
    const token = await getStoredToken();
    if (!token) return null;

    try {
        const res = await netFetch(`${API_BASE}/api/plugins/${encodeURIComponent(pluginName)}/like`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
        });

        if (!res?.ok || !res.data) return null;

        const data = res.data as PluginLikeData;

        // Update cache immediately so UI feels instant
        if (ratingsCache) {
            ratingsCache[pluginName] = data;
        }

        return data;
    } catch (e) {
        console.error("[PluginLikes] togglePluginLike failed:", e);
        return null;
    }
}

export function invalidateRatingsCache() {
    ratingsCache = null;
    cacheTime = 0;
}

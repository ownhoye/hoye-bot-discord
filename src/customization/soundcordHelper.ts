/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { playerState } from "@lolicordplugins/soundcloudPlayer";

export interface SoundCordTrackResult {
    id: string;
    title: string;
    artist: string;
    artworkUrl: string;
    durationMs: number;
    durationText: string;
    streamUrl: string;
    userAvatarUrl?: string;
    userPermalink?: string;
}

const SC_CLIENT_ID_KEY = "SoundCordPlayer_clientId";
const DEAD_CLIENT_ID = "iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX";
const CURRENT_FALLBACK_CLIENT_ID = "vI5BsvpTIlavDLl7RDbbcFAPg8kls8Bg";

let cachedClientId: string | null = null;

export async function getSoundCordClientId(forceRefresh = false): Promise<string> {
    if (!forceRefresh) {
        if (cachedClientId && cachedClientId !== DEAD_CLIENT_ID) {
            return cachedClientId;
        }

        if (playerState?.clientId && playerState.clientId !== DEAD_CLIENT_ID) {
            cachedClientId = playerState.clientId;
            return playerState.clientId;
        }

        try {
            const stored = await DataStore.get<string>(SC_CLIENT_ID_KEY);
            if (stored && stored !== DEAD_CLIENT_ID) {
                cachedClientId = stored;
                return stored;
            }
        } catch {}
    }

    cachedClientId = null;
    try {
        await DataStore.del(SC_CLIENT_ID_KEY);
    } catch {}

    const nativeHelper = (VencordNative.pluginHelpers as any)?.SoundCordPlayer;
    if (nativeHelper?.fetchSoundCloudClientId) {
        try {
            const id = await nativeHelper.fetchSoundCloudClientId();
            if (id && id.length >= 20 && id !== DEAD_CLIENT_ID) {
                cachedClientId = id;
                void DataStore.set(SC_CLIENT_ID_KEY, id);
                return id;
            }
        } catch (e) {
            console.warn("[Customization/SoundCord] fetchSoundCloudClientId error:", e);
        }
    }

    cachedClientId = CURRENT_FALLBACK_CLIENT_ID;
    return CURRENT_FALLBACK_CLIENT_ID;
}

export function formatDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function searchSoundCordTracks(query: string, limit = 20, isRetry = false): Promise<SoundCordTrackResult[]> {
    const q = query.trim();
    if (!q) return [];
    const clientId = await getSoundCordClientId(isRetry);

    let jsonString: string | null = null;
    let hadAuthError = false;
    const nativeHelper = (VencordNative.pluginHelpers as any)?.SoundCordPlayer;

    if (nativeHelper?.searchSoundCloud) {
        try {
            jsonString = await nativeHelper.searchSoundCloud(q, clientId, 0, limit);
        } catch (e: any) {
            const msg = String(e?.message ?? e);
            if (msg.includes("401") || msg.includes("403") || msg.includes("Unauthorized")) {
                hadAuthError = true;
            }
            console.warn("[Customization/SoundCord] native search failed:", msg);
        }
    }

    if (!jsonString && !hadAuthError) {
        try {
            const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${clientId}&limit=${limit}&offset=0`;
            const resp = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Referer": "https://soundcloud.com/"
                }
            });
            if (resp.status === 401 || resp.status === 403) {
                hadAuthError = true;
            } else if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            } else {
                jsonString = await resp.text();
            }
        } catch (e: any) {
            const msg = String(e?.message ?? e);
            if (msg.includes("401") || msg.includes("403")) hadAuthError = true;
            else if (!hadAuthError) throw e;
        }
    }

    if (hadAuthError && !isRetry) {
        console.warn("[Customization/SoundCord] SoundCord client ID expired, refreshing dynamically...");
        await getSoundCordClientId(true);
        return searchSoundCordTracks(query, limit, true);
    }

    if (!jsonString) return [];
    const data = JSON.parse(jsonString);
    const list = Array.isArray(data) ? data : (data?.collection ?? []);
    if (!Array.isArray(list)) return [];

    const results: SoundCordTrackResult[] = [];
    for (const rawItem of list) {
        const item = rawItem.track || rawItem;
        if (!item || (item.kind && item.kind !== "track")) continue;

        const transcodings = item.media?.transcodings ?? [];
        let streamUrl = "";
        // Priority 1: progressive (direct MP3)
        for (const tc of transcodings) {
            if (tc.format?.protocol === "progressive" && tc.url) {
                streamUrl = tc.url;
                break;
            }
        }
        // Priority 2: HLS (m3u8)
        if (!streamUrl) {
            for (const tc of transcodings) {
                if (tc.format?.protocol === "hls" && tc.url) {
                    streamUrl = tc.url;
                    break;
                }
            }
        }
        if (!streamUrl) continue;

        let artwork = item.artwork_url || item.user?.avatar_url || "";
        if (artwork) {
            artwork = artwork.replace(/-(large|t500x500|t300x300|t120x120|t200x200|t67x67)/, "-t500x500");
            if (!artwork.includes("-t500x500")) artwork = artwork.replace(/\.jpg$/, "-t500x500.jpg");
        }

        const durMs = item.duration ?? 0;
        results.push({
            id: String(item.id),
            title: item.title ?? "Titre inconnu",
            artist: item.user?.username ?? "Artiste inconnu",
            artworkUrl: artwork,
            durationMs: durMs,
            durationText: formatDuration(durMs),
            streamUrl,
            userAvatarUrl: item.user?.avatar_url,
            userPermalink: item.user?.permalink_url
        });
    }

    return results;
}

export async function resolveSoundCordStream(streamTranscodingUrl: string, isRetry = false): Promise<string | null> {
    const clientId = await getSoundCordClientId(isRetry);
    const nativeHelper = (VencordNative.pluginHelpers as any)?.SoundCordPlayer;

    if (nativeHelper?.resolveStreamUrl) {
        try {
            const url = await nativeHelper.resolveStreamUrl(streamTranscodingUrl, clientId);
            if (url) return url;
        } catch {}
    }

    try {
        const u = new URL(streamTranscodingUrl);
        u.searchParams.set("client_id", clientId);
        const resp = await fetch(u.toString(), {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": "https://soundcloud.com/"
            }
        });
        if ((resp.status === 401 || resp.status === 403) && !isRetry) {
            await getSoundCordClientId(true);
            return resolveSoundCordStream(streamTranscodingUrl, true);
        }
        const data = await resp.json();
        return data?.url || null;
    } catch (e) {
        if (!isRetry) {
            await getSoundCordClientId(true);
            return resolveSoundCordStream(streamTranscodingUrl, true);
        }
        console.error("[Customization/SoundCord] resolveStreamUrl error:", e);
        return null;
    }
}

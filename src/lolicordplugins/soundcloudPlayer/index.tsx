/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { HeaderBarButton } from "@api/HeaderBar";
import { DataStore } from "@api/index";
import { EquicordDevs } from "@utils/constants";
import { ModalRoot, ModalSize, openModal } from "@utils/modal";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { IconComponent, OptionType, PluginNative } from "@utils/types";
import { findStoreLazy } from "@webpack";
import { ApplicationAssetUtils, FluxDispatcher, MediaEngineStore, React, ScrollerThin, UserStore, useEffect, useRef, useState } from "@webpack/common";
import { isPluginEnabled } from "@api/PluginManager";
import { SafeDynamicIsland } from "@lolicordplugins/DynamicIslande";
import { t } from "../autoTranslateLoliCord";
import { Switch } from "@components/Switch";
import { Button } from "@components/Button";
import { Badge } from "@components/Badge";
import { TooltipContainer } from "@components/TooltipContainer";
import { SafeSearchableSelect } from "@components/SafeSearchableSelect";
import { getStoredToken } from "../../api/OAuth2";
import { saveOwnPluginConfig, getPublicPluginConfig } from "../../api/PluginSync";

// ─── Native (IPC → main process) ─────────────────────────────────────────────

const Native = VencordNative.pluginHelpers.SoundCordPlayer as PluginNative<typeof import("./native")>;

// ─── SoundCord Official Logo ──────────────────────────────────────────────────

export const SOUNDCLOUD_LOGO_SRC = "data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAAImlsb2MAAAAAREAAAQABAAAAAAD6AAEAAAAAAAANvAAAACNpaW5mAAAAAAABAAAAFWluZmUCAAAAAAEAAGF2MDEAAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgQQMAAAAABRpc3BlAAAAAAAAAnIAAAJyAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAA3EbWRhdBIACgoZJmcZx4ICGg0IMqsbRFAAQQQQUPS+7C7TE2LUM7RK5NY8acmaUV/uwlxEVig2KO1uWZiZRSZNDArg5ZOeZ2T7badARcuwsJ2CO4lr8KhiucDIKeQuJmebAdGkncp+oW/cZPYl2OW3iOWmg5IyST4+o8XHx+Lgyim6DfiJVes0yIdEhDqjOL/cUtzt2sSgIdIQva+M88QaF6Qa1wwBMQqWOXiZfoZpZZGnDIlw+wPJBIbTLazyVsNAI5pjf/BmnxHTb9vnYRP5/3vnFwLZAObMC72ekFdmVu+H5bAAqy3y4o2gOJW0vw00+gWLws/YX7f2AVRnQbKH5nxAA+3lz9QAHHh4R1svkpWyne3bMfXVVJIbL7JgCnldB4jhB0gOGrPt8RJWyRGNA98lHIoR30EzGi2lp5BH+h4IoOAjto+9iZrXiIp1x6zOL2pyIrOmicG/5zhgsVzubSR2O6aDX1MKYvp/LHYR3kkne8kmAhPE/lPJOQdnd6C2ACimgWG2+MIHIHFtZ3MOWly8HDZHvKb5SfX3HPofhfv6neRARJQ1jJtI1KUiWOntwLgf81JlPyWIVPqAvvgi+eeXEFQhanpgyxMA75JdEfdLQ3JW6FmkvYZlbTuwnhyEuYaSxuuhEDgdaD6gMhiql56UD74liMYWalnaaqdcEwAOT14l2lPGBmFrvSOd4e3K7xCQwXr5L1u2mUtRWMtiGcy7Nq2lcIAFGbhFOEnd2EvJ6R7mf5bU9poKZvr2ni1zfLTnYZcJVlhD2h5EbTLdKKIKGKSuJWYI/Dv1LhPdliu1yNJDjNnHomDC3Gz2b5+2xHA75lJ/T6oydt3Ws0PzGKc3YZl1jXic/a33yWmFWJO8P1Fv+S8amxw7K8+0q2FYduXHdTZvN3jWmAcQLjiiW1sgkv9dKM2bkWzq8cl3REsJyU8Rlw4YiviWBh+qTO+BDR+CuOqKkIIbFoLNtkX8IXZF1C2R+HfzFVRHu//0gDKq2/nHrETiqPuSpfYhpcp+5BgTSwJJ2askvKYV0xAoWuVfw+qWvYhn1OjlqClSVWb0AiHcVsqn5GArwscDoQuj1ZZuNgT1zOcPXTKBLI9qrYzkCOhZK5hA4EyVWUXsmJhndaSsRzT4zO+7EqxyCeeySRispmXemtYJ4RbahRHkPWSuV5AWGbsdOtPPFaGlLdbuBF5vJQrPZYv1LQvYEN+Z7Tj42hsNJuQTnvHVB2okEkhuZQw3yPdo+6sShOKGRycBCOpVE74GHdOjLaZyQ6Zn/aE+sqjo84ERFq4QIkjYwcCD7fnPxiY1oe+lXmZsGUQcLrifeDzVT83wvhesrHOilDSSBcbBhz0PE4f+kxGp3j1IeYlneHfs0h3wdcbARMPZBbFD5JPQw55AN5VeB8n1xRupUBG6jz8JSAJRUHTksHpNRqJ8Tv0IGcaYLop4S+hYyI3vPA1vDgO++xCBuFBEDNQSOYrDAM0qN1j2EbX1nCCOSvur4f6ucsRf7FX/XkjGkLFPnhz/cE+3GFkrt2Kojr9EuPZPzfdw1mywF3llqnoydr/LGGorcctMS2+FXQ3PK5aqcCtnd5isYIGwBu8O387BbmPuu4JSWaQkWyRMnYgMKvsZUGPz6OhnG795dQj4wLqqWdqBbpue/6VSSg0EkwIxGAo899obUYyfc9Eq7HW5Pgn3939c98mlBgUWOeB1db9GBmBvCOxZByE3yHZbC0Icf7xrXFckjJ3FCmQwDPcGI7vrA5ON46XS65qh4nAC/d7i3r4aFqTAeYBdHgWw7bvx3sbqNCHHHwdV7FBBoNz1JvN6lTtZED8rNzGsaQSWOQBH9VbQE7PkjCnzCe6WAaNYvcBnQoUhxzkuh50sDIMoqfkTjJlZVEU4b5PX4R9iOgcdw3P6hitv3p/HHdsbeYwbuXpPLtzXoOGQQFSmshXwy+qiFaG0T25TSWNCG+H0Mw/TqUV33MmFnTqnPa9NSd89uSn3oNVRbKaUSNQgF5UZLvn7KOZHAdQ0D/KSIzGltJad5Ff2iojH2LZX+klyId8PTjKitG81gJJGwPpf2UzaLmcp3AvuHzjs7yPqGE0bvYLTv6QzEcQRBoVNWpbvDXSpNNgNZitGuboat6U32ShUNUwFLORTbIRT5rlkfXzSZThjH2cQn8OKnwCTfNpdcpxu7OhmDSdaqp9BkdxNDE4eW9udZbiXM+grA7x8uDGYFuYBz2My6kEQTV+OL+VRO0/16MqOTV1W9UWFEmK+MQNP8QGvKf0ljlUZTZT78yPJbUAJOUcEanpotqQOrGVIY0vO4UWz+z6SKtvYj9cmlkdm+8Bsfhl+S4aVyWcGBP6iyH16tfh/kR1ErXKn2cmGFtyO3n6gyX+dGa15dYlgc5ozAZ2q3LXZRpMfgbFMJ5Z+bNGIEUTwq584QnQhkcGcT02oto95tyPqPZS4ic51OwW/kRrU0Oof1nDVBoQh3VjIdlUTB9MFZxkEUhfbTLSVYiglgOXzFcUZik6/KxOp9Wy+aPCnJ3A07GavYlDfHUnrL7k0ITUnxNBZphXTaDYRwt62bypKvd0RkuWXEy1480DR3e+fPYlGUxcYtcEUSoqSwo5MInPD8MtVx+XstvxspQs8TLXEp17A7WgjuBDyI4uiwKnfKJd8/Y1EOgVYGeN4JFaaibol1BXE7PSljBucyOWz9TkDnEPmwIkCnYld2nHr9Y8lX+ucUaQB9KmorFnDGS+uTg2EG7eYGBhhLPSR68GBEFE42IveloiZicPOWEmzJP6Tx7/ZK0Cmzq2yCTXAu2B9BFNBkdyWogcjcMxpEsXAlbPNMtN22qUgGqRPCMsfAP01xRhAi48/d9sBgFhwv7+emvOI/7Yw44h2Xr0fP1dhP8QrYy9+tqLpazXbr77GgHnVwQP/KPhfqJ1+EfKfa4+nhkD6hlBNNzIeauI9RLZ0Dfi6Usj9LHYYV/4HWrRLWMo7DjeIT+x7yhrpgAqdDppMn0EWkK24plM2xQMi8MGZHRxP2onhPJpJIH+DFgfWqpQruxl9VYaaYpfSujYBvFf5Cc6rWOT0EoNWNCfR96dZxNcCcjTvc546LsFF0G+4w8a1C/mZ6z9URhXBmO9wGThmxFte3mbz3Vjet1CzH7rZKGfi4HDVHWTrdelwJs3XJ+puOl9hpvabl6H8R5uEUQhDViaedf1XfH+q5HShc3qMzu9ddMNPWWIypBXWgH/JHy8xJ/P4LOiyNxZOM31cceVpO9YjVuTbh2ccGeH8iImG8tVY4q58TqZSHsoJjldc+xkoy119QeUCz1h5wQFJV+pxYq8d3oULYolThmuofwTRTA1r9u4Lgl39fP/cP33MLZvcZvj/uK+chJOQFea52ni/fyab9EK6X9/1Z2P/BaInQMFO9cj/UVTwJNi7W6icUSPQ2bbO0/PHHDkKBL1BJw/XOC+nae27Shq/Or0yg44T8wZWBTbrEkuzC0yrNpgf1Kzh629goerab5A+Mez6isrRnJHKYh9CTC8Tkhtp0A+hsZ9fOajn5JaKPKKQf2cCXWadz2+w+3k4g6ZQICuQfiX8gDwZK6yrJn4zm6UXKWb467zX38vOvKQN/OQ40DTEStLDIbMdM9zLOd0A0NhNQTWtIUVE+9O50H6DfzoqJhjDxVkk7PY8G3hAAxDTbb5B73ji/8cH6Yf8rMBvYiwukfFHV0wg56ASNJavr9CjBj4xSZbqm+mQ+Zr/4Bclzu8xZW2XMgKZS7sx+/iMlcw2/DcMsP5F6XacYK5zstsWPLqQmYSX9oFYb3D3MghLCRl6jNcLE0L3P/gB1vPh2fhVExVb18jmSE6ta2NwMScBcThcIM95+BpRZza6g6HBmxGnr0iOTy5FDj/w+5MHdW5pbS2TA+mjr5TvorTrDYOf0uwYX8AyobEkgbqdn3iiqThBUMVB3h8/ks/2J75B/hMY2aQ28s0lfgcx4ZgOWo7HN9hV78dv0ps5pqLDyM636kCZlXK3qllxN3qYNOGno+BOKkpObab8KZXeNKCVKNYktcpYSrUTxiCPcJ5ahyjMWQEU5sB+vE3fRidsLtyBPCx/BWd4mF6nu0aUXgytXYdtkXaR43//tErnq7pKzG9PNNhiuDHtHZZ83DYBQNvig0HPcA1UNCZqoo60ikOR6VUGOzEmcpcD0s5x1K761inhDQNRXRe9j5V7aDZit2EwDVi3ueHU5qcnSGvWVup77o+py2UCU2OYg6YQBbS5uK0PWoXJV076/eVK014eo0L1u5ysCYi0rFf6dXXtJg5h8sxbsN7HZ8zva5IHYkEqo/aVak0un4o1HRNpajQi516bfXlPgoQtqhX2d2/Vb7fpesd0P2JVZkcp5Yoi01eEd6e+xpri4E1FWbS9V1cfBf9RwYX66eJp2qvk2aYw8cxBwnCOXTe8fVLbGyIGgeQG3tL8gnNgWSvhbVukG6NjadeIH6nP26Zv97o2g9Ki6ZnIgIl7RkoEsdZzXjViqOtiazr3xeXj2QUi+AcnHaUzJ1Knk4HigxFdQpL7V5+8KqzTlnnWTRV7DG/2gKMpiKoKCYST1YrZKWHcSEqognc3DfBQ6VycsL3IPVR70Aq4tJ+t4c76+JgQCQDuVHUI1z+rW8nDMA3xb88R4BC7bQhbqyWbXqRms4EnHzN6fHadzUK02rvdgPDYMqMUjmAnMcgq1o1BgA==";

function SoundCloudIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width={20} height={20} fill="none" viewBox="0 0 24 24" {...props} className={`nc-soundcord-icon ${props.className || ""}`}>
            <path fill="currentColor" d="M8.65 1.51A2 2 0 0 0 6 3.41v9.88A3.98 3.98 0 0 0 4.5 13C2.57 13 1 14.34 1 16s1.57 3 3.5 3S8 17.66 8 16V5.4l11 3.81v7.08a3.98 3.98 0 0 0-1.5-.29c-1.93 0-3.5 1.34-3.5 3s1.57 3 3.5 3 3.5-1.34 3.5-3V7.03c0-.74-.47-1.4-1.18-1.65L8.65 1.51Z" />
        </svg>
    );
}

const SoundCloudIconComponent: IconComponent = props => <SoundCloudIcon {...props} />;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScTrack {
    id: string;
    title: string;
    artist: string;
    artworkUrl: string;
    streamUrl: string;
    durationMs: number;
    /** true when SoundCloud only allows a 30s preview (label/Go+ restriction) */
    snipped?: boolean;
    /** Source platform of this track */
    source?: "soundcloud" | "deezer" | "spotify";
    /** true when this is a 30s preview (Deezer/Spotify fallback) */
    previewOnly?: boolean;
    /** Original external URL (Spotify/Deezer link) */
    externalUrl?: string;
    /** Creator / Artist user ID */
    userId?: string;
    /** Creator / Artist avatar URL */
    userAvatarUrl?: string;
    /** Creator / Artist permalink */
    userPermalink?: string;
    /** Creator / Artist followers count */
    userFollowersCount?: number;
    /** Creator / Artist tracks count */
    userTrackCount?: number;
    /** Creator / Artist verified status */
    userVerified?: boolean;
}

interface ScUserProfile {
    id: string;
    username: string;
    avatarUrl: string;
    permalinkUrl?: string;
    followersCount?: number;
    trackCount?: number;
    description?: string;
    verified?: boolean;
}

// ─── DataStore keys ───────────────────────────────────────────────────────────

const SC_CLIENT_ID_KEY = "SoundCordPlayer_clientId";
const SC_FAVS_KEY = "SoundCordPlayer_favorites";
const SC_AUTH_TOKEN_KEY = "SoundCordPlayer_oauthToken";
const SC_AUTH_USER_KEY = "SoundCordPlayer_authUser";

let cachedClientId: string | null = null;

async function loadCachedClientId(): Promise<string | null> {
    if (cachedClientId) return cachedClientId;
    try {
        const stored = await DataStore.get<string>(SC_CLIENT_ID_KEY);
        if (stored) cachedClientId = stored;
    } catch { }
    return cachedClientId;
}

async function saveClientId(id: string) {
    cachedClientId = id;
    try { await DataStore.set(SC_CLIENT_ID_KEY, id); } catch { }
}

// ─── Client ID Fetch via native (main process) ────────────────────────────

async function fetchClientId(): Promise<string | null> {
    const cached = await loadCachedClientId();
    if (cached) return cached;

    const FALLBACK = "iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX";

    try {
        let id = null;
        if (Native?.fetchSoundCloudClientId) {
            id = await Native.fetchSoundCloudClientId();
        }
        if (!id) id = FALLBACK;
        await saveClientId(id);
        return id;
    } catch (e: any) {
        console.error("[SoundCloudPlayer] fetchClientId:", e?.message);
        await saveClientId(FALLBACK);
        return FALLBACK;
    }
}

async function refreshClientId(): Promise<string | null> {
    cachedClientId = null;
    try { await DataStore.del(SC_CLIENT_ID_KEY); } catch { }
    return fetchClientId();
}

// ─── SoundCloud API via native ────────────────────────────────────────────────

function parseTracks(data: any): ScTrack[] {
    const list = Array.isArray(data) ? data : (data?.collection ?? []);
    if (!Array.isArray(list)) return [];
    const tracks: ScTrack[] = [];
    for (const rawItem of list) {
        const item = rawItem.track || rawItem;
        if (!item || (item.kind && item.kind !== "track")) continue;
        const transcodings = item.media?.transcodings ?? [];

        // Only use transcodings that are fully playable (not preview/blocked).
        // SoundCloud marks major-label tracks with access: "preview" which only
        // streams a 30-second snipped clip and whose URL resolves to an error.
        const playable = transcodings.filter((tc: any) =>
            tc.url && (!tc.access || tc.access === "playable")
        );

        // If nothing playable, mark as snipped but still include the track in results
        // so the user can see it (greyed out) rather than it silently disappearing.
        const snipped = playable.length === 0;
        const pool = snipped ? transcodings : playable;

        let streamUrl = "";

        // Priority 1: progressive (direct MP3)
        for (const tc of pool) {
            if (tc.format?.protocol === "progressive" && tc.url) {
                streamUrl = tc.url;
                break;
            }
        }

        // Priority 2: HLS (m3u8)
        if (!streamUrl) {
            for (const tc of pool) {
                if (tc.format?.protocol === "hls" && tc.url) {
                    streamUrl = tc.url;
                    break;
                }
            }
        }

        if (!streamUrl) continue;
        let artworkUrl = item.artwork_url || item.user?.avatar_url || "";
        if (artworkUrl) {
            artworkUrl = artworkUrl.replace(/-(large|t500x500|t300x300|t120x120|t200x200|t67x67)/, "-t500x500");
            if (!artworkUrl.includes("-t500x500")) artworkUrl = artworkUrl.replace(/\.jpg$/, "-t500x500.jpg");
        }

        const userAvatar = item.user?.avatar_url
            ? item.user.avatar_url.replace(/-(large|t500x500|t300x300|t120x120|t200x200|t67x67)/, "-t500x500")
            : "";

        tracks.push({
            id: String(item.id),
            title: item.title ?? "Unknown title",
            artist: item.user?.username ?? "Unknown artist",
            artworkUrl,
            streamUrl,
            durationMs: item.duration ?? 0,
            snipped,
            userId: item.user?.id ? String(item.user.id) : (item.user_id ? String(item.user_id) : undefined),
            userAvatarUrl: userAvatar,
            userPermalink: item.user?.permalink || item.user?.permalink_url,
            userFollowersCount: item.user?.followers_count,
            userTrackCount: item.user?.track_count,
            userVerified: !!(item.user?.verified || item.user?.badges?.pro),
        });
    }
    return tracks;
}

async function searchTracks(query: string, clientId: string, offset = 0, limit = 50): Promise<ScTrack[]> {
    // Include both playable and preview so users can see restricted tracks
    const json = await Native.searchSoundCloud(query, clientId, offset, limit);
    if (!json) throw new Error("Empty response");
    return parseTracks(JSON.parse(json));
}

// ─── Paroles / Lyrics via LrcLib ──────────────────────────────────────────────

export interface LyricsLine {
    time: number; // in seconds
    text: string;
}

export interface LyricsData {
    plainLyrics: string;
    syncedLyrics?: LyricsLine[];
    isSynced: boolean;
    trackId: string;
}

const lyricsCache = new Map<string, LyricsData | null>();

function parseLrc(lrc: string): LyricsLine[] {
    const lines = lrc.split("\n");
    const result: LyricsLine[] = [];
    const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
    for (const line of lines) {
        const match = regex.exec(line);
        if (match) {
            const min = parseInt(match[1], 10);
            const sec = parseInt(match[2], 10);
            const ms = parseInt(match[3].padEnd(3, "0"), 10);
            const time = min * 60 + sec + ms / 1000;
            const text = match[4].trim();
            if (text) {
                result.push({ time, text });
            }
        }
    }
    return result;
}

async function getLyricsForTrack(track: ScTrack): Promise<LyricsData | null> {
    if (lyricsCache.has(track.id)) {
        return lyricsCache.get(track.id)!;
    }
    try {
        const raw = await Native.fetchLyrics(track.title, track.artist, track.durationMs);
        if (!raw) {
            lyricsCache.set(track.id, null);
            return null;
        }
        const data = JSON.parse(raw);
        const synced = data.syncedLyrics ? parseLrc(data.syncedLyrics) : undefined;
        const lyricsData: LyricsData = {
            plainLyrics: data.plainLyrics || "",
            syncedLyrics: synced && synced.length > 0 ? synced : undefined,
            isSynced: !!(synced && synced.length > 0),
            trackId: track.id,
        };
        lyricsCache.set(track.id, lyricsData);
        return lyricsData;
    } catch {
        lyricsCache.set(track.id, null);
        return null;
    }
}



async function getStreamUrl(track: ScTrack, clientId: string): Promise<string> {
    const { streamUrl, snipped, source } = track;
    if (!streamUrl) throw new Error("Stream URL not found");

    // Deezer/Spotify previews are direct CDN MP3 URLs — play directly, no resolution needed
    if (source === "deezer" || source === "spotify") {
        return streamUrl;
    }

    if (snipped) {
        throw new Error("Label restricted — not available outside SoundCloud Go+");
    }

    // Already a resolved CDN URL, no need to call the resolve endpoint
    if (streamUrl.includes("cf-hls-media") || streamUrl.includes("cf-media")) {
        return streamUrl;
    }

    try {
        const url = await Native.resolveStreamUrl(streamUrl, clientId);
        if (!url) throw new Error("Stream URL not found (check region or Go+ status)");
        return url;
    } catch (e: any) {
        throw new Error(e?.message || "Stream URL not found");
    }
}

async function refreshTrackData(track: ScTrack, clientId: string): Promise<ScTrack> {
    // Deezer/Spotify preview URLs are static CDN links — no refresh needed
    if (track.source === "deezer" || track.source === "spotify") return track;
    try {
        const json = await Native.resolveTrack(track.id, clientId);
        if (!json) return track;
        const data = JSON.parse(json);

        const transcodings = data.media?.transcodings ?? [];

        // Apply the same access filter as parseTracks: only use playable streams.
        // Major-label tracks return access: "preview" which can't be resolved.
        const playable = transcodings.filter((tc: any) =>
            tc.url && (!tc.access || tc.access === "playable")
        );
        const snipped = playable.length === 0;
        const pool = snipped ? transcodings : playable;

        let streamUrl = "";

        // Priority 1: progressive (direct MP3) - most stable
        for (const tc of pool) {
            if (tc.format?.protocol === "progressive" && tc.url) {
                streamUrl = tc.url;
                break;
            }
        }

        // Priority 2: HLS (fallback)
        if (!streamUrl) {
            for (const tc of pool) {
                if (tc.format?.protocol === "hls" && tc.url) {
                    streamUrl = tc.url;
                    break;
                }
            }
        }

        if (streamUrl) {
            return { ...track, streamUrl, snipped };
        }
    } catch { }
    return track;
}

async function playTrackById(trackId: string, startParam?: string) {
    try {
        const p = playerState;
        const clientId = await fetchClientId();
        const json = await Native.resolveTrack(trackId, clientId);
        if (!json) throw new Error("Track not found");
        const tracks = parseTracks({ collection: [JSON.parse(json)] });
        if (tracks.length === 0) throw new Error("Invalid track data");
        
        let seekPos = 0;
        if (startParam) {
            const startTime = Number(startParam);
            if (!isNaN(startTime) && startTime > 0) {
                seekPos = (Date.now() - startTime) / 1000;
            }
        }

        playerPlayTrack(tracks[0], -1, seekPos);
    } catch (e: any) {
        playerState.status = `${t("Failed to load track: ")}${e.message}`;
        playerState.notify();
    }
}

// ─── Favorites ──────────────────────────────────────────────────────────────────

async function loadFavorites(): Promise<ScTrack[]> {
    try { return (await DataStore.get<ScTrack[]>(SC_FAVS_KEY)) ?? []; }
    catch { return []; }
}

async function saveFavorites(favs: ScTrack[]) {
    try { await DataStore.set(SC_FAVS_KEY, favs); } catch { }
}

// ─── Duration helper ─────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ─── Player singleton (persiste après fermeture de la modal) ─────────────────

type PlayerListener = () => void;

export const playerState = {
    clientId: null as string | null,
    playing: null as ScTrack | null,
    isPlaying: false,
    progress: 0,
    position: 0,
    duration: 0,
    loop: false,
    shuffle: false,
    volume: 35,
    favIndex: -1,
    resultIndex: -1,
    favorites: [] as ScTrack[],
    queue: [] as ScTrack[],
    currentResults: [] as ScTrack[],
    currentLyrics: null as LyricsData | null,
    hasLyrics: false,
    status: "Connecting to SoundCloud…",
    audio: null as HTMLAudioElement | null,
    listeners: new Set<PlayerListener>(),

    notify() { 
        this.listeners.forEach(l => l()); 
        try {
            FluxDispatcher.dispatch({
                type: "SOUNDCORD_STATE_UPDATE",
                state: {
                    playing: this.playing,
                    isPlaying: this.isPlaying,
                    favorites: this.favorites,
                    favIndex: this.favIndex,
                    volume: this.volume,
                    hasLyrics: this.hasLyrics
                }
            });
        } catch { }
    },
    subscribe(l: PlayerListener) { this.listeners.add(l); },
    unsubscribe(l: PlayerListener) { this.listeners.delete(l); },
};

let playerInited = false;
async function initPlayer() {
    if (playerInited) return;
    playerInited = true;
    const id = await fetchClientId();
    if (id) {
        playerState.clientId = id;
        playerState.status = t("Search for a title or an artist...");
    } else {
        playerState.status = t("Impossible to obtain client_id. Check your connection.");
    }
    playerState.favorites = await loadFavorites();
    playerState.notify();
}

async function getDiscordRealOutputDeviceId(): Promise<string> {
    try {
        const discordId = MediaEngineStore.getOutputDeviceId();
        if (!discordId || discordId === "default") return "";

        const devs = MediaEngineStore.getOutputDevices();
        const selected = devs[discordId];
        if (!selected || !selected.name) return "";

        let webDevs = await navigator.mediaDevices.enumerateDevices();
        if (webDevs.some(d => d.kind === "audiooutput" && !d.label)) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
                webDevs = await navigator.mediaDevices.enumerateDevices();
            } catch { }
        }

        const match = webDevs.find(d =>
            d.kind === "audiooutput" &&
            d.label &&
            (d.label.includes(selected.name) || selected.name.includes(d.label) || d.label.toLowerCase() === selected.name.toLowerCase())
        );

        if (match) {
            return match.deviceId;
        }
    } catch { }
    return "";
}

async function playerPlayTrack(track: ScTrack, fromFavIdx = -1, seekPos = 0, fromResultIdx = -1) {
    const s = playerState;
    if (!s.clientId) { s.status = t("Missing client_id"); s.notify(); return; }
    if (s.audio) { s.audio.pause(); s.audio.src = ""; s.audio = null; }

    s.status = t("Refreshing track...");
    s.playing = track;
    s.favIndex = fromFavIdx;
    s.resultIndex = fromResultIdx;
    s.progress = 0; s.position = 0; s.isPlaying = false;
    s.hasLyrics = false;
    s.currentLyrics = null;
    s.notify();

    // Fetch lyrics asynchronously in background
    getLyricsForTrack(track).then(lyrics => {
        if (s.playing?.id === track.id) {
            s.currentLyrics = lyrics;
            s.hasLyrics = !!lyrics && (!!lyrics.plainLyrics || !!lyrics.syncedLyrics?.length);
            s.notify();
        }
    });

    try {
        // Rafraîchir les données de la piste pour éviter les 404 (liens expirés)
        const freshTrack = await refreshTrackData(track, s.clientId);
        s.playing = freshTrack;

        const mp3Url = await getStreamUrl(freshTrack, s.clientId);
        const audio = new Audio();

        // Nettoyage de l'ancienne instance
        if (s.audio) {
            s.audio.pause();
            s.audio.src = "";
            s.audio.load();
        }

        // Error handling for the audio element itself
        audio.addEventListener("error", e => {
            const { error } = audio;
            console.error("[SoundCord] HTML5 Audio Error:", error?.code, error?.message);
            if (error?.code === 4 || error?.code === 3) {
                s.status = t("Stream error : No supported source found");
            } else if (error?.code === 2) {
                s.status = t("Network error : Connection failed");
            } else {
                s.status = t("Audio playback error");
            }
            s.isPlaying = false;
            s.notify();
        });

        audio.src = mp3Url;
        if (seekPos > 0) {
            audio.currentTime = seekPos;
        }
        audio.crossOrigin = "anonymous";
        audio.volume = s.volume / 100;
        s.audio = audio;

        // Apply saved output device on start
        const savedDevice = await DataStore.get<string>(SC_OUTPUT_KEY);
        if (savedDevice && (audio as any).setSinkId) {
            try {
                const targetDeviceId = savedDevice === "default"
                    ? await getDiscordRealOutputDeviceId()
                    : savedDevice;
                await (audio as any).setSinkId(targetDeviceId);
            } catch { }
        }

        audio.addEventListener("loadedmetadata", () => { s.duration = audio.duration; s.notify(); });
        audio.addEventListener("timeupdate", () => {
            if (audio.duration) {
                s.progress = audio.currentTime / audio.duration;
                s.position = audio.currentTime;
                s.duration = audio.duration;
                s.notify();
            }
        });
        audio.addEventListener("pause", () => {
            if (s.isPlaying) {
                s.isPlaying = false;
                s.notify();
            }
        });
        audio.addEventListener("play", () => {
            if (!s.isPlaying) {
                s.isPlaying = true;
                s.notify();
            }
        });
        audio.addEventListener("ended", () => {
            if (s.loop) {
                audio.currentTime = 0;
                audio.play();
                return;
            }

            // Automatic advancement: Queue -> Shuffle -> Favorites -> Search Results
            if (s.queue.length > 0) {
                const nextTrack = s.queue.shift()!;
                playerPlayTrack(nextTrack);
            } else if (s.shuffle) {
                if (fromFavIdx >= 0 && s.favorites.length > 1) {
                    const nextIdx = Math.floor(Math.random() * s.favorites.length);
                    playerPlayFavAt(nextIdx);
                } else if (fromResultIdx >= 0 && s.currentResults.length > 1) {
                    const nextIdx = Math.floor(Math.random() * s.currentResults.length);
                    playerPlayTrack(s.currentResults[nextIdx], -1, 0, nextIdx);
                }
            } else if (fromFavIdx >= 0 && s.favorites.length > 1) {
                playerPlayFavAt((fromFavIdx + 1) % s.favorites.length);
            } else if (fromResultIdx >= 0 && s.currentResults.length > 1) {
                const nextIdx = (fromResultIdx + 1) % s.currentResults.length;
                playerPlayTrack(s.currentResults[nextIdx], -1, 0, nextIdx);
            }
        });
        audio.addEventListener("error", () => { s.status = t("Audio playback error"); s.isPlaying = false; s.notify(); });
        await audio.play();
        s.isPlaying = true;
        s.status = t("Now playing…");
        s.notify();
    } catch (e: any) {
        s.status = `${t("Stream error : ")}${e.message}`;
        s.isPlaying = false;
        s.notify();
    }
}

export function playerPlayFavAt(idx: number) {
    const favs = playerState.favorites;
    if (favs.length === 0) return;
    const i = ((idx % favs.length) + favs.length) % favs.length;
    playerPlayTrack(favs[i], i);
}

function playerStop() {
    const s = playerState;
    if (s.audio) { s.audio.pause(); s.audio.src = ""; s.audio = null; }
    s.playing = null; s.isPlaying = false; s.progress = 0; s.position = 0; s.favIndex = -1; s.resultIndex = -1;
    s.hasLyrics = false; s.currentLyrics = null;
    s.status = "Search for a track or an artist...";
    clearRichPresence();
    s.notify();
}

function usePlayerState() {
    const [, forceUpdate] = useState(0);
    useEffect(() => {
        const listener = () => forceUpdate(n => n + 1);
        playerState.subscribe(listener);
        return () => playerState.unsubscribe(listener);
    }, []);
    return playerState;
}

function IconSearch() {
    return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx={11} cy={11} r={8} /><line x1={21} y1={21} x2={16.65} y2={16.65} /></svg>;
}
function IconHeart({ filled }: { filled: boolean; }) {
    return <svg width={16} height={16} viewBox="0 0 24 24" fill={filled ? "#ed4245" : "none"} stroke={filled ? "#ed4245" : "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
}
function IconPlay({ size = 18 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z" /></svg>;
}
function IconPause({ size = 18 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><rect x={6} y={4} width={4} height={16} rx={1} /><rect x={14} y={4} width={4} height={16} rx={1} /></svg>;
}
function IconPrev({ size = 18 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M11 12l9-7v14l-9-7zM2 12l9-7v14l-9-7z" /></svg>;
}
function IconNext({ size = 18 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M13 12l-9 7V5l9 7zM22 12l-9 7V5l9 7z" /></svg>;
}
function IconStop({ size = 16 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><rect x={4} y={4} width={16} height={16} rx={2} /></svg>;
}
function IconRepeat({ active }: { active: boolean; }) {
    return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ color: active ? "#5865f2" : undefined }}><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>;
}
function IconShuffle({ active }: { active: boolean; }) {
    return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ color: active ? "#5865f2" : undefined }}><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>;
}
function IconMic({ size = 16 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>;
}
function IconVolume({ low, muted }: { low: boolean; muted?: boolean; }) {
    if (muted) {
        return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>;
    }
    return low
        ? <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1={15.54} y1={8.46} x2={15.54} y2={15.54} /></svg>
        : <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>;
}
function IconClose() {
    return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1={18} y1={6} x2={6} y2={18} /><line x1={6} y1={6} x2={18} y2={18} /></svg>;
}
function IconMaximize({ size = 14 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
    );
}
function IconRestore({ size = 14 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 14h6m0 0v6m0-6L3 21m17-11h-6m0 0V4m0 6l7-7" />
        </svg>
    );
}
function IconMusicNote({ size = 15 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M9 18V5l12-2v13" /><circle cx={6} cy={18} r={3} /><circle cx={18} cy={16} r={3} /></svg>;
}
function IconUsers({ size = 14 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}
function IconVerified({ size = 18 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, verticalAlign: "middle" }}>
            <path
                d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.67-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
                fill="#3897f0"
            />
            <path
                d="M9.5 12.3l2 2 4.5-4.5"
                stroke="#ffffff"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
function IconUpload({ size = 16 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>;
}
function IconCloudUpload({ size = 28 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" /><polyline points="16 16 12 12 8 16" /></svg>;
}
function IconFileAudio({ size = 22 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>;
}
function IconImage({ size = 20 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>;
}
function IconCheckCircle({ size = 24 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#23a55a" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>;
}
function IconGlobe({ size = 15 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>;
}
function IconLock({ size = 15 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
}
function IconExternalLink({ size = 14 }: { size?: number; }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>;
}

const UPLOAD_GENRES = [
    "Lo-Fi",
    "Hip-Hop & Rap",
    "Electronic / EDM",
    "Phonk",
    "Synthwave",
    "Trap",
    "Rock & Alternative",
    "Pop",
    "R&B & Soul",
    "Chillout & Ambient",
    "Piano & Instrumental",
    "Anime & Game OST",
    "House",
    "Techno",
    "Drill",
    "Acoustic",
];

function IconPlus() {
    return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
function IconTrash({ size = 16, className = "" }: { size?: number; className?: string; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
    );
}
function IconRefresh({ size = 16, className = "" }: { size?: number; className?: string; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
    );
}

const GENRE_PILLS = [
    { label: "Trending", query: "Trending" },
    { label: "Lo-Fi", query: "Lo-Fi Beats" },
    { label: "Synthwave", query: "Synthwave" },
    { label: "Gaming", query: "Gaming EDM" },
    { label: "Phonk", query: "Phonk" },
    { label: "Chill", query: "Chillout" },
    { label: "Hip-Hop", query: "Hip-Hop" },
    { label: "Rock", query: "Rock" },
    { label: "Piano", query: "Piano Calm" },
    { label: "Anime", query: "Anime OST" },
];

const DISCOVER_CARDS = [
    { title: "Trending Worldwide", query: "Top Chart 2026", desc: "Most viral and played tracks right now", bg: "linear-gradient(135deg, #f97316, #ea580c)" },
    { title: "Lo-Fi & Study", query: "Lofi Hip Hop Chill", desc: "Relaxing beats to focus, work and study", bg: "linear-gradient(135deg, #8b5cf6, #6d28d9)" },
    { title: "Synthwave & Retro", query: "Synthwave Cyberpunk", desc: "Neon lights, 80s nostalgia and bass", bg: "linear-gradient(135deg, #ec4899, #be185d)" },
    { title: "Gaming & Bass", query: "Gaming EDM Trap", desc: "High octane beats for competitive gaming", bg: "linear-gradient(135deg, #06b6d4, #0284c7)" },
    { title: "Phonk & Drift", query: "Drift Phonk House", desc: "Heavy aggressive bass and drift sounds", bg: "linear-gradient(135deg, #ef4444, #b91c1c)" },
    { title: "Chill & Deep Sleep", query: "Ambient Relaxation", desc: "Soothing acoustic and ambient landscapes", bg: "linear-gradient(135deg, #10b981, #047857)" },
];

const SC_OUTPUT_KEY = "SoundCordPlayer_outputDevice";

function SoundCloudModal({ onClose }: { onClose: () => void; }) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [tab, setTab] = useState<"search" | "favs" | "queue" | "lyrics" | "artist" | "upload">("search");
    const [previousTab, setPreviousTab] = useState<"search" | "favs" | "queue" | "lyrics" | "upload">("search");
    const [activeSearchQuery, setActiveSearchQuery] = useState("");
    const [activeCategoryName, setActiveCategoryName] = useState<string | null>(null);

    // ─── SoundCloud Account Auth & Upload State ─────────────────────────────
    const [authToken, setAuthToken] = useState<string | null>(null);
    const [authUser, setAuthUser] = useState<any | null>(null);
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [manualToken, setManualToken] = useState("");
    const [showManualInput, setShowManualInput] = useState(false);
    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");
    /** Cookies read from the user's browser (includes datadome for upload bypass) */
    const [browserCookies, setBrowserCookies] = useState<string>("");

    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [audioDuration, setAudioDuration] = useState<number>(0);
    const [audioBase64, setAudioBase64] = useState<string | null>(null);
    const [artworkFile, setArtworkFile] = useState<File | null>(null);
    const [artworkPreview, setArtworkPreview] = useState<string | null>(null);
    const [artworkBase64, setArtworkBase64] = useState<string | null>(null);
    const [uploadTitle, setUploadTitle] = useState("");
    const [uploadGenre, setUploadGenre] = useState("Lo-Fi");
    const [uploadSharing, setUploadSharing] = useState<"public" | "private">("public");
    const [uploadDescription, setUploadDescription] = useState("");
    const [uploadTags, setUploadTags] = useState("");
    const [uploading, setUploading] = useState(false);
    const [uploadProgressText, setUploadProgressText] = useState("");
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadedTrack, setUploadedTrack] = useState<any | null>(null);
    const [userTracks, setUserTracks] = useState<any[]>([]);
    const [loadingUserTracks, setLoadingUserTracks] = useState<boolean>(false);
    const [deletingTrackId, setDeletingTrackId] = useState<string | number | null>(null);
    const [trackToDelete, setTrackToDelete] = useState<any | null>(null);
    const [userTrackNotice, setUserTrackNotice] = useState<string | null>(null);

    const audioInputRef = useRef<HTMLInputElement>(null);
    const artworkInputRef = useRef<HTMLInputElement>(null);
    const [selectedArtist, setSelectedArtist] = useState<ScUserProfile | null>(null);
    const [artistTracks, setArtistTracks] = useState<ScTrack[]>([]);
    const [artistLoading, setArtistLoading] = useState(false);
    const [artistOffset, setArtistOffset] = useState(0);
    const [artistHasMore, setArtistHasMore] = useState(true);
    const [artistLoadingMore, setArtistLoadingMore] = useState(false);

    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionIdx, setSuggestionIdx] = useState(-1);
    const modalRootRef = useRef<HTMLDivElement>(null);
    const searchContainerRef = useRef<HTMLDivElement>(null);
    const searchSubmittedRef = useRef(false);

    useEffect(() => {
        const modalRoot = modalRootRef.current?.closest(".sc-modal-root");
        if (modalRoot) {
            if (isFullscreen) {
                modalRoot.classList.add("sc-modal-root--fullscreen");
                document.body.classList.add("sc-fullscreen-active");
            } else {
                modalRoot.classList.remove("sc-modal-root--fullscreen");
                document.body.classList.remove("sc-fullscreen-active");
            }
        }
        return () => {
            modalRoot?.classList.remove("sc-modal-root--fullscreen");
            document.body.classList.remove("sc-fullscreen-active");
        };
    }, [isFullscreen]);
    const [results, setResults] = useState<ScTrack[]>([]);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedOutput, setSelectedOutput] = useState<string>("default");
    const [prevVolume, setPrevVolume] = useState<number>(80);
    const p = usePlayerState();
    const { enableDynamicIsland, richPresence } = settings.use(["enableDynamicIsland", "richPresence"]);
    const displayActivity = richPresence ?? true;
    const enableIsland = enableDynamicIsland ?? false;
    const progressRef = useRef<HTMLDivElement>(null);
    const lyricsContainerRef = useRef<HTMLDivElement>(null);
    const activeLyricRef = useRef<HTMLDivElement | null>(null);

    const activeLyricIndex = p.currentLyrics?.syncedLyrics?.findIndex((line, idx, arr) => {
        const nextLine = arr[idx + 1];
        return line.time <= p.position && (!nextLine || nextLine.time > p.position);
    }) ?? -1;

    useEffect(() => {
        if (tab === "lyrics" && activeLyricRef.current) {
            activeLyricRef.current.scrollIntoView({
                behavior: "smooth",
                block: "center",
                inline: "nearest",
            });
        }
    }, [activeLyricIndex, tab]);

    // ─── Search Autocomplete Suggestions ──────────────────────────────────
    useEffect(() => {
        if (searchSubmittedRef.current || !query.trim() || query.trim().length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        const timer = setTimeout(async () => {
            if (searchSubmittedRef.current) return;
            const clientId = p.clientId || (await fetchClientId()) || "iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX";
            if (Native?.fetchSoundCloudSuggestions) {
                const list = await Native.fetchSoundCloudSuggestions(clientId, query.trim());
                if (searchSubmittedRef.current) return;
                if (Array.isArray(list) && list.length > 0) {
                    setSuggestions(list);
                    setShowSuggestions(true);
                    setSuggestionIdx(-1);
                } else {
                    setSuggestions([]);
                    setShowSuggestions(false);
                }
            }
        }, 180);

        return () => clearTimeout(timer);
    }, [query, p.clientId]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        initPlayer();
        DataStore.get<string>(SC_AUTH_TOKEN_KEY).then(async (storedToken) => {
            const clientId = p.clientId || (await fetchClientId()) || "iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX";

            // Step 1: Restore from DataStore
            let token = storedToken || null;

            // Step 2: If no stored token, try to auto-read from browser (Chrome/Edge/Brave)
            if (!token && (Native as any)?.getBrowserSoundCloudToken) {
                try {
                    const browserResult = await (Native as any).getBrowserSoundCloudToken();
                    if (browserResult?.token) {
                        token = browserResult.token;
                        setBrowserCookies(browserResult.cookies || "");
                        await DataStore.set(SC_AUTH_TOKEN_KEY, token!);
                    }
                } catch { }
            } else if (storedToken) {
                // Even if we have a stored token, refresh browser cookies for upload
                try {
                    const browserResult = await (Native as any)?.getBrowserSoundCloudToken?.();
                    if (browserResult?.cookies) setBrowserCookies(browserResult.cookies);
                } catch { }
            }

            if (!token) {
                DataStore.get<any>(SC_AUTH_USER_KEY).then(u => { if (u) setAuthUser(u); });
                return;
            }

            setAuthToken(token);
            try {
                if (Native?.fetchSoundCloudMe) {
                    const meJson = await Native.fetchSoundCloudMe(token, clientId);
                    if (meJson) {
                        const user = JSON.parse(meJson);
                        setAuthUser(user);
                        await DataStore.set(SC_AUTH_USER_KEY, user);
                        return;
                    }
                }
            } catch { }
            DataStore.get<any>(SC_AUTH_USER_KEY).then(u => { if (u) setAuthUser(u); });
        });
    }, []);

    useEffect(() => {
        const load = async () => {
            try {
                let devices = await navigator.mediaDevices.enumerateDevices();
                const outputs = devices.filter(d => d.kind === "audiooutput");

                if (outputs.some(d => !d.label)) {
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        stream.getTracks().forEach(t => t.stop());
                        devices = await navigator.mediaDevices.enumerateDevices();
                    } catch { }
                }

                setOutputDevices(devices.filter(d => d.kind === "audiooutput"));
                const saved = await DataStore.get<string>(SC_OUTPUT_KEY);
                if (saved) setSelectedOutput(saved);
            } catch { }
        };
        load();
    }, []);

    async function applyOutputDevice(deviceId: string) {
        setSelectedOutput(deviceId);
        await DataStore.set(SC_OUTPUT_KEY, deviceId);
        try {
            if (p.audio && (p.audio as any).setSinkId) {
                const realId = deviceId === "default"
                    ? await getDiscordRealOutputDeviceId()
                    : deviceId;
                await (p.audio as any).setSinkId(realId);
            }
        } catch { }
    }

    async function doSearch(
        isRetry = false,
        customQuery?: string,
        keepSearchInputClean = false,
        categoryName?: string
    ) {
        searchSubmittedRef.current = true;
        setShowSuggestions(false);
        setSuggestions([]);
        setSuggestionIdx(-1);
        const targetQuery = customQuery ?? query;
        if (!p.clientId || !targetQuery.trim()) return;

        if (customQuery && !keepSearchInputClean) {
            setQuery(customQuery);
            setActiveCategoryName(null);
        } else if (keepSearchInputClean) {
            setActiveCategoryName(categoryName || customQuery || null);
        } else {
            setActiveCategoryName(null);
        }

        setActiveSearchQuery(targetQuery);
        setTab("search");
        setOffset(0);
        setHasMore(true);
        p.status = "Searching..."; p.notify();
        try {
            const tracks = await searchTracks(targetQuery, p.clientId, 0, 50);
            setResults(tracks);
            p.currentResults = tracks;
            setHasMore(tracks.length >= 50);
            p.status = tracks.length > 0 ? `${tracks.length} tracks found` : "No tracks found";
            p.notify();
        } catch (e: any) {
            if (!isRetry && (e.message?.includes("401") || e.message?.includes("403"))) {
                p.status = "Refreshing connection..."; p.notify();
                const newId = await refreshClientId();
                if (newId) {
                    p.clientId = newId;
                    return doSearch(true, targetQuery, keepSearchInputClean, categoryName);
                } else {
                    p.status = "Connection failed"; p.notify();
                }
            } else {
                p.status = `Error: ${e.message}`; p.notify();
            }
        }
    }

    async function loadMore() {
        const currentQ = activeSearchQuery || query;
        if (loadingMore || !hasMore || !p.clientId || !currentQ.trim()) return;
        setLoadingMore(true);
        const nextOffset = offset + 50;
        try {
            const moreTracks = await searchTracks(currentQ, p.clientId, nextOffset, 50);
            if (moreTracks.length === 0) {
                setHasMore(false);
            } else {
                const combined = [...results, ...moreTracks];
                setResults(combined);
                p.currentResults = combined;
                setOffset(nextOffset);
                p.status = `${combined.length} tracks found`;
                p.notify();
                if (moreTracks.length < 50) setHasMore(false);
            }
        } catch (e: any) {
            console.error("[SoundCloudPlayer] loadMore error:", e?.message);
        } finally {
            setLoadingMore(false);
        }
    }

    async function openArtistProfile(artistName: string, track?: ScTrack, e?: React.MouseEvent) {
        if (e) e.stopPropagation();
        if (!p.clientId) return;
        if (tab !== "artist") {
            setPreviousTab(tab as any);
        }
        setTab("artist");
        setArtistLoading(true);
        setArtistTracks([]);
        setArtistOffset(0);
        setArtistHasMore(true);

        const initialProfile: ScUserProfile = {
            id: track?.userId || "",
            username: artistName || track?.artist || "Artist",
            avatarUrl: track?.userAvatarUrl || track?.artworkUrl || "",
            permalinkUrl: track?.userPermalink,
            followersCount: track?.userFollowersCount,
            trackCount: track?.userTrackCount,
            verified: track?.userVerified,
        };
        setSelectedArtist(initialProfile);

        try {
            let userId = track?.userId;
            if (!userId && track?.id) {
                try {
                    const rawTrack = await Native.resolveTrack(track.id, p.clientId);
                    if (rawTrack) {
                        const parsed = JSON.parse(rawTrack);
                        if (parsed.user) {
                            userId = String(parsed.user.id);
                            initialProfile.id = userId;
                            initialProfile.username = parsed.user.username || initialProfile.username;
                            initialProfile.avatarUrl = parsed.user.avatar_url || initialProfile.avatarUrl;
                            initialProfile.followersCount = parsed.user.followers_count;
                            initialProfile.trackCount = parsed.user.track_count;
                            initialProfile.description = parsed.user.description;
                            initialProfile.verified = !!(parsed.user.verified || parsed.user.badges?.pro);
                            setSelectedArtist({ ...initialProfile });
                        }
                    }
                } catch { }
            }

            if (userId) {
                try {
                    const userJson = await Native.fetchSoundCloudUser(userId, p.clientId);
                    if (userJson) {
                        const u = JSON.parse(userJson);
                        setSelectedArtist({
                            id: String(u.id),
                            username: u.username || artistName,
                            avatarUrl: (u.avatar_url || "").replace("-large.", "-t500x500."),
                            permalinkUrl: u.permalink_url,
                            followersCount: u.followers_count,
                            trackCount: u.track_count,
                            description: u.description,
                            verified: !!(u.verified || u.badges?.pro),
                        });
                    }
                } catch { }

                const tracksJson = await Native.fetchSoundCloudUserTracks(userId, p.clientId, 0, 50);
                if (tracksJson) {
                    const parsedTracks = parseTracks(JSON.parse(tracksJson));
                    setArtistTracks(parsedTracks);
                    setArtistHasMore(parsedTracks.length >= 50);
                }
            } else {
                const searchResults = await searchTracks(artistName, p.clientId, 0, 50);
                setArtistTracks(searchResults);
                setArtistHasMore(searchResults.length >= 50);
            }
        } catch (err: any) {
            console.error("[SoundCord] openArtistProfile error:", err);
        } finally {
            setArtistLoading(false);
        }
    }

    async function loadMoreArtistTracks() {
        if (artistLoadingMore || !artistHasMore || !p.clientId || !selectedArtist?.id) return;
        setArtistLoadingMore(true);
        const nextOffset = artistOffset + 50;
        try {
            const tracksJson = await Native.fetchSoundCloudUserTracks(selectedArtist.id, p.clientId, nextOffset, 50);
            if (tracksJson) {
                const moreTracks = parseTracks(JSON.parse(tracksJson));
                if (moreTracks.length === 0) {
                    setArtistHasMore(false);
                } else {
                    const combined = [...artistTracks, ...moreTracks];
                    setArtistTracks(combined);
                    setArtistOffset(nextOffset);
                    if (moreTracks.length < 50) setArtistHasMore(false);
                }
            }
        } catch {
            setArtistHasMore(false);
        } finally {
            setArtistLoadingMore(false);
        }
    }

    function playAllArtistTracks() {
        if (artistTracks.length === 0) return;
        p.queue = [...artistTracks.slice(1)];
        playerPlayTrack(artistTracks[0], -1, 0, -1);
        p.status = `Playing all tracks by ${selectedArtist?.username || "Artist"}`;
        p.notify();
    }

    function addAllArtistToQueue() {
        if (artistTracks.length === 0) return;
        p.queue = [...p.queue, ...artistTracks];
        p.status = `Added ${artistTracks.length} tracks to queue`;
        p.notify();
    }

    function togglePause() {
        if (!p.audio) return;
        if (p.isPlaying) { p.audio.pause(); p.isPlaying = false; p.notify(); }
        else { p.audio.play(); p.isPlaying = true; p.notify(); }
    }

    function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
        if (!p.audio || !progressRef.current) return;
        const rect = progressRef.current.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        p.audio.currentTime = frac * (p.audio.duration || 0);
        p.progress = frac; p.notify();
    }

    function navFav(dir: 1 | -1) {
        if (p.favIndex >= 0 && p.favorites.length > 0) {
            const nextIdx = ((p.favIndex + dir) % p.favorites.length + p.favorites.length) % p.favorites.length;
            playerPlayFavAt(nextIdx);
        } else if (p.resultIndex >= 0 && p.currentResults.length > 0) {
            const nextIdx = ((p.resultIndex + dir) % p.currentResults.length + p.currentResults.length) % p.currentResults.length;
            playerPlayTrack(p.currentResults[nextIdx], -1, 0, nextIdx);
        } else if (p.favorites.length > 0) {
            playerPlayFavAt(0);
        }
    }

    function addToQueue(track: ScTrack, e: React.MouseEvent) {
        e.stopPropagation();
        p.queue.push(track);
        p.status = `Added "${track.title}" to queue`;
        p.notify();
    }

    function removeFromQueue(idx: number, e: React.MouseEvent) {
        e.stopPropagation();
        p.queue.splice(idx, 1);
        p.notify();
    }

    function clearQueue() {
        p.queue = [];
        p.notify();
    }

    async function toggleFavorite(track: ScTrack, e: React.MouseEvent) {
        e.stopPropagation();
        const favs = [...p.favorites];
        const idx = favs.findIndex(f => f.id === track.id);
        if (idx >= 0) favs.splice(idx, 1);
        else favs.push(track);
        p.favorites = favs; p.notify();
        await saveFavorites(favs);
    }

    const handleConnectSoundCloud = async (withEmail = false) => {
        setAuthLoading(true);
        setAuthError(null);
        try {
            let token: string | null = null;
            if (Native?.openSoundCloudAuthWindow) {
                const res = await Native.openSoundCloudAuthWindow(
                    withEmail && loginEmail.trim() ? loginEmail.trim() : undefined,
                    withEmail && loginPassword ? loginPassword : undefined
                );
                token = res?.token || null;
            }
            if (!token) {
                setAuthError(t("Authentication failed or window was closed."));
                setAuthLoading(false);
                return;
            }

            const clientId = p.clientId || (await fetchClientId()) || "iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX";
            let user = null;
            if (Native?.fetchSoundCloudMe) {
                const meJson = await Native.fetchSoundCloudMe(token, clientId);
                if (meJson) user = JSON.parse(meJson);
            }

            setUserTracks([]);
            setAuthToken(token);
            setAuthUser(user);
            await DataStore.set(SC_AUTH_TOKEN_KEY, token);
            if (user) await DataStore.set(SC_AUTH_USER_KEY, user);
            setLoginPassword("");
        } catch (e: any) {
            setAuthError(e?.message || t("Authentication failed or window was closed."));
        } finally {
            setAuthLoading(false);
        }
    };

    const handleCredentialsLogin = () => {
        handleConnectSoundCloud(true);
    };

    const handleManualTokenSave = async () => {
        if (!manualToken.trim()) return;
        setAuthLoading(true);
        setAuthError(null);
        const token = manualToken.trim();
        try {
            const clientId = p.clientId || (await fetchClientId()) || "iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX";
            let user = null;
            if (Native?.fetchSoundCloudMe) {
                const meJson = await Native.fetchSoundCloudMe(token, clientId);
                if (meJson) user = JSON.parse(meJson);
            }
            setAuthToken(token);
            setAuthUser(user);
            await DataStore.set(SC_AUTH_TOKEN_KEY, token);
            if (user) await DataStore.set(SC_AUTH_USER_KEY, user);
            setShowManualInput(false);
            setManualToken("");
        } catch (e: any) {
            setAuthError(e?.message || t("Authentication failed or window was closed."));
        } finally {
            setAuthLoading(false);
        }
    };

    const handleDisconnect = async () => {
        setAuthToken(null);
        setAuthUser(null);
        setUserTracks([]);
        await DataStore.del(SC_AUTH_TOKEN_KEY);
        await DataStore.del(SC_AUTH_USER_KEY);
        try {
            await (Native as any).clearSoundCloudSession();
        } catch { }
    };

    const handleAudioSelect = (file: File) => {
        setAudioFile(file);
        setUploadError(null);
        if (!uploadTitle.trim()) {
            const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
            setUploadTitle(nameWithoutExt);
        }

        try {
            const audioEl = new Audio(URL.createObjectURL(file));
            audioEl.addEventListener("loadedmetadata", () => {
                setAudioDuration(audioEl.duration * 1000);
            });
        } catch { }

        const reader = new FileReader();
        reader.onload = () => {
            const res = reader.result as string;
            const b64 = res.split(",")[1];
            setAudioBase64(b64);
        };
        reader.readAsDataURL(file);
    };

    const handleArtworkSelect = (file: File) => {
        setArtworkFile(file);
        const url = URL.createObjectURL(file);
        setArtworkPreview(url);

        const reader = new FileReader();
        reader.onload = () => {
            const res = reader.result as string;
            const b64 = res.split(",")[1];
            setArtworkBase64(b64);
        };
        reader.readAsDataURL(file);
    };

    const handleUploadSubmit = async () => {
        if (!authToken) {
            setUploadError(t("Authentication required. Please connect your SoundCloud account."));
            return;
        }
        if (!audioFile || !audioBase64) {
            setUploadError(t("Please select an audio file."));
            return;
        }
        if (!uploadTitle.trim()) {
            setUploadError(t("Please enter a track title."));
            return;
        }

        setUploading(true);
        setUploadError(null);
        setUploadProgressText(t("Uploading track to SoundCloud..."));

        try {
            const clientId = p.clientId || (await fetchClientId()) || "iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX";
            const res = await Native.uploadSoundCloudTrack({
                token: authToken,
                clientId,
                title: uploadTitle.trim(),
                genre: uploadGenre,
                sharing: uploadSharing,
                description: uploadDescription.trim(),
                tags: uploadTags.trim(),
                audioBase64,
                audioFileName: audioFile.name,
                audioMime: audioFile.type,
                artworkBase64: artworkBase64 || undefined,
                artworkFileName: artworkFile?.name,
                artworkMime: artworkFile?.type,
                browserCookies: browserCookies || undefined,
            } as any);

            let parsed: any = null;
            try { parsed = JSON.parse(res || "{}"); } catch { parsed = { title: uploadTitle, permalink_url: `https://soundcloud.com/${authUser?.permalink || "you"}` }; }
            setUploadedTrack(parsed);
            loadUserTracks();
        } catch (e: any) {
            setUploadError(`${t("Failed to upload track: ")}${e?.message || e}`);
        } finally {
            setUploading(false);
        }
    };

    const loadUserTracks = async () => {
        if (!authToken || !authUser?.id) return;
        setLoadingUserTracks(true);
        try {
            const clientId = p.clientId || (await fetchClientId()) || "iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX";
            const res = await (Native as any).fetchSoundCloudUserOwnTracks({
                token: authToken,
                clientId,
                userId: authUser.id,
                limit: 50,
            });
            if (res) {
                const data = JSON.parse(res);
                const collection = data.collection || data || [];
                if (artworkPreview) {
                    for (const t of collection) {
                        if ((t.title === uploadTitle || t.id === uploadedTrack?.id) && !t.artwork_url) {
                            t.artwork_url = artworkPreview;
                        }
                    }
                }
                setUserTracks(collection);
            }
        } catch (e: any) {
            console.error("[SoundCloudPlayer] loadUserTracks error:", e?.message);
        } finally {
            setLoadingUserTracks(false);
        }
    };

    const handleDeleteTrack = async (track: any) => {
        if (!authToken || !track?.id) return;
        setDeletingTrackId(track.id);
        try {
            const clientId = p.clientId || (await fetchClientId()) || "iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX";
            const ok = await (Native as any).deleteSoundCloudTrack({
                token: authToken,
                clientId,
                trackId: track.id,
            });
            if (ok) {
                setUserTracks(prev => prev.filter(t => t.id !== track.id));
                setAuthUser(prev => prev ? { ...prev, track_count: Math.max(0, (prev.track_count || 1) - 1) } : prev);
                setUserTrackNotice(t("Track deleted successfully."));
                setTimeout(() => setUserTrackNotice(null), 4000);
            } else {
                setUserTrackNotice(t("Failed to delete track. Please try again."));
                setTimeout(() => setUserTrackNotice(null), 4000);
            }
        } catch (err: any) {
            console.error("[SoundCloudPlayer] Delete error:", err?.message);
            setUserTrackNotice(`${t("Failed to delete track: ")}${err?.message || err}`);
            setTimeout(() => setUserTrackNotice(null), 4000);
        } finally {
            setDeletingTrackId(null);
            setTrackToDelete(null);
        }
    };

    useEffect(() => {
        if (authToken && authUser?.id && tab === "upload") {
            loadUserTracks();
        }
    }, [authToken, authUser?.id, tab]);

    const handleResetUpload = () => {
        setAudioFile(null);
        setAudioBase64(null);
        setAudioDuration(0);
        setArtworkFile(null);
        setArtworkPreview(null);
        setArtworkBase64(null);
        setUploadTitle("");
        setUploadDescription("");
        setUploadTags("");
        setUploadedTrack(null);
        setUploadError(null);
    };

    function toggleMute() {
        if (p.volume > 0) {
            setPrevVolume(p.volume);
            p.volume = 0;
            if (p.audio) p.audio.volume = 0;
        } else {
            p.volume = prevVolume || 35;
            if (p.audio) p.audio.volume = (prevVolume || 35) / 100;
        }
        p.notify();
    }

    const isFav = (t: ScTrack) => p.favorites.some(f => f.id === t.id);

    return (
        <div ref={modalRootRef} className={`sc-player-root ${isFullscreen ? "sc-player-root--fullscreen" : ""}`}>

            {/* Header */}
            <div className="sc-header">
                <div className="sc-header-left">
                    <div>
                        <div className="sc-header-title">SoundCord Player</div>
                        <div className="sc-header-sub">
                            {p.isPlaying && p.playing
                                ? `${t("Now playing:")} ${p.playing.title} · ${p.playing.artist}`
                                : tab === "search" && results.length > 0
                                    ? `${results.length} ${t("tracks")}`
                                    : tab === "favs"
                                        ? `${p.favorites.length} ${t("Favorites")}`
                                        : tab === "queue"
                                            ? `${p.queue.length} ${t("tracks")}`
                                            : p.status}
                        </div>
                    </div>
                </div>

                <div className="sc-header-actions">
                    {/* Display Activity Switch */}
                    <div className="sc-island-toggle">
                        <span>{t("Display activity")}</span>
                        <Switch
                            checked={displayActivity}
                            onChange={(val: boolean) => {
                                settings.store.richPresence = val;
                                if (!val) {
                                    clearRichPresence();
                                } else {
                                    updateRichPresence();
                                }
                            }}
                        />
                    </div>

                    {/* Dynamic Island Switch */}
                    <div className="sc-island-toggle">
                        <span>{t("Dynamic Island")}</span>
                        <Switch
                            checked={enableIsland}
                            onChange={(val: boolean) => settings.store.enableDynamicIsland = val}
                        />
                    </div>

                    {/* Audio Output device button */}
                    <TooltipContainer text={t("Audio output device")}>
                        <button
                            className={`sc-header-btn ${showSettings ? "sc-header-btn--active" : ""}`}
                            onClick={() => setShowSettings(v => !v)}
                        >
                            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 18v-6a9 9 0 0 1 18 0v6"></path>
                                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path>
                            </svg>
                        </button>
                    </TooltipContainer>
                </div>
            </div>

            {/* Output Settings Drawer */}
            {showSettings && (
                <div className="sc-settings-drawer">
                    <span className="sc-drawer-label">{t("Audio Output Device:")}</span>
                    <div style={{ flex: 1, maxWidth: 360 }}>
                        <SafeSearchableSelect
                            options={[
                                { value: "default", label: t("Default Discord Output") },
                                ...outputDevices.map(d => ({
                                    value: d.deviceId,
                                    label: d.label || `Device ${d.deviceId.slice(0, 16)}`
                                }))
                            ]}
                            value={selectedOutput}
                            onChange={(v: string) => applyOutputDevice(v)}
                            closeOnSelect={true}
                        />
                    </div>
                </div>
            )}

            {/* Search Bar with Autocomplete Suggestions */}
            <div className="sc-search-container">
                <div
                    className={`sc-search-bar ${showSuggestions && query.trim() ? "sc-search-bar--open" : ""}`}
                    ref={searchContainerRef}
                >
                    <IconSearch />
                    <input
                        className="sc-search-input"
                        value={query}
                        onChange={e => {
                            searchSubmittedRef.current = false;
                            setQuery(e.currentTarget.value);
                        }}
                        onFocus={() => {
                            if (!searchSubmittedRef.current && suggestions.length > 0 && query.trim()) {
                                setShowSuggestions(true);
                            }
                        }}
                        onKeyDown={e => {
                            if (e.key === "ArrowDown") {
                                e.preventDefault();
                                if (suggestions.length > 0) {
                                    setSuggestionIdx(prev => (prev < suggestions.length - 1 ? prev + 1 : -1));
                                }
                            } else if (e.key === "ArrowUp") {
                                e.preventDefault();
                                if (suggestions.length > 0) {
                                    setSuggestionIdx(prev => (prev > -1 ? prev - 1 : suggestions.length - 1));
                                }
                            } else if (e.key === "Enter") {
                                e.preventDefault();
                                e.stopPropagation();
                                searchSubmittedRef.current = true;
                                setShowSuggestions(false);
                                setSuggestions([]);
                                if (showSuggestions && suggestionIdx >= 0 && suggestions[suggestionIdx]) {
                                    const chosen = suggestions[suggestionIdx];
                                    setQuery(chosen);
                                    doSearch(false, chosen);
                                } else {
                                    doSearch(false);
                                }
                                (e.target as HTMLElement)?.blur();
                            } else if (e.key === "Escape") {
                                setShowSuggestions(false);
                            }
                        }}
                        placeholder={t("Search by track title, artist, playlist, or paste a link...")}
                        autoFocus
                    />
                    {query && (
                        <button className="sc-search-clear" onClick={() => { searchSubmittedRef.current = false; setQuery(""); setSuggestions([]); setShowSuggestions(false); }}><IconClose /></button>
                    )}

                    {/* SoundCloud Autocomplete Suggestions Dropdown attached to search bar */}
                    {showSuggestions && query.trim() && (
                        <div className="sc-suggestions-dropdown">
                            <div
                                className={`sc-suggestion-item sc-suggestion-item--header ${suggestionIdx === -1 ? "sc-suggestion-item--active" : ""}`}
                                onMouseDown={e => {
                                    e.preventDefault();
                                    searchSubmittedRef.current = true;
                                    setShowSuggestions(false);
                                    setSuggestions([]);
                                    doSearch(false, query);
                                }}
                            >
                                <IconSearch size={14} />
                                <span>{t("Search for")} "{query}"</span>
                            </div>

                            {suggestions.map((item, idx) => (
                                <div
                                    key={`${item}-${idx}`}
                                    className={`sc-suggestion-item ${suggestionIdx === idx ? "sc-suggestion-item--active" : ""}`}
                                    onMouseDown={e => {
                                        e.preventDefault();
                                        searchSubmittedRef.current = true;
                                        setShowSuggestions(false);
                                        setSuggestions([]);
                                        setQuery(item);
                                        doSearch(false, item);
                                    }}
                                >
                                    <span className="sc-suggestion-text">{item}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <Button
                    variant="primary"
                    size="medium"
                    className="sc-search-btn"
                    onClick={() => {
                        searchSubmittedRef.current = true;
                        setShowSuggestions(false);
                        setSuggestions([]);
                        doSearch(false);
                    }}
                    disabled={!p.clientId || !query.trim()}
                >
                    {t("Search")}
                </Button>
            </div>

            {/* Navigation Tabs */}
            <div className="sc-tabs-row">
                <div className="sc-tabs-list">
                    <button
                        className={`sc-tab-btn ${tab === "search" ? "sc-tab-btn--active" : ""}`}
                        onClick={() => setTab("search")}
                    >
                        <IconSearch />
                        <span>{t("Search Results")}</span>
                        {results.length > 0 && <Badge text={results.length} variant="default" className="sc-tab-badge" />}
                    </button>
                    <button
                        className={`sc-tab-btn ${tab === "favs" ? "sc-tab-btn--active" : ""}`}
                        onClick={() => setTab("favs")}
                    >
                        <IconHeart filled={false} />
                        <span>{t("Favorites")}</span>
                        {p.favorites.length > 0 && <Badge text={p.favorites.length} variant="default" className="sc-tab-badge" />}
                    </button>
                    <button
                        className={`sc-tab-btn ${tab === "queue" ? "sc-tab-btn--active" : ""}`}
                        onClick={() => setTab("queue")}
                    >
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                        <span>{t("Queue")}</span>
                        {p.queue.length > 0 && <Badge text={p.queue.length} variant="expressive" className="sc-tab-badge" />}
                    </button>
                    <button
                        className={`sc-tab-btn ${tab === "upload" ? "sc-tab-btn--active" : ""}`}
                        onClick={() => setTab("upload")}
                    >
                        <IconUpload size={14} />
                        <span>{t("Upload Track")}</span>
                    </button>
                </div>

                {tab === "queue" && p.queue.length > 0 && (
                    <Button
                        variant="dangerPrimary"
                        size="small"
                        className="sc-clear-queue-btn"
                        onClick={clearQueue}
                    >
                        <IconTrash />
                        <span>{t("Clear Queue")}</span>
                    </Button>
                )}
            </div>

            {/* Main Content Body */}
            <div className="sc-main-body" onScroll={e => {
                const el = e.currentTarget;
                if (tab === "search" && hasMore && !loadingMore) {
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
                        loadMore();
                    }
                } else if (tab === "artist" && artistHasMore && !artistLoadingMore) {
                    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
                        loadMoreArtistTracks();
                    }
                }
            }}>

                {/* ARTIST PROFILE TAB */}
                {tab === "artist" && (
                    <div className="sc-artist-view">
                        {/* Artist Hero Header Card */}
                        <div className="sc-artist-hero-card">
                            <div className="sc-artist-hero-top">
                                <button className="sc-artist-back-btn" onClick={() => setTab(previousTab || "search")}>
                                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                                    <span>{t("Back")}</span>
                                </button>
                            </div>

                            <div className="sc-artist-profile-row">
                                <div className="sc-artist-avatar-wrap">
                                    {selectedArtist?.avatarUrl ? (
                                        <img
                                            className="sc-artist-avatar-img"
                                            src={selectedArtist.avatarUrl}
                                            alt=""
                                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                        />
                                    ) : (
                                        <div className="sc-artist-avatar-placeholder">
                                            {(selectedArtist?.username || "A")[0].toUpperCase()}
                                        </div>
                                    )}
                                </div>

                                <div className="sc-artist-main-info">
                                    <div className="sc-artist-title-row">
                                        <h2 className="sc-artist-heading">
                                            <span>{selectedArtist?.username || t("Artist")}</span>
                                            {selectedArtist?.verified && (
                                                <TooltipContainer text={t("Verified artist")}>
                                                    <span className="sc-artist-verified-badge">
                                                        <IconVerified size={20} />
                                                    </span>
                                                </TooltipContainer>
                                            )}
                                        </h2>
                                    </div>

                                    <div className="sc-artist-meta-stats">
                                        <span className="sc-artist-meta-stat">
                                            <IconMusicNote size={14} />
                                            <span>{selectedArtist?.trackCount ? `${selectedArtist.trackCount} ${t("tracks")}` : `${artistTracks.length} ${t("tracks")}`}</span>
                                        </span>
                                        {selectedArtist?.followersCount !== undefined && selectedArtist.followersCount > 0 && (
                                            <>
                                                <span>·</span>
                                                <span className="sc-artist-meta-stat">
                                                    <IconUsers size={14} />
                                                    <span>{selectedArtist.followersCount.toLocaleString()} {t("followers")}</span>
                                                </span>
                                            </>
                                        )}
                                    </div>

                                    {selectedArtist?.description && (
                                        <div className="sc-artist-description" title={selectedArtist.description}>
                                            {selectedArtist.description}
                                        </div>
                                    )}

                                    <div className="sc-artist-actions-row">
                                        <Button
                                            variant="primary"
                                            size="small"
                                            onClick={playAllArtistTracks}
                                            disabled={artistTracks.length === 0}
                                        >
                                            <IconPlay size={16} />
                                            <span>{t("Play all")}</span>
                                        </Button>

                                        <Button
                                            variant="secondary"
                                            size="small"
                                            onClick={addAllArtistToQueue}
                                            disabled={artistTracks.length === 0}
                                        >
                                            <IconPlus />
                                            <span>{t("Add to queue")}</span>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Artist Tracks List */}
                        <div className="sc-artist-section-heading">
                            <span>{t("Artist tracks")}</span>
                            {artistTracks.length > 0 && <span style={{ fontSize: 12, opacity: 0.7 }}>{artistTracks.length}</span>}
                        </div>

                        {artistLoading ? (
                            <div className="sc-empty-state">
                                <div className="sc-empty-title">{t("Loading artist tracks...")}</div>
                            </div>
                        ) : artistTracks.length === 0 ? (
                            <div className="sc-empty-state">
                                <div className="sc-empty-title">{t("No tracks found")}</div>
                                <div className="sc-empty-desc">{t("This artist has no public tracks currently available.")}</div>
                            </div>
                        ) : (
                            <div className="sc-tracklist">
                                {artistTracks.map((track, idx) => {
                                    const isCurrentPlaying = p.playing?.id === track.id;
                                    return (
                                        <div
                                            key={`${track.id}-${idx}`}
                                            className={`sc-track-card ${isCurrentPlaying ? "sc-track-card--playing" : ""} ${track.snipped ? "sc-track-card--snipped" : ""}`}
                                            onClick={() => {
                                                if (!track.snipped) {
                                                    playerPlayTrack(track, -1, 0, idx);
                                                }
                                            }}
                                        >
                                            <div className="sc-art-wrap">
                                                <img
                                                    className="sc-track-art"
                                                    src={track.artworkUrl || ""}
                                                    alt=""
                                                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                                />
                                                <div className="sc-art-overlay">
                                                    {isCurrentPlaying && p.isPlaying ? (
                                                        <IconPause size={18} />
                                                    ) : (
                                                        <IconPlay size={18} />
                                                    )}
                                                </div>
                                            </div>

                                            <div className="sc-track-details">
                                                <div className="sc-track-main-title">
                                                    {track.title}
                                                    {track.snipped && <span className="sc-restricted-badge">{t("30s Preview")}</span>}
                                                </div>
                                                <div className="sc-track-meta">
                                                    <span>{track.artist}</span>
                                                    <span>·</span>
                                                    <span>{fmtDuration(track.durationMs)}</span>
                                                </div>
                                            </div>

                                            <div className="sc-track-actions">
                                                <TooltipContainer text={t("Add to queue")}>
                                                    <Button
                                                        variant="secondary"
                                                        size="small"
                                                        className="sc-row-btn"
                                                        onClick={e => addToQueue(track, e)}
                                                    >
                                                        <IconPlus />
                                                        <span>Queue</span>
                                                    </Button>
                                                </TooltipContainer>
                                                <TooltipContainer text={isFav(track) ? t("Remove from favorites") : t("Add to favorites")}>
                                                    <button
                                                        className={`sc-row-btn sc-row-btn--heart ${isFav(track) ? "sc-row-btn--fav" : ""}`}
                                                        onClick={e => toggleFavorite(track, e)}
                                                    >
                                                        <IconHeart filled={isFav(track)} />
                                                    </button>
                                                </TooltipContainer>
                                                <TooltipContainer text={track.snipped ? t("30s Preview") : t("Play track")}>
                                                    <button
                                                        className="sc-row-btn sc-row-btn--play"
                                                        disabled={!!track.snipped}
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            if (!track.snipped) {
                                                                playerPlayTrack(track, -1, 0, idx);
                                                            }
                                                        }}
                                                    >
                                                        {isCurrentPlaying && p.isPlaying ? <IconPause size={14} /> : <IconPlay size={14} />}
                                                    </button>
                                                </TooltipContainer>
                                            </div>
                                        </div>
                                    );
                                })}

                                {artistHasMore && (
                                    <div className="sc-load-more-row">
                                        <Button
                                            variant="secondary"
                                            size="medium"
                                            className="sc-load-more-btn"
                                            onClick={loadMoreArtistTracks}
                                            disabled={artistLoadingMore}
                                        >
                                            {artistLoadingMore ? t("Loading more tracks...") : t("Load More Tracks ▾")}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* LYRICS TAB — Apple Music / Spotify 2-Column Split View */}
                {tab === "lyrics" && (
                    <div className="sc-lyrics-split-layout">
                        {p.playing ? (
                            <>
                                {/* Left: HD Banner / Artwork & Metadata */}
                                <div className="sc-lyrics-left-pane">
                                    <div className="sc-lyrics-art-frame">
                                        <img
                                            className="sc-lyrics-big-art"
                                            src={(p.playing.artworkUrl || "").replace("-large.", "-t500x500.")}
                                            alt=""
                                            onError={e => {
                                                if (p.playing?.artworkUrl && (e.target as HTMLImageElement).src !== p.playing.artworkUrl) {
                                                    (e.target as HTMLImageElement).src = p.playing.artworkUrl;
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="sc-lyrics-meta-block">
                                        <div className="sc-lyrics-track-title-large" title={p.playing.title}>
                                            {p.playing.title}
                                        </div>
                                        <div
                                            className="sc-lyrics-track-artist-large sc-artist-name--clickable"
                                            onClick={e => openArtistProfile(p.playing!.artist, p.playing!, e)}
                                            title={t("View artist profile")}
                                        >
                                            {p.playing.artist}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Lyrics Scrollable Stream */}
                                <div className="sc-lyrics-right-pane">
                                    {p.hasLyrics && p.currentLyrics ? (
                                        <ScrollerThin className="sc-lyrics-lines-scroller" ref={lyricsContainerRef}>
                                            {p.currentLyrics.isSynced && p.currentLyrics.syncedLyrics ? (
                                                <div className="sc-synced-lyrics-list">
                                                    {p.currentLyrics.syncedLyrics.map((line, idx) => {
                                                        const currentL = p.currentLyrics!.syncedLyrics!;
                                                        const nextLine = currentL[idx + 1];
                                                        const isActive = line.time <= p.position && (!nextLine || nextLine.time > p.position);
                                                        return (
                                                            <div
                                                                key={`${line.time}-${idx}`}
                                                                ref={isActive ? activeLyricRef : null}
                                                                className={`sc-lyric-line ${isActive ? "sc-lyric-line--active" : ""}`}
                                                                onClick={() => {
                                                                    if (p.audio) {
                                                                        p.audio.currentTime = line.time;
                                                                        p.position = line.time;
                                                                        p.notify();
                                                                    }
                                                                }}
                                                            >
                                                                {line.text}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="sc-plain-lyrics-text">
                                                    {p.currentLyrics.plainLyrics}
                                                </div>
                                            )}
                                        </ScrollerThin>
                                    ) : (
                                        <div className="sc-empty-state">
                                            <IconMic size={48} />
                                            <div className="sc-empty-title">{t("Lyrics not available")}</div>
                                            <div className="sc-empty-desc">{t("No lyrics found for this track.")}</div>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="sc-empty-state" style={{ width: "100%" }}>
                                <IconMic size={48} />
                                <div className="sc-empty-title">{t("No track currently playing")}</div>
                                <div className="sc-empty-desc">{t("Play a track to view its HD artwork and live lyrics.")}</div>
                            </div>
                        )}
                    </div>
                )}

                {/* UPLOAD TAB */}
                {tab === "upload" && (
                    <div className="sc-upload-view">
                        {/* 1. Account Header Banner */}
                        {authToken && authUser ? (
                            <div className="sc-upload-user-banner">
                                <div className="sc-upload-user-left">
                                    <img
                                        className="sc-upload-user-avatar"
                                        src={authUser.avatar_url || "https://a-v2.sndcdn.com/assets/images/default/avatar-large.png"}
                                        alt=""
                                    />
                                    <div className="sc-upload-user-info">
                                        <div className="sc-upload-user-name-row">
                                            <span className="sc-upload-user-name">{authUser.username || authUser.full_name || "SoundCloud User"}</span>
                                            <span className="sc-upload-status-badge">
                                                <span className="sc-upload-status-dot" />
                                                <span>{t("Connected")}</span>
                                            </span>
                                        </div>
                                        <div className="sc-upload-user-stats">
                                            {authUser.track_count !== undefined && (
                                                <span>{authUser.track_count} {t("tracks")}</span>
                                            )}
                                            {authUser.followers_count !== undefined && (
                                                <>
                                                    <span>·</span>
                                                    <span>{authUser.followers_count.toLocaleString()} {t("followers")}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    variant="secondary"
                                    size="small"
                                    onClick={handleDisconnect}
                                >
                                    {t("Disconnect")}
                                </Button>
                            </div>
                        ) : (
                            <div className="sc-auth-hero-card">
                                <div className="sc-auth-hero-icon">
                                    <img src={SOUNDCLOUD_LOGO_SRC} alt="SoundCloud" className="sc-auth-hero-img" />
                                </div>
                                <div className="sc-auth-hero-title">{t("Connect your SoundCloud account")}</div>
                                <div className="sc-auth-hero-desc">
                                    {t("Log in with your SoundCloud account to upload tracks directly, manage your music, and sync with your profile.")}
                                </div>

                                {authError && (
                                    <div className="sc-auth-error-box">{authError}</div>
                                )}

                                <div className="sc-auth-actions-row">
                                    <Button
                                        variant="primary"
                                        size="medium"
                                        className="sc-auth-btn"
                                        onClick={() => handleConnectSoundCloud(false)}
                                        disabled={authLoading}
                                    >
                                        <span>{authLoading ? t("Connecting to SoundCloud...") : t("Log in with SoundCloud")}</span>
                                    </Button>

                                    <Button
                                        variant="secondary"
                                        size="medium"
                                        className="sc-auth-btn"
                                        onClick={() => setShowManualInput(v => !v)}
                                    >
                                        <span>{t("Or enter an OAuth session token manually")}</span>
                                    </Button>
                                </div>

                                {showManualInput && (
                                    <div className="sc-manual-token-box">
                                        <div className="sc-manual-token-label">{t("SoundCloud OAuth Token (oauth_token)")}</div>
                                        <div className="sc-manual-token-row">
                                            <input
                                                className="sc-manual-token-input"
                                                type="password"
                                                value={manualToken}
                                                onChange={e => setManualToken(e.currentTarget.value)}
                                                placeholder={t("Paste your SoundCloud OAuth token...")}
                                            />
                                            <Button
                                                variant="primary"
                                                size="small"
                                                onClick={handleManualTokenSave}
                                                disabled={!manualToken.trim() || authLoading}
                                            >
                                                {t("Save & Connect")}
                                            </Button>
                                        </div>
                                        <div className="sc-manual-token-help">
                                            {t("Tip: If already logged in on soundcloud.com in your browser, press F12 -> Application -> Cookies -> copy 'oauth_token'.")}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 2. Success Screen */}
                        {uploadedTrack ? (
                            <div className="sc-upload-success-card">
                                <IconCheckCircle size={44} />
                                <div className="sc-upload-success-title">{t("Track uploaded successfully!")}</div>
                                <div className="sc-upload-success-desc">{t("Your track is now live on your SoundCloud profile.")}</div>

                                <div className="sc-upload-success-preview">
                                    {artworkPreview ? (
                                        <img className="sc-upload-success-art" src={artworkPreview} alt="" />
                                    ) : (
                                        <div className="sc-upload-success-art sc-upload-success-art--placeholder">
                                            <IconFileAudio size={28} />
                                        </div>
                                    )}
                                    <div className="sc-upload-success-meta">
                                        <div className="sc-upload-success-name">{uploadTitle}</div>
                                        <div className="sc-upload-success-sub">
                                            <span>{uploadGenre}</span>
                                            <span>·</span>
                                            <span>{uploadSharing === "public" ? t("Public") : t("Private")}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="sc-upload-success-actions">
                                    {uploadedTrack.id && (
                                        <Button
                                            variant="primary"
                                            size="medium"
                                            onClick={() => {
                                                const newScTrack: ScTrack = {
                                                    id: String(uploadedTrack.id),
                                                    title: uploadTitle,
                                                    artist: authUser?.username || "You",
                                                    artworkUrl: artworkPreview || "",
                                                    streamUrl: uploadedTrack.stream_url || "",
                                                    durationMs: audioDuration || 0,
                                                    source: "soundcloud"
                                                };
                                                playerPlayTrack(newScTrack);
                                            }}
                                        >
                                            <IconPlay size={16} />
                                            <span>{t("Play in SoundCord")}</span>
                                        </Button>
                                    )}

                                    {uploadedTrack.permalink_url && (
                                        <Button
                                            variant="secondary"
                                            size="medium"
                                            onClick={() => window.open(uploadedTrack.permalink_url, "_blank")}
                                        >
                                            <IconExternalLink size={15} />
                                            <span>{t("View on SoundCloud")}</span>
                                        </Button>
                                    )}

                                    <Button
                                        variant="secondary"
                                        size="medium"
                                        onClick={handleResetUpload}
                                    >
                                        <IconPlus />
                                        <span>{t("Upload another track")}</span>
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            /* 3. Upload Form (when authenticated) */
                            authToken && (
                                <div className="sc-upload-form">
                                    {/* Audio File Selection Card */}
                                    <input
                                        ref={audioInputRef}
                                        type="file"
                                        accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac"
                                        style={{ display: "none" }}
                                        onChange={e => {
                                            const file = e.currentTarget.files?.[0];
                                            if (file) handleAudioSelect(file);
                                        }}
                                    />

                                    <input
                                        ref={artworkInputRef}
                                        type="file"
                                        accept="image/*,.jpg,.jpeg,.png,.webp"
                                        style={{ display: "none" }}
                                        onChange={e => {
                                            const file = e.currentTarget.files?.[0];
                                            if (file) handleArtworkSelect(file);
                                        }}
                                    />

                                    {!audioFile ? (
                                        <div
                                            className="sc-dropzone-box"
                                            onClick={() => audioInputRef.current?.click()}
                                            onDragOver={e => e.preventDefault()}
                                            onDrop={e => {
                                                e.preventDefault();
                                                const file = e.dataTransfer.files?.[0];
                                                if (file) handleAudioSelect(file);
                                            }}
                                        >
                                            <div className="sc-dropzone-icon">
                                                <IconCloudUpload size={36} />
                                            </div>
                                            <div className="sc-dropzone-title">{t("Drag & drop an audio file here, or click to browse")}</div>
                                            <div className="sc-dropzone-sub">{t("Supported formats: MP3, WAV, FLAC, OGG, M4A")}</div>
                                            <Button variant="primary" size="small" className="sc-dropzone-btn">
                                                <span>{t("Choose Audio File")}</span>
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="sc-audio-selected-card">
                                            <div className="sc-audio-selected-icon">
                                                <IconFileAudio size={24} />
                                            </div>
                                            <div className="sc-audio-selected-details">
                                                <div className="sc-audio-selected-name">{audioFile.name}</div>
                                                <div className="sc-audio-selected-meta">
                                                    <span>{(audioFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                                                    {audioDuration > 0 && (
                                                        <>
                                                            <span>·</span>
                                                            <span>{fmtDuration(audioDuration)}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <Button
                                                variant="secondary"
                                                size="small"
                                                onClick={() => audioInputRef.current?.click()}
                                            >
                                                {t("Change file")}
                                            </Button>
                                        </div>
                                    )}

                                    {/* Metadata & Details Row */}
                                    <div className="sc-upload-grid">
                                        {/* Artwork Box */}
                                        <div className="sc-upload-art-column">
                                            <div className="sc-field-label">{t("Track Artwork")}</div>
                                            <div
                                                className={`sc-artwork-dropzone ${artworkPreview ? "sc-artwork-dropzone--has-art" : ""}`}
                                                onClick={() => artworkInputRef.current?.click()}
                                            >
                                                {artworkPreview ? (
                                                    <>
                                                        <img className="sc-artwork-preview-img" src={artworkPreview} alt="" />
                                                        <div className="sc-artwork-overlay">
                                                            <IconImage size={18} />
                                                            <span>{t("Change Cover")}</span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="sc-artwork-placeholder">
                                                        <IconImage size={32} />
                                                        <span>{t("Upload Cover")}</span>
                                                    </div>
                                                )}
                                            </div>
                                            {artworkPreview && (
                                                <button
                                                    className="sc-remove-cover-btn"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        setArtworkFile(null);
                                                        setArtworkPreview(null);
                                                        setArtworkBase64(null);
                                                    }}
                                                >
                                                    {t("Remove Cover")}
                                                </button>
                                            )}
                                        </div>

                                        {/* Inputs Column */}
                                        <div className="sc-upload-fields-column">
                                            {/* Track Title */}
                                            <div className="sc-field-group">
                                                <label className="sc-field-label">{t("Track Title")} <span className="sc-req-star">*</span></label>
                                                <input
                                                    className="sc-field-input"
                                                    value={uploadTitle}
                                                    onChange={e => setUploadTitle(e.currentTarget.value)}
                                                    placeholder={t("Enter track title...")}
                                                />
                                            </div>

                                            {/* Genre & Visibility Row */}
                                            <div className="sc-field-row">
                                                <div className="sc-field-group" style={{ flex: 1 }}>
                                                    <label className="sc-field-label">{t("Genre")}</label>
                                                    <SafeSearchableSelect
                                                        options={UPLOAD_GENRES.map(g => ({ value: g, label: g }))}
                                                        value={uploadGenre}
                                                        onChange={(v: string) => setUploadGenre(v)}
                                                        closeOnSelect={true}
                                                    />
                                                </div>

                                                <div className="sc-field-group" style={{ flex: 1 }}>
                                                    <label className="sc-field-label">{t("Visibility")}</label>
                                                    <div className="sc-visibility-pills">
                                                        <button
                                                            className={`sc-visibility-pill ${uploadSharing === "public" ? "sc-visibility-pill--active" : ""}`}
                                                            onClick={() => setUploadSharing("public")}
                                                            title={t("Public (Everyone can listen)")}
                                                        >
                                                            <IconGlobe size={14} />
                                                            <span>{t("Public")}</span>
                                                        </button>
                                                        <button
                                                            className={`sc-visibility-pill ${uploadSharing === "private" ? "sc-visibility-pill--active" : ""}`}
                                                            onClick={() => setUploadSharing("private")}
                                                            title={t("Private (Only you can listen)")}
                                                        >
                                                            <IconLock size={14} />
                                                            <span>{t("Private")}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Description */}
                                            <div className="sc-field-group">
                                                <label className="sc-field-label">{t("Description")}</label>
                                                <textarea
                                                    className="sc-field-textarea"
                                                    value={uploadDescription}
                                                    onChange={e => setUploadDescription(e.currentTarget.value)}
                                                    placeholder={t("Add a description, credits, or links...")}
                                                    rows={3}
                                                />
                                            </div>

                                            {/* Tags */}
                                            <div className="sc-field-group">
                                                <label className="sc-field-label">{t("Tags")}</label>
                                                <input
                                                    className="sc-field-input"
                                                    value={uploadTags}
                                                    onChange={e => setUploadTags(e.currentTarget.value)}
                                                    placeholder={t("e.g. lofi, chill, ambient")}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Error Banner */}
                                    {uploadError && (
                                        <div className="sc-upload-error-box">{uploadError}</div>
                                    )}

                                    {/* Submit Action */}
                                    <div className="sc-upload-submit-row">
                                        <Button
                                            variant="primary"
                                            size="large"
                                            className="sc-upload-submit-btn"
                                            onClick={handleUploadSubmit}
                                            disabled={uploading || !audioFile || !uploadTitle.trim()}
                                        >
                                            <IconCloudUpload size={20} />
                                            <span>{uploading ? (uploadProgressText || t("Uploading track to SoundCloud...")) : t("Upload to SoundCloud")}</span>
                                        </Button>
                                    </div>
                                </div>
                            )
                        )}

                        {/* 4. Your Uploaded Tracks Management Section */}
                        {authToken && authUser && (
                            <div className="sc-user-tracks-section">
                                <div className="sc-user-tracks-header">
                                    <div className="sc-user-tracks-title-group">
                                        <div className="sc-user-tracks-title">{t("Your Uploaded Tracks")}</div>
                                        <span className="sc-user-tracks-count-badge">
                                            {userTracks.length}
                                        </span>
                                    </div>

                                    <button
                                        className="sc-user-tracks-refresh-btn"
                                        onClick={loadUserTracks}
                                        disabled={loadingUserTracks}
                                        title={t("Refresh tracks")}
                                    >
                                        <IconRefresh size={16} className={loadingUserTracks ? "sc-spin-anim" : ""} />
                                        <span>{t("Refresh")}</span>
                                    </button>
                                </div>

                                {userTrackNotice && (
                                    <div className="sc-user-tracks-notice">
                                        {userTrackNotice}
                                    </div>
                                )}

                                {loadingUserTracks && userTracks.length === 0 ? (
                                    <div className="sc-user-tracks-loading">
                                        <div className="sc-loading-spinner" />
                                        <span>{t("Loading your tracks...")}</span>
                                    </div>
                                ) : userTracks.length === 0 ? (
                                    <div className="sc-user-tracks-empty">
                                        <IconFileAudio size={36} />
                                        <div className="sc-user-tracks-empty-title">{t("No tracks uploaded yet")}</div>
                                        <div className="sc-user-tracks-empty-desc">{t("Upload your first audio track using the form above!")}</div>
                                    </div>
                                ) : (
                                    <div className="sc-user-tracks-list">
                                        {userTracks.map(track => {
                                            const isPlayingThis = p.currentTrack?.id === String(track.id);
                                            const art = track.artwork_url ? track.artwork_url.replace("-large", "-t500x500") : (authUser?.avatar_url || "");
                                            const isDeleting = deletingTrackId === track.id;

                                            return (
                                                <div key={track.id} className={`sc-user-track-card ${isPlayingThis ? "sc-user-track-card--playing" : ""}`}>
                                                    <div
                                                        className="sc-user-track-art-wrapper"
                                                        onClick={() => {
                                                            const scTrack: ScTrack = {
                                                                id: String(track.id),
                                                                title: track.title,
                                                                artist: authUser?.username || "You",
                                                                artworkUrl: art,
                                                                streamUrl: track.media?.transcodings?.[0]?.url || "",
                                                                durationMs: track.duration || 0,
                                                                source: "soundcloud"
                                                            };
                                                            playerPlayTrack(scTrack);
                                                        }}
                                                    >
                                                        {art ? (
                                                            <img src={art} alt="" className="sc-user-track-art" />
                                                        ) : (
                                                            <div className="sc-user-track-art sc-user-track-art--placeholder">
                                                                <IconFileAudio size={20} />
                                                            </div>
                                                        )}
                                                        <div className="sc-user-track-art-overlay">
                                                            {isPlayingThis && p.isPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}
                                                        </div>
                                                    </div>

                                                    <div className="sc-user-track-info">
                                                        <div className="sc-user-track-title-row">
                                                            <span
                                                                className="sc-user-track-title"
                                                                onClick={() => {
                                                                    const scTrack: ScTrack = {
                                                                        id: String(track.id),
                                                                        title: track.title,
                                                                        artist: authUser?.username || "You",
                                                                        artworkUrl: art,
                                                                        streamUrl: track.media?.transcodings?.[0]?.url || "",
                                                                        durationMs: track.duration || 0,
                                                                        source: "soundcloud"
                                                                    };
                                                                    playerPlayTrack(scTrack);
                                                                }}
                                                            >
                                                                {track.title}
                                                            </span>
                                                            <span className={`sc-user-track-badge ${track.sharing === "private" ? "sc-user-track-badge--private" : "sc-user-track-badge--public"}`}>
                                                                {track.sharing === "private" ? t("Private") : t("Public")}
                                                            </span>
                                                        </div>

                                                        <div className="sc-user-track-meta">
                                                            {track.genre && (
                                                                <>
                                                                    <span className="sc-user-track-genre">{track.genre}</span>
                                                                    <span>·</span>
                                                                </>
                                                            )}
                                                            {track.duration && (
                                                                <>
                                                                    <span>{fmtDuration(Math.floor(track.duration / 1000))}</span>
                                                                    <span>·</span>
                                                                </>
                                                            )}
                                                            {track.playback_count !== undefined && (
                                                                <>
                                                                    <span>{track.playback_count.toLocaleString()} {t("plays")}</span>
                                                                    <span>·</span>
                                                                </>
                                                            )}
                                                            {track.likes_count !== undefined && (
                                                                <span>{track.likes_count.toLocaleString()} {t("likes")}</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="sc-user-track-actions">
                                                        <Button
                                                            variant="secondary"
                                                            size="small"
                                                            className="sc-user-track-play-btn"
                                                            onClick={() => {
                                                                const scTrack: ScTrack = {
                                                                    id: String(track.id),
                                                                    title: track.title,
                                                                    artist: authUser?.username || "You",
                                                                    artworkUrl: art,
                                                                    streamUrl: track.media?.transcodings?.[0]?.url || "",
                                                                    durationMs: track.duration || 0,
                                                                    source: "soundcloud"
                                                                };
                                                                playerPlayTrack(scTrack);
                                                            }}
                                                        >
                                                            <IconPlay size={14} />
                                                            <span>{t("Play")}</span>
                                                        </Button>

                                                        {track.permalink_url && (
                                                            <button
                                                                className="sc-user-track-icon-btn"
                                                                onClick={() => window.open(track.permalink_url, "_blank")}
                                                                title={t("View on SoundCloud")}
                                                            >
                                                                <IconExternalLink size={15} />
                                                            </button>
                                                        )}

                                                        <button
                                                            className="sc-user-track-delete-btn"
                                                            onClick={() => setTrackToDelete(track)}
                                                            disabled={isDeleting}
                                                            title={t("Delete track")}
                                                        >
                                                            <IconTrash size={15} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Delete Confirmation Modal */}
                        {trackToDelete && (
                            <div className="sc-confirm-modal-backdrop" onClick={() => setTrackToDelete(null)}>
                                <div className="sc-confirm-modal-card" onClick={e => e.stopPropagation()}>
                                    <div className="sc-confirm-modal-icon">
                                        <IconTrash size={28} />
                                    </div>
                                    <div className="sc-confirm-modal-title">{t("Delete Track")}</div>
                                    <div className="sc-confirm-modal-desc">
                                        {t("Are you sure you want to permanently delete")} <strong>"{trackToDelete.title}"</strong> {t("from your SoundCloud account? This action cannot be undone.")}
                                    </div>
                                    <div className="sc-confirm-modal-actions">
                                        <Button
                                            variant="secondary"
                                            size="medium"
                                            onClick={() => setTrackToDelete(null)}
                                            disabled={deletingTrackId === trackToDelete.id}
                                        >
                                            {t("Cancel")}
                                        </Button>
                                        <Button
                                            variant="primary"
                                            size="medium"
                                            className="sc-btn-danger"
                                            onClick={() => handleDeleteTrack(trackToDelete)}
                                            disabled={deletingTrackId === trackToDelete.id}
                                        >
                                            <span>{deletingTrackId === trackToDelete.id ? t("Deleting...") : t("Delete Track")}</span>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* QUEUE TAB */}
                {tab === "queue" && (
                    <div className="sc-tracklist">
                        {p.queue.length === 0 ? (
                            <div className="sc-empty-state">
                                <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line></svg>
                                <div className="sc-empty-title">{t("Queue is empty")}</div>
                                <div className="sc-empty-desc">{t("Click \"+ Queue\" on any track in search results or favorites to queue it up.")}</div>
                            </div>
                        ) : p.queue.map((track, idx) => (
                            <div
                                key={`${track.id}-${idx}`}
                                className="sc-track-card"
                                onClick={() => playerPlayTrack(track, -1, 0, -1)}
                            >
                                <div className="sc-track-index">{idx + 1}</div>
                                <div className="sc-art-wrap">
                                    <img
                                        className="sc-track-art"
                                        src={track.artworkUrl || ""}
                                        alt=""
                                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                    />
                                    <div className="sc-art-overlay">
                                        <IconPlay size={18} />
                                    </div>
                                </div>
                                <div className="sc-track-details">
                                    <div className="sc-track-main-title">{track.title}</div>
                                    <div className="sc-track-meta">
                                        <span
                                            className="sc-artist-name sc-artist-name--clickable"
                                            onClick={e => openArtistProfile(track.artist, track, e)}
                                            title={t("View artist profile")}
                                        >
                                            {track.artist}
                                        </span>
                                        <span>·</span>
                                        <span>{fmtDuration(track.durationMs)}</span>
                                        {track.source && (
                                            <span className={`sc-source-tag sc-source-tag--${track.source}`}>
                                                {track.source}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="sc-track-actions">
                                    <TooltipContainer text={t("Remove from queue")}>
                                        <button
                                            className="sc-row-btn sc-row-btn--remove"
                                            onClick={e => removeFromQueue(idx, e)}
                                        >
                                            <IconClose />
                                        </button>
                                    </TooltipContainer>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* SEARCH RESULTS & FAVORITES TABS */}
                {(tab === "search" || tab === "favs") && (
                    <div className="sc-tracklist">
                        {(tab === "search" ? results : p.favorites).length === 0 ? (
                            tab === "favs" ? (
                                <div className="sc-empty-state">
                                    <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                                    <div className="sc-empty-title">{t("No favorites saved yet")}</div>
                                    <div className="sc-empty-desc">{t("Click the heart icon on any track to add it to your personal favorites library.")}</div>
                                </div>
                            ) : (
                                // ─── Home Screen (empty search) ──────────────────────────────
                                <div className="sc-home-screen">
                                    {/* Genre Quick Filters */}
                                    <div className="sc-home-section">
                                        <div className="sc-home-section-label">{t("Browse by Genre")}</div>
                                        <div className="sc-home-genres">
                                            {GENRE_PILLS.map(g => (
                                                <button
                                                    key={g.query}
                                                    className="sc-home-genre-pill"
                                                    onClick={() => doSearch(false, g.query, true, g.label)}
                                                >
                                                    {g.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Discover Cards */}
                                    <div className="sc-home-section">
                                        <div className="sc-home-section-label">{t("Discover")}</div>
                                        <div className="sc-home-cards">
                                            {DISCOVER_CARDS.map(card => (
                                                <button
                                                    key={card.query}
                                                    className="sc-home-card"
                                                    style={{ background: card.bg }}
                                                    onClick={() => doSearch(false, card.query, true, card.title)}
                                                >
                                                    <div className="sc-home-card-title">{card.title}</div>
                                                    <div className="sc-home-card-desc">{card.desc}</div>
                                                    <div className="sc-home-card-icon">
                                                        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Recent / Quick mood row */}
                                    <div className="sc-home-section">
                                        <div className="sc-home-section-label">{t("Quick Moods")}</div>
                                        <div className="sc-home-moods">
                                            {[
                                                { label: t("Focus"), query: "Deep Focus Study", icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
                                                { label: t("Workout"), query: "Workout Motivation Gym", icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
                                                { label: t("Night Drive"), query: "Night Drive Synthwave", icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
                                                { label: t("Chill"), query: "Chill Lofi Relax", icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> },
                                                { label: t("Party"), query: "Party Electro Rave", icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
                                                { label: t("Sleep"), query: "Sleep Ambient White Noise", icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> },
                                            ].map(m => (
                                                <button
                                                    key={m.query}
                                                    className="sc-home-mood-btn"
                                                    onClick={() => doSearch(false, m.query, true, m.label)}
                                                >
                                                    {m.icon}
                                                    <span>{m.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )
                        ) : (
                            <>
                                {tab === "search" && activeCategoryName && (
                                    <div className="sc-category-header">
                                        <div className="sc-category-badge">
                                            <span>{t("Browsing:")}</span>
                                            <span className="sc-category-name">{activeCategoryName}</span>
                                        </div>
                                        <button
                                            className="sc-category-clear-btn"
                                            onClick={() => {
                                                setActiveCategoryName(null);
                                                setActiveSearchQuery("");
                                                setResults([]);
                                                p.currentResults = [];
                                            }}
                                        >
                                            <IconClose />
                                            <span>{t("Back to browse")}</span>
                                        </button>
                                    </div>
                                )}
                                {(tab === "search" ? results : p.favorites).map((track, idx) => {
                                    const isCurrentPlaying = p.playing?.id === track.id;
                                    return (
                                        <div
                                            key={`${track.id}-${idx}`}
                                            className={`sc-track-card ${isCurrentPlaying ? "sc-track-card--playing" : ""} ${track.snipped ? "sc-track-card--snipped" : ""}`}
                                            onClick={() => {
                                                if (!track.snipped) {
                                                    if (tab === "favs") playerPlayFavAt(idx);
                                                    else playerPlayTrack(track, -1, 0, idx);
                                                }
                                            }}
                                        >
                                            <div className="sc-art-wrap">
                                                <img
                                                    className="sc-track-art"
                                                    src={track.artworkUrl || ""}
                                                    alt=""
                                                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                                />
                                                <div className="sc-art-overlay">
                                                    {isCurrentPlaying && p.isPlaying ? (
                                                        <IconPause size={18} />
                                                    ) : (
                                                        <IconPlay size={18} />
                                                    )}
                                                </div>
                                            </div>

                                            <div className="sc-track-details">
                                                <div className="sc-track-main-title">
                                                    {track.title}
                                                    {track.snipped && <span className="sc-restricted-badge">{t("30s Preview")}</span>}
                                                </div>
                                                <div className="sc-track-meta">
                                                    <span
                                                        className="sc-artist-name sc-artist-name--clickable"
                                                        onClick={e => openArtistProfile(track.artist, track, e)}
                                                        title={t("View artist profile")}
                                                    >
                                                        {track.artist}
                                                    </span>
                                                    <span>·</span>
                                                    <span>{fmtDuration(track.durationMs)}</span>
                                                    {track.source && (
                                                        <span className={`sc-source-tag sc-source-tag--${track.source}`}>
                                                            {track.source}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="sc-track-actions">
                                                <TooltipContainer text={t("Add to queue")}>
                                                    <Button
                                                        variant="secondary"
                                                        size="small"
                                                        className="sc-row-btn"
                                                        onClick={e => addToQueue(track, e)}
                                                    >
                                                        <IconPlus />
                                                        <span>Queue</span>
                                                    </Button>
                                                </TooltipContainer>
                                                <TooltipContainer text={isFav(track) ? t("Remove from favorites") : t("Add to favorites")}>
                                                    <button
                                                        className={`sc-row-btn sc-row-btn--heart ${isFav(track) ? "sc-row-btn--fav" : ""}`}
                                                        onClick={e => toggleFavorite(track, e)}
                                                    >
                                                        <IconHeart filled={isFav(track)} />
                                                    </button>
                                                </TooltipContainer>
                                                <TooltipContainer text={track.snipped ? t("30s Preview") : t("Play track")}>
                                                    <button
                                                        className="sc-row-btn sc-row-btn--play"
                                                        disabled={!!track.snipped}
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            if (!track.snipped) {
                                                                if (tab === "favs") playerPlayFavAt(idx);
                                                                else playerPlayTrack(track, -1, 0, idx);
                                                            }
                                                        }}
                                                    >
                                                        {isCurrentPlaying && p.isPlaying ? <IconPause size={14} /> : <IconPlay size={14} />}
                                                    </button>
                                                </TooltipContainer>
                                            </div>
                                        </div>
                                    );
                                })}

                                {tab === "search" && hasMore && (
                                    <div className="sc-load-more-row">
                                        <Button
                                            variant="secondary"
                                            size="medium"
                                            className="sc-load-more-btn"
                                            onClick={loadMore}
                                            disabled={loadingMore}
                                        >
                                            {loadingMore ? t("Loading more tracks...") : t("Load More Tracks ▾")}
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Bottom Docked Now-Playing Bar */}
            {p.playing && (
                <div className="sc-docked-player">
                    {/* Left: Track info */}
                    <div className="sc-dock-left">
                        <img
                            className="sc-dock-artwork"
                            src={p.playing.artworkUrl || ""}
                            alt=""
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <div className="sc-dock-info">
                            <div className="sc-dock-title" title={p.playing.title}>{p.playing.title}</div>
                            <div
                                className="sc-dock-artist sc-artist-name--clickable"
                                onClick={e => openArtistProfile(p.playing!.artist, p.playing!, e)}
                                title={t("View artist profile")}
                            >
                                {p.playing.artist}
                            </div>
                        </div>
                        <TooltipContainer text={isFav(p.playing) ? t("Remove from favorites") : t("Add to favorites")}>
                            <button
                                className={`sc-dock-fav-btn ${isFav(p.playing) ? "sc-dock-fav-btn--active" : ""}`}
                                onClick={e => toggleFavorite(p.playing!, e)}
                            >
                                <IconHeart filled={isFav(p.playing)} />
                            </button>
                        </TooltipContainer>
                    </div>

                    {/* Center: Controls & Scrubber */}
                    <div className="sc-dock-center">
                        <div className="sc-dock-controls">
                            <TooltipContainer text={t("Shuffle")}>
                                <button
                                    className={`sc-dock-btn ${p.shuffle ? "sc-dock-btn--active" : ""}`}
                                    onClick={() => { p.shuffle = !p.shuffle; p.notify(); }}
                                >
                                    <IconShuffle active={p.shuffle} />
                                </button>
                            </TooltipContainer>

                            <TooltipContainer text={t("Previous track")}>
                                <button className="sc-dock-btn" onClick={() => navFav(-1)}>
                                    <IconPrev size={18} />
                                </button>
                            </TooltipContainer>

                            <TooltipContainer text={p.isPlaying ? t("Pause") : t("Play")}>
                                <button className="sc-dock-play-btn" onClick={togglePause}>
                                    {p.isPlaying ? <IconPause size={20} /> : <IconPlay size={20} />}
                                </button>
                            </TooltipContainer>

                            <TooltipContainer text={t("Next track")}>
                                <button className="sc-dock-btn" onClick={() => navFav(1)}>
                                    <IconNext size={18} />
                                </button>
                            </TooltipContainer>

                            <TooltipContainer text={t("Repeat")}>
                                <button
                                    className={`sc-dock-btn ${p.loop ? "sc-dock-btn--active" : ""}`}
                                    onClick={() => { p.loop = !p.loop; p.notify(); }}
                                >
                                    <IconRepeat active={p.loop} />
                                </button>
                            </TooltipContainer>

                            <TooltipContainer text={t("Stop playback")}>
                                <button className="sc-dock-btn sc-dock-btn--stop" onClick={playerStop}>
                                    <IconStop size={15} />
                                </button>
                            </TooltipContainer>
                        </div>

                        <div className="sc-dock-scrubber-row">
                            <span className="sc-time-text">{fmtDuration(p.position * 1000)}</span>
                            <div ref={progressRef} className="sc-scrubber-bar" onClick={handleSeek}>
                                <div className="sc-scrubber-fill" style={{ width: `${Math.max(0, Math.min(100, p.progress * 100))}%` }}>
                                    <div className="sc-scrubber-thumb" />
                                </div>
                            </div>
                            <span className="sc-time-text">{fmtDuration(p.duration * 1000)}</span>
                        </div>
                    </div>

                    {/* Right: Lyrics & Volume & Output */}
                    <div className="sc-dock-right">
                        {/* Paroles Microphone Button */}
                        <TooltipContainer text={p.hasLyrics ? t("Show lyrics") : t("Lyrics not available for this track")}>
                            <button
                                className={`sc-dock-btn ${tab === "lyrics" ? "sc-dock-btn--active" : ""} ${!p.hasLyrics ? "sc-dock-btn--disabled" : ""}`}
                                onClick={() => {
                                    if (p.hasLyrics) {
                                        setTab(t => t === "lyrics" ? "search" : "lyrics");
                                    }
                                }}
                                disabled={!p.hasLyrics}
                            >
                                <IconMic size={16} />
                            </button>
                        </TooltipContainer>

                        <TooltipContainer text={p.volume === 0 ? t("Unmute") : t("Mute")}>
                            <button className="sc-volume-btn" onClick={toggleMute}>
                                <IconVolume low={p.volume < 50} muted={p.volume === 0} />
                            </button>
                        </TooltipContainer>

                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={p.volume}
                            className="sc-dock-volume-slider"
                            onChange={e => {
                                p.volume = Number(e.currentTarget.value);
                                if (p.audio) p.audio.volume = p.volume / 100;
                                p.notify();
                            }}
                        />
                        <span className="sc-volume-text">{p.volume}%</span>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Thumbnail Toolbar Windows ──────────────────────────────────────────────

let thumbarListener: (() => void) | null = null;

function initThumbar() {
    try {
        const win = VencordNative?.window as any;
        if (!win?.setThumbarButtons || !win?.onThumbarClick) return;

        // Listen for taskbar clicks
        win.onThumbarClick((action: string) => {
            const s = playerState;
            try {
                if (action === "prev") {
                    if (s.favIndex >= 0) playerPlayFavAt(s.favIndex - 1);
                } else if (action === "next") {
                    if (s.favIndex >= 0) playerPlayFavAt(s.favIndex + 1);
                } else if (action === "play") {
                    if (s.audio) { s.audio.play().catch(() => { }); s.isPlaying = true; s.notify(); }
                } else if (action === "pause") {
                    if (s.audio) { s.audio.pause(); s.isPlaying = false; s.notify(); }
                }
            } catch { }
        });

        // Sync thumbar on every player state change
        thumbarListener = () => {
            try {
                const s = playerState;
                const state: "playing" | "paused" | "stopped" = !s.playing ? "stopped" : s.isPlaying ? "playing" : "paused";
                win.setThumbarButtons(state).catch(() => { });
            } catch { }
        };
        playerState.subscribe(thumbarListener);
    } catch { }
}

function cleanupThumbar() {
    try {
        const win = VencordNative?.window as any;
        if (win?.removeThumbarClickListener) win.removeThumbarClickListener();
        if (win?.setThumbarButtons) win.setThumbarButtons("stopped").catch(() => { });
        if (thumbarListener) {
            playerState.unsubscribe(thumbarListener);
            thumbarListener = null;
        }
    } catch { }
}

// ─── Bouton HeaderBar ─────────────────────────────────────────────────────────

function SCHeaderBarButton() {
    return (
        <HeaderBarButton
            tooltip="SoundCord Player"
            position="bottom"
            icon={SoundCloudIconComponent}
            onClick={() => openModal(props => (
                <ModalRoot {...props} size={ModalSize.DYNAMIC} className="sc-modal-root">
                    <SoundCloudModal onClose={props.onClose} />
                </ModalRoot>
            ))}
        />
    );
}


const UserStore = findStoreLazy("UserStore");

let lastSyncTime = 0;
let lastSyncTrackId = "";
let lastSyncIsPlaying = false;

async function syncPlayerStateToCloud() {
    try {
        const token = await getStoredToken();
        if (!token) return;

        const p = playerState;
        if (!p.playing) {
            await saveOwnPluginConfig("soundcloudPlayer", token, {
                private: false,
                trackId: null,
                isPlaying: false,
                start: 0,
                updatedAt: Date.now()
            });
            return;
        }

        const now = Date.now();
        const elapsed = Math.floor(p.position * 1000);
        const start = now - elapsed;

        const shouldSync = 
            p.playing.id !== lastSyncTrackId ||
            p.isPlaying !== lastSyncIsPlaying ||
            Math.abs(now - lastSyncTime) > 10000;

        if (!shouldSync) return;

        lastSyncTime = now;
        lastSyncTrackId = p.playing.id;
        lastSyncIsPlaying = p.isPlaying;

        await saveOwnPluginConfig("soundcloudPlayer", token, {
            private: false,
            trackId: p.playing.id,
            isPlaying: p.isPlaying,
            start: start,
            updatedAt: now
        });
    } catch (e) {
        console.error("[SoundCord] Cloud sync failed:", e);
    }
}

// ─── Rich Presence ───────────────────────────────────────────────────────────────────

const RPC_SOCKET_ID = "SoundCordPlayer";
const RPC_APP_ID = "1108588077900898414"; // Shared Discord music app ID

let _rpcLastTitle = "";
let _rpcLastPlaying = false;
let _rpcThrottleTimer: ReturnType<typeof setTimeout> | null = null;

function updateRichPresence() {
    const p = playerState;
    if (!settings.store.richPresence || !p.playing || !p.isPlaying) {
        clearRichPresence();
        return;
    }
    const nowTitle = p.playing?.title ?? "";
    const nowPlaying = !!p.playing && p.isPlaying;

    // Always react immediately to state changes (play/pause/stop/track switch)
    if (nowTitle !== _rpcLastTitle || nowPlaying !== _rpcLastPlaying) {
        if (_rpcThrottleTimer) { clearTimeout(_rpcThrottleTimer); _rpcThrottleTimer = null; }
        _doUpdateRichPresence();
        return;
    }

    // Throttle progress updates to avoid spamming Discord
    if (_rpcThrottleTimer) return;
    _rpcThrottleTimer = setTimeout(() => {
        _rpcThrottleTimer = null;
        _doUpdateRichPresence();
    }, 5000);
}

async function _doUpdateRichPresence() {
    try {
        if (!settings.store.richPresence) {
            clearRichPresence();
            return;
        }
        const p = playerState;
        if (!p.playing || !p.isPlaying) {
            clearRichPresence();
            return;
        }

        _rpcLastTitle = p.playing.title ?? "";
        _rpcLastPlaying = true;

        const now = Date.now();
        const elapsed = Math.floor(p.position * 1000);
        const start = now - elapsed;
        const duration = Math.floor(p.duration * 1000);
        const end = start + duration;

        const myUserId = UserStore?.getCurrentUser?.()?.id || "";

        let large_image: string | undefined;
        if (p.playing.artworkUrl) {
            try {
                large_image = (await ApplicationAssetUtils.fetchAssetIds(RPC_APP_ID, [p.playing.artworkUrl]))[0];
            } catch {
                large_image = undefined;
            }
            if (!large_image) {
                large_image = `mp:external/${encodeURIComponent(p.playing.artworkUrl).replace(/%2F/g, "/")}`;
            }
        }

        const assets = large_image ? {
            large_image,
            large_text: p.playing.title || undefined,
        } : undefined;

        FluxDispatcher.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            socketId: RPC_SOCKET_ID,
            activity: {
                application_id: RPC_APP_ID,
                name: "SoundCord",
                details: p.playing.title || "Unknown track",
                state: p.playing.artist || undefined,
                type: 2, // LISTENING
                timestamps: duration > 0 ? { start, end } : { start },
                assets,
                buttons: ["Download"],
                metadata: {
                    button_urls: ["https://nightcord.st"],
                },
                flags: 1,
            }
        });
    } catch { }
}

function clearRichPresence() {
    try {
        _rpcLastTitle = "";
        _rpcLastPlaying = false;
        if (_rpcThrottleTimer) {
            clearTimeout(_rpcThrottleTimer);
            _rpcThrottleTimer = null;
        }
        FluxDispatcher.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            socketId: RPC_SOCKET_ID,
            activity: null,
        });
        FluxDispatcher.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            activity: null,
        });
    } catch { }
}

let rpcListener: (() => void) | null = null;
let documentClickHandler: ((e: MouseEvent) => void) | null = null;

function findUrlInReactFiber(element: HTMLElement | null): string | null {
    // Only inspect if the user actually clicked a button or anchor
    const btn = element?.closest("button, a, [role='button']");
    if (!btn) return null;

    let curr: HTMLElement | null = btn as HTMLElement;
    const keys = Object.keys(curr);
    const key = keys.find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
    if (key) {
        let fiber = (curr as any)[key];
        let depth = 0;
        while (fiber && depth < 6) {
            const props = fiber.memoizedProps;
            if (props) {
                if (typeof props.href === "string" && props.href.includes("nightcord.st/listen")) return props.href;
                if (typeof props.url === "string" && props.url.includes("nightcord.st/listen")) return props.url;
                if (typeof props.button?.url === "string" && props.button.url.includes("nightcord.st/listen")) return props.button.url;
            }
            fiber = fiber.return;
            depth++;
        }
    }
    return null;
}

async function handleListeningTogether(scId: string, startParam: string, userIdParam?: string) {
    if (userIdParam) {
        try {
            const config = await getPublicPluginConfig("soundcloudPlayer", userIdParam);
            if (config?.settings) {
                const { trackId, start, isPlaying } = config.settings;
                if (trackId && isPlaying) {
                    playTrackById(trackId, String(start));
                    return;
                }
            }
        } catch (e) {
            console.error("[SoundCord] API sync failed:", e);
        }
    }
    // Fallback: play directly by scId if no user config or API failed
    if (scId) {
        playTrackById(scId, startParam);
    }
}

function handleListeningTogetherEvent(e: any) {
    const scId = e.detail?.scId;
    const start = e.detail?.start;
    const userId = e.detail?.userId;
    handleListeningTogether(scId, start, userId);
}

function handleSoundCordCommand(e: any) {
    if (e.type === "SOUNDCORD_REQUEST_STATE") {
        playerState.notify();
    } else if (e.type === "SOUNDCORD_COMMAND") {
        const cmd = e.command;
        if (cmd === "toggle") {
            if (!playerState.audio) return;
            if (playerState.isPlaying) { playerState.audio.pause(); playerState.isPlaying = false; }
            else { playerState.audio.play(); playerState.isPlaying = true; }
            playerState.notify();
        } else if (cmd === "prev") {
            const base = playerState.favIndex >= 0 ? playerState.favIndex : playerState.favorites.length;
            playerPlayFavAt((base - 1 + playerState.favorites.length) % playerState.favorites.length);
        } else if (cmd === "next") {
            const base = playerState.favIndex >= 0 ? playerState.favIndex : -1;
            playerPlayFavAt((base + 1) % playerState.favorites.length);
        } else if (cmd === "volume") {
            const vol = e.value;
            if (vol !== undefined) {
                playerState.volume = vol;
                if (playerState.audio) playerState.audio.volume = vol / 100;
                playerState.notify();
            }
        }
    }
}

function handleAccountSwitch() {
    playerStop();
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export const settings = definePluginSettings({
    richPresence: {
        type: OptionType.BOOLEAN,
        description: t("Show listening activity status (like Spotify)"),
        default: true,
        onChange(val: boolean) {
            if (!val) {
                clearRichPresence();
            } else {
                updateRichPresence();
            }
        },
    },
    enableDynamicIsland: {
        type: OptionType.BOOLEAN,
        description: t("Enable Dynamic Island for SoundCord"),
        default: false,
    },
    showSoundCordControls: {
        type: OptionType.BOOLEAN,
        description: t("Show playback controls (Previous, Play/Pause, Next) in Dynamic Island"),
        default: true,
    },
    showSoundCordVolume: {
        type: OptionType.BOOLEAN,
        description: t("Show volume slider in Dynamic Island"),
        default: true,
    },
});

export default definePlugin({

    name: "SoundCordPlayer",
    enabledByDefault: true,
    description: "Integrated SoundCord player. Client ID is automatically fetched via native Electron process — no account required.",
    authors: [EquicordDevs.nobody],
    settings,
    
    toolboxActions: {
        "Open SoundCord": () => {
            openModal(props => (
                <ModalRoot {...props} size={ModalSize.DYNAMIC} className="sc-modal-root">
                    <SoundCloudModal onClose={props.onClose} />
                </ModalRoot>
            ));
        }
    },

    headerBarButton: {
        icon: SoundCloudIconComponent,
        render: (props) => {
            // DynamicIslande acts as the primary host. If it's disabled, we render our standalone version for SoundCord.
            const isFullIslandEnabled = isPluginEnabled("DynamicIslande");
            const enableIsland = settings.use(["enableDynamicIsland"]).enableDynamicIsland ?? true;
            return (
                <React.Fragment>
                    <SCHeaderBarButton {...props} />
                    {!isFullIslandEnabled && enableIsland && <SafeDynamicIsland onlySoundCord={true} />}
                </React.Fragment>
            );
        },
    },

    search: searchTracks,
    get clientId() { return playerState.clientId; },

    start() {
        Native.installListeningTogetherIntercept().catch(() => {});
        fetchClientId().catch(() => { });
        initThumbar();

        window.addEventListener("soundcord-listen-together", handleListeningTogetherEvent);
        window.addEventListener("beforeunload", clearRichPresence);

        documentClickHandler = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;

            // Try direct href on anchors first
            const anchor = target.closest("a") as HTMLAnchorElement | null;
            let href = anchor?.href || "";

            // Fallback to React fiber properties (for buttons)
            if (!href) {
                const fiberHref = findUrlInReactFiber(target);
                if (fiberHref) href = fiberHref;
            }

            if (href && href.includes("nightcord.st/listen?")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                try {
                    const params = new URL(href).searchParams;
                    const scId = params.get("sc_id") ?? "";
                    const start = params.get("start") ?? "";
                    const userId = params.get("userId") ?? "";
                    if (scId || userId) {
                        handleListeningTogether(scId, start, userId);
                    }
                } catch {}
            }
        };
        document.addEventListener("click", documentClickHandler, true);

        // Force clear any stuck activity from previous sessions on startup
        clearRichPresence();

        // Wire Rich Presence to player state changes
        rpcListener = () => {
            updateRichPresence();
            syncPlayerStateToCloud();
        };
        playerState.subscribe(rpcListener);

        FluxDispatcher.subscribe("LOGOUT", handleAccountSwitch);
        FluxDispatcher.subscribe("CONNECTION_OPEN", handleAccountSwitch);
        FluxDispatcher.subscribe("SOUNDCORD_REQUEST_STATE", handleSoundCordCommand);
        FluxDispatcher.subscribe("SOUNDCORD_COMMAND", handleSoundCordCommand);
    },

    stop() {
        window.removeEventListener("soundcord-listen-together", handleListeningTogetherEvent);
        window.removeEventListener("beforeunload", clearRichPresence);
        if (documentClickHandler) {
            document.removeEventListener("click", documentClickHandler, true);
            documentClickHandler = null;
        }
        cleanupThumbar();
        playerStop();

        // Unsubscribe RPC listener and clear activity
        if (rpcListener) {
            playerState.unsubscribe(rpcListener);
            rpcListener = null;
        }
        clearRichPresence();
        FluxDispatcher.unsubscribe("LOGOUT", handleAccountSwitch);
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", handleAccountSwitch);
        FluxDispatcher.unsubscribe("SOUNDCORD_REQUEST_STATE", handleSoundCordCommand);
        FluxDispatcher.unsubscribe("SOUNDCORD_COMMAND", handleSoundCordCommand);
        playerInited = false;
    },
});

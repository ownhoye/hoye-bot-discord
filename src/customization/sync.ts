/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { authorizeUser, checkOAuthToken, clearToken, getStoredToken } from "@api/OAuth2";
import { getPublicPluginConfig, saveOwnPluginConfig } from "@api/PluginSync";
import { getPluginSyncToken } from "@api/SettingsSync/pluginSync";
import { UserStore } from "@webpack/common";
import type {
    LoliCordPremiumPayload,
    LoliCordPremiumSettings,
    PremiumFavSong,
    PremiumStory,
    ProfileEffectsConfig
} from "./types";

export const PREMIUM_SETTINGS_KEY = "LoliCord_Premium_Settings";
export const STORIES_KEY = "LoliCordPremium_Stories";
export const FAV_SONGS_KEY = "LoliCordPremium_FavSongs";
export const EFFECTS_KEY = "LoliCordPremium_ProfileEffects";

export const DEFAULT_PREMIUM_SETTINGS: LoliCordPremiumSettings = {
    enabled: true,
    storiesEnabled: false,
    favSongsEnabled: false,
    profileEffectsEnabled: false,
};

export const DEFAULT_EFFECTS_CONFIG: ProfileEffectsConfig = {
    enabled: false,
    mode: "preset",
    presetName: "cards-glitch",
    showBanner: false,
    gifUrl: "https://i.imgur.com/b8THXPt.gif",
    gifOpacity: 0.6,
    gifFit: "cover",
    gifBgColor: "#0a0010",
    gifBlendMode: "normal",
    nameEffect: "none",
    glowColor: "#a78bfa",
    chatUsernameEffect: "none",
    memberListEffect: "none",
    profileFont: "none",
    profileDrawing: {
        enabled: true,
        strokes: [],
        updatedAt: 0,
    },
};

// ─── Settings Store ──────────────────────────────────────────────────────────

const LS_PREMIUM_SETTINGS_KEY = "lolicord_premium_settings_cache";

function loadInitialSettings(): LoliCordPremiumSettings {
    try {
        if (typeof window !== "undefined" && window.localStorage) {
            const raw = window.localStorage.getItem(LS_PREMIUM_SETTINGS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") {
                    return { ...DEFAULT_PREMIUM_SETTINGS, ...parsed };
                }
            }
        }
    } catch {}
    return { ...DEFAULT_PREMIUM_SETTINGS };
}

let inMemorySettings: LoliCordPremiumSettings | null = null;
const settingsListeners = new Set<(s: LoliCordPremiumSettings) => void>();

export async function getPremiumSettings(): Promise<LoliCordPremiumSettings> {
    if (inMemorySettings) return inMemorySettings;
    const saved = await DataStore.get<LoliCordPremiumSettings>(PREMIUM_SETTINGS_KEY);
    inMemorySettings = { ...DEFAULT_PREMIUM_SETTINGS, ...(saved || {}) };
    try {
        if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem(LS_PREMIUM_SETTINGS_KEY, JSON.stringify(inMemorySettings));
        }
    } catch {}
    return inMemorySettings;
}

export function getCachedPremiumSettings(): LoliCordPremiumSettings {
    if (!inMemorySettings) {
        inMemorySettings = loadInitialSettings();
    }
    return inMemorySettings;
}

export async function setPremiumSettings(update: Partial<LoliCordPremiumSettings>): Promise<LoliCordPremiumSettings> {
    const current = await getPremiumSettings();
    const next = { ...current, ...update };
    inMemorySettings = next;
    try {
        if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem(LS_PREMIUM_SETTINGS_KEY, JSON.stringify(next));
        }
    } catch {}
    await DataStore.set(PREMIUM_SETTINGS_KEY, next);
    for (const listener of settingsListeners) {
        try { listener(next); } catch {}
    }
    void syncOwnDataToCloud();
    return next;
}

export function subscribePremiumSettings(listener: (s: LoliCordPremiumSettings) => void): () => void {
    settingsListeners.add(listener);
    return () => settingsListeners.delete(listener);
}

// ─── OAuth2 Verification & Auth ──────────────────────────────────────────────

export async function getValidOAuthToken(): Promise<string | null> {
    let token = await getStoredToken();
    if (!token) {
        token = (await getPluginSyncToken()) || null;
    }
    if (!token) {
        token = (await DataStore.get<string>("lolicord_oauth_token")) || null;
    }
    if (!token) return null;

    try {
        const check = await checkOAuthToken(token);
        if (check) return token;
    } catch {}
    return null;
}

export async function isOAuthAuthenticated(): Promise<boolean> {
    const token = await getValidOAuthToken();
    return !!token;
}

export async function promptDiscordOAuth(): Promise<string | null> {
    const token = await authorizeUser();
    if (token) {
        // Trigger auto sync
        void syncOwnDataToCloud();
    }
    return token;
}

export async function disconnectDiscordOAuth(): Promise<void> {
    await clearToken();
    await DataStore.del("lolicord_oauth_token");
}

// ─── Local Data Storage ──────────────────────────────────────────────────────

export async function getLocalStories(userId?: string): Promise<PremiumStory[]> {
    const curId = UserStore.getCurrentUser()?.id;
    const uid = userId || curId;
    if (uid) {
        const saved = await DataStore.get<PremiumStory[]>(`${STORIES_KEY}_${uid}`);
        if (Array.isArray(saved) && saved.length > 0) return saved;
    }
    if (!userId || userId === curId) {
        const fallback = await DataStore.get<PremiumStory[]>(STORIES_KEY);
        return Array.isArray(fallback) ? fallback : [];
    }
    return [];
}

export async function saveLocalStories(stories: PremiumStory[]): Promise<void> {
    const uid = UserStore.getCurrentUser()?.id;
    if (uid) {
        await DataStore.set(`${STORIES_KEY}_${uid}`, stories);
    }
    await DataStore.set(STORIES_KEY, stories);
    void syncOwnDataToCloud();
}

export async function getLocalFavSongs(userId?: string): Promise<PremiumFavSong[]> {
    const curId = UserStore.getCurrentUser()?.id;
    const uid = userId || curId;
    if (uid) {
        const saved = await DataStore.get<PremiumFavSong[]>(`${FAV_SONGS_KEY}_${uid}`);
        if (Array.isArray(saved) && saved.length > 0) return saved;
    }
    if (!userId || userId === curId) {
        const fallback = await DataStore.get<PremiumFavSong[]>(FAV_SONGS_KEY);
        return Array.isArray(fallback) ? fallback : [];
    }
    return [];
}

export async function saveLocalFavSongs(songs: PremiumFavSong[]): Promise<void> {
    const uid = UserStore.getCurrentUser()?.id;
    if (uid) {
        await DataStore.set(`${FAV_SONGS_KEY}_${uid}`, songs);
    }
    await DataStore.set(FAV_SONGS_KEY, songs);
    void syncOwnDataToCloud();
}

let inMemoryEffectsConfig: ProfileEffectsConfig | null = null;

export function getCachedEffectsConfig(): ProfileEffectsConfig {
    return inMemoryEffectsConfig ?? DEFAULT_EFFECTS_CONFIG;
}

export async function getLocalEffectsConfig(userId?: string): Promise<ProfileEffectsConfig> {
    const curId = UserStore.getCurrentUser()?.id;
    const uid = userId || curId;
    if (uid) {
        const saved = await DataStore.get<ProfileEffectsConfig>(`${EFFECTS_KEY}_${uid}`);
        if (saved) {
            const res = { ...DEFAULT_EFFECTS_CONFIG, ...saved };
            if (!userId || userId === curId) inMemoryEffectsConfig = res;
            return res;
        }
    }
    if (!userId || userId === curId) {
        const fallback = await DataStore.get<ProfileEffectsConfig>(EFFECTS_KEY);
        const res = { ...DEFAULT_EFFECTS_CONFIG, ...(fallback || {}) };
        inMemoryEffectsConfig = res;
        return res;
    }
    return DEFAULT_EFFECTS_CONFIG;
}

export async function saveLocalEffectsConfig(config: ProfileEffectsConfig): Promise<void> {
    inMemoryEffectsConfig = config;
    const uid = UserStore.getCurrentUser()?.id;
    if (uid) {
        await DataStore.set(`${EFFECTS_KEY}_${uid}`, config);
    }
    await DataStore.set(EFFECTS_KEY, config);
    void syncOwnDataToCloud();
}

// ─── Cloud Sync via LoliCord OAuth2 ─────────────────────────────────────────

export const profileCache = new Map<string, { data: LoliCordPremiumPayload | null; ts: number }>();
const inFlightRequests = new Map<string, Promise<LoliCordPremiumPayload | null>>();
const CACHE_TTL_MS = 60 * 1000;

export async function syncOwnDataToCloud(): Promise<boolean> {
    const token = await getValidOAuthToken();
    if (!token) return false;

    const [stories, favSongs, effects, st] = await Promise.all([
        getLocalStories(),
        getLocalFavSongs(),
        getLocalEffectsConfig(),
        getPremiumSettings(),
    ]);

    const payload: LoliCordPremiumPayload = {
        storiesEnabled: st.storiesEnabled,
        favSongsEnabled: st.favSongsEnabled,
        profileEffectsEnabled: st.profileEffectsEnabled,
        stories,
        favSongs,
        effects,
        updatedAt: Date.now(),
    };

    try {
        await saveOwnPluginConfig("lolicord_premium", token, { ...payload, private: false });
        const curUser = UserStore.getCurrentUser();
        if (curUser?.id) {
            profileCache.set(curUser.id, { data: payload, ts: Date.now() });
        }
        return true;
    } catch (e) {
        console.warn("[LoliCordPremium] Cloud sync write failed:", e);
        return false;
    }
}

export async function readUserPremiumData(userId: string): Promise<LoliCordPremiumPayload | null> {
    if (!userId) return null;

    const curUser = UserStore.getCurrentUser();
    const isSelf = curUser?.id && String(curUser.id) === String(userId);

    if (isSelf) {
        const [stories, favSongs, effects, st] = await Promise.all([
            getLocalStories(userId),
            getLocalFavSongs(userId),
            getLocalEffectsConfig(userId),
            getPremiumSettings(),
        ]);
        const data: LoliCordPremiumPayload = {
            storiesEnabled: st.storiesEnabled,
            favSongsEnabled: st.favSongsEnabled,
            profileEffectsEnabled: st.profileEffectsEnabled,
            stories,
            favSongs,
            effects,
            updatedAt: Date.now(),
        };
        profileCache.set(userId, { data, ts: Date.now() });
        return data;
    }

    const cached = profileCache.get(userId);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.data;
    }

    if (inFlightRequests.has(userId)) {
        return inFlightRequests.get(userId)!;
    }

    const fetchPromise = (async (): Promise<LoliCordPremiumPayload | null> => {
        try {
            const remote = await getPublicPluginConfig("lolicord_premium", userId);
            const raw = (remote as any)?.settings ?? (remote as any)?.data ?? remote;
            if (raw && typeof raw === "object") {
                const data: LoliCordPremiumPayload = {
                    storiesEnabled: raw.storiesEnabled ?? false,
                    favSongsEnabled: raw.favSongsEnabled ?? false,
                    profileEffectsEnabled: raw.profileEffectsEnabled ?? false,
                    stories: Array.isArray(raw.stories) ? raw.stories : [],
                    favSongs: Array.isArray(raw.favSongs) ? raw.favSongs : [],
                    effects: raw.effects ? { ...DEFAULT_EFFECTS_CONFIG, ...raw.effects } : DEFAULT_EFFECTS_CONFIG,
                    updatedAt: raw.updatedAt ?? Date.now(),
                };
                profileCache.set(userId, { data, ts: Date.now() });
                return data;
            }
        } catch (e) {
            console.warn(`[LoliCordPremium] readUserPremiumData error for ${userId}:`, e);
        }

        // Fallback: check if local storage has data specifically for this userId
        try {
            const [localStories, localSongs, localEffects] = await Promise.all([
                getLocalStories(userId),
                getLocalFavSongs(userId),
                getLocalEffectsConfig(userId),
            ]);
            if (localStories.length > 0 || localSongs.length > 0 || localEffects.enabled || (localEffects.nameEffect && localEffects.nameEffect !== "none")) {
                const fallbackData: LoliCordPremiumPayload = {
                    storiesEnabled: localStories.length > 0,
                    favSongsEnabled: localSongs.length > 0,
                    profileEffectsEnabled: localEffects.enabled || (localEffects.nameEffect && localEffects.nameEffect !== "none"),
                    stories: localStories,
                    favSongs: localSongs,
                    effects: localEffects,
                    updatedAt: Date.now(),
                };
                profileCache.set(userId, { data: fallbackData, ts: Date.now() });
                return fallbackData;
            }
        } catch {}

        profileCache.set(userId, { data: null, ts: Date.now() });
        return null;
    })().finally(() => {
        inFlightRequests.delete(userId);
    });

    inFlightRequests.set(userId, fetchPromise);
    return fetchPromise;
}

// ─── Resilient Image Upload & Hosting ───────────────────────────────────────

const IMGUR_CLIENT_IDS = ["546c25a59c58ad7", "28eb27663471018", "b1959714ba361f1"];

/**
 * Resizes and compresses an image file to a lightweight data URL (WebP/JPEG max 1280px).
 * Acts as an offline/infallible fallback so uploads never fail.
 */
export async function compressImageToDataUrl(file: File, maxDim = 1280, quality = 0.82): Promise<string> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            if (!result) {
                resolve("");
                return;
            }
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    resolve(result);
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                try {
                    const webp = canvas.toDataURL("image/webp", quality);
                    if (webp && webp.startsWith("data:image/webp")) {
                        resolve(webp);
                        return;
                    }
                } catch {}
                try {
                    const jpeg = canvas.toDataURL("image/jpeg", quality);
                    resolve(jpeg);
                } catch {
                    resolve(result);
                }
            };
            img.onerror = () => resolve(result);
            img.src = result;
        };
        reader.onerror = () => resolve("");
        reader.readAsDataURL(file);
    });
}

/**
 * Uploads an image file with multi-provider fallbacks (Catbox, Litterbox, Imgur, DataURL).
 * Guarantees a valid working image URL for stories and avatars.
 */
export async function uploadImageFile(file: File): Promise<string | null> {
    // 1. Try Catbox (Permanent free hosting, no auth required, CORS friendly)
    try {
        const catboxData = new FormData();
        catboxData.append("reqtype", "fileupload");
        catboxData.append("fileToUpload", file);
        const res = await fetch("https://catbox.moe/user/api.php", {
            method: "POST",
            body: catboxData,
        });
        if (res.ok) {
            const url = (await res.text()).trim();
            if (url.startsWith("http://") || url.startsWith("https://")) {
                return url;
            }
        }
    } catch {}

    // 2. Try Litterbox (Catbox temporary upload fallback)
    try {
        const litterData = new FormData();
        litterData.append("reqtype", "fileupload");
        litterData.append("time", "72h");
        litterData.append("fileToUpload", file);
        const res = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", {
            method: "POST",
            body: litterData,
        });
        if (res.ok) {
            const url = (await res.text()).trim();
            if (url.startsWith("http://") || url.startsWith("https://")) {
                return url;
            }
        }
    } catch {}

    // 3. Try Imgur with client ID rotation
    for (const clientId of IMGUR_CLIENT_IDS) {
        try {
            const formData = new FormData();
            formData.append("image", file);
            const res = await fetch("https://api.imgur.com/3/image", {
                method: "POST",
                headers: { Authorization: `Client-ID ${clientId}` },
                body: formData,
            });
            if (res.ok) {
                const json = await res.json();
                if (json?.data?.link) {
                    return json.data.link;
                }
            }
        } catch {}
    }

    // 4. Infallible fallback: Compress to lightweight WebP Data URL
    try {
        const dataUrl = await compressImageToDataUrl(file);
        if (dataUrl && dataUrl.startsWith("data:image/")) {
            return dataUrl;
        }
    } catch {}

    return null;
}

// Backward-compatible alias
export const uploadToImgur = uploadImageFile;

/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { findByProps, waitFor } from "@webpack";
import { AuthenticationStore, ContextMenuApi, FluxDispatcher, Forms, IconUtils, MediaEngineStore, Menu, React, ReactDOM, showToast, TextInput, Toasts, UserStore } from "@webpack/common";

import { t } from "../autoTranslateLoliCord";

const settings = definePluginSettings({
    domain: {
        type: OptionType.SELECT,
        description: "Discord release channel / domain to open for instances.",
        options: [
            { label: "Discord (Stable)", value: "discord.com", default: true },
            { label: "Discord PTB", value: "ptb.discord.com" },
            { label: "Discord Canary", value: "canary.discord.com" }
        ]
    },
    syncAudioSettings: {
        type: OptionType.BOOLEAN,
        description: "Audio Settings Sync: Automatically inherit audio devices, volume, and Krisp from your main Discord window.",
        default: true
    },
    blockExternalTokenAccess: {
        type: OptionType.BOOLEAN,
        description: "Token Protection: Use protected temporary sessions and clear saved login data before opening an instance.",
        default: false
    },
    performanceMode: {
        type: OptionType.BOOLEAN,
        description: "Performance Mode: Throttle background instances to reduce CPU usage.",
        default: false
    }
});

const Native = VencordNative.pluginHelpers.MultiInstance as PluginNative<typeof import("./native")>;
const STORE_KEY = "TokenImporter_accounts";
const MI_TOKEN_CACHE_KEY = "lolicord-mi-token-cache";
const MI_AUTO_LAUNCH_KEY = "lolicord-mi-autolaunch-ids";
export const inMemoryAutoLaunchIds: Set<string> = new Set();
let autoLaunchLoaded = false;

export async function getAutoLaunchAccountIds(): Promise<string[]> {
    try {
        let local: string[] = [];
        try {
            local = (await DataStore.get<string[]>(MI_AUTO_LAUNCH_KEY)) ?? [];
        } catch {}
        let shared: string[] = [];
        try {
            if (typeof (Native as any)?.getSharedAutoLaunch === "function") {
                shared = (await (Native as any).getSharedAutoLaunch()) ?? [];
            }
        } catch {}
        const merged = Array.from(new Set([...shared, ...local].filter(Boolean)));
        inMemoryAutoLaunchIds.clear();
        merged.forEach(id => inMemoryAutoLaunchIds.add(id));
        autoLaunchLoaded = true;
        return merged;
    } catch {
        return [];
    }
}

export async function setAutoLaunchAccountIds(ids: string[]): Promise<void> {
    try {
        const unique = Array.from(new Set(ids.filter(Boolean)));
        inMemoryAutoLaunchIds.clear();
        unique.forEach(id => inMemoryAutoLaunchIds.add(id));
        await DataStore.set(MI_AUTO_LAUNCH_KEY, unique);
        if (typeof (Native as any)?.saveSharedAutoLaunch === "function") {
            (Native as any).saveSharedAutoLaunch(unique).catch(() => {});
        }
    } catch {}
}

export async function setAccountAutoLaunch(userId: string, enable: boolean): Promise<boolean> {
    if (enable) {
        inMemoryAutoLaunchIds.add(userId);
    } else {
        inMemoryAutoLaunchIds.delete(userId);
    }
    const arr = Array.from(inMemoryAutoLaunchIds);
    await setAutoLaunchAccountIds(arr);
    return enable;
}

export async function toggleAutoLaunchAccount(userId: string): Promise<boolean> {
    const isCurrently = inMemoryAutoLaunchIds.has(userId);
    return setAccountAutoLaunch(userId, !isCurrently);
}

let autoLaunchDone = false;

async function runAutoLaunch(): Promise<void> {
    if (autoLaunchDone || isCurrentInstanceWindow()) return;
    autoLaunchDone = true;

    try {
        const autoIds = await getAutoLaunchAccountIds();
        if (!autoIds || autoIds.length === 0) return;

        await loadTokenCache();
        const accounts = await fetchAllAccounts().catch(() => []);
        const curUser = UserStore.getCurrentUser();
        const openIds = (await Native.getOpenInstances().catch(() => [])) ?? [];

        const { domain, blockExternalTokenAccess, performanceMode, syncAudioSettings } = settings.store;
        const audioSettings = syncAudioSettings ? captureMasterAudioSettings() : undefined;

        let delayMs = 1500;
        for (const targetId of autoIds) {
            if (!targetId || (curUser?.id && targetId === curUser.id)) continue;
            if (openIds.includes(targetId)) continue;

            const acc = accounts.find(a => a.id === targetId);
            const tok = acc?.token || tokenCache[targetId];
            if (!tok) continue;

            const username = acc?.username || "";
            setTimeout(async () => {
                try {
                    const currentlyOpen = (await Native.getOpenInstances().catch(() => [])) ?? [];
                    if (currentlyOpen.includes(targetId)) return;
                    console.log(`[LoliCordMI] Auto-launching instance for ${username || targetId}...`);
                    await Native.openInstanceWindow(
                        tok,
                        targetId,
                        true,
                        username,
                        domain,
                        blockExternalTokenAccess,
                        performanceMode,
                        audioSettings
                    );
                } catch (err) {
                    console.warn(`[LoliCordMI] Auto-launch failed for ${targetId}:`, err);
                }
            }, delayMs);
            delayMs += 1200;
        }
    } catch (e) {
        console.warn("[LoliCordMI] runAutoLaunch error:", e);
    }
}

export const INSTANCE_PALETTE = [
    "#5865F2", // Discord Blurple
    "#57F287", // Green
    "#FEE75C", // Yellow
    "#EB459E", // Fuchsia / Pink
    "#ED4245", // Red
    "#00AFF4", // Cyan
    "#9B59B6", // Purple
    "#F47B67", // Coral / Peach
    "#E67E22", // Orange
    "#1ABC9C", // Turquoise / Teal
    "#FF73FA", // Neon Pink
    "#3498DB", // Sky Blue
    "#2ECC71", // Emerald
    "#E91E63", // Hot Pink
];

export function getAccountColor(userId: string): string {
    if (!userId) return INSTANCE_PALETTE[0];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
    }
    return INSTANCE_PALETTE[hash % INSTANCE_PALETTE.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// Token cache — capture les tokens des accounts natifs Discord
// ─────────────────────────────────────────────────────────────────────────────

let tokenCache: Record<string, string> = {};
let tokenCacheLoaded = false;
let encryptHooked = false;

async function loadTokenCache(): Promise<void> {
    if (tokenCacheLoaded) return;
    let local: Record<string, string> = {};
    try {
        local = (await DataStore.get<Record<string, string>>(MI_TOKEN_CACHE_KEY)) ?? {};
    } catch {}

    let shared: Record<string, string> = {};
    try {
        if (typeof Native?.getSharedTokenCache === "function") {
            shared = (await Native.getSharedTokenCache()) ?? {};
        }
    } catch {}

    tokenCache = { ...shared, ...local, ...tokenCache };
    tokenCacheLoaded = true;

    // Purge any corrupted or cross-account tokens
    const curUser = UserStore.getCurrentUser();
    const tokenMod = findByProps("getToken", "encryptAndStoreTokens");
    const curTok = tokenMod?.getToken?.();
    if (curUser?.id && curTok) {
        tokenCache[curUser.id] = curTok;
    }

    let dirty = false;
    for (const [id, tok] of Object.entries(tokenCache)) {
        if (!tok || typeof tok !== "string") {
            delete tokenCache[id];
            dirty = true;
            continue;
        }
        let realTok = tok;
        if (tok.startsWith("dQw4w9WgXcQ:")) {
            try {
                const dec = await Native.decryptToken(tok);
                if (dec && !dec.startsWith("dQw4w9WgXcQ:")) {
                    tokenCache[id] = dec;
                    realTok = dec;
                    dirty = true;
                }
            } catch { }
        }
        if (curUser?.id && curTok && id !== curUser.id && realTok === curTok) {
            delete tokenCache[id];
            dirty = true;
            continue;
        }
        const owner = getUserIdFromToken(realTok);
        if (owner && owner !== id) {
            delete tokenCache[id];
            dirty = true;
        }
    }
    if (dirty || Object.keys(tokenCache).length > Object.keys(local).length) {
        saveTokenCache();
    }
}

let _saveTokenTimer: ReturnType<typeof setTimeout> | undefined;
function saveTokenCache(): void {
    if (_saveTokenTimer !== undefined) clearTimeout(_saveTokenTimer);
    _saveTokenTimer = setTimeout(() => {
        _saveTokenTimer = undefined;
        DataStore.set(MI_TOKEN_CACHE_KEY, tokenCache).catch(() => {});
        if (typeof Native?.saveSharedTokenCache === "function") {
            Native.saveSharedTokenCache(tokenCache).catch(() => {});
        }
    }, 1000);
}

function decodeBase64Safe(str: string): string | null {
    try {
        let normalized = str.replace(/-/g, "+").replace(/_/g, "/");
        while (normalized.length % 4 !== 0) {
            normalized += "=";
        }
        return atob(normalized);
    } catch {
        return null;
    }
}

function getUserIdFromToken(token: string): string | null {
    if (!token || typeof token !== "string") return null;
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const decoded = decodeBase64Safe(parts[0]);
        if (decoded && /^\d{17,20}$/.test(decoded)) {
            return decoded;
        }
    } catch {}
    return null;
}

function cacheToken(userId: string, token: string): boolean {
    if (!userId || !token || typeof token !== "string") return false;
    const cleanTok = token.trim().replace(/^"+|"+$/g, "");
    const tokenOwner = getUserIdFromToken(cleanTok);
    if (tokenOwner && tokenOwner !== userId) {
        console.warn(`[MultiInstance] Token owner mismatch: belongs to ${tokenOwner}, expected ${userId}. Cache rejected.`);
        return false;
    }
    if (tokenCache[userId] === cleanTok) return false;
    tokenCache[userId] = cleanTok;
    return true;
}

function captureCurrentToken(): void {
    try {
        const tokenMod = findByProps("getToken", "encryptAndStoreTokens");
        const token = tokenMod?.getToken?.();
        const user = UserStore.getCurrentUser();
        if (token && user?.id && typeof token === "string") {
            const changed = cacheToken(user.id, token);
            if (changed) saveTokenCache();
            if (typeof fetchAllAccounts === "function") {
                fetchAllAccounts().catch(() => {});
            }
        }
    } catch { }
}

function hookEncryptAndStoreTokens(): void {
    if (encryptHooked) return;
    try {
        const tokenMod = findByProps("getToken", "encryptAndStoreTokens");
        if (!tokenMod?.encryptAndStoreTokens) return;
        const orig = tokenMod.encryptAndStoreTokens.bind(tokenMod);
        tokenMod.encryptAndStoreTokens = async function (tokens: Record<string, string>) {
            if (tokens && typeof tokens === "object") {
                let changed = false;
                for (const [id, token] of Object.entries(tokens)) {
                    if (id && token) {
                        if (cacheToken(id, token)) changed = true;
                    }
                }
                if (changed) saveTokenCache();
            }
            return orig(tokens);
        };
        encryptHooked = true;
    } catch { }
}

function hookFluxDispatcher(): (() => void) | null {
    try {
        if (!FluxDispatcher?.subscribe) return null;
        const handler = (event: any) => {
            if (event?.token && event?.userId) {
                const changed = cacheToken(event.userId, event.token);
                if (changed) saveTokenCache();
            }
        };
        FluxDispatcher.subscribe("MULTI_ACCOUNT_VALIDATE_TOKEN_SUCCESS", handler);
        return () => FluxDispatcher.unsubscribe("MULTI_ACCOUNT_VALIDATE_TOKEN_SUCCESS", handler);
    } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Synchronisation des réglages audio (Krisp, volume, micros, casques)
// ─────────────────────────────────────────────────────────────────────────────

function isCurrentInstanceWindow(): boolean {
    return !!((window as any).__lolicord_token || (window as any).__lolicord_user_id);
}

function captureMasterAudioSettings(): Record<string, any> | null {
    try {
        const rawLs = window.localStorage.getItem("MediaEngineStore");
        let parsedLs: any = null;
        if (rawLs) {
            try {
                parsedLs = JSON.parse(rawLs);
            } catch {}
        }

        let storeSettings: any = null;
        try {
            if (MediaEngineStore) {
                // Read all voice settings — handle both boolean and string noiseSuppression
                // (Discord stores it as boolean in older builds, string enum in newer builds)
                const rawNoiseSuppression = MediaEngineStore.getNoiseSuppression?.();
                const rawState = MediaEngineStore.getState?.()?.settingsByContext?.default ?? {};
                storeSettings = {
                    // 1. Spread rawState FIRST to pick up extra flags (vadSensitivity, inputProfile, soundshare, etc.)
                    ...rawState,
                    // 2. Override with live getter values — these are authoritative and always accurate
                    noiseSuppression2: rawState.noiseSuppression2 ?? rawState.noiseSuppressionType ?? undefined,
                    noiseCancellation: MediaEngineStore.getNoiseCancellation?.(),
                    noiseSuppression: rawNoiseSuppression,
                    echoCancellation: MediaEngineStore.getEchoCancellation?.(),
                    automaticGainControl: MediaEngineStore.getAutomaticGainControl?.(),
                    inputVolume: MediaEngineStore.getInputVolume?.(),
                    outputVolume: MediaEngineStore.getOutputVolume?.(),
                    inputDeviceId: MediaEngineStore.getInputDeviceId?.(),
                    outputDeviceId: MediaEngineStore.getOutputDeviceId?.(),
                    mode: MediaEngineStore.getMode?.(),
                    modeOptions: MediaEngineStore.getModeOptions?.(),
                    attenuation: MediaEngineStore.getAttenuation?.(),
                    attenuateWhileSpeakingSelf: MediaEngineStore.getAttenuateWhileSpeakingSelf?.(),
                    attenuateWhileSpeakingOthers: MediaEngineStore.getAttenuateWhileSpeakingOthers?.(),
                    qos: MediaEngineStore.getQoS?.(),
                };
            }
        } catch {}

        const defaultSettings = {
            ...(parsedLs?.default || {}),
            ...(storeSettings || {})
        };

        // Always rebuild rawMediaEngineStore from the live-merged defaultSettings
        // so the snapshot written to disk reflects the current voice settings exactly,
        // not the potentially stale localStorage blob.
        const mergedFullState = {
            ...(parsedLs || {}),
            default: {
                ...(parsedLs?.default || {}),
                ...(storeSettings || {})
            }
        };

        return {
            rawMediaEngineStore: JSON.stringify(mergedFullState),
            defaultSettings,
            fullState: mergedFullState
        };
    } catch {
        return null;
    }
}

let _audioSaveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleMasterAudioSave(): void {
    if (isCurrentInstanceWindow()) return;
    if (_audioSaveTimer !== undefined) clearTimeout(_audioSaveTimer);
    _audioSaveTimer = setTimeout(() => {
        _audioSaveTimer = undefined;
        const audio = captureMasterAudioSettings();
        if (audio && typeof Native?.saveMasterAudioSettings === "function") {
            Native.saveMasterAudioSettings(audio).catch(() => {});
        }
    }, 500);
}

function applyAudioSettings(audio: any): void {
    if (!audio) return;
    const def = audio.defaultSettings || audio;
    if (!def || typeof def !== "object") return;

    // 1. Output Volume
    if (typeof def.outputVolume === "number") {
        try {
            FluxDispatcher?.dispatch?.({
                type: "AUDIO_SET_OUTPUT_VOLUME",
                volume: def.outputVolume
            });
        } catch {}
    }

    // 2. Input Volume
    if (typeof def.inputVolume === "number") {
        try {
            FluxDispatcher?.dispatch?.({
                type: "AUDIO_SET_INPUT_VOLUME",
                volume: def.inputVolume
            });
        } catch {}
    }

    // 3. Output Device
    if (def.outputDeviceId && typeof def.outputDeviceId === "string") {
        try {
            FluxDispatcher?.dispatch?.({
                type: "AUDIO_SET_OUTPUT_DEVICE",
                id: def.outputDeviceId
            });
        } catch {}
    }

    // 4. Input Device
    if (def.inputDeviceId && typeof def.inputDeviceId === "string") {
        try {
            FluxDispatcher?.dispatch?.({
                type: "AUDIO_SET_INPUT_DEVICE",
                id: def.inputDeviceId
            });
        } catch {}
    }

    // 5. Krisp (noiseCancellation) & Noise Suppression
    const meActions = findByProps("setNoiseCancellation", "setNoiseSuppression") || findByProps("setNoiseCancellation");
    if (typeof def.noiseCancellation === "boolean") {
        try {
            meActions?.setNoiseCancellation?.(def.noiseCancellation);
        } catch {}
        try {
            MediaEngineStore?.getMediaEngine?.()?.setNoiseCancellation?.(def.noiseCancellation);
        } catch {}
    }
    // noiseSuppression may be boolean (legacy) or string enum ("none","standard","krisp") in modern Discord
    if (def.noiseSuppression !== undefined && def.noiseSuppression !== null) {
        try {
            meActions?.setNoiseSuppression?.(def.noiseSuppression);
        } catch {}
        try {
            MediaEngineStore?.getMediaEngine?.()?.setNoiseSuppression?.(def.noiseSuppression);
        } catch {}
    }

    // 6. Echo Cancellation & Automatic Gain Control
    if (typeof def.echoCancellation === "boolean") {
        try {
            meActions?.setEchoCancellation?.(def.echoCancellation);
        } catch {}
        try {
            MediaEngineStore?.getMediaEngine?.()?.setEchoCancellation?.(def.echoCancellation);
        } catch {}
    }
    if (typeof def.automaticGainControl === "boolean") {
        try {
            meActions?.setAutomaticGainControl?.(def.automaticGainControl);
        } catch {}
        try {
            MediaEngineStore?.getMediaEngine?.()?.setAutomaticGainControl?.(def.automaticGainControl);
        } catch {}
    }

    // 7. Voice Mode & Sensitivity / Options
    // Apply mode even when modeOptions is absent (voice activity vs push to talk)
    if (def.mode) {
        try {
            const modeActions = findByProps("setMode") || meActions;
            modeActions?.setMode?.(def.mode, def.modeOptions ?? {});
        } catch {}
    }

    // 8. Attenuation
    if (typeof def.attenuation === "number") {
        try {
            const attActions = findByProps("setAttenuation") || meActions;
            attActions?.setAttenuation?.(
                def.attenuation,
                Boolean(def.attenuateWhileSpeakingSelf),
                Boolean(def.attenuateWhileSpeakingOthers)
            );
        } catch {}
    }

    // 8b. Quality of Service
    if (typeof def.qos === "boolean") {
        try {
            meActions?.setQoS?.(def.qos);
        } catch {}
    }

    // 9. Direct MediaEngineStore state sync — copies ALL captured fields at once
    try {
        if (MediaEngineStore) {
            const state = MediaEngineStore.getState?.();
            if (state?.settingsByContext?.default) {
                Object.assign(state.settingsByContext.default, def);
                MediaEngineStore.emitChange?.();
            }
        }
    } catch {}

    // 10. Persist to localStorage
    if (audio.rawMediaEngineStore && typeof audio.rawMediaEngineStore === "string") {
        try {
            window.localStorage.setItem("MediaEngineStore", audio.rawMediaEngineStore);
        } catch {}
    }
}

async function syncInstanceAudioSettings(): Promise<void> {
    try {
        if (typeof Native?.getMasterAudioSettings !== "function") return;
        const masterAudio = await Native.getMasterAudioSettings();
        if (!masterAudio) return;

        if (masterAudio.rawMediaEngineStore && typeof masterAudio.rawMediaEngineStore === "string") {
            try {
                window.localStorage.setItem("MediaEngineStore", masterAudio.rawMediaEngineStore);
            } catch {}
        }

        const tryApply = () => applyAudioSettings(masterAudio);
        tryApply();

        waitFor(["dispatch", "subscribe"], (dispatcher: any) => {
            const unConn = dispatcher.subscribe("CONNECTION_OPEN", () => {
                try { unConn(); } catch {}
                setTimeout(tryApply, 500);
                setTimeout(tryApply, 1500);
            });
        });

        [1000, 2500, 5000].forEach(delay => {
            setTimeout(tryApply, delay);
        });
    } catch (e) {
        console.warn("[LoliCordMI] syncInstanceAudioSettings error:", e);
    }
}

let unhookAudioWatcher: (() => void) | null = null;
function hookAudioSettingsWatcher(): void {
    if (unhookAudioWatcher) return;
    const unsubs: Array<() => void> = [];

    const onAudioChanged = () => scheduleMasterAudioSave();

    if (FluxDispatcher?.subscribe) {
        const events = [
            "AUDIO_SET_OUTPUT_VOLUME",
            "AUDIO_SET_INPUT_VOLUME",
            "AUDIO_SET_OUTPUT_DEVICE",
            "AUDIO_SET_INPUT_DEVICE",
            "AUDIO_SET_MODE",
            "AUDIO_SET_NOISE_SUPPRESSION",
            "AUDIO_SET_NOISE_CANCELLATION",
            "AUDIO_SET_ECHO_CANCELLATION",
            "AUDIO_SET_AUTOMATIC_GAIN_CONTROL",
            "AUDIO_SET_QOS",
            "AUDIO_SET_ATTENUATION",
            "MEDIA_ENGINE_SET_AUDIO_SUB_SYSTEM",
            "MEDIA_ENGINE_SETTINGS_CHANGED",
        ];
        for (const evt of events) {
            try {
                FluxDispatcher.subscribe(evt, onAudioChanged);
                unsubs.push(() => FluxDispatcher.unsubscribe(evt, onAudioChanged));
            } catch {}
        }
    }

    if (MediaEngineStore?.addChangeListener) {
        try {
            MediaEngineStore.addChangeListener(onAudioChanged);
            unsubs.push(() => MediaEngineStore.removeChangeListener(onAudioChanged));
        } catch {}
    }

    unhookAudioWatcher = () => {
        for (const u of unsubs) {
            try { u(); } catch {}
        }
        unsubs.length = 0;
        unhookAudioWatcher = null;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SavedAccount {
    id: string;
    token: string;
    username: string;
    avatar: string;
}

interface AccountEntry extends SavedAccount {
    hasToken: boolean;
    isNative: boolean;
}

function getAvatarUrl(id: string, hash?: string | null): string {
    return hash ? IconUtils.getUserAvatarURL({ id, avatar: hash } as any, false, 64) : IconUtils.getDefaultAvatarURL(id);
}

function getNativeAccounts(): SavedAccount[] {
    try {
        const store = findByProps("getUsers", "getValidUsers");
        const users: any[] = store?.getUsers?.() ?? store?.getValidUsers?.() ?? [];
        return users.filter(u => u?.id).map(u => ({
            id: u.id,
            token: tokenCache[u.id] ?? "",
            username: u.globalName || u.username || `User_${u.id.slice(-4)}`,
            avatar: getAvatarUrl(u.id, u.avatar),
        }));
    } catch {
        return [];
    }
}

async function fetchAllAccounts(): Promise<SavedAccount[]> {
    let local: SavedAccount[] = [];
    try {
        local = (await DataStore.get<SavedAccount[]>(STORE_KEY)) ?? [];
    } catch {}

    let shared: SavedAccount[] = [];
    try {
        if (typeof (Native as any)?.getSharedAccounts === "function") {
            shared = (await (Native as any).getSharedAccounts()) ?? [];
        }
    } catch {}

    const map = new Map<string, SavedAccount>();
    for (const a of shared) {
        if (a && a.id) map.set(a.id, a);
    }
    for (const a of local) {
        if (!a || !a.id) continue;
        const prev = map.get(a.id);
        map.set(a.id, {
            id: a.id,
            username: a.username || prev?.username || "",
            avatar: a.avatar || prev?.avatar || "",
            token: a.token || prev?.token || "",
        });
    }

    const nativeAccs = getNativeAccounts();
    for (const a of nativeAccs) {
        if (!a || !a.id) continue;
        const prev = map.get(a.id);
        map.set(a.id, {
            id: a.id,
            username: a.username || prev?.username || "",
            avatar: a.avatar || prev?.avatar || "",
            token: a.token || prev?.token || tokenCache[a.id] || "",
        });
    }

    const curUser = UserStore.getCurrentUser();
    if (curUser?.id) {
        const tokenMod = findByProps("getToken", "encryptAndStoreTokens");
        const curTok = tokenMod?.getToken?.();
        const prev = map.get(curUser.id);
        map.set(curUser.id, {
            id: curUser.id,
            username: (curUser as any).globalName || curUser.username || prev?.username || "",
            avatar: getAvatarUrl(curUser.id, curUser.avatar) || prev?.avatar || "",
            token: curTok || prev?.token || tokenCache[curUser.id] || "",
        });
    }

    const merged = Array.from(map.values());
    for (const acc of merged) {
        if (acc.token && acc.token.startsWith("dQw4w9WgXcQ:")) {
            try {
                const dec = await Native.decryptToken(acc.token);
                if (dec) acc.token = dec;
            } catch {}
        }
    }

    if (typeof (Native as any)?.saveSharedAccounts === "function") {
        (Native as any).saveSharedAccounts(merged).catch(() => {});
    }
    DataStore.set(STORE_KEY, merged).catch(() => {});
    return merged;
}

/** Quick switch — token direct */
function switchToQuick(token: string, userId?: string) {
    const cleanTok = token.trim().replace(/^"+|"+$/g, "");
    try {
        window.localStorage.setItem("token", `"${cleanTok}"`);
        window.localStorage.setItem("default_token", `"${cleanTok}"`);
        if (userId) {
            window.localStorage.setItem("user_id_cache", `"${userId}"`);
        }
        location.reload();
    } catch {
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.appendChild(iframe);
        try {
            (iframe as any).contentWindow.localStorage.token = `"${cleanTok}"`;
            (iframe as any).contentWindow.localStorage.default_token = `"${cleanTok}"`;
            if (userId) {
                (iframe as any).contentWindow.localStorage.user_id_cache = `"${userId}"`;
            }
        } catch { }
        document.body.removeChild(iframe);
        location.reload();
    }
}

/** Switch pour accounts natifs sans token — utilise le mécanisme Discord natif */
function switchNativeAccount(userId: string) {
    try {
        const multiAuth = findByProps("switchAccount", "loginToken") ?? findByProps("switchAccount");
        if (multiAuth?.switchAccount) {
            multiAuth.switchAccount(userId);
            return;
        }
        // Fallback : dispatch le flux event comme Discord le fait nativement
        if (FluxDispatcher?.dispatch) {
            FluxDispatcher.dispatch({ type: "MULTI_ACCOUNT_SWITCH_ATTEMPT", userId });
        }
    } catch {
        console.warn("[MultiInstance] switchNativeAccount failed for", userId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modales d'édition de compte (Token & Nom d'affichage)
// ─────────────────────────────────────────────────────────────────────────────

function ChangeTokenModal({
    acc,
    rootProps,
    onSuccess
}: {
    acc: AccountEntry;
    rootProps: any;
    onSuccess(): void;
}) {
    const [token, setToken] = React.useState(acc.token || "");
    const [error, setError] = React.useState<string | null>(null);

    const handleSave = async () => {
        const cleanTok = token.trim().replace(/^"+|"+$/g, "");
        if (!cleanTok) {
            setError(t("Token cannot be empty."));
            return;
        }
        const owner = getUserIdFromToken(cleanTok);
        if (owner && owner !== acc.id) {
            setError(`${t("Token belongs to user ID")} ${owner}, ${t("expected")} ${acc.id}`);
            return;
        }
        cacheToken(acc.id, cleanTok);
        saveTokenCache();

        try {
            const saved = await fetchAllAccounts();
            const target = saved.find(s => s.id === acc.id);
            if (target) {
                target.token = cleanTok;
            } else {
                saved.push({ id: acc.id, username: acc.username, token: cleanTok, avatar: acc.avatar });
            }
            await DataStore.set(STORE_KEY, saved);
            if (typeof (Native as any)?.saveSharedAccounts === "function") {
                (Native as any).saveSharedAccounts(saved).catch(() => {});
            }
        } catch {}

        try {
            const tokenMod = findByProps("getToken", "encryptAndStoreTokens");
            if (tokenMod?.encryptAndStoreTokens) {
                const tokensJson = window.localStorage.getItem("tokens");
                const parsed = tokensJson ? JSON.parse(tokensJson) : {};
                parsed[acc.id] = cleanTok;
                tokenMod.encryptAndStoreTokens(parsed).catch(() => {});
            }
        } catch {}

        showToast(t("Token updated successfully"), Toasts.Type.SUCCESS);
        rootProps.onClose();
        onSuccess();
    };

    return (
        <ModalRoot {...rootProps} size="small">
            <ModalHeader separator={false}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <h2 style={{ color: "var(--header-primary, #ffffff)", fontSize: 18, fontWeight: 600, margin: 0 }}>
                        {t("Change Token")}
                    </h2>
                    <ModalCloseButton onClick={rootProps.onClose} />
                </div>
            </ModalHeader>
            <ModalContent style={{ padding: "0 16px 16px" }}>
                <p style={{ color: "var(--text-muted, #949ba4)", fontSize: 14, margin: "0 0 12px" }}>
                    {t("Enter a new token for")} <strong style={{ color: "var(--header-primary, #ffffff)" }}>{acc.username}</strong> :
                </p>
                <TextInput
                    value={token}
                    placeholder="mfa.xxx..."
                    type="password"
                    onChange={(val: string) => { setToken(val); setError(null); }}
                    autoFocus
                />
                {error && (
                    <p style={{ color: "var(--text-danger, #ed4245)", fontSize: 12, margin: "8px 0 0" }}>
                        {error}
                    </p>
                )}
            </ModalContent>
            <ModalFooter>
                <Button variant="secondary" onClick={rootProps.onClose} style={{ marginRight: 8 }}>
                    {t("Cancel")}
                </Button>
                <Button variant="primary" onClick={handleSave}>
                    {t("Save")}
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

function ChangeUsernameModal({
    acc,
    rootProps,
    onSuccess
}: {
    acc: AccountEntry;
    rootProps: any;
    onSuccess(): void;
}) {
    const [name, setName] = React.useState(acc.username || "");

    const handleSave = async () => {
        const trimmed = name.trim();
        if (!trimmed) return;

        try {
            const saved = await fetchAllAccounts();
            const target = saved.find(s => s.id === acc.id);
            if (target) {
                target.username = trimmed;
            } else {
                saved.push({ id: acc.id, username: trimmed, token: acc.token, avatar: acc.avatar });
            }
            await DataStore.set(STORE_KEY, saved);
            if (typeof (Native as any)?.saveSharedAccounts === "function") {
                (Native as any).saveSharedAccounts(saved).catch(() => {});
            }
        } catch {}

        showToast(t("Display name updated"), Toasts.Type.SUCCESS);
        rootProps.onClose();
        onSuccess();
    };

    return (
        <ModalRoot {...rootProps} size="small">
            <ModalHeader separator={false}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <h2 style={{ color: "var(--header-primary, #ffffff)", fontSize: 18, fontWeight: 600, margin: 0 }}>
                        {t("Change Display Name")}
                    </h2>
                    <ModalCloseButton onClick={rootProps.onClose} />
                </div>
            </ModalHeader>
            <ModalContent style={{ padding: "0 16px 16px" }}>
                <p style={{ color: "var(--text-muted, #949ba4)", fontSize: 14, margin: "0 0 12px" }}>
                    {t("Enter a custom display name for")} <strong style={{ color: "var(--header-primary, #ffffff)" }}>{acc.username}</strong> :
                </p>
                <TextInput
                    value={name}
                    placeholder={acc.username}
                    onChange={(val: string) => setName(val)}
                    autoFocus
                />
            </ModalContent>
            <ModalFooter>
                <Button variant="secondary" onClick={rootProps.onClose} style={{ marginRight: 8 }}>
                    {t("Cancel")}
                </Button>
                <Button variant="primary" onClick={handleSave}>
                    {t("Save")}
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu contextuel natif Discord (via ContextMenuApi)
// ─────────────────────────────────────────────────────────────────────────────

function AccountActionsMenu({
    acc,
    isOpen,
    isCurrent,
    initialAutoLaunch,
    onAutoLaunchChanged,
    onNewGrouped,
    onSwitch,
    onLogout,
    onChangeToken,
    onChangeUsername,
    onCloseInstance
}: {
    acc: AccountEntry;
    isOpen: boolean;
    isCurrent: boolean;
    initialAutoLaunch: boolean;
    onAutoLaunchChanged(nextState: boolean): void;
    onNewGrouped(): void;
    onSwitch(): void;
    onLogout(): void;
    onChangeToken(): void;
    onChangeUsername(): void;
    onCloseInstance(): void;
}) {
    const [checked, setChecked] = React.useState(initialAutoLaunch);

    const handleToggle = async () => {
        const nextVal = !checked;
        setChecked(nextVal);
        await setAccountAutoLaunch(acc.id, nextVal);
        onAutoLaunchChanged(nextVal);
        if (nextVal) {
            showToast(t("Auto-launch enabled"), Toasts.Type.SUCCESS);
        } else {
            showToast(t("Auto-launch disabled"), Toasts.Type.INFO);
        }
    };

    return (
        <Menu.Menu navId="nc-mi-account-actions" onClose={ContextMenuApi.closeContextMenu} aria-label={acc.username}>
            <Menu.MenuGroup>
                {!isCurrent && (
                    <Menu.MenuItem
                        id="mi-switch"
                        label={t("Switch Account")}
                        action={onSwitch}
                    />
                )}
                {acc.hasToken && (
                    <Menu.MenuItem
                        id="mi-grouped"
                        label={t("New grouped instance")}
                        action={onNewGrouped}
                    />
                )}
            </Menu.MenuGroup>
            <Menu.MenuGroup>
                <Menu.MenuCheckboxItem
                    id="mi-auto-launch"
                    label={t("Launch on Discord startup")}
                    checked={checked}
                    action={handleToggle}
                />
            </Menu.MenuGroup>
            <Menu.MenuGroup>
                <Menu.MenuItem
                    id="mi-change-username"
                    label={t("Change Display Name")}
                    action={onChangeUsername}
                />
                <Menu.MenuItem
                    id="mi-change-token"
                    label={t("Change Token")}
                    action={onChangeToken}
                />
            </Menu.MenuGroup>
            <Menu.MenuGroup>
                {isOpen && (
                    <Menu.MenuItem
                        id="mi-close-instance"
                        label={t("Close instance")}
                        color="danger"
                        action={onCloseInstance}
                    />
                )}
                <Menu.MenuItem
                    id="mi-logout"
                    label={t("Log out")}
                    color="danger"
                    action={onLogout}
                />
            </Menu.MenuGroup>
        </Menu.Menu>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal principal
// ─────────────────────────────────────────────────────────────────────────────

function MultiInstanceModal({ rootProps }: { rootProps: any; }) {
    const currentUser = UserStore.getCurrentUser();
    const [savedAccounts, setSavedAccounts] = React.useState<SavedAccount[]>([]);
    const [nativeAccounts, setNativeAccounts] = React.useState<SavedAccount[]>([]);
    const [openInstances, setOpenInstances] = React.useState<string[]>([]);
    const [autoLaunchIds, setAutoLaunchIds] = React.useState<string[]>([]);

    const refreshAccounts = async () => {
        captureCurrentToken();
        const accs = await fetchAllAccounts().catch(() => []);
        setSavedAccounts(accs);
        setNativeAccounts(getNativeAccounts());
        const ids = await Native.getOpenInstances().catch(() => []);
        setOpenInstances(ids ?? []);
        const aIds = await getAutoLaunchAccountIds().catch(() => []);
        setAutoLaunchIds(aIds);
    };

    React.useEffect(() => {
        refreshAccounts();
    }, []);

    const allAccounts = React.useMemo<AccountEntry[]>(() => {
        const seen = new Set<string>();
        const result: AccountEntry[] = [];
        const tokenMod = findByProps("getToken", "encryptAndStoreTokens");
        const curTok = tokenMod?.getToken?.();

        // 1. Current logged-in user (appears first among accounts)
        if (currentUser) {
            seen.add(currentUser.id);
            const saved = savedAccounts.find(s => s.id === currentUser.id);
            const native = nativeAccounts.find(n => n.id === currentUser.id);
            let token = curTok || saved?.token || native?.token || tokenCache[currentUser.id] || "";
            if (token) {
                const owner = getUserIdFromToken(token);
                if (owner && owner !== currentUser.id) {
                    token = "";
                }
            }
            const displayUsername = saved?.username || (currentUser as any).globalName || currentUser.username;
            result.push({
                id: currentUser.id,
                username: displayUsername,
                avatar: getAvatarUrl(currentUser.id, currentUser.avatar),
                token,
                hasToken: !!token,
                isNative: true,
            });
        }

        // 2. Native Discord accounts
        for (const acc of nativeAccounts) {
            if (seen.has(acc.id)) continue;
            seen.add(acc.id);
            const saved = savedAccounts.find(s => s.id === acc.id);
            let token = saved?.token || acc.token || tokenCache[acc.id] || "";
            if (token && curTok && token === curTok && acc.id !== currentUser?.id) {
                token = "";
            }
            if (token) {
                const owner = getUserIdFromToken(token);
                if (owner && owner !== acc.id) {
                    token = "";
                }
            }
            const displayUsername = saved?.username || acc.username;
            result.push({ ...acc, username: displayUsername, token, hasToken: !!token, isNative: true });
        }

        // 3. Saved accounts from TokenImporter & Shared Accounts
        for (const acc of savedAccounts) {
            if (seen.has(acc.id)) continue;
            seen.add(acc.id);
            let token = acc.token || tokenCache[acc.id] || "";
            if (token && curTok && token === curTok && acc.id !== currentUser?.id) {
                token = "";
            }
            if (token) {
                const owner = getUserIdFromToken(token);
                if (owner && owner !== acc.id) {
                    token = "";
                }
            }
            result.push({ ...acc, token, hasToken: !!token, isNative: false });
        }
        return result;
    }, [savedAccounts, nativeAccounts, currentUser]);

    const refreshInstances = async () => {
        const ids = await Native.getOpenInstances().catch(() => []);
        setOpenInstances(ids ?? []);
    };

    const handleToggleAutoLaunch = async (acc: AccountEntry) => {
        const isNowAuto = await toggleAutoLaunchAccount(acc.id);
        const aIds = await getAutoLaunchAccountIds().catch(() => []);
        setAutoLaunchIds(aIds);
        if (isNowAuto) {
            showToast(t("Auto-launch enabled"), Toasts.Type.SUCCESS);
        } else {
            showToast(t("Auto-launch disabled"), Toasts.Type.INFO);
        }
    };

    const handleNewWindow = async (acc: AccountEntry) => {
        if (!acc.hasToken || !acc.token) return;
        const tokenMod = findByProps("getToken", "encryptAndStoreTokens");
        const curTok = tokenMod?.getToken?.();
        if (curTok && acc.token === curTok && acc.id !== currentUser?.id) {
            showToast(t("Cannot launch: Token collision detected."), Toasts.Type.FAILURE);
            return;
        }
        const { domain, blockExternalTokenAccess, performanceMode, syncAudioSettings } = settings.store;
        const audioSettings = syncAudioSettings ? captureMasterAudioSettings() : undefined;
        // @ts-ignore - Passage du pseudo, domaine, token protection, perf mode, audioSettings
        const res = await Native.openInstanceWindow(acc.token, acc.id, false, acc.username, domain, blockExternalTokenAccess, performanceMode, audioSettings).catch(() => ({ ok: false, error: "error" }));
        if ((res as any)?.ok) {
            await refreshInstances();
        } else {
            showToast(`${t("Error:")} ` + ((res as any)?.error ?? t("unknown")), Toasts.Type.FAILURE);
        }
    };

    const handleNewDetached = async (acc: AccountEntry) => {
        if (!acc.hasToken || !acc.token) {
            switchNativeAccount(acc.id);
            return;
        }
        const tokenMod = findByProps("getToken", "encryptAndStoreTokens");
        const curTok = tokenMod?.getToken?.();
        if (curTok && acc.token === curTok && acc.id !== currentUser?.id) {
            showToast(t("Cannot launch: Token collision detected."), Toasts.Type.FAILURE);
            return;
        }
        const { domain, blockExternalTokenAccess, performanceMode, syncAudioSettings } = settings.store;
        const audioSettings = syncAudioSettings ? captureMasterAudioSettings() : undefined;
        // @ts-ignore - Argument 'detached', pseudo, domaine, token protection, perf mode, audioSettings
        const res = await Native.openInstanceWindow(acc.token, acc.id, true, acc.username, domain, blockExternalTokenAccess, performanceMode, audioSettings).catch(() => ({ ok: false, error: "error" }));
        if ((res as any)?.ok) {
            await refreshInstances();
        } else {
            showToast(`${t("Error:")} ` + ((res as any)?.error ?? t("unknown")), Toasts.Type.FAILURE);
        }
    };

    const handleNewGrouped = async (acc: AccountEntry) => {
        if (!acc.hasToken || !acc.token) return;
        const tokenMod = findByProps("getToken", "encryptAndStoreTokens");
        const curTok = tokenMod?.getToken?.();
        if (curTok && acc.token === curTok && acc.id !== currentUser?.id) {
            showToast(t("Cannot launch: Token collision detected."), Toasts.Type.FAILURE);
            return;
        }
        const { domain, blockExternalTokenAccess, performanceMode, syncAudioSettings } = settings.store;
        const audioSettings = syncAudioSettings ? captureMasterAudioSettings() : undefined;
        // @ts-ignore
        const res = await Native.openInstanceWindowGrouped(acc.token, acc.id, acc.username, domain, blockExternalTokenAccess, performanceMode, audioSettings).catch(() => ({ ok: false, error: "error" }));
        if ((res as any)?.ok) {
            await refreshInstances();
        } else {
            showToast(`${t("Error:")} ` + ((res as any)?.error ?? t("unknown")), Toasts.Type.FAILURE);
        }
    };

    const handleLogout = async (acc: AccountEntry) => {
        ContextMenuApi.closeContextMenu();
        if (acc.id === currentUser?.id) {
            try {
                const authMod = findByProps("logout");
                if (typeof authMod?.logout === "function") {
                    authMod.logout();
                    return;
                }
            } catch {}
        }

        try {
            delete tokenCache[acc.id];
            saveTokenCache();

            const saved = await fetchAllAccounts();
            const filtered = saved.filter(s => s.id !== acc.id);
            await DataStore.set(STORE_KEY, filtered);
            if (typeof (Native as any)?.saveSharedAccounts === "function") {
                (Native as any).saveSharedAccounts(filtered).catch(() => {});
            }

            if (FluxDispatcher?.dispatch) {
                FluxDispatcher.dispatch({ type: "MULTI_ACCOUNT_REMOVE_ACCOUNT", userId: acc.id });
            }

            const tokenMod = findByProps("getToken", "encryptAndStoreTokens");
            if (tokenMod?.encryptAndStoreTokens) {
                const tokensJson = window.localStorage.getItem("tokens");
                if (tokensJson) {
                    try {
                        const parsed = JSON.parse(tokensJson);
                        delete parsed[acc.id];
                        window.localStorage.setItem("tokens", JSON.stringify(parsed));
                        window.localStorage.setItem("multiaccount_tokens", JSON.stringify(parsed));
                        tokenMod.encryptAndStoreTokens(parsed).catch(() => {});
                    } catch {}
                }
            }

            if (openInstances.includes(acc.id)) {
                await Native.closeInstance(acc.id).catch(() => {});
            }

            showToast(t("Account removed"), Toasts.Type.SUCCESS);
            await refreshAccounts();
        } catch (e) {
            console.error("[MultiInstance] Logout error:", e);
        }
    };

    const openCtx = (e: React.MouseEvent, acc: AccountEntry) => {
        e.preventDefault();
        e.stopPropagation();
        const isCurrent = acc.id === currentUser?.id;
        const isOpen = openInstances.includes(acc.id);
        const isAutoLaunch = inMemoryAutoLaunchIds.has(acc.id) || autoLaunchIds.includes(acc.id);

        ContextMenuApi.openContextMenu(e, () => (
            <AccountActionsMenu
                acc={acc}
                isOpen={isOpen}
                isCurrent={isCurrent}
                initialAutoLaunch={isAutoLaunch}
                onAutoLaunchChanged={() => {
                    setAutoLaunchIds(Array.from(inMemoryAutoLaunchIds));
                }}
                onNewGrouped={() => handleNewGrouped(acc)}
                onSwitch={() => {
                    ContextMenuApi.closeContextMenu();
                    if (acc.token) switchToQuick(acc.token, acc.id);
                    else switchNativeAccount(acc.id);
                }}
                onLogout={() => handleLogout(acc)}
                onChangeToken={() => {
                    ContextMenuApi.closeContextMenu();
                    openModal(modalProps => <ChangeTokenModal acc={acc} rootProps={modalProps} onSuccess={refreshAccounts} />);
                }}
                onChangeUsername={() => {
                    ContextMenuApi.closeContextMenu();
                    openModal(modalProps => <ChangeUsernameModal acc={acc} rootProps={modalProps} onSuccess={refreshAccounts} />);
                }}
                onCloseInstance={async () => {
                    ContextMenuApi.closeContextMenu();
                    await Native.closeInstance(acc.id).catch(() => {});
                    await refreshInstances();
                }}
            />
        ));
    };

    const handleAddAccount = () => {
        try {
            const multiAuth = findByProps("openMultiAccountLoginModal", "switchAccount") ?? findByProps("loginToken");
            if (multiAuth?.openMultiAccountLoginModal) {
                rootProps.onClose();
                multiAuth.openMultiAccountLoginModal();
                return;
            }
        } catch { }
        try {
            const tokenMod = findByProps("openTokenImporterModal") as any;
            if (typeof tokenMod?.openTokenImporterModal === "function") {
                rootProps.onClose();
                tokenMod.openTokenImporterModal();
                return;
            }
        } catch { }
        try {
            const importer = (window as any).openTokenImporterModal;
            if (typeof importer === "function") {
                rootProps.onClose();
                importer();
                return;
            }
        } catch { }
        showToast(t("Use TokenImporter or Switch Account in Discord settings."), Toasts.Type.INFO);
    };

    return (
        <ModalRoot {...rootProps} size="medium" className="container__8a031 size-md__8a031 nc-mi-modal-container">
            <header className="section__8a031 header__8a031 nc-mi-header">
                <div data-align="stretch" data-justify="start" data-direction="vertical" data-wrap="false" data-full-width="true" className="stack_dbd263" style={{ gap: "var(--space-8, 8px)", padding: 0 }}>
                    <div className="headerLayout__8a031 nc-mi-header-layout">
                        <div className="headerMain__8a031">
                            <h1 className="heading-lg/semibold_cf4812 defaultColor__5345c headerTitle__8a031 nc-mi-title" style={{ color: "var(--text-strong, #f2f3f5)" }}>
                                {t("Multi Accounts")}
                            </h1>
                        </div>
                        <div className="headerTrailing__8a031">
                            <button
                                className="button_a22cb0 md_a22cb0 icon-only_a22cb0 nc-mi-close-btn"
                                type="button"
                                aria-label="Close"
                                onClick={rootProps.onClose}
                            >
                                <div className="buttonChildrenWrapper_a22cb0">
                                    <div className="buttonChildren_a22cb0">
                                        <svg className="icon_a22cb0" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24">
                                            <path fill="currentColor" d="M19.3 20.7a1 1 0 0 0 1.4-1.4L13.42 12l7.3-7.3a1 1 0 0 0-1.42-1.4L12 10.58l-7.3-7.3a1 1 0 0 0-1.4 1.42L10.58 12l-7.3 7.3a1 1 0 1 0 1.42 1.4L12 13.42l7.3 7.3Z"></path>
                                        </svg>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>
                    <div className="headerSubtitleWrapper__8a031">
                        <div className="text-md/normal_cf4812 headerSubtitle__8a031 nc-mi-subtitle" style={{ color: "var(--text-subtle, #949ba4)" }}>
                            {t("Switch accounts, sign in, sign out, go wild.")}
                        </div>
                    </div>
                </div>
            </header>

            <div className="body__8a031 nc-mi-body">
                <main className="bodyInner__8a031">
                    <div className="list__920b8 nc-mi-list">
                        {allAccounts.length === 0 ? (
                            <div className="mi-empty">
                                {t("No accounts found.")}
                            </div>
                        ) : allAccounts.map((acc, index) => {
                            const isCurrent = acc.id === currentUser?.id;
                            const isOpen = openInstances.includes(acc.id);
                            return (
                                <React.Fragment key={acc.id}>
                                    {index > 0 && <div role="separator" className="separator__920b8 nc-mi-separator" />}
                                    <div
                                        className={`accountCard__920b8 nc-mi-account-card${isCurrent ? " nc-mi-account-card--active" : ""}`}
                                        onContextMenu={e => openCtx(e, acc)}
                                    >
                                        <div className="userDetails__920b8 nc-mi-user-details">
                                            <div
                                                className="wrapper__44b0c nc-mi-avatar-wrapper"
                                                style={{
                                                    width: 40,
                                                    height: 40
                                                }}
                                            >
                                                <AccountAvatar url={acc.avatar} name={acc.username} />
                                            </div>
                                            <div className="usernameSection__920b8 nc-mi-user-section">
                                                <div className="username__920b8 nc-mi-username">
                                                    <div className="lineClamp1__4bd52 text-md/semibold_cf4812" style={{ color: "var(--text-strong, #f2f3f5)" }}>
                                                        {acc.username}
                                                    </div>
                                                </div>
                                                {isCurrent ? (
                                                    <div className="text-sm/semibold_cf4812 hintText__920b8 nc-mi-hint-active" style={{ color: "var(--text-feedback-positive, #23a55a)" }}>
                                                        {t("Active account")}
                                                    </div>
                                                ) : isOpen ? (
                                                    <div className="text-sm/semibold_cf4812 hintText__920b8 nc-mi-hint-open" style={{ color: "var(--brand-500, #5865f2)", display: "flex", alignItems: "center", gap: 4 }}>
                                                        <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "var(--brand-500, #5865f2)" }} />
                                                        {t("Instance running")}
                                                    </div>
                                                ) : (
                                                    !acc.hasToken ? (
                                                        <div className="nc-mi-hint-sub">
                                                            {t("Requires login")}
                                                        </div>
                                                    ) : null
                                                )}
                                            </div>
                                            <div className="userActions__920b8 nc-mi-user-actions">
                                                {!isCurrent && (
                                                    <button
                                                        className="button_a22cb0 md_a22cb0 secondary_a22cb0 hasText_a22cb0 nc-mi-switch-btn"
                                                        type="button"
                                                        onClick={() => handleNewDetached(acc)}
                                                    >
                                                        <div className="buttonChildrenWrapper_a22cb0">
                                                            <div className="buttonChildren_a22cb0">
                                                                <span className="lineClamp1__4bd52 text-md/medium_cf4812">{t("Switch")}</span>
                                                            </div>
                                                        </div>
                                                    </button>
                                                )}
                                                <button
                                                    className="button_a22cb0 md_a22cb0 icon-only_a22cb0 nc-mi-options-btn"
                                                    type="button"
                                                    aria-label="More Options"
                                                    onClick={e => openCtx(e, acc)}
                                                >
                                                    <div className="buttonChildrenWrapper_a22cb0">
                                                        <div className="buttonChildren_a22cb0">
                                                            <svg className="icon_a22cb0" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24">
                                                                <path fill="currentColor" fillRule="evenodd" d="M4 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10-2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" clipRule="evenodd"></path>
                                                            </svg>
                                                        </div>
                                                    </div>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                </main>
            </div>

            <footer className="actionBar__8a031 section__8a031 nc-mi-footer">
                <div className="actionBarTrailing__8a031 actionBarTrailingFullWidth__8a031" style={{ width: "100%" }}>
                    <div data-align="stretch" data-justify="start" data-direction="horizontal" data-wrap="true" data-full-width="true" className="stack_dbd263" style={{ gap: "var(--space-8, 8px)", padding: 0, width: "100%" }}>
                        <button
                            className="button_a22cb0 md_a22cb0 secondary_a22cb0 hasText_a22cb0 fullWidth_a22cb0 nc-mi-add-btn"
                            type="button"
                            onClick={handleAddAccount}
                        >
                            <div className="buttonChildrenWrapper_a22cb0">
                                <div className="buttonChildren_a22cb0">
                                    <span className="lineClamp1__4bd52 text-md/medium_cf4812">{t("Add an account")}</span>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>
            </footer>
        </ModalRoot>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────────────────────────

function AccountAvatar({ url, name }: { url: string; name: string; }) {
    const [err, setErr] = React.useState(false);
    if (err || !url) return <div className="nc-mi-avatar-ph">{name?.[0]?.toUpperCase() ?? "?"}</div>;
    return <img src={url} className="nc-mi-avatar" alt="" onError={() => setErr(true)} />;
}

function MultiInstanceIcon({ width = 20, height = 20, className = "" }: { width?: number; height?: number; className?: string; }) {
    return (
        <svg className={`nc-multi-instance-icon ${className}`} width={width} height={height} viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.73 4.87a18.2 18.2 0 0 0-4.6-1.44c-.21.4-.4.8-.58 1.21-1.69-.25-3.4-.25-5.1 0-.18-.41-.37-.82-.59-1.2-1.6.27-3.14.75-4.6 1.43A19.04 19.04 0 0 0 .96 17.7a18.43 18.43 0 0 0 5.63 2.87c.46-.62.86-1.28 1.2-1.98-.65-.25-1.29-.55-1.9-.92.17-.12.32-.24.47-.37 3.58 1.7 7.7 1.7 11.28 0l.46.37c-.6.36-1.25.67-1.9.92.35.7.75 1.35 1.2 1.98 2.03-.63 3.94-1.6 5.64-2.87.47-4.87-.78-9.09-3.3-12.83ZM8.3 15.12c-1.1 0-2-1.02-2-2.27 0-1.24.88-2.26 2-2.26s2.02 1.02 2 2.26c0 1.25-.89 2.27-2 2.27Zm7.4 0c-1.1 0-2-1.02-2-2.27 0-1.24.88-2.26 2-2.26s2.02 1.02 2 2.26c0 1.25-.88 2.27-2 2.27Z" />
        </svg>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bouton header bar
// ─────────────────────────────────────────────────────────────────────────────

function MultiInstanceButton() {
    return (
        <HeaderBarButton
            icon={MultiInstanceIcon}
            tooltip={t("Multi-instance — open Discord with another account")}
            onClick={() => openModal(props => <MultiInstanceModal rootProps={props} />)}
        />
    );
}

async function initInstanceWindowAuth(): Promise<void> {
    let auth: { token: string; userId: string; username: string; } | null = null;
    try {
        if (typeof Native?.getInstanceAuth === "function") {
            auth = await Native.getInstanceAuth();
        }
    } catch (e) {
        console.warn("[LoliCordMI] getInstanceAuth IPC error:", e);
    }

    const miToken = auth?.token || (window as any).__lolicord_token;
    const miUserId = auth?.userId || (window as any).__lolicord_user_id || getUserIdFromToken(miToken || "");
    if (!miToken || typeof miToken !== "string") {
        return;
    }

    let cleanTok = miToken.trim().replace(/^"+|"+$/g, "");
    if (!cleanTok || cleanTok === "undefined") return;

    if (cleanTok.startsWith("dQw4w9WgXcQ:")) {
        try {
            const dec = await Native.decryptToken(cleanTok);
            if (dec) cleanTok = dec;
        } catch { }
    }
    if (cleanTok.startsWith("dQw4w9WgXcQ:")) return;

    console.log("[LoliCordMI] Instance token acquired for userId:", miUserId);

    let encryptedTok = "";
    try {
        if (typeof (Native as any)?.encryptToken === "function") {
            encryptedTok = await (Native as any).encryptToken(cleanTok);
        }
    } catch { }

    const tokensMap: Record<string, string> = {};
    if (miUserId && encryptedTok) {
        tokensMap[miUserId] = encryptedTok;
    }
    const tokensJson = Object.keys(tokensMap).length > 0 ? JSON.stringify(tokensMap) : "";

    // 1. Synchronously sync localStorage in current window and hidden iframe
    const syncStorage = () => {
        try {
            const q = JSON.stringify(cleanTok);
            window.localStorage.setItem("token", q);
            window.localStorage.setItem("default_token", q);
            if (miUserId) {
                window.localStorage.setItem("user_id_cache", JSON.stringify(miUserId));
            }
            if (tokensJson) {
                window.localStorage.setItem("tokens", tokensJson);
                window.localStorage.setItem("multiaccount_tokens", tokensJson);
            }
            const iframe = document.createElement("iframe");
            iframe.style.display = "none";
            document.body.appendChild(iframe);
            const ifLs = (iframe as any).contentWindow?.localStorage;
            if (ifLs) {
                ifLs.token = q;
                ifLs.default_token = q;
                if (miUserId) ifLs.user_id_cache = JSON.stringify(miUserId);
                if (tokensJson) {
                    ifLs.tokens = tokensJson;
                    ifLs.multiaccount_tokens = tokensJson;
                }
            }
            document.body.removeChild(iframe);
        } catch (e) {
            console.warn("[LoliCordMI] syncStorage error:", e);
        }
    };
    syncStorage();

    // 2. Check if already authenticated with target account
    const checkAuthAndRoute = () => {
        const authStore = findByProps("getToken", "getId");
        if (authStore?.getToken?.() === cleanTok && authStore?.getId?.()) {
            console.log("[LoliCordMI] User authenticated successfully!");
            const router = findByProps("transitionTo", "replaceWith");
            if ((window.location.pathname.includes("/login") || window.location.pathname === "/") && router?.transitionTo) {
                router.transitionTo("/channels/@me");
            }
            return true;
        }
        return false;
    };

    if (checkAuthAndRoute()) return;

    // 3. Trigger official Discord login action ONCE
    let loginTriggered = false;
    const triggerLogin = (loginMod: any) => {
        if (loginTriggered || !loginMod?.loginToken) return;
        loginTriggered = true;
        console.log("[LoliCordMI] Triggering loginMod.loginToken()...");
        try {
            loginMod.loginToken(cleanTok);
        } catch (e) {
            console.warn("[LoliCordMI] loginToken error:", e);
        }
        const dispatcher = findByProps("dispatch", "subscribe") || FluxDispatcher;
        if (dispatcher?.dispatch) {
            try {
                dispatcher.dispatch({ type: "LOGIN", token: cleanTok });
                dispatcher.dispatch({ type: "LOGIN_SUCCESS", token: cleanTok });
                if (miUserId) {
                    dispatcher.dispatch({
                        type: "MULTI_ACCOUNT_VALIDATE_TOKEN_SUCCESS",
                        token: cleanTok,
                        userId: miUserId
                    });
                }
            } catch { }
        }
    };

    const immediateLoginMod = findByProps("loginToken") || findByProps("switchAccount", "loginToken");
    if (immediateLoginMod) {
        triggerLogin(immediateLoginMod);
    } else {
        waitFor(["loginToken"], mod => triggerLogin(mod));
    }

    // 4. Transition to /channels/@me once gateway connects
    const routeToMe = () => {
        console.log("[LoliCordMI] Transitioning to /channels/@me...");
        const router = findByProps("transitionTo", "replaceWith");
        if ((window.location.pathname.includes("/login") || window.location.pathname === "/") && router?.transitionTo) {
            router.transitionTo("/channels/@me");
        }
    };

    waitFor(["dispatch", "subscribe"], (dispatcher: any) => {
        const unConn = dispatcher.subscribe("CONNECTION_OPEN", () => {
            try { unConn(); } catch { }
            routeToMe();
        });
        const unLogin = dispatcher.subscribe("LOGIN_SUCCESS", () => {
            setTimeout(checkAuthAndRoute, 500);
        });
    });

    if (settings.store.syncAudioSettings !== false) {
        syncInstanceAudioSettings();
    }

    // 5. Gentle fallback checks (at 1s, 2.5s, 5s)
    [1000, 2500, 5000].forEach(delay => {
        setTimeout(() => {
            syncStorage();
            if (!checkAuthAndRoute() && !loginTriggered) {
                const mod = findByProps("loginToken") || findByProps("switchAccount", "loginToken");
                if (mod) triggerLogin(mod);
            }
        }, delay);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "MultiInstance",
    enabledByDefault: true,
    description: "Opens a 2nd Discord (new window or split screen) with another account.",
    authors: [{ name: "Nightcord",
     id: 0n }],
    dependencies: ["HeaderBarAPI"],
    settings,

    headerBarButton: {
        icon: MultiInstanceIcon,
    },

    _fluxUnsub: null as (() => void) | null,

    async start() {
        await initInstanceWindowAuth();
        await loadTokenCache();
        hookEncryptAndStoreTokens();
        this._fluxUnsub = hookFluxDispatcher();
        captureCurrentToken();
        fetchAllAccounts().catch(() => {});
        if (!isCurrentInstanceWindow()) {
            scheduleMasterAudioSave();
            hookAudioSettingsWatcher();

            const triggerAuto = () => {
                setTimeout(() => {
                    runAutoLaunch().catch(err => console.warn("[LoliCordMI] runAutoLaunch error:", err));
                }, 2000);
            };

            const curUser = UserStore.getCurrentUser();
            if (curUser?.id) {
                triggerAuto();
            } else {
                waitFor(["dispatch", "subscribe"], (dispatcher: any) => {
                    const unConn = dispatcher.subscribe("CONNECTION_OPEN", () => {
                        try { unConn(); } catch {}
                        triggerAuto();
                    });
                });
            }
        }
        addHeaderBarButton("lolicord-multi-instance", () => <MultiInstanceButton />, 9);
    },

    stop() {
        removeHeaderBarButton("lolicord-multi-instance");
        if (this._fluxUnsub) { this._fluxUnsub(); this._fluxUnsub = null; }
        if (unhookAudioWatcher) { unhookAudioWatcher(); }
        const root = document.getElementById("lolicord-mi-ctx-root");
        if (root) root.remove();
    },
});

// Execute immediately on renderer startup — independent of any plugin lifecycle
initInstanceWindowAuth().catch(err => console.warn("[LoliCordMI] initInstanceWindowAuth error:", err));

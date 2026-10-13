/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { Settings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { getCloudUrl } from "./cloudSetup";
import { openModal } from "@utils/modal";
import { OAuth2AuthorizeModal } from "@webpack/common";

const logger = new Logger("SettingsSync:PluginSync", "#39b7e0");

const PLUGIN_TOKEN_KEY = "LoliCord_pluginSyncToken";

export async function getPluginSyncToken(): Promise<string | undefined> {
    return await DataStore.get<string>(PLUGIN_TOKEN_KEY);
}

export async function setPluginSyncToken(token: string) {
    await DataStore.set(PLUGIN_TOKEN_KEY, token);
}

export async function clearPluginSyncToken() {
    await DataStore.set(PLUGIN_TOKEN_KEY, undefined);
}

// ─── CORS-safe fetch helper ───────────────────────────────────────────────────
// Routes through Electron main-process net.fetch to bypass CORS on api.nightcord.st.
// Falls back to renderer fetch when running in web/browser context.
async function netFetch(url: string, opts?: { method?: string; headers?: Record<string, string>; body?: string; noCache?: boolean; }): Promise<{ ok: boolean; status: number; data: unknown; } | null> {
    const nf = (window as any).VencordNative?.lolicord?.netFetch;
    if (typeof nf === "function") {
        return nf(url, opts ?? {}) as Promise<{ ok: boolean; status: number; data: unknown; } | null>;
    }
    // Web fallback
    try {
        const res = await fetch(url, {
            method: opts?.method ?? "GET",
            headers: opts?.headers,
            body: opts?.body
        });
        let data: unknown;
        try { data = await res.json(); } catch { data = null; }
        return { ok: res.ok, status: res.status, data };
    } catch {
        return null;
    }
}

export async function beginDiscordOAuth(state?: string) {
    const url = new URL("/api/oauth2/signing", getCloudUrl());
    if (state) {
        url.searchParams.set("state", state);
    }

    const res = await netFetch(url.toString());
    if (!res?.ok) {
        throw new Error("Failed to create OAuth URL");
    }

    return res.data as { url: string; redirectUri: string; scopes: string[]; };
}

export async function checkOAuthToken(token: string) {
    const res = await netFetch(new URL(`/api/oauth2/check?token=${encodeURIComponent(token)}`, getCloudUrl()).toString());
    if (!res?.ok) return null;
    return res.data;
}

export async function getOwnPluginConfig(pluginName: string, token: string) {
    const res = await netFetch(new URL(`/api/sync/${encodeURIComponent(pluginName)}?token=${encodeURIComponent(token)}`, getCloudUrl()).toString());
    if (!res?.ok) {
        throw new Error("Failed to load plugin config");
    }
    return res.data;
}

export async function saveOwnPluginConfig(pluginName: string, token: string, settings: Record<string, unknown>) {
    const res = await netFetch(new URL(`/api/sync/${encodeURIComponent(pluginName)}`, getCloudUrl()).toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, settings })
    });
    if (!res?.ok) {
        throw new Error("Failed to save plugin config");
    }
    return res.data;
}

export async function getPublicPluginConfig(pluginName: string, userId: string) {
    const res = await netFetch(new URL(`/api/sync/${encodeURIComponent(pluginName)}/public?userId=${encodeURIComponent(userId)}`, getCloudUrl()).toString());
    if (!res?.ok) return null;
    return res.data;
}


export async function authorizePluginSync(): Promise<boolean> {
    if (await getPluginSyncToken()) {
        return true;
    }

    try {
        const { url, redirectUri, scopes } = await beginDiscordOAuth();
        const parsedUrl = new URL(url);
        const clientId = parsedUrl.searchParams.get("client_id");

        if (!clientId) {
            throw new Error("Missing client_id in OAuth URL");
        }

        return new Promise((resolve) => {
            openModal((props: any) => <OAuth2AuthorizeModal
                {...props}
                scopes={scopes}
                responseType="code"
                redirectUri={redirectUri}
                permissions={0n}
                clientId={clientId}
                cancelCompletesFlow={false}
                callback={async ({ location }: any) => {
                    if (!location) {
                        resolve(false);
                        return;
                    }

                    try {
                        const res = await fetch(location, {
                            headers: { Accept: "application/json" }
                        });
                        const data = await res.json();
                        
                        if (data.token) {
                            logger.info("Authorized plugin sync");
                            await setPluginSyncToken(data.token);
                            showNotification({
                                title: "Plugin Sync",
                                body: "Plugin sync is now authenticated!"
                            });
                            resolve(true);
                        } else {
                            logger.error("OAuth callback returned no token", data);
                            showNotification({
                                title: "Plugin Sync",
                                body: data.error ? `Setup failed: ${data.error}` : "Setup failed (no token returned)."
                            });
                            resolve(false);
                        }
                    } catch (e: any) {
                        logger.error("Failed to authorize plugin sync", e);
                        showNotification({
                            title: "Plugin Sync",
                            body: `Setup failed (${e.toString()}).`
                        });
                        resolve(false);
                    }
                }}
            />);
        });
    } catch (e: any) {
        logger.error("Failed to begin plugin sync OAuth", e);
        showNotification({
            title: "Plugin Sync",
            body: `Could not start setup (${e.toString()}).`
        });
        return false;
    }
}


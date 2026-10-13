/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Settings } from "@api/Settings";
import { getCloudAuth, getCloudUrl } from "@api/SettingsSync/cloudSetup";
import { decryptVault, EncryptedVaultEnvelope, encryptVault } from "./crypto";
import { exportTotpAccountsJson, importTotpAccountsJson, TotpAccount } from "./store";

export const TOTP_VAULT_DATASTORE_KEY = "lolicord_totp_encrypted_vault";
export const TOTP_VAULT_METADATA_KEY = "lolicord_totp_vault_meta";

export interface VaultMetadata {
    lastSynced: number;
    accountCount: number;
    hasCloudBackup: boolean;
}

export async function getLocalVaultEnvelope(): Promise<EncryptedVaultEnvelope | null> {
    return await DataStore.get<EncryptedVaultEnvelope>(TOTP_VAULT_DATASTORE_KEY) ?? null;
}

export async function saveLocalVaultEnvelope(envelope: EncryptedVaultEnvelope | null): Promise<void> {
    if (envelope) {
        await DataStore.set(TOTP_VAULT_DATASTORE_KEY, envelope);
    } else {
        await DataStore.del(TOTP_VAULT_DATASTORE_KEY);
    }
}

export async function getVaultMetadata(): Promise<VaultMetadata> {
    const meta = await DataStore.get<VaultMetadata>(TOTP_VAULT_METADATA_KEY);
    if (meta) return meta;
    const envelope = await getLocalVaultEnvelope();
    return {
        lastSynced: envelope?.timestamp || 0,
        accountCount: 0,
        hasCloudBackup: !!envelope
    };
}

export async function updateVaultMetadata(meta: Partial<VaultMetadata>): Promise<void> {
    const curr = await getVaultMetadata();
    await DataStore.set(TOTP_VAULT_METADATA_KEY, { ...curr, ...meta });
}

import {
    authorizePluginSync,
    checkOAuthToken as checkPluginSyncOAuthToken,
    getPluginSyncToken
} from "@api/SettingsSync/pluginSync";
import { checkOAuthToken as checkRootOAuthToken, getStoredToken } from "@api/OAuth2";
import { putCloudSettings } from "@api/SettingsSync/cloudSync";

// The Nightcord PluginSync servers are no longer used: the vault syncs through the
// configured settings cloud only, and always stays available locally.
const API_BASES: string[] = [];
const PLUGIN_KEYS = ["totp-manager", "totpManager", "totp_manager"];

// ─── CORS-safe fetch helper ───────────────────────────────────────────────────
// Routes calls through Electron's main-process net.fetch to bypass CORS
// restrictions. Falls back to renderer fetch on web (non-Electron) contexts.
async function netFetch(url: string, opts?: { method?: string; headers?: Record<string, string>; body?: string; }): Promise<{ ok: boolean; status: number; data: unknown; } | null> {
    const nf = (window as any).VencordNative?.lolicord?.netFetch;
    if (typeof nf === "function") {
        return nf(url, opts ?? {}) as Promise<{ ok: boolean; status: number; data: unknown; } | null>;
    }
    try {
        const res = await fetch(url, { method: opts?.method ?? "GET", headers: opts?.headers, body: opts?.body });
        let data: unknown;
        try { data = await res.json(); } catch { data = null; }
        return { ok: res.ok, status: res.status, data };
    } catch {
        return null;
    }
}


/**
 * Retrieves a valid OAuth2 session token for LoliCord Cloud.
 */
export async function getValidCloudToken(promptAuth = false): Promise<string | null> {
    // 1. Check all token storage keys
    let token = await getPluginSyncToken();
    if (!token) {
        token = (await getStoredToken()) || undefined;
    }
    if (!token) {
        token = (await DataStore.get<string>("lolicord_oauth_token")) || undefined;
    }

    if (token) {
        try {
            const check = (await checkPluginSyncOAuthToken(token)) || (await checkRootOAuthToken(token));
            if (check && !check.error) {
                return token;
            }
        } catch {
            // Check network error - token might still be valid
            return token;
        }
    }

    if (promptAuth) {
        const ok = await authorizePluginSync();
        if (ok) {
            return (await getPluginSyncToken()) || (await getStoredToken()) || null;
        }
    }

    return token || null;
}

// ─── Cloud Remote Interaction ───────────────────────────────────────────────────

export async function pushEncryptedVaultToCloud(envelope: EncryptedVaultEnvelope): Promise<boolean> {
    await saveLocalVaultEnvelope(envelope);

    let uploaded = false;

    // 1. Direct PluginSync API (CORS-safe via netFetch)
    try {
        const token = await getValidCloudToken(false);
        if (token) {
            for (const base of API_BASES) {
                for (const key of PLUGIN_KEYS) {
                    try {
                        const res = await netFetch(`${base}/api/sync/${encodeURIComponent(key)}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                token,
                                private: true,
                                settings: {
                                    private: true,
                                    version: 1,
                                    ...envelope
                                }
                            })
                        });
                        if (res?.ok) {
                            uploaded = true;
                            break;
                        }
                    } catch {}
                }
                if (uploaded) break;
            }
        }
    } catch (e) {
        console.warn("[TotpManager] PluginSync upload fallback:", e);
    }

    // 2. Direct Vault endpoint (/v2/totp/vault)
    if (Settings.cloud?.authenticated) {
        try {
            const auth = await getCloudAuth();
            const cloudUrl = getCloudUrl();
            const res = await netFetch(new URL("/v2/totp/vault", cloudUrl).toString(), {
                method: "PUT",
                headers: {
                    Authorization: auth,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(envelope)
            });
            if (res?.ok) uploaded = true;
        } catch {}

        // 3. Trigger global SettingsSync v2 upload
        try {
            await putCloudSettings();
        } catch {}
    }
    return uploaded;
}

export async function pullEncryptedVaultFromCloud(): Promise<EncryptedVaultEnvelope | null> {
    // 1. Try Direct PluginSync API — CORS-safe via netFetch
    try {
        const token = await getValidCloudToken(false);
        if (token) {
            for (const base of API_BASES) {
                for (const key of PLUGIN_KEYS) {
                    try {
                        const res = await netFetch(`${base}/api/sync/${encodeURIComponent(key)}?token=${encodeURIComponent(token)}`);
                        if (res?.ok) {
                            const data = res.data as any;
                            const settingsObj = data?.config?.settings || data?.config || data?.settings || data;
                            if (settingsObj && settingsObj.ciphertext) {
                                const envelope: EncryptedVaultEnvelope = {
                                    version: settingsObj.version || 1,
                                    salt: settingsObj.salt,
                                    aesIv: settingsObj.aesIv,
                                    chachaNonce: settingsObj.chachaNonce || settingsObj.chachaIv || "",
                                    ciphertext: settingsObj.ciphertext,
                                    iterations: settingsObj.iterations || 600000,
                                    timestamp: settingsObj.timestamp || Date.now()
                                };
                                await saveLocalVaultEnvelope(envelope);
                                return envelope;
                            }
                        }
                    } catch {}
                }
            }
        }
    } catch (e) {
        console.warn("[TotpManager] PluginSync pull fallback:", e);
    }

    // 2. Try Direct Vault endpoint (/v2/totp/vault)
    if (Settings.cloud?.authenticated) {
        try {
            const auth = await getCloudAuth();
            const cloudUrl = getCloudUrl();
            const res = await netFetch(new URL("/v2/totp/vault", cloudUrl).toString(), {
                method: "GET",
                headers: { Authorization: auth }
            });
            if (res?.ok) {
                const envelope = res.data as EncryptedVaultEnvelope;
                if (envelope?.ciphertext) {
                    await saveLocalVaultEnvelope(envelope);
                    return envelope;
                }
            }
        } catch {}
    }

    // 3. Fallback to local DataStore vault
    return await getLocalVaultEnvelope();
}

// ─── High-Level Sync Operations ───────────────────────────────────────────────

/**
 * Encrypts current local accounts with user Master Password and syncs to LoliCord Cloud.
 */
export async function syncAccountsToCloud(masterPassword: string): Promise<VaultMetadata> {
    const rawJson = await exportTotpAccountsJson();
    const accounts: TotpAccount[] = JSON.parse(rawJson);

    const envelope = await encryptVault(rawJson, masterPassword);
    await pushEncryptedVaultToCloud(envelope);

    const meta: VaultMetadata = {
        lastSynced: Date.now(),
        accountCount: accounts.length,
        hasCloudBackup: true
    };
    await updateVaultMetadata(meta);
    return meta;
}

/**
 * Pulls and decrypts accounts from LoliCord Cloud using the Master Password and restores them into local store.
 */
export async function restoreAccountsFromCloud(masterPassword: string): Promise<number> {
    const envelope = await pullEncryptedVaultFromCloud();
    if (!envelope) {
        throw new Error("NO_VAULT_FOUND");
    }

    const decryptedJson = await decryptVault(envelope, masterPassword);
    const count = await importTotpAccountsJson(decryptedJson, true);

    await updateVaultMetadata({
        lastSynced: Date.now(),
        accountCount: count,
        hasCloudBackup: true
    });

    return count;
}

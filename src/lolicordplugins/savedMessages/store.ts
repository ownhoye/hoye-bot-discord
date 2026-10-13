/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { PluginNative } from "@utils/types";
import { FluxDispatcher } from "@webpack/common";

export const SAVED_MESSAGES_CHANNEL_ID = "888888888888888888";
export const SAVED_MESSAGES_USER_ID = "888888888888888880";

const DATASTORE_KEY = "lolicord_saved_messages_vault_v1";

export interface SavedAttachment {
    id: string;
    filename: string;
    contentType: string;
    size: number;
    dataUrl?: string;
    mediaId: string;
    width?: number;
    height?: number;
    isImage: boolean;
    isVideo: boolean;
    isAudio: boolean;
}

export interface SavedMessage {
    id: string;
    channel_id: string;
    content: string;
    timestamp: string;
    author: {
        id: string;
        username: string;
        discriminator: string;
        global_name: string;
        avatar: string;
        bot: boolean;
        system: boolean;
    };
    attachments: SavedAttachment[];
    embeds: any[];
    flags: number;
    isBot: boolean;
}

export interface SavedMessagesPayload {
    version: 1;
    messages: SavedMessage[];
    createdAt: number;
    updatedAt: number;
}

export const Native = (window as any).VencordNative?.pluginHelpers?.SavedMessages as PluginNative<typeof import("./native")> | undefined;

let savedMessagesCache: SavedMessage[] = [];
let isLoaded = false;
let loadPromise: Promise<SavedMessage[]> | null = null;

// High-speed Blob URL cache for instant image/video loading
export const mediaBlobUrlCache = new Map<string, string>();
const inFlightMediaReads = new Map<string, Promise<string>>();

export const storeListeners = new Set<() => void>();
export function notifyStoreChange() {
    storeListeners.forEach(fn => { try { fn(); } catch { } });
}

export function isMessagesLoaded(): boolean {
    return isLoaded;
}

export function isVaultUnlocked(): boolean {
    return true;
}

export function isVaultPasswordSet(): boolean {
    return false;
}

export async function checkVaultStatus(): Promise<{ isPasswordSet: boolean; isUnlocked: boolean }> {
    if (!isLoaded) {
        await loadSavedMessages();
    }
    return { isPasswordSet: false, isUnlocked: true };
}

export function getSavedMessages(): SavedMessage[] {
    return [...savedMessagesCache];
}

export function getDecryptedMessages(): SavedMessage[] {
    return [...savedMessagesCache];
}

// ─── Media & Blob URL Helpers (Instant GPU-accelerated rendering) ───────────

export function createBlobUrlFromData(data: string, contentType = "application/octet-stream"): string {
    if (!data) return "";
    if (data.startsWith("blob:")) return data.split(/[?#]/)[0];

    try {
        let cleanB64 = data;
        if (cleanB64.startsWith("data:")) {
            const commaIdx = cleanB64.indexOf(",");
            if (commaIdx !== -1) {
                const header = cleanB64.slice(0, commaIdx);
                const match = header.match(/data:([^;]+);base64/i);
                if (match?.[1]) contentType = match[1];
                cleanB64 = cleanB64.slice(commaIdx + 1);
            }
        }
        cleanB64 = cleanB64.replace(/\s+/g, "");

        const binaryString = atob(cleanB64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: contentType || "image/png" });
        return URL.createObjectURL(blob);
    } catch (e) {
        console.warn("[SavedMessages] createBlobUrlFromData error:", e);
        if (data.startsWith("data:")) return data.split(/[?#]/)[0];
        return `data:${contentType || "image/png"};base64,${data.replace(/\s+/g, "")}`;
    }
}

export async function loadAttachmentBlobUrl(att: SavedAttachment): Promise<string> {
    if (!att) return "";

    if (att.mediaId && mediaBlobUrlCache.has(att.mediaId)) {
        return mediaBlobUrlCache.get(att.mediaId)!;
    }
    if (att.id && mediaBlobUrlCache.has(att.id)) {
        return mediaBlobUrlCache.get(att.id)!;
    }

    if (att.dataUrl) {
        const blobUrl = createBlobUrlFromData(att.dataUrl, att.contentType);
        if (blobUrl) {
            if (att.mediaId) mediaBlobUrlCache.set(att.mediaId, blobUrl);
            if (att.id) mediaBlobUrlCache.set(att.id, blobUrl);
            return blobUrl;
        }
    }

    if (att.mediaId && Native?.readMediaFile) {
        if (inFlightMediaReads.has(att.mediaId)) {
            return inFlightMediaReads.get(att.mediaId)!;
        }
        const readTask = Native.readMediaFile(att.mediaId)
            .then(b64 => {
                if (b64) {
                    const blobUrl = createBlobUrlFromData(b64, att.contentType);
                    if (blobUrl) {
                        if (att.mediaId) mediaBlobUrlCache.set(att.mediaId, blobUrl);
                        if (att.id) mediaBlobUrlCache.set(att.id, blobUrl);
                        return blobUrl;
                    }
                }
                return "";
            })
            .catch(() => "")
            .finally(() => {
                inFlightMediaReads.delete(att.mediaId);
            });
        inFlightMediaReads.set(att.mediaId, readTask);
        return readTask;
    }

    return "";
}

export function getAttachmentUrl(att: SavedAttachment): string {
    if (!att) return "";

    if (att.mediaId && mediaBlobUrlCache.has(att.mediaId)) {
        return mediaBlobUrlCache.get(att.mediaId)!;
    }
    if (att.id && mediaBlobUrlCache.has(att.id)) {
        return mediaBlobUrlCache.get(att.id)!;
    }

    if (att.dataUrl) {
        const blobUrl = createBlobUrlFromData(att.dataUrl, att.contentType);
        if (blobUrl) {
            if (att.mediaId) mediaBlobUrlCache.set(att.mediaId, blobUrl);
            if (att.id) mediaBlobUrlCache.set(att.id, blobUrl);
            return blobUrl;
        }
    }

    // Trigger async load if not yet in cache
    loadAttachmentBlobUrl(att).then(url => {
        if (url) notifyStoreChange();
    });

    return "";
}

export async function preloadMediaAttachments(messages: SavedMessage[]): Promise<void> {
    if (!Array.isArray(messages)) return;

    const loadTasks: Promise<string>[] = [];

    for (const msg of messages) {
        for (const att of msg.attachments || []) {
            if (!att) continue;
            if ((att.mediaId && mediaBlobUrlCache.has(att.mediaId)) || (att.id && mediaBlobUrlCache.has(att.id))) {
                continue;
            }
            loadTasks.push(loadAttachmentBlobUrl(att));
        }
    }

    if (loadTasks.length > 0) {
        await Promise.allSettled(loadTasks);
    }
}

// ─── Direct Local Storage ───────────────────────────────────────────────────

export async function loadSavedMessages(force = false): Promise<SavedMessage[]> {
    if (isLoaded && !force) {
        await preloadMediaAttachments(savedMessagesCache);
        return [...savedMessagesCache];
    }

    if (loadPromise && !force) {
        return loadPromise;
    }

    loadPromise = (async () => {
        let loadedMessages: SavedMessage[] | null = null;

        try {
            if (Native?.readVaultFile) {
                const diskContent = await Native.readVaultFile();
                if (diskContent) {
                    try {
                        const parsed = JSON.parse(diskContent);
                        if (Array.isArray(parsed?.messages)) {
                            loadedMessages = parsed.messages;
                        } else if (Array.isArray(parsed)) {
                            loadedMessages = parsed;
                        }
                    } catch (err) {
                        console.error("[SavedMessages] Failed to parse vault file:", err);
                    }
                }
            }
        } catch { }

        if (!loadedMessages) {
            try {
                const dsContent = await DataStore.get<any>(DATASTORE_KEY);
                if (dsContent) {
                    if (Array.isArray(dsContent?.messages)) {
                        loadedMessages = dsContent.messages;
                    } else if (Array.isArray(dsContent)) {
                        loadedMessages = dsContent;
                    }
                }
            } catch { }
        }

        if (Array.isArray(loadedMessages)) {
            savedMessagesCache = loadedMessages;
        }

        await preloadMediaAttachments(savedMessagesCache);

        isLoaded = true;
        loadPromise = null;
        notifyStoreChange();
        return [...savedMessagesCache];
    })();

    return loadPromise;
}

async function persistCurrentMessages(): Promise<void> {
    const sanitizedMessages: SavedMessage[] = savedMessagesCache.map(msg => ({
        ...msg,
        attachments: (msg.attachments || []).map(att => ({
            id: att.id,
            filename: att.filename,
            contentType: att.contentType,
            size: att.size,
            mediaId: att.mediaId,
            width: att.width,
            height: att.height,
            isImage: att.isImage,
            isVideo: att.isVideo,
            isAudio: att.isAudio
        }))
    }));

    const payload: SavedMessagesPayload = {
        version: 1,
        messages: sanitizedMessages,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    const jsonStr = JSON.stringify(payload, null, 2);

    try {
        if (Native?.writeVaultFile) {
            await Native.writeVaultFile(jsonStr);
        }
    } catch { }

    try {
        await DataStore.set(DATASTORE_KEY, payload);
    } catch { }
}

function fileToBase64(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const res = reader.result as string;
            const commaIdx = res.indexOf(",");
            resolve(commaIdx !== -1 ? res.slice(commaIdx + 1) : res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function generateSnowflake(): string {
    const epoch = 1420070400000;
    const time = BigInt(Date.now() - epoch) << 22n;
    const rand = BigInt(Math.floor(Math.random() * 4194304));
    return (time | rand).toString();
}

export async function addSavedMessage(content: string, files: (File | Blob | any)[] = []): Promise<SavedMessage> {
    if (!isLoaded) {
        await loadSavedMessages();
    }

    const uniqueFiles: (File | Blob | any)[] = [];
    const seenFiles = new Set<any>();
    for (const f of files) {
        const actual = f?.file || f?.item?.file || f;
        if (actual && !seenFiles.has(actual)) {
            seenFiles.add(actual);
            uniqueFiles.push(f);
        }
    }

    const savedAttachments: SavedAttachment[] = [];
    const backgroundSaveTasks: Promise<void>[] = [];

    for (const f of uniqueFiles) {
        try {
            const actualFile: File | Blob = f.file || f.item?.file || f;
            const filename = (f.name || f.filename || (actualFile as File)?.name || "attachment").replace(/[^a-zA-Z0-9._-]/g, "_");
            const contentType = (actualFile as File)?.type || f.contentType || f.content_type || "application/octet-stream";
            const size = actualFile?.size || f.size || 0;

            const isImage = contentType.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(filename);
            const isVideo = contentType.startsWith("video/") || /\.(mp4|webm|mov|mkv)$/i.test(filename);
            const isAudio = contentType.startsWith("audio/") || /\.(mp3|ogg|wav|m4a|flac|aac)$/i.test(filename);

            const attId = generateSnowflake();
            const mediaId = `media_${Date.now()}_${attId}_${filename}`;

            // Create instantaneous native Blob URL directly from the File/Blob in 0ms!
            let blobUrl = "";
            if (actualFile instanceof Blob) {
                blobUrl = URL.createObjectURL(actualFile);
            } else if (typeof (f as any)?.dataUrl === "string") {
                blobUrl = createBlobUrlFromData((f as any).dataUrl, contentType);
            }

            if (blobUrl) {
                mediaBlobUrlCache.set(mediaId, blobUrl);
                mediaBlobUrlCache.set(attId, blobUrl);
            }

            let width: number | undefined;
            let height: number | undefined;
            if (isImage && typeof createImageBitmap === "function" && actualFile instanceof Blob) {
                try {
                    const bitmap = await Promise.race([
                        createImageBitmap(actualFile),
                        new Promise<null>(r => setTimeout(() => r(null), 120))
                    ]);
                    if (bitmap) {
                        width = bitmap.width;
                        height = bitmap.height;
                        bitmap.close();
                    }
                } catch { }
            }

            savedAttachments.push({
                id: attId,
                filename,
                contentType,
                size,
                dataUrl: blobUrl,
                mediaId,
                width,
                height,
                isImage,
                isVideo,
                isAudio
            });

            // Offload Base64 encoding and disk write asynchronously so UI renders in 0ms
            if (actualFile instanceof Blob && Native?.saveMediaFile) {
                backgroundSaveTasks.push(
                    fileToBase64(actualFile)
                        .then(b64 => Native.saveMediaFile!(mediaId, b64))
                        .then(() => { })
                        .catch(e => console.error("[SavedMessages] Background media save failed:", e))
                );
            }
        } catch (err) {
            console.error("[SavedMessages] Failed to process attachment:", err);
        }
    }

    const msgId = generateSnowflake();
    const timestamp = new Date().toISOString();

    const savedMsg: SavedMessage = {
        id: msgId,
        channel_id: SAVED_MESSAGES_CHANNEL_ID,
        content: content || "",
        timestamp,
        author: {
            id: SAVED_MESSAGES_USER_ID,
            username: "SavedMessages",
            discriminator: "0",
            global_name: "Saved Messages",
            avatar: "saved_messages_bot",
            bot: true,
            system: true
        },
        attachments: savedAttachments,
        embeds: [],
        flags: 0,
        isBot: true
    };

    savedMessagesCache.unshift(savedMsg);

    // Persist asynchronously in background without blocking message rendering
    Promise.allSettled(backgroundSaveTasks).then(() => persistCurrentMessages()).catch(() => { });

    return savedMsg;
}

export async function deleteSavedMessage(messageId: string): Promise<void> {
    if (!isLoaded) {
        await loadSavedMessages();
    }

    const target = savedMessagesCache.find(m => m.id === messageId);
    if (target?.attachments?.length) {
        for (const att of target.attachments) {
            try {
                if (att.mediaId && mediaBlobUrlCache.has(att.mediaId)) {
                    try { URL.revokeObjectURL(mediaBlobUrlCache.get(att.mediaId)!); } catch { }
                    mediaBlobUrlCache.delete(att.mediaId);
                }
                if (Native?.deleteMediaFile && att.mediaId) {
                    await Native.deleteMediaFile(att.mediaId);
                }
            } catch { }
        }
    }

    savedMessagesCache = savedMessagesCache.filter(m => m.id !== messageId);
    await persistCurrentMessages();
    notifyStoreChange();

    try {
        FluxDispatcher.dispatch({
            type: "MESSAGE_DELETE",
            channelId: SAVED_MESSAGES_CHANNEL_ID,
            id: messageId,
        });
    } catch { }
}

export async function clearAllSavedMessages(): Promise<void> {
    for (const msg of savedMessagesCache) {
        for (const att of msg.attachments || []) {
            try {
                if (att.mediaId && mediaBlobUrlCache.has(att.mediaId)) {
                    try { URL.revokeObjectURL(mediaBlobUrlCache.get(att.mediaId)!); } catch { }
                    mediaBlobUrlCache.delete(att.mediaId);
                }
                if (Native?.deleteMediaFile && att.mediaId) {
                    await Native.deleteMediaFile(att.mediaId);
                }
            } catch { }
        }
    }

    savedMessagesCache = [];
    await persistCurrentMessages();
    notifyStoreChange();

    try {
        FluxDispatcher.dispatch({
            type: "LOAD_MESSAGES_SUCCESS",
            channelId: SAVED_MESSAGES_CHANNEL_ID,
            messages: [],
            isBefore: false,
            isAfter: false,
            hasMoreBefore: false,
            hasMoreAfter: false,
            limit: 50,
        });
    } catch { }
}

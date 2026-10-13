/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, Toasts } from "@webpack/common";
import { DBSchema, IDBPDatabase, openDB } from "idb";

import { LoggedMessageJSON } from "./types";
import { getMessageStatus } from "./utils";
import { stripTransientRenderState } from "./utils/cleanUp";
import { DB_NAME, DB_VERSION } from "./utils/constants";
import { getAttachmentBlobUrl } from "./utils/saveImage";

export enum DBMessageStatus {
    DELETED = "DELETED",
    EDITED = "EDITED",
    GHOST_PINGED = "GHOST_PINGED",
}

export interface DBMessageRecord {
    message_id: string;
    channel_id: string;
    status: DBMessageStatus;
    message: LoggedMessageJSON;
}

export interface MLIDB extends DBSchema {
    messages: {
        key: string;
        value: DBMessageRecord;
        indexes: {
            by_channel_id: string;
            by_status: DBMessageStatus;
            by_timestamp: string;
            by_timestamp_and_message_id: [string, string];
        };
    };
}

export let db: IDBPDatabase<MLIDB> | null = null;
export const cachedMessages = new Map<string, LoggedMessageJSON>();

const MacDonald = 1000;
function setCachedMessage(id: string, msg: LoggedMessageJSON) {
    if (cachedMessages.size >= MacDonald) {
        const firstKey = cachedMessages.keys().next().value;
        if (firstKey !== undefined) cachedMessages.delete(firstKey);
    }
    cachedMessages.set(id, msg);
}

async function cacheRecords(records: DBMessageRecord[]) {
    for (const r of records) {
        cacheRecord(r);

        for (const att of r.message.attachments) {
            const blobUrl = await getAttachmentBlobUrl(att);
            if (blobUrl) {
                att.url = blobUrl + "#";
                att.proxy_url = blobUrl + "#";
            }
        }
    }
    return records;
}

async function cacheRecord(record?: DBMessageRecord | null) {
    if (!record) return record;

    stripTransientRenderState(record.message);
    setCachedMessage(record.message_id, record.message);
    return record;
}

let initPromise: Promise<void> | null = null;

export async function initIDB(): Promise<void> {
    if (db && db.objectStoreNames?.contains("messages")) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            const currentDb = await openDB<MLIDB>(DB_NAME);
            if (currentDb.objectStoreNames.contains("messages")) {
                db = currentDb;
                return;
            }

            const targetVer = (currentDb.version || 1) + 1;
            currentDb.close();

            db = await openDB<MLIDB>(DB_NAME, targetVer, {
                upgrade(database) {
                    if (!database.objectStoreNames.contains("messages")) {
                        const messageStore = database.createObjectStore("messages", { keyPath: "message_id" });
                        messageStore.createIndex("by_channel_id", "channel_id");
                        messageStore.createIndex("by_status", "status");
                        messageStore.createIndex("by_timestamp", "message.timestamp");
                        messageStore.createIndex("by_timestamp_and_message_id", ["channel_id", "message.timestamp"]);
                    }
                }
            });
        } catch (err) {
            console.warn("[MessageLoggerEnhanced] Failed to initialize IDB:", err);
            db = null;
        } finally {
            initPromise = null;
        }
    })();

    return initPromise;
}
initIDB();

async function ensureDbReady(): Promise<boolean> {
    if (!db || !db.objectStoreNames?.contains("messages")) {
        await initIDB();
    }
    return !!(db && db.objectStoreNames?.contains("messages"));
}

export async function hasMessageIDB(message_id: string) {
    if (cachedMessages.has(message_id)) return true;
    if (!(await ensureDbReady())) return false;
    try {
        return (await db!.count("messages", message_id)) > 0;
    } catch {
        return false;
    }
}

export async function countMessagesIDB() {
    if (!(await ensureDbReady())) return 0;
    try {
        return await db!.count("messages");
    } catch {
        return 0;
    }
}

export async function countMessagesByStatusIDB(status: DBMessageStatus) {
    if (!(await ensureDbReady())) return 0;
    try {
        return await db!.countFromIndex("messages", "by_status", status);
    } catch {
        return 0;
    }
}

export async function getAllMessagesIDB() {
    if (!(await ensureDbReady())) return [];
    try {
        return cacheRecords(await db!.getAll("messages"));
    } catch {
        return [];
    }
}

export async function getMessagesForChannelIDB(channel_id: string) {
    if (!(await ensureDbReady())) return [];
    try {
        return cacheRecords(await db!.getAllFromIndex("messages", "by_channel_id", channel_id));
    } catch {
        return [];
    }
}

export async function getMessageIDB(message_id: string) {
    if (!(await ensureDbReady())) return cacheRecord(null);
    try {
        return cacheRecord(await db!.get("messages", message_id));
    } catch {
        return cacheRecord(null);
    }
}

export async function getMessagesByStatusIDB(status: DBMessageStatus) {
    if (!(await ensureDbReady())) return [];
    try {
        return cacheRecords(await db!.getAllFromIndex("messages", "by_status", status));
    } catch {
        return [];
    }
}

export async function getOldestMessagesIDB(limit: number) {
    if (!(await ensureDbReady())) return [];
    try {
        return cacheRecords(await db!.getAllFromIndex("messages", "by_timestamp", undefined, limit));
    } catch {
        return [];
    }
}

export async function* iterateAllMessagesIDB(batchSize = 100) {
    if (!(await ensureDbReady())) return;
    let lastId: string | undefined;
    while (true) {
        try {
            const batch: DBMessageRecord[] = [];
            const tx = db!.transaction("messages");
            const range = lastId ? IDBKeyRange.lowerBound(lastId, true) : undefined;
            let cursor = await tx.store.openCursor(range);

            while (cursor && batch.length < batchSize) {
                batch.push(cursor.value);
                cursor = await cursor.continue();
            }

            if (batch.length === 0) break;

            lastId = batch[batch.length - 1].message_id;

            yield await cacheRecords(batch);

            if (batch.length < batchSize) break;
        } catch {
            break;
        }
    }
}

export async function getOlderThanTimestampIDB(timestamp: string) {
    if (!(await ensureDbReady())) return [];
    try {
        const tx = db!.transaction("messages", "readonly");
        const { store } = tx;
        const index = store.index("by_timestamp");

        const cursor = await index.openCursor(IDBKeyRange.upperBound(timestamp));

        if (!cursor) {
            return [];
        }

        const messages: DBMessageRecord[] = [];
        for await (const c of cursor) {
            messages.push(c.value);
        }

        return cacheRecords(messages);
    } catch {
        return [];
    }
}

export async function getOlderThanTimestampForGuildsIDB(timestamp: string, currentChannelId?: string, preserveCurrentChannel?: boolean) {
    const allOldMessages = await getOlderThanTimestampIDB(timestamp);
    return allOldMessages.filter(record => {
        const { message } = record;
        const channel = ChannelStore.getChannel(message.channel_id);
        const isGuildMessage = channel?.guild_id != null;
        const isCurrentChannel = preserveCurrentChannel && currentChannelId && message.channel_id === currentChannelId;
        return isGuildMessage && !isCurrentChannel;
    });
}

export async function getDateStortedMessagesByStatusIDB(newest: boolean, limit: number, status: DBMessageStatus) {
    if (!(await ensureDbReady())) return [];
    try {
        const tx = db!.transaction("messages", "readonly");
        const { store } = tx;
        const index = store.index("by_status");

        const direction = newest ? "prev" : "next";
        const cursor = await index.openCursor(IDBKeyRange.only(status), direction);

        if (!cursor) {
            return [];
        }

        const messages: DBMessageRecord[] = [];
        for await (const c of cursor) {
            messages.push(c.value);
            if (messages.length >= limit) break;
        }

        return cacheRecords(messages);
    } catch {
        return [];
    }
}

export async function getMessagesByChannelAndAfterTimestampIDB(channel_id: string, start: string) {
    if (!(await ensureDbReady())) return [];
    try {
        const tx = db!.transaction("messages", "readonly");
        const { store } = tx;
        const index = store.index("by_timestamp_and_message_id");

        const cursor = await index.openCursor(IDBKeyRange.bound([channel_id, start], [channel_id, "\uffff"]));

        if (!cursor) {
            return [];
        }

        const messages: DBMessageRecord[] = [];
        for await (const c of cursor) {
            messages.push(c.value);
        }

        return cacheRecords(messages);
    } catch {
        return [];
    }
}

export async function getMessagesByChannelBetweenTimestampsIDB(channel_id: string, start: string, end: string) {
    if (!(await ensureDbReady())) return [];
    try {
        const tx = db!.transaction("messages", "readonly");
        const { store } = tx;
        const index = store.index("by_timestamp_and_message_id");

        const cursor = await index.openCursor(IDBKeyRange.bound([channel_id, start], [channel_id, end], false, false));

        if (!cursor) {
            return [];
        }

        const messages: DBMessageRecord[] = [];
        for await (const c of cursor) {
            messages.push(c.value);
        }

        return cacheRecords(messages);
    } catch {
        return [];
    }
}

export async function addMessageIDB(message: LoggedMessageJSON, status: DBMessageStatus) {
    stripTransientRenderState(message);

    if (!(await ensureDbReady())) {
        setCachedMessage(message.id, message);
        return;
    }

    try {
        await db!.put("messages", {
            channel_id: message.channel_id,
            message_id: message.id,
            status,
            message,
        });
    } catch (err) {
        console.warn("[MessageLoggerEnhanced] addMessageIDB error:", err);
    }

    setCachedMessage(message.id, message);
}

export async function addMessagesBulkIDB(messages: LoggedMessageJSON[], status?: DBMessageStatus) {
    messages.forEach(stripTransientRenderState);

    if (!(await ensureDbReady())) {
        messages.forEach(message => setCachedMessage(message.id, message));
        return;
    }

    try {
        const tx = db!.transaction("messages", "readwrite");
        const { store } = tx;

        await Promise.all([
            ...messages.map(message => store.add({
                channel_id: message.channel_id,
                message_id: message.id,
                status: status ?? getMessageStatus(message),
                message,
            })),
            tx.done
        ]);
    } catch (err) {
        console.warn("[MessageLoggerEnhanced] addMessagesBulkIDB error:", err);
    }

    messages.forEach(message => setCachedMessage(message.id, message));
}

export async function deleteMessageIDB(message_id: string) {
    if (await ensureDbReady()) {
        try {
            await db!.delete("messages", message_id);
        } catch { }
    }
    cachedMessages.delete(message_id);
}

export async function deleteMessagesBulkIDB(message_ids: string[]) {
    if (await ensureDbReady()) {
        try {
            const tx = db!.transaction("messages", "readwrite");
            const { store } = tx;

            await Promise.all([...message_ids.map(id => store.delete(id)), tx.done]);
        } catch { }
    }
    message_ids.forEach(id => cachedMessages.delete(id));
}

export async function clearMessagesIDB(showToast = true) {
    cachedMessages.clear();
    if (await ensureDbReady()) {
        try {
            await db!.clear("messages");
        } catch { }
    }
    if (!showToast) return;

    Toasts.show({
        type: Toasts.Type.MESSAGE,
        message: "Cleared message log database and cache.",
        id: Toasts.genId()
    });
}

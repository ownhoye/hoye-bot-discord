/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import * as DataStore from "@api/DataStore";
import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { ModalCloseButton,ModalContent, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { definePluginSettings } from "@api/Settings";
import { findByProps, findByPropsLazy } from "@webpack";
import { ChannelStore, ContextMenuApi, FluxDispatcher, Forms, GuildStore, IconUtils, Menu, MessageStore, NavigationRouter, React, Select, SelectedChannelStore, showToast, Toasts, useCallback, useEffect, useMemo, UserStore, useState } from "@webpack/common";
import { Switch } from "@components/Switch";

import { t, useTranslation } from "../autoTranslateLoliCord";

// Stratégie de navigation alternative via Dispatcher
const navigateTo = (path: string) => {
    try {
        if (NavigationRouter?.transitionTo) return NavigationRouter.transitionTo(path);
        const Router = findByProps("transitionTo") || findByProps("push");
        if (Router?.transitionTo) return Router.transitionTo(path);
        if (Router?.push) return Router.push(path);

        // Dernier recours via le dispatcher
        FluxDispatcher.dispatch({
            type: "NAVIGATE_TO",
            path: path
        });
    } catch (e) {
        console.error("Navigation error", e);
    }
};

const VoiceStateActionCreators = findByPropsLazy("selectVoiceChannel", "connectToVoiceChannel");
const ClipboardModule = findByPropsLazy("copy", "copyLink");

type LogType =
    | "message_delete" | "message_edit"
    | "voice_join" | "voice_leave" | "voice_move"
    | "voice_mute" | "voice_deaf" | "voice_stream" | "voice_mute_mod"
    | "friend_add" | "friend_remove" | "friend_request" | "friend_request_cancel" | "unblock"
    | "block" | "guild_member_add" | "guild_member_remove" | "guild_ban" | "guild_unban"
    | "guild_timeout" | "guild_kick" | "user_disconnect" | "ping";

interface LogAttachment {
    url: string;
    proxy_url?: string;
    width?: number;
    height?: number;
    filename?: string;
    content_type?: string;
}

interface LogEntry {
    id: string; // Internal unique ID
    realId?: string; // Original ID (message, user, etc.)
    type: LogType;
    timestamp: number;
    timeStr: string;
    content: string;
    authorId?: string;
    authorName?: string;
    authorAvatar?: string | null;
    channelId?: string;
    channelName?: string;
    guildId?: string;
    guildName?: string;
    extra?: string;
    isMyVoice?: boolean;
    attachments?: LogAttachment[];
}

const MAX_LOGS = 10000;
const PAGE_SIZE = 40;
let logs: LogEntry[] = [];

// Track the user's current voice channel ID for "My Voice" filter
let myVoiceChannelId: string | null = null;
let logCount = 0;

const PERSISTENT_TYPES = new Set(["ping", "message_delete", "message_edit", "friend_add", "friend_remove", "friend_request", "friend_request_cancel", "block", "unblock"]);
const NOTIF_TYPES = new Set(["ping", "friend_add", "friend_remove", "friend_request", "friend_request_cancel", "block", "unblock"]);
const unreadLogEntries = new Set<LogEntry>();

export const settings = definePluginSettings({
    keepLogsOnRestart: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Don't Delete — Re-display all logged events after every app reload",
        restartNeeded: false,
    },
    ignoreBots: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Ignore Bots — Do not log message edits or deletions from bots and webhooks",
        restartNeeded: false,
    },
    maxLogsLimit: {
        type: OptionType.NUMBER,
        default: 0,
        description: "Max Logs Limit — Limit the maximum number of logs to retain (0 = Unlimited, no auto-deletion)",
        restartNeeded: false,
    },
});

const DATA_STORE_KEY = "LoliCord_EventLogs";
const MAX_PERSISTENT_LOGS = 1000;
const GUILD_CONFIG_STORE_KEY = "LoliCord_EventLogs_GuildConfig";

export interface GuildLogConfig {
    enabled?: boolean;     // default true
    messages?: boolean;    // default true
    voice?: boolean;       // default true
}

export type GuildConfigMap = Record<string, GuildLogConfig>;

let guildConfigs: GuildConfigMap = {};

async function loadGuildConfigs() {
    try {
        const saved = await DataStore.get<GuildConfigMap>(GUILD_CONFIG_STORE_KEY);
        if (saved && typeof saved === "object" && !Array.isArray(saved)) {
            guildConfigs = saved;
        }
    } catch (e) {
        console.error("[EventLogs] Error loading guild configs:", e);
    }
}

function saveGuildConfigs() {
    try {
        DataStore.set(GUILD_CONFIG_STORE_KEY, guildConfigs).catch(() => {});
    } catch {}
}

function getGuildConfig(guildId: string): { enabled: boolean; messages: boolean; voice: boolean; } {
    const cfg = guildConfigs[guildId];
    return {
        enabled: cfg?.enabled ?? true,
        messages: cfg?.messages ?? true,
        voice: cfg?.voice ?? true,
    };
}

function isGuildLoggingEnabled(guildId?: string): boolean {
    if (!guildId) return true;
    return getGuildConfig(guildId).enabled;
}

function isGuildMessagesEnabled(guildId?: string): boolean {
    if (!guildId) return true;
    const cfg = getGuildConfig(guildId);
    return cfg.enabled && cfg.messages;
}

function isGuildVoiceEnabled(guildId?: string): boolean {
    if (!guildId) return true;
    const cfg = getGuildConfig(guildId);
    return cfg.enabled && cfg.voice;
}

function formatTimestamp(ts: number): string {
    const d = new Date(ts);
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    const s = d.getSeconds().toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
}

async function loadPersistLogs() {
    try {
        // Clean up legacy settings.store.persistentLogs if present in settings.json
        const legacy = (settings.store as any).persistentLogs;
        if (legacy) {
            delete (settings.store as any).persistentLogs;
        }

        let saved = await DataStore.get<any[]>(DATA_STORE_KEY);
        if (!saved || !Array.isArray(saved) || saved.length === 0) {
            // Check if there was any legacy array in settings
            if (Array.isArray(legacy) && legacy.length > 0) {
                saved = legacy.slice(0, MAX_PERSISTENT_LOGS);
                DataStore.set(DATA_STORE_KEY, safeSanitizeLogs(saved)).catch(() => {});
            }
        }

        if (Array.isArray(saved) && saved.length > 0) {
            const capped = saved.slice(0, MAX_PERSISTENT_LOGS);
            const parsed: LogEntry[] = capped.map((l: any) => ({
                ...l,
                id: l.id || `${l.timestamp}_${logCount++}`,
                timeStr: formatTimestamp(l.timestamp)
            }));
            const seen = new Set(logs.map(l => `${l.timestamp}_${l.type}_${l.authorId || ""}_${l.content || ""}`));
            const fresh = parsed.filter(l => !seen.has(`${l.timestamp}_${l.type}_${l.authorId || ""}_${l.content || ""}`));
            logs = fresh.concat(logs).sort((a, b) => b.timestamp - a.timestamp);
            logCount = Math.max(logCount, logs.length);
            globalVersion++;
            for (const fn of updateListeners) {
                try { fn(); } catch { }
            }
        }
    } catch { }
}

function safeSanitizeLogs(arr: any[]): any[] {
    try {
        return JSON.parse(JSON.stringify(arr, (k, v) => {
            if (typeof v === "function" || typeof v === "symbol") return undefined;
            if (typeof v === "bigint") return v.toString();
            if (v instanceof Error) return { message: v.message };
            if (v instanceof Node) return undefined;
            return v;
        }));
    } catch {
        return [];
    }
}

function savePersistLogs() {
    try {
        const limit = settings.store.maxLogsLimit && settings.store.maxLogsLimit > 0
            ? Math.min(settings.store.maxLogsLimit, MAX_PERSISTENT_LOGS)
            : MAX_PERSISTENT_LOGS;
        const persistentFiltered = logs.filter(l => PERSISTENT_TYPES.has(l.type)).slice(0, limit);
        const toSave = persistentFiltered.map(l => {
            const { id, timeStr, ...rest } = l;
            return rest;
        });
        DataStore.set(DATA_STORE_KEY, safeSanitizeLogs(toSave)).catch(() => {});
    } catch { }
}

// Seul accountur de version — pas de snapshot, pas de copie
let globalVersion = 0;
const updateListeners = new Set<() => void>();

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        globalVersion++;
        for (const fn of updateListeners) {
            try { fn(); } catch { }
        }
        
        // Debounce actual localStorage save to 5 seconds to avoid freezing
        if (saveTimer === null) {
            saveTimer = setTimeout(() => {
                saveTimer = null;
                savePersistLogs();
            }, 5000);
        }
    }, 500);
}

function fmtNow(): string {
    const d = new Date();
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    const s = d.getSeconds().toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
}

function pushLog(entry: Omit<LogEntry, "id" | "timestamp" | "timeStr">) {
    const now = Date.now();
    const limit = settings.store.maxLogsLimit ?? 0;
    if (limit > 0 && logs.length >= limit) {
        logs.pop();
    }
    const newLog: LogEntry = { id: `${now}_${logCount++}`, timestamp: now, timeStr: fmtNow(), ...(entry as any) };
    logs.unshift(newLog);
    if (NOTIF_TYPES.has(newLog.type)) {
        unreadLogEntries.add(newLog);
        if (unreadLogEntries.size > 200) {
            const oldest = unreadLogEntries.values().next().value;
            if (oldest) unreadLogEntries.delete(oldest);
        }
    }
    scheduleFlush();
}

const getUser = (id?: string) => { try { return id ? UserStore?.getUser?.(id) : null; } catch { return null; } };
const getChannel = (id?: string) => { try { return id ? ChannelStore?.getChannel?.(id) : null; } catch { return null; } };
const getGuild = (id?: string) => { try { return id ? GuildStore?.getGuild?.(id) : null; } catch { return null; } };

function chInfo(channelId?: string) {
    const ch = getChannel(channelId); const g = getGuild(ch?.guild_id);
    return { channelId, channelName: ch?.name ?? channelId, guildId: ch?.guild_id, guildName: g?.name };
}
function uInfo(userId?: string) {
    const u = getUser(userId);
    return { authorId: userId, authorName: u?.globalName ?? u?.username ?? userId ?? "?", authorAvatar: u?.avatar ?? null };
}
function authorFrom(msg: any) {
    const id = msg?.author?.id ?? msg?.authorId;
    let name = msg?.author?.global_name ?? msg?.author?.username ?? "?";
    let av: string | null = msg?.author?.avatar ?? null;
    let isBot = Boolean(msg?.author?.bot || msg?.webhook_id || msg?.webhookId);
    if (id) {
        const u = getUser(id);
        if (u) {
            if (name === "?") name = u.globalName ?? u.username ?? name;
            if (!av) av = u.avatar ?? null;
            if (u.bot) isBot = true;
        }
    }
    return { authorId: id, authorName: name, authorAvatar: av, isBot };
}

const MSG_CACHE_MAX = 50000;
const MSG_CACHE_PURGE = 2000;

interface CachedMsg {
    content: string;
    authorId: string;
    authorName: string;
    authorAvatar: string | null;
    attachments: LogAttachment[];
}

const msgCache = new Map<string, CachedMsg>();

// Flag pour bloquer les purges du cache pendant le scroll (LOAD_MESSAGES_SUCCESS actif)
let isLoadingMessages = false;

function pruneMsgCache() {
    if (msgCache.size < MSG_CACHE_MAX) return;
    for (let i = 0; i < MSG_CACHE_PURGE; i++) {
        const firstKey = msgCache.keys().next().value;
        if (firstKey !== undefined) msgCache.delete(firstKey);
        else break;
    }
}

function cacheMsg(msg: any) {
    if (!msg?.id) return;
    if (!isLoadingMessages) pruneMsgCache();
    const a = authorFrom(msg);
    const rawAtts = msg.attachments || msg.attachments_cache || [];
    const attachments: LogAttachment[] = Array.isArray(rawAtts) ? rawAtts.map((att: any) => ({
        url: att.url || att.proxy_url || "",
        proxy_url: att.proxy_url || att.url || "",
        width: att.width,
        height: att.height,
        filename: att.filename || "file",
        content_type: att.content_type || att.contentType || ""
    })).filter(att => !!att.url) : [];

    const content = msg.content ?? "";

    msgCache.set(msg.id, {
        content,
        authorId: a.authorId ?? "",
        authorName: a.authorName,
        authorAvatar: a.authorAvatar,
        attachments
    });
}

const CFG: Record<LogType, { label: string; color: string; }> = {
    message_delete: { label: "Deleted", color: "#ed4245" },
    message_edit: { label: "Edited", color: "#faa61a" },
    voice_join: { label: "Voice +", color: "#3ba55c" },
    voice_leave: { label: "Voice -", color: "#747f8d" },
    voice_move: { label: "Moved", color: "#5865f2" },
    voice_mute: { label: "Mic", color: "#faa61a" },
    voice_deaf: { label: "Deaf", color: "#faa61a" },
    voice_stream: { label: "Stream", color: "#5865f2" },
    voice_mute_mod: { label: "Muted", color: "#ed4245" },
    friend_add: { label: "Friend +", color: "#3ba55c" },
    friend_remove: { label: "Friend -", color: "#ed4245" },
    friend_request: { label: "Request", color: "#5865f2" },
    friend_request_cancel: { label: "Cancelled", color: "#747f8d" },
    block: { label: "Blocked", color: "#ed4245" },
    unblock: { label: "Unblocked", color: "#3ba55c" },
    guild_member_add: { label: "Joined", color: "#3ba55c" },
    guild_member_remove: { label: "Left", color: "#ed4245" },
    guild_ban: { label: "Banned", color: "#ed4245" },
    guild_unban: { label: "Unbanned", color: "#3ba55c" },
    guild_timeout: { label: "Timeout", color: "#faa61a" },
    guild_kick: { label: "Kick", color: "#ed4245" },
    user_disconnect: { label: "Disconnected", color: "#747f8d" },
    ping: { label: "Ping", color: "#eb459f" },
};

const FRIENDS_SET = new Set(["friend_add", "friend_remove", "friend_request", "friend_request_cancel", "block", "unblock"]);
const GUILD_SET = new Set(["guild_member_add", "guild_member_remove", "guild_ban", "guild_unban", "guild_timeout", "guild_kick", "user_disconnect"]);

const avatarUrl = (userId: string, av?: string | null) =>
    av ? IconUtils.getUserAvatarURL({ id: userId, avatar: av } as any, false, 32) : IconUtils.getDefaultAvatarURL(userId);

function renderContent(text: string) {
    if (!text) return text;
    // Remplace les pings <@ID> ou <@!ID> par @pseudo
    return text.replace(/<@!?(\d+)>/g, (match, id) => {
        const u = getUser(id);
        return u ? `@${u.globalName || u.username}` : match;
    });
}

function isImg(att: LogAttachment): boolean {
    if (!att || !att.url) return false;
    const type = (att.content_type || "").toLowerCase();
    if (type.startsWith("image/")) return true;
    const url = att.url.toLowerCase();
    return /\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(url);
}

function isVideo(att: LogAttachment): boolean {
    if (!att || !att.url) return false;
    const type = (att.content_type || "").toLowerCase();
    if (type.startsWith("video/")) return true;
    const url = att.url.toLowerCase();
    return /\.(mp4|webm|mov|avi|mkv|ogg)($|\?)/i.test(url);
}

function LogRow({ e, onClose }: { e: LogEntry; onClose?: () => void; }) {
    const cfg = CFG[e.type] ?? { label: e.type, color: "#747f8d" };

    const onDoubleClick = () => {
        if (!e.channelId) return;

        try {
            // Pour le vocal
            if (e.type.startsWith("voice_")) {
                if (VoiceStateActionCreators?.selectVoiceChannel) {
                    VoiceStateActionCreators.selectVoiceChannel(e.channelId);
                } else if (VoiceStateActionCreators?.connectToVoiceChannel) {
                    VoiceStateActionCreators.connectToVoiceChannel(e.guildId, e.channelId);
                }
                onClose?.();
                return;
            }

            // Pour les messages et pings
            const guildId = e.guildId || "@me";
            const path = e.realId
                ? `/channels/${guildId}/${e.channelId}/${e.realId}`
                : `/channels/${guildId}/${e.channelId}`;

            if (NavigationRouter?.transitionTo) {
                NavigationRouter.transitionTo(path);
            } else {
                navigateTo(path);
            }
            onClose?.();
        } catch (err) {
            console.error("LoliCord Navigation Error:", err);
            navigateTo(e.realId ? `/channels/${e.guildId || "@me"}/${e.channelId}/${e.realId}` : `/channels/${e.guildId || "@me"}/${e.channelId}`);
            onClose?.();
        }
    };

    const copyToClipboard = (text: string) => {
        try {
            const el = document.createElement("textarea");
            el.value = text;
            el.style.position = "absolute";
            el.style.left = "-9999px";
            el.style.top = "0";
            document.body.appendChild(el);
            el.select();
            document.execCommand("copy");
            document.body.removeChild(el);
            return true;
        } catch (err) {
            console.error("[EventLogs] Copy failed:", err);
            return false;
        }
    };

    const onContextMenu = (event: React.MouseEvent) => {
        const user = e.authorId ? getUser(e.authorId) : null;
        const realUsername = user?.username || e.authorName;

        ContextMenuApi.openContextMenu(event as any, () => (
            <Menu.Menu navId="log-row-context" onClose={ContextMenuApi.closeContextMenu}>
                {e.authorId && (
                    <>
                        <Menu.MenuItem
                            id="open-profile"
                            label={t("Open Profile")}
                            action={() => {
                                const UserProfileModal = findByProps("openUserProfileModal") || findByProps("fetchProfile");
                                if (UserProfileModal?.openUserProfileModal) {
                                    UserProfileModal.openUserProfileModal({ userId: e.authorId });
                                } else {
                                    // Fallback navigation
                                    navigateTo(`/channels/@me/${e.authorId}`);
                                }
                            }}
                        />
                        <Menu.MenuSeparator />
                        <Menu.MenuItem
                            id="copy-user-id"
                            label={t("Copy User ID")}
                            action={() => {
                                if (copyToClipboard(String(e.authorId))) {
                                    showToast(t("User ID copied!"), Toasts.Type.SUCCESS);
                                }
                            }}
                        />
                        <Menu.MenuItem
                            id="copy-username"
                            label={t("Copy Username")}
                            action={() => {
                                if (copyToClipboard(String(realUsername))) {
                                    showToast(t("Username copied!"), Toasts.Type.SUCCESS);
                                }
                            }}
                        />
                    </>
                )}
                <Menu.MenuSeparator />
                {e.channelId && (
                    <Menu.MenuItem
                        id="copy-channel-id"
                        label={t("Copy Channel ID")}
                        action={() => {
                            if (copyToClipboard(String(e.channelId))) {
                                showToast(t("Channel ID copied!"), Toasts.Type.SUCCESS);
                            }
                        }}
                    />
                )}
            </Menu.Menu>
        ));
    };

    return (
        <div className="el-row"
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            style={{ cursor: e.channelId ? "pointer" : "default" }}>
            <div className="el-left">
                {e.authorId
                    ? <img src={avatarUrl(e.authorId, e.authorAvatar)} className="el-avatar" alt=""
                        loading="lazy"
                        onError={ev => { (ev.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    : <span className="el-icon-placeholder" />}
            </div>
            <div className="el-body">
                <div className="el-top">
                    <span className="el-badge" style={{ background: cfg.color }}>{t(cfg.label)}</span>
                    {e.authorName && e.authorName !== "?" && <span className="el-author">{e.authorName}</span>}
                    {e.channelName && <><span className="el-sep">·</span><span className="el-channel">#{e.channelName}</span></>}
                    {e.guildName && <span className="el-guild">{e.guildName}</span>}
                    <span className="el-time">{e.timeStr}</span>
                </div>
                {e.type === "message_delete" && (
                    <div className="el-msg el-msg--deleted">
                        <span className="el-msg-label">{t("Message:")} </span>
                        <div style={{ flex: 1, overflow: "hidden" }}>
                            <span>{renderContent(e.content)}</span>
                            {e.attachments && e.attachments.length > 0 && (
                                <div className="el-attachments">
                                    {e.attachments.map((att, i) => (
                                        <div key={i} className="el-attachment-item">
                                            {isImg(att) ? (
                                                <img
                                                    src={att.proxy_url || att.url}
                                                    alt={att.filename || "image"}
                                                    className="el-attachment-img"
                                                    onClick={ev => {
                                                        ev.stopPropagation();
                                                        window.open(att.url, "_blank");
                                                    }}
                                                    loading="lazy"
                                                />
                                            ) : isVideo(att) ? (
                                                <video
                                                    src={att.proxy_url || att.url}
                                                    className="el-attachment-video"
                                                    controls
                                                    preload="metadata"
                                                    onClick={ev => ev.stopPropagation()}
                                                    title={att.filename || "video"}
                                                />
                                            ) : (
                                                <a href={att.url} target="_blank" rel="noreferrer" className="el-attachment-link" onClick={ev => ev.stopPropagation()}>
                                                    📁 {att.filename || "file"}
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {e.type === "message_edit" && (
                    <div className="el-edit-wrap">
                        <div className="el-msg el-msg--before"><span className="el-msg-label">{t("Before:")} </span><span>{renderContent(e.extra || "?")}</span></div>
                        <div className="el-msg el-msg--after"><span className="el-msg-label">{t("After:")} </span><span>{renderContent(e.content || "—")}</span></div>
                        {e.attachments && e.attachments.length > 0 && (
                            <div className="el-attachments">
                                {e.attachments.map((att, i) => (
                                    <div key={i} className="el-attachment-item">
                                        {isImg(att) ? (
                                            <img
                                                src={att.proxy_url || att.url}
                                                alt={att.filename || "image"}
                                                className="el-attachment-img"
                                                onClick={ev => {
                                                    ev.stopPropagation();
                                                    window.open(att.url, "_blank");
                                                }}
                                                loading="lazy"
                                            />
                                        ) : isVideo(att) ? (
                                            <video
                                                src={att.proxy_url || att.url}
                                                className="el-attachment-video"
                                                controls
                                                preload="metadata"
                                                onClick={ev => ev.stopPropagation()}
                                                title={att.filename || "video"}
                                            />
                                        ) : (
                                            <a href={att.url} target="_blank" rel="noreferrer" className="el-attachment-link" onClick={ev => ev.stopPropagation()}>
                                                📁 {att.filename || "file"}
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {e.type !== "message_delete" && e.type !== "message_edit" && e.content && (
                    <div className="el-content-text">{renderContent(t(e.content))}</div>
                )}
            </div>
        </div>
    );
}

const FILTERS = [
    { key: "all", label: "All" }, { key: "delete", label: "Deleted" }, { key: "edit", label: "Edited" },
    { key: "vocal", label: "Voice" }, { key: "myvoice", label: "My Voice" }, { key: "friends", label: "Friends" }, { key: "ping", label: "Ping" },
    { key: "settings", label: "Setting" },
];

function applyFilter(entries: LogEntry[], f: string, q: string, guildId: string): LogEntry[] {
    let r: LogEntry[];
    if (f === "delete") r = entries.filter(l => l.type === "message_delete");
    else if (f === "edit") r = entries.filter(l => l.type === "message_edit");
    else if (f === "vocal") r = entries.filter(l => l.type.charCodeAt(0) === 118); // "v"oice_
    else if (f === "myvoice") {
        r = entries.filter(l => l.isMyVoice);
    }
    else if (f === "friends") r = entries.filter(l => FRIENDS_SET.has(l.type));
    else if (f === "guild") r = entries.filter(l => GUILD_SET.has(l.type));
    else if (f === "ping") r = entries.filter(l => l.type === "ping");
    else r = entries;

    if (guildId !== "all") {
        r = r.filter(l => l.guildId === guildId);
    }

    if (!q) return r;
    const lq = q.toLowerCase();
    return r.filter(l => {
        const authorNameLow = l.authorName?.toLowerCase() || "";
        return l.content?.toLowerCase().includes(lq) ||
            authorNameLow.includes(lq) ||
            l.channelName?.toLowerCase().includes(lq) ||
            l.realId?.includes(q) ||
            l.authorId?.includes(q);
    });
}

const MicIcon = () => (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
);

const MsgIcon = () => (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
        <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />
    </svg>
);

const SearchIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5, flexShrink: 0, marginLeft: 8 }}>
        <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </svg>
);

function LogsSettingsView() {
    const { t } = useTranslation();
    const [search, setSearch] = useState("");
    const [configVersion, setConfigVersion] = useState(0);

    const guilds = useMemo(() => {
        try {
            const raw = GuildStore.getGuilds() || {};
            const list = Object.values(raw) as any[];
            return list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        } catch {
            return [];
        }
    }, [configVersion]);

    const filteredGuilds = useMemo(() => {
        if (!search.trim()) return guilds;
        const q = search.toLowerCase();
        return guilds.filter(g => (g.name || "").toLowerCase().includes(q));
    }, [guilds, search]);

    const stats = useMemo(() => {
        let enabled = 0;
        for (const g of guilds) {
            if (getGuildConfig(g.id).enabled) enabled++;
        }
        return { total: guilds.length, enabled };
    }, [guilds, configVersion]);

    const updateGuild = (id: string, partial: Partial<GuildLogConfig>) => {
        const current = getGuildConfig(id);
        guildConfigs[id] = { ...current, ...partial };
        saveGuildConfigs();
        setConfigVersion(v => v + 1);
    };

    const handleEnableAll = () => {
        for (const g of guilds) {
            guildConfigs[g.id] = { enabled: true, messages: true, voice: true };
        }
        saveGuildConfigs();
        setConfigVersion(v => v + 1);
    };

    const handleDisableAll = () => {
        for (const g of guilds) {
            guildConfigs[g.id] = { enabled: false, messages: false, voice: false };
        }
        saveGuildConfigs();
        setConfigVersion(v => v + 1);
    };

    const handleToggleAllVoice = () => {
        const anyDisabled = guilds.some(g => getGuildConfig(g.id).enabled && !getGuildConfig(g.id).voice);
        const target = anyDisabled;
        for (const g of guilds) {
            const cur = getGuildConfig(g.id);
            guildConfigs[g.id] = { ...cur, voice: target };
        }
        saveGuildConfigs();
        setConfigVersion(v => v + 1);
    };

    const handleToggleAllMessages = () => {
        const anyDisabled = guilds.some(g => getGuildConfig(g.id).enabled && !getGuildConfig(g.id).messages);
        const target = anyDisabled;
        for (const g of guilds) {
            const cur = getGuildConfig(g.id);
            guildConfigs[g.id] = { ...cur, messages: target };
        }
        saveGuildConfigs();
        setConfigVersion(v => v + 1);
    };

    return (
        <div className="el-settings-view">
            <div className="el-settings-toolbar">
                <div className="el-settings-search-wrap">
                    <SearchIcon />
                    <input
                        className="el-search-input el-settings-search-input"
                        placeholder={t("Search servers...")}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button className="el-clear" onClick={() => setSearch("")}>✕</button>
                    )}
                </div>

                <div className="el-settings-actions">
                    <button
                        type="button"
                        className="el-bulk-btn"
                        onClick={handleEnableAll}
                    >
                        {t("Enable All")}
                    </button>
                    <button
                        type="button"
                        className="el-bulk-btn"
                        onClick={handleDisableAll}
                    >
                        {t("Disable All")}
                    </button>
                    <button
                        type="button"
                        className="el-bulk-btn"
                        onClick={handleToggleAllVoice}
                    >
                        {t("Voice (All)")}
                    </button>
                    <button
                        type="button"
                        className="el-bulk-btn"
                        onClick={handleToggleAllMessages}
                    >
                        {t("Messages (All)")}
                    </button>
                </div>
            </div>

            <div className="el-settings-header-info">
                <span className="el-settings-stats">
                    {stats.enabled} / {stats.total} {t("servers enabled")}
                </span>
            </div>

            <div className="el-servers-list">
                {filteredGuilds.length === 0 ? (
                    <div className="el-empty">{t("No servers found")}</div>
                ) : (
                    filteredGuilds.map(guild => {
                        const cfg = getGuildConfig(guild.id);
                        const iconUrl = guild.icon
                            ? IconUtils?.getGuildIconURL?.({ id: guild.id, icon: guild.icon, size: 40 })
                            : null;
                        const acronym = (guild.name || "?")
                            .split(/\s+/)
                            .map((w: string) => w[0])
                            .join("")
                            .slice(0, 3)
                            .toUpperCase();

                        return (
                            <div
                                key={guild.id}
                                className={`el-server-card ${!cfg.enabled ? "el-server-card--disabled" : ""}`}
                            >
                                <div className="el-server-left">
                                    {iconUrl ? (
                                        <img src={iconUrl} className="el-server-icon" alt="" />
                                    ) : (
                                        <div className="el-server-acronym">{acronym}</div>
                                    )}
                                    <div className="el-server-meta">
                                        <span className="el-server-name" title={guild.name}>
                                            {guild.name}
                                        </span>
                                        <span className="el-server-status">
                                            {cfg.enabled
                                                ? (
                                                    (cfg.messages && cfg.voice)
                                                        ? `${t("Messages")} · ${t("Voice")}`
                                                        : cfg.messages
                                                            ? t("Messages")
                                                            : cfg.voice
                                                                ? t("Voice")
                                                                : t("No actions active")
                                                )
                                                : t("Disabled")}
                                        </span>
                                    </div>
                                </div>

                                <div className="el-server-right">
                                    <div className="el-action-chips">
                                        <button
                                            type="button"
                                            className={`el-action-chip ${cfg.voice && cfg.enabled ? "el-action-chip--active" : ""}`}
                                            disabled={!cfg.enabled}
                                            onClick={() => updateGuild(guild.id, { voice: !cfg.voice })}
                                            title={t("Log voice events for this server")}
                                        >
                                            <MicIcon />
                                            <span>{t("Voice")}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className={`el-action-chip ${cfg.messages && cfg.enabled ? "el-action-chip--active" : ""}`}
                                            disabled={!cfg.enabled}
                                            onClick={() => updateGuild(guild.id, { messages: !cfg.messages })}
                                            title={t("Log message events for this server")}
                                        >
                                            <MsgIcon />
                                            <span>{t("Messages")}</span>
                                        </button>
                                    </div>

                                    <div className="el-server-switch-wrap">
                                        <Switch
                                            checked={cfg.enabled}
                                            onChange={val => updateGuild(guild.id, { enabled: val })}
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

function LogsModal({ rootProps }: { rootProps: any; }) {
    const { t } = useTranslation();
    const [version, setVersion] = useState(globalVersion);
    const [filter, setFilter] = useState("all");
    const [selectedGuild, setSelectedGuild] = useState("all");
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [page, setPage] = useState(0);

    // Extraction des guildes uniques pour le select
    const guildOptions = useMemo(() => {
        const map = new Map<string, { label: string, guild: any; }>();
        for (const l of logs) {
            if (l.guildId && l.guildName) {
                if (!map.has(l.guildId)) {
                    map.set(l.guildId, { label: l.guildName, guild: getGuild(l.guildId) });
                }
            }
        }
        const options = [{ value: "all", label: t("All Servers") }];
        const sorted = Array.from(map.entries()).sort((a, b) => a[1].label.localeCompare(b[1].label));
        for (const [id, data] of sorted) {
            options.push({ value: id, label: data.label });
        }
        return options;
    }, [version, t]);

    useEffect(() => {
        const fn = () => setVersion(globalVersion);
        updateListeners.add(fn);
        return () => { updateListeners.delete(fn); };
    }, []);

    // Debounce search à 200ms
    useEffect(() => {
        const tm = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 200);
        return () => clearTimeout(tm);
    }, [search]);

    useEffect(() => { setPage(0); }, [filter, selectedGuild]);

    const filtered = useMemo(() => applyFilter(logs, filter, debouncedSearch, selectedGuild), [version, filter, debouncedSearch, selectedGuild]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    // Clear unread categories when viewed
    useEffect(() => {
        let changed = false;
        for (const l of unreadLogEntries) {
            if (filter === "all" || (filter === "ping" && l.type === "ping") || (filter === "friends" && FRIENDS_SET.has(l.type))) {
                unreadLogEntries.delete(l);
                changed = true;
            }
        }
        if (changed) { globalVersion++; setVersion(globalVersion); }
    }, [filter, version]);

    const clearLogs = useCallback(() => {
        if (filter === "all" && selectedGuild === "all") {
            logs = [];
        } else {
            const matchesFilter = (l: LogEntry) => applyFilter([l], filter, "", selectedGuild).length > 0;
            logs = logs.filter(l => !matchesFilter(l));
        }
        globalVersion++; setVersion(globalVersion);
        savePersistLogs();
    }, [filter, selectedGuild]);

    const saveAsTxt = useCallback(() => {
        try {
            const content = filtered.map(l => {
                const type = CFG[l.type]?.label || l.type;
                const author = l.authorName || "Unknown";
                const authorId = l.authorId ? ` (${l.authorId})` : "";
                const channel = l.channelName ? `#${l.channelName}` : "";
                const guild = l.guildName ? `[${l.guildName}]` : "";
                const messageId = l.realId ? ` [ID:${l.realId}]` : "";
                const body = l.type === "message_edit" ? `Before: ${l.extra} | After: ${l.content}` : l.content;
                return `[${l.timeStr}] [${type}] ${author}${authorId} ${channel} ${guild}${messageId}: ${body}`;
            }).join("\n");

            const blob = new Blob([content], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `lolicord_logs_${new Date().toISOString().slice(0, 10)}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            showToast(t("Logs saved!"), Toasts.Type.SUCCESS);
        } catch (err) {
            showToast(t("Error saving logs"), Toasts.Type.FAILURE);
        }
    }, [filtered, t]);

    return (
        <ModalRoot {...rootProps} size="large">
            <ModalHeader separator={false}>
                <Forms.FormTitle tag="h4" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, color: "#ffffff" }}>
                    Logs <span className="el-count">{logs.length}</span>
                </Forms.FormTitle>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent className="el-content">
                <div className="el-toolbar">
                    <div className="el-filters">
                        {FILTERS.map(f => {
                            let tbUnread = 0;
                            for (const l of unreadLogEntries) {
                                if (f.key === "all" || (f.key === "ping" && l.type === "ping") || (f.key === "friends" && FRIENDS_SET.has(l.type))) {
                                    tbUnread++;
                                }
                            }
                            return (
                                <button key={f.key}
                                    style={{ position: "relative" }}
                                    className={`el-filter-btn ${filter === f.key ? "el-filter-btn--active" : ""}`}
                                    onClick={() => setFilter(f.key)}>
                                    {t(f.label)}
                                    {tbUnread > 0 && f.key !== "settings" && (
                                        <div style={{
                                            position: "absolute", top: -4, right: -4, background: "#ed4245", color: "white",
                                            fontSize: "9px", fontWeight: "bold", padding: "1px 4px", borderRadius: "8px", lineHeight: 1
                                        }}>{tbUnread}</div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    {filter !== "settings" && (
                        <div className="el-search-row">
                            <div className="el-guild-select-wrap">
                                <Select
                                    options={guildOptions}
                                    isSelected={(v: string) => selectedGuild === v}
                                    select={(v: string) => setSelectedGuild(v)}
                                    serialize={(v: string) => v}
                                    placeholder={t("All Servers")}
                                />
                            </div>
                            <input className="el-search-input"
                                placeholder={t("Filter...")} value={search} onChange={e => setSearch(e.target.value)} />
                            {search && <button className="el-clear" onClick={() => setSearch("")}>✕</button>}
                            <button className="el-clear-all" style={{ marginRight: 4 }} onClick={saveAsTxt} title={t("Save as .txt")}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
                            </button>
                            <button className="el-clear-all" onClick={clearLogs} title={t("Clear")}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z" /></svg>
                            </button>
                        </div>
                    )}
                </div>

                {filter === "settings" ? (
                    <LogsSettingsView />
                ) : (
                    <>
                        <div className="el-list">
                            {slice.length === 0
                                ? <div className="el-empty">{t("Aucun événement")}</div>
                                : slice.map(e => <LogRow key={e.id} e={e} onClose={rootProps?.onClose} />)}
                        </div>

                        {totalPages > 1 && (
                            <div className="el-pagination">
                                <button disabled={page === 0} onClick={() => setPage(0)}>«</button>
                                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
                                <span>{page + 1} / {totalPages}</span>
                                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
                                <button disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
                            </div>
                        )}
                    </>
                )}
            </ModalContent>
        </ModalRoot>
    );
}

function LogsIconWithBadge({ width = 20, height = 20, count = 0 }) {
    return (
        <div style={{ position: "relative", display: "flex" }}>
            <svg width={width} height={height} viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M18.5 23c.88 0 1.7-.25 2.4-.69l1.4 1.4a1 1 0 0 0 1.4-1.42l-1.39-1.4A4.5 4.5 0 1 0 18.5 23Zm0-2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" clipRule="evenodd" />
                <path d="M3 3a1 1 0 0 0 0 2h18a1 1 0 1 0 0-2H3ZM2 8a1 1 0 0 1 1-1h18a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1ZM3 11a1 1 0 1 0 0 2h11a1 1 0 1 0 0-2H3ZM2 16a1 1 0 0 1 1-1h8a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1ZM3 19a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2H3Z" />
            </svg>
        </div>
    );
}

function LogsButton() {
    const [count, setCount] = useState(logs.length);
    const [notif, setNotif] = useState(unreadLogEntries.size);
    const [modalOpen, setModalOpen] = useState(false);
    const btnRef = React.useRef<any>(null);

    useEffect(() => {
        const fn = () => { setCount(logs.length); setNotif(unreadLogEntries.size); };
        updateListeners.add(fn);
        return () => { updateListeners.delete(fn); };
    }, []);

    const onClick = (e: React.MouseEvent) => {
        // Dispatch a synthetic mouseleave so Discord's Tooltip dismisses itself
        const el = (e.currentTarget as HTMLElement);
        el.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));

        unreadLogEntries.clear();
        globalVersion++;
        for (const fn of updateListeners) { try { fn(); } catch { } }

        setModalOpen(true);
        openModal(props => <LogsModal rootProps={{ ...props, onClose: () => { props.onClose(); setModalOpen(false); } }} />);
    };

    return (
        <HeaderBarButton
            ref={btnRef}
            icon={() => <LogsIconWithBadge count={notif} />}
            tooltip={modalOpen ? null : `${t("Logs")} (${count})`}
            selected={modalOpen}
            onClick={onClick}
        />
    );
}

let unsubs: Array<() => void> = [];
const prevVS = new Map<string, any>();

function subscribeToEvents() {
    const sub = (ev: string, fn: (d: any) => void) => {
        FluxDispatcher.subscribe(ev, fn);
        unsubs.push(() => FluxDispatcher.unsubscribe(ev, fn));
    };

    sub("MESSAGE_CREATE", d => {
        if (d.message) {
            cacheMsg(d.message);
            const meId = UserStore?.getCurrentUser?.()?.id;
            if (meId && d.message.mentions?.some((m: any) => m.id === meId)) {
                const ch = chInfo(d.message.channel_id);
                if (ch.guildId && !isGuildMessagesEnabled(ch.guildId)) return;
                const a = authorFrom(d.message);
                pushLog({
                    type: "ping",
                    content: d.message.content || "",
                    authorId: a.authorId ?? "",
                    authorName: a.authorName,
                    authorAvatar: a.authorAvatar,
                    realId: d.message.id,
                    ...ch
                });
            }
        }
    });
    sub("LOAD_MESSAGES_SUCCESS", d => {
        if (!d) return;
        // FIX CRASH DM SCROLL: isLoadingMessages bloque la purge du msgCache pendant
        // le traitement du batch — évite un pic synchrone sur le thread principal.
        const msgs = [
            ...(Array.isArray(d.messages) ? d.messages : []),
            ...(Array.isArray(d.jump) ? d.jump : []),
            ...(Array.isArray(d.around) ? d.around : []),
            ...(Array.isArray(d.before) ? d.before : [])
        ];
        if (msgs.length === 0) return;

        // requestIdleCallback est idéal pour le scan en arrière-plan sans lag
        if (typeof requestIdleCallback !== "undefined") {
            requestIdleCallback(() => {
                isLoadingMessages = true;
                try { for (const m of msgs) cacheMsg(m); } finally { isLoadingMessages = false; }
                // Purge différée si le cache dépasse la limite
                pruneMsgCache();
            }, { timeout: 3000 });
        } else {
            setTimeout(() => {
                isLoadingMessages = true;
                try { for (const m of msgs) cacheMsg(m); } finally { isLoadingMessages = false; }
                pruneMsgCache();
            }, 100);
        }
    });
    sub("MESSAGE_UPDATE", d => {
        if (!d.message) return;
        const m = d.message;
        const cached = msgCache.get(m.id);
        const oldC = cached?.content ?? "";
        const newC = m.content ?? "";
        // If content didn't change or if either string is empty (unknown previous message or embed update), ignore
        if (oldC === newC || !newC || !oldC) {
            if (cached) cached.content = newC || cached.content;
            else if (newC) cacheMsg(m);
            return;
        }

        const ch = chInfo(m.channel_id);
        if (ch.guildId && !isGuildMessagesEnabled(ch.guildId)) {
            if (cached) cached.content = newC;
            return;
        }

        const a = authorFrom(m);
        if (settings.store.ignoreBots && a.isBot) {
            if (cached) cached.content = newC;
            return;
        }

        pushLog({
            type: "message_edit",
            content: newC,
            extra: oldC,
            realId: m.id,
            authorId: a.authorId ?? cached?.authorId,
            authorName: a.authorName !== "?" ? a.authorName : (cached?.authorName ?? "?"),
            authorAvatar: a.authorAvatar ?? cached?.authorAvatar ?? null,
            ...ch
        });
        if (cached) cached.content = newC;
        else cacheMsg(m);
    });
    sub("MESSAGE_DELETE", d => {
        if (d.mlDeleted) return;
        const ch = chInfo(d.channelId);
        if (ch.guildId && !isGuildMessagesEnabled(ch.guildId)) return;
        const cached = msgCache.get(d.id);
        let content = "", authorId = "", authorName = "?", authorAvatar: string | null = null;
        let attachments: LogAttachment[] = [];

        try {
            const sm = MessageStore?.getMessage?.(d.channelId, d.id);
            if (sm) {
                content = sm.content ?? "";
                const a = authorFrom(sm);
                authorId = a.authorId ?? "";
                authorName = a.authorName;
                authorAvatar = a.authorAvatar;
                if (sm.attachments?.length) {
                    attachments = sm.attachments.map((att: any) => ({
                        url: att.url || att.proxy_url || "",
                        proxy_url: att.proxy_url || att.url || "",
                        width: att.width,
                        height: att.height,
                        filename: att.filename || "image.png",
                        content_type: att.content_type || att.contentType || ""
                    })).filter((att: any) => !!att.url);
                }
            }
        } catch { }

        if (cached) {
            if (!content) content = cached.content;
            if (!attachments.length && cached.attachments?.length) attachments = cached.attachments;
            if (!authorId) {
                authorId = cached.authorId;
                authorName = cached.authorName;
                authorAvatar = cached.authorAvatar;
            }
        }

        // Fallback: check Vencord MessageLogger plugins
        if (!content && !attachments.length) {
            try {
                const ml = (window as any).Vencord?.Plugins?.plugins?.MessageLogger
                    || (window as any).Vencord?.Plugins?.plugins?.MessageLoggerEnhanced;
                const mlMsg = ml?.deletedMessages?.get?.(d.id);
                if (mlMsg) {
                    content = mlMsg.content || "";
                    if (mlMsg.attachments) {
                        attachments = mlMsg.attachments.map((att: any) => ({
                            url: att.url || att.proxy_url || "",
                            proxy_url: att.proxy_url || att.url || "",
                            width: att.width,
                            height: att.height,
                            filename: att.filename || "file",
                            content_type: att.content_type || ""
                        }));
                    }
                    if (!authorId && mlMsg.author) {
                        authorId = mlMsg.author.id;
                        authorName = mlMsg.author.username;
                        authorAvatar = mlMsg.author.avatar;
                    }
                }
            } catch { }
        }

        // If message had no text and no attachments (embeds only or empty), do not log anything
        if (!content && !attachments.length) return;

        if (settings.store.ignoreBots) {
            const a = authorId ? authorFrom({ author: { id: authorId } }) : null;
            if (a?.isBot) return;
        }

        if (authorId) {
            const u = getUser(authorId);
            if (u) {
                authorName = u.globalName ?? u.username ?? authorName;
                authorAvatar = u.avatar ?? authorAvatar;
            }
        }

        pushLog({
            type: "message_delete",
            content,
            authorId,
            authorName,
            authorAvatar,
            realId: d.id,
            attachments,
            ...chInfo(d.channelId)
        });
    });
    sub("VOICE_STATE_UPDATES", d => {
        const meId = UserStore?.getCurrentUser?.()?.id;
        for (const s of d?.voiceStates ?? []) {
            const { userId, channelId, oldChannelId, guildId } = s;
            if (!userId) continue;

            // Determine if the event happened in our current VC before we possibly change myVoiceChannelId
            let isMyVoice = false;
            // Our own actions are always tagged as our voice
            if (userId === meId) {
                isMyVoice = true;
            }
            // Others interacting with the channel we are currently in
            else if (myVoiceChannelId != null && (channelId === myVoiceChannelId || oldChannelId === myVoiceChannelId)) {
                isMyVoice = true;
            }

            // Track our own voice channel for future events
            if (userId === meId) {
                myVoiceChannelId = channelId ?? null;
            }

            const u = getUser(userId); const ch = getChannel(channelId ?? oldChannelId); const g = getGuild(guildId ?? ch?.guild_id);
            const voiceActive = isGuildVoiceEnabled(g?.id);
            if (voiceActive) {
                const b = {
                    authorId: userId, authorName: u?.globalName ?? u?.username ?? userId, authorAvatar: u?.avatar ?? null,
                    channelId: channelId ?? oldChannelId, channelName: ch?.name, guildId: g?.id, guildName: g?.name,
                    isMyVoice
                };
                if (!oldChannelId && channelId) pushLog({ type: "voice_join", content: t("Joined"), ...b });
                else if (oldChannelId && !channelId) {
                    const p = prevVS.get(userId);
                    const content = (s.selfStream === false && p?.selfStream === true) ? t("Stream stopped") : t("Left");
                    pushLog({ type: "voice_leave", content, ...b, channelId: oldChannelId });
                }
                else if (oldChannelId && channelId && oldChannelId !== channelId) { const oc = getChannel(oldChannelId); pushLog({ type: "voice_move", content: `${oc?.name ?? "?"} → ${ch?.name ?? "?"}`, ...b }); }
                const p = prevVS.get(userId);
                if (p) {
                    if (s.selfMute !== p.selfMute) pushLog({ type: "voice_mute", content: s.selfMute ? t("Mic muted") : t("Mic unmuted"), ...b });
                    if (s.selfDeaf !== p.selfDeaf) pushLog({ type: "voice_deaf", content: s.selfDeaf ? t("Headphones muted") : t("Headphones unmuted"), ...b });
                    if (s.mute && !p.mute) pushLog({ type: "voice_mute_mod", content: t("Muted by staff"), ...b });
                    if (!s.mute && p.mute) pushLog({ type: "voice_mute_mod", content: t("Unmuted by staff"), ...b });
                    if (s.selfStream !== p.selfStream) pushLog({ type: "voice_stream", content: s.selfStream ? t("Stream started") : t("Stream stopped"), ...b });
                }
            }
            if (!channelId) prevVS.delete(userId);
            else prevVS.set(userId, s);
        }
    });
    const relUser = (data: any) => {
        const rel = data?.relationship ?? data; const userId = rel?.user?.id ?? rel?.id ?? data?.userId ?? "?";
        let name = rel?.user?.global_name ?? rel?.user?.globalName ?? rel?.user?.username ?? null;
        let av: string | null = rel?.user?.avatar ?? null;
        if (userId !== "?") { const u = getUser(userId); if (u) { name = name ?? u.globalName ?? u.username ?? null; av = av ?? u.avatar ?? null; } }
        return { authorId: userId, authorName: name ?? userId, authorAvatar: av };
    };
    const relType = (data: any) => { const raw = data?.relationship?.type ?? data?.type ?? -1; return typeof raw === "number" ? raw : parseInt(String(raw), 10) || -1; };
    sub("RELATIONSHIP_ADD", d => {
        const b = relUser(d); const t_type = relType(d);
        const [type, content]: [LogType, string] = t_type === 2 ? ["block", t("Blocked")] : t_type === 3 ? ["friend_request", t("Request received")] : t_type === 4 ? ["friend_request", t("Request sent")] : ["friend_add", t("Friend added")];
        pushLog({ type, content, ...b });
    });
    sub("RELATIONSHIP_REMOVE", d => {
        const b = relUser(d); const t_type = relType(d);
        const [type, content]: [LogType, string] = (t_type === 3 || t_type === 4) ? ["friend_request_cancel", t("Request cancelled")] : t_type === 2 ? ["unblock", t("Unblocked")] : ["friend_remove", t("Friend removed")];
        pushLog({ type, content, ...b });
    });
    sub("GUILD_MEMBER_ADD", d => {
        if (!isGuildLoggingEnabled(d.guildId)) return;
        const b = uInfo(d.user?.id); const g = getGuild(d.guildId);
        pushLog({ type: "guild_member_add", content: t("Joined"), ...b, guildId: d.guildId, guildName: g?.name });
    });
    sub("GUILD_MEMBER_REMOVE", d => {
        if (!isGuildLoggingEnabled(d.guildId)) return;
        const b = uInfo(d.user?.id); const g = getGuild(d.guildId);
        pushLog({ type: "guild_member_remove", content: t("Left/Kick"), ...b, guildId: d.guildId, guildName: g?.name });
    });
    // GUILD_MEMBER_LIST_UPDATE: dispatche a tous les membres quand la liste change
    // Les ops DELETE = quelquun a quitte le serveur (visible sans perms admin)
    sub("GUILD_MEMBER_LIST_UPDATE", d => {
        if (!d?.ops || !d.guildId || !isGuildLoggingEnabled(d.guildId)) return;
        const g = getGuild(d.guildId);
        const meId = UserStore?.getCurrentUser?.()?.id;
        for (const op of d.ops) {
            if (op.op !== "DELETE") continue;
            const items = op.items ?? (op.item ? [op.item] : []);
            for (const item of items) {
                const member = item?.member;
                if (!member?.user) continue;
                const userId = member.user.id;
                if (!userId || userId === meId) continue;
                const recentDupe = logs.find((l: any) =>
                    l.type === "guild_member_remove" &&
                    l.authorId === userId &&
                    l.guildId === d.guildId &&
                    Date.now() - l.timestamp < 3000
                );
                if (recentDupe) continue;
                const b = {
                    authorId: userId,
                    authorName: member.user.global_name ?? member.user.username ?? userId,
                    authorAvatar: member.user.avatar ?? null,
                };
                pushLog({ type: "guild_member_remove", content: t("Left"), ...b, guildId: d.guildId, guildName: g?.name });
            }
        }
    });
    sub("GUILD_BAN_ADD", d => {
        if (!isGuildLoggingEnabled(d.guildId)) return;
        const userId = d.user?.id;
        if (!userId) return;
        const recentDupe = logs.find((l: any) =>
            l.type === "guild_ban" &&
            l.authorId === userId &&
            l.guildId === d.guildId &&
            Date.now() - l.timestamp < 3000
        );
        if (recentDupe) return;
        const b = uInfo(userId); const g = getGuild(d.guildId);
        pushLog({ type: "guild_ban", content: t("Banned"), ...b, guildId: d.guildId, guildName: g?.name });
    });
    sub("GUILD_BAN_REMOVE", d => {
        if (!isGuildLoggingEnabled(d.guildId)) return;
        const userId = d.user?.id;
        if (!userId) return;
        const recentDupe = logs.find((l: any) =>
            l.type === "guild_unban" &&
            l.authorId === userId &&
            l.guildId === d.guildId &&
            Date.now() - l.timestamp < 3000
        );
        if (recentDupe) return;
        const b = uInfo(userId); const g = getGuild(d.guildId);
        pushLog({ type: "guild_unban", content: t("Unbanned"), ...b, guildId: d.guildId, guildName: g?.name });
    });

    sub("GUILD_MEMBER_UPDATE", d => {
        if (!d.guildId || !d.user?.id || !isGuildLoggingEnabled(d.guildId)) return;
        const b = uInfo(d.user.id); const g = getGuild(d.guildId);
        if (d.communicationDisabledUntil) {
            pushLog({ type: "guild_timeout", content: t("Exclu temporairement (Timeout)"), ...b, guildId: d.guildId, guildName: g?.name });
        }
    });

    sub("CHANNEL_SELECT", d => {
        if (!d.channelId) return;
        let changed = false;
        for (const l of unreadLogEntries) {
            if (l.channelId === d.channelId) {
                unreadLogEntries.delete(l);
                changed = true;
            }
        }
        if (changed) scheduleFlush();
    });

    // Capture logout/disconnect (partiel car le plugin s'arrête si déco totale)
    sub("LOGOUT", () => { pushLog({ type: "user_disconnect", content: t("Déconnexion du account"), authorName: "System" }); });
}

export default definePlugin({
    name: "EventLogs",
    enabledByDefault: true,
    description: "Logs deleted/edited messages, friends, pings, etc. Open via Discord Header Bar.",
    authors: [{ name: "Nightcord", id: 0n }],
    dependencies: ["HeaderBarAPI"],
    settings,

    headerBarButton: {
        icon: LogsIconWithBadge,
        render: () => <LogsButton />,
        priority: 7,
    },

    start() {
        void loadGuildConfigs();
        // Initialize current voice channel on start
        try {
            const vcId = (SelectedChannelStore as any)?.getVoiceChannelId?.();
            if (vcId) myVoiceChannelId = vcId;
        } catch { }
        if (settings.store.keepLogsOnRestart !== false) {
            if ("requestIdleCallback" in window) {
                (window as any).requestIdleCallback(() => loadPersistLogs(), { timeout: 1500 });
            } else {
                setTimeout(() => loadPersistLogs(), 500);
            }
        }
        subscribeToEvents();
        // Also save on page unload (Discord force-close / crash)
        window.addEventListener("beforeunload", savePersistLogs);
    },
    stop() {
        saveGuildConfigs();
        window.removeEventListener("beforeunload", savePersistLogs);
        unsubs.forEach(fn => fn()); unsubs = [];
        // Save before clearing — cancel the debounce timers then immediately persist
        if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
        if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
        savePersistLogs();
        logs = []; msgCache.clear(); prevVS.clear(); updateListeners.clear();
        isLoadingMessages = false;
        myVoiceChannelId = null;
    },
});

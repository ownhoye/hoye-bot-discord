/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { ModalCloseButton, ModalContent, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Alerts, ChannelStore, Forms, GuildStore, Menu, React, RelationshipStore, RestAPI, ScrollerThin, showToast, TextInput, Toasts, UserStore } from "@webpack/common";
import { t } from "../autoTranslateLoliCord";

// ─── Icons ───────────────────────────────────────────────────────────────────
function CleanerIcon(props: any) {
    return (
        <svg className="nc-cleaner-icon" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width={props.width || 20} height={props.height || 20} fill="none" viewBox="0 0 24 24" {...props}>
            <path className="nc-trash-lid" fill="currentColor" d="M14.25 1c.41 0 .75.34.75.75V3h5.25c.41 0 .75.34.75.75v.5c0 .41-.34.75-.75.75H3.75A.75.75 0 0 1 3 4.25v-.5c0-.41.34-.75.75-.75H9V1.75c0-.41.34-.75.75-.75h4.5Z" />
            <path className="nc-trash-body" fill="currentColor" fillRule="evenodd" d="M5.06 7a1 1 0 0 0-1 1.06l.76 12.13a3 3 0 0 0 3 2.81h8.36a3 3 0 0 0 3-2.81l.75-12.13a1 1 0 0 0-1-1.06H5.07ZM11 12a1 1 0 1 0-2 0v6a1 1 0 1 0 2 0v-6Zm3-1a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Z" clipRule="evenodd" />
        </svg>
    );
}

// ─── Types & State ────────────────────────────────────────────────────────────

interface LogEntry {
    id: string;
    type: "dm" | "server" | "channel";
    targetId: string;
    targetName: string;
    deleted: number;
    failed: number;
    skipped: number;
    timestamp: number;
    messages: string[];
}

interface QueueItem {
    id: string;
    type: "dm" | "server" | "channel";
    targetId: string;
    name: string;
}

let logs: LogEntry[] = [];
let queue: QueueItem[] = [];
let isQueueRunning = false;
let shouldStop = false;
let currentTask: { name: string; progress: string; percentage: number } | null = null;

let deleteDelay = 800;
try {
    const saved = localStorage.getItem("lolicord_mc_delay");
    if (saved) deleteDelay = Math.max(50, Math.min(5000, parseInt(saved, 10) || 800));
} catch { }

let useSilentDelete = false;
try {
    const saved = localStorage.getItem("lolicord_mc_silent_delete");
    if (saved !== null) useSilentDelete = saved === "true";
} catch { }

export function getDeleteDelay(): number {
    return deleteDelay;
}

export function setDeleteDelay(val: number) {
    deleteDelay = Math.max(50, Math.min(5000, val));
    try {
        localStorage.setItem("lolicord_mc_delay", deleteDelay.toString());
    } catch { }
}

export function getUseSilentDelete(): boolean {
    return useSilentDelete;
}

export function setUseSilentDelete(val: boolean) {
    useSilentDelete = val;
    try {
        localStorage.setItem("lolicord_mc_silent_delete", val.toString());
    } catch { }
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

// ─── Core Logic ───────────────────────────────────────────────────────────────

function isCallMessage(message: any): boolean {
    return message?.type === 3 || !!message?.call;
}

function canDeleteMessage(message: any, currentUserId: string): boolean {
    try {
        if (message.author?.id !== currentUserId) return false;
        // Text messages (0), replies (19), and calls initiated by the user (3)
        if (message.type === 0 || message.type === 19) return true;
        if (message.type === 3 || isCallMessage(message)) return true;
        return false;
    } catch {
        return false;
    }
}

async function deleteMessage(channelId: string, messageId: string, retryCount = 0): Promise<boolean> {
    try {
        await RestAPI.del({ url: `/channels/${channelId}/messages/${messageId}` });
        return true;
    } catch (error: any) {
        const statusCode = error?.status || error?.statusCode;
        if (statusCode === 429 && retryCount < 3) {
            const retryAfter = error?.body?.retry_after ?? 5;
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return deleteMessage(channelId, messageId, retryCount + 1);
        }
        return false;
    }
}

async function silentDeleteMessage(channelId: string, messageId: string, retryCount = 0): Promise<boolean> {
    try {
        const response = await RestAPI.post({
            url: `/channels/${channelId}/messages`,
            body: {
                content: "** **",
                flags: 4096, // suppress notifications
                mobile_network_type: "unknown",
                nonce: messageId,
                tts: false
            }
        });

        await new Promise(r => setTimeout(r, 150));
        if (response?.body?.id) {
            await RestAPI.del({ url: `/channels/${channelId}/messages/${response.body.id}` }).catch(() => {});
        }
        await new Promise(r => setTimeout(r, 100));
        await RestAPI.del({ url: `/channels/${channelId}/messages/${messageId}` }).catch(() => {});
        return true;
    } catch (error: any) {
        const statusCode = error?.status || error?.statusCode;
        if (statusCode === 429 && retryCount < 3) {
            const retryAfter = error?.body?.retry_after ?? 5;
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return silentDeleteMessage(channelId, messageId, retryCount + 1);
        }
        return deleteMessage(channelId, messageId);
    }
}

async function deleteTargetMessage(channelId: string, message: any): Promise<boolean> {
    const isCall = isCallMessage(message);
    if (useSilentDelete || isCall) {
        return silentDeleteMessage(channelId, message.id);
    }
    return deleteMessage(channelId, message.id);
}

async function getChannelMessages(channelId: string, before?: string): Promise<any[]> {
    try {
        const url = before ? `/channels/${channelId}/messages?limit=100&before=${before}` : `/channels/${channelId}/messages?limit=100`;
        const response = await RestAPI.get({ url });
        if (!response || !response.body) return [];
        return Array.isArray(response.body) ? response.body : [];
    } catch {
        return [];
    }
}

async function cleanChannel(channelId: string, logEntry: LogEntry, taskName: string) {
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    let lastMessageId: string | undefined;
    let keepRunning = true;
    let totalProcessed = 0;
    
    let initialTotalResults: number = 0;
    try {
        const res = await RestAPI.get({ url: `/channels/${channelId}/messages/search?author_id=${currentUserId}` });
        if (res?.body?.total_results) initialTotalResults = res.body.total_results;
    } catch (e) {}
    
    currentTask = { name: taskName, progress: "Fetching...", percentage: 0 };
    emit();

    while (keepRunning && !shouldStop) {
        try {
            const messages = await getChannelMessages(channelId, lastMessageId);
            if (messages.length === 0) break;

            const validMessages = messages.filter(msg => canDeleteMessage(msg, currentUserId));
            
            if (validMessages.length === 0) {
                lastMessageId = messages[messages.length - 1].id;
                logEntry.skipped += messages.length;
                if (messages.length < 100) break;
                continue;
            }

            for (const message of validMessages) {
                if (shouldStop) break;

                const success = await deleteTargetMessage(channelId, message);
                if (success) {
                    logEntry.deleted++;
                    logEntry.messages.push(`[${message.timestamp}] ${message.content || "<attachment/embed>"}`);
                } else {
                    logEntry.failed++;
                }
                totalProcessed++;
                // Keep total as max(initial, deleted) so bar never goes backwards
                const effectiveTotal = Math.max(initialTotalResults, logEntry.deleted);
                currentTask = { 
                    name: taskName, 
                    progress: effectiveTotal > 0 ? `Deleted ${logEntry.deleted} / ${effectiveTotal}` : `Deleted ${logEntry.deleted}`, 
                    percentage: effectiveTotal > 0 ? Math.min((logEntry.deleted / effectiveTotal) * 100, 99) : Math.min((totalProcessed / (totalProcessed + 50)) * 100, 99) 
                };
                emit();
                
                await new Promise(resolve => setTimeout(resolve, getDeleteDelay())); // User-configured deletion speed
            }
            
            logEntry.skipped += messages.length - validMessages.length;
            lastMessageId = messages[messages.length - 1].id;
            if (messages.length < 100) break;

        } catch (e: any) {
            if (e?.status === 429) {
                const retryAfter = e?.body?.retry_after ?? 30;
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            } else {
                break;
            }
        }
    }
}

async function cleanGuild(guildId: string, logEntry: LogEntry, taskName: string) {
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    let maxId: string | undefined;
    let totalProcessed = 0;
    let initialTotalResults: number = 0;
    
    currentTask = { name: taskName, progress: "Searching...", percentage: 0 };
    emit();

    while (!shouldStop) {
        try {
            let url = `/guilds/${guildId}/messages/search?author_id=${currentUserId}`;
            if (maxId) url += `&max_id=${maxId}`;

            const response = await RestAPI.get({ url });
            if (!response?.body?.messages || response.body.messages.length === 0) break;
            if (!initialTotalResults && response.body.total_results) {
                initialTotalResults = response.body.total_results;
            }

            let messages: any[] = [];
            for (const group of response.body.messages) {
                for (const msg of group) {
                    if (msg.author && msg.author.id === currentUserId) messages.push(msg);
                }
            }

            if (messages.length === 0) break;

            let oldestHitId: string | undefined;
            for (const group of response.body.messages) {
                for (const msg of group) {
                    if (msg.hit) {
                        if (!oldestHitId || BigInt(msg.id) < BigInt(oldestHitId)) oldestHitId = msg.id;
                    }
                }
            }
            
            if (oldestHitId) {
                maxId = (BigInt(oldestHitId) - 1n).toString();
            } else {
                let oldestId = messages[0].id;
                for (const m of messages) if (BigInt(m.id) < BigInt(oldestId)) oldestId = m.id;
                maxId = (BigInt(oldestId) - 1n).toString();
            }

            const validMessages = messages.filter(msg => canDeleteMessage(msg, currentUserId));
            if (validMessages.length === 0) {
                logEntry.skipped += messages.length;
                continue;
            }

            for (const message of validMessages) {
                if (shouldStop) break;
                if (!message.channel_id) continue;

                const success = await deleteTargetMessage(message.channel_id, message);
                if (success) {
                    logEntry.deleted++;
                    logEntry.messages.push(`[${message.timestamp}] ${message.content || "<attachment/embed>"}`);
                } else {
                    logEntry.failed++;
                }

                totalProcessed++;
                // Keep total as max(initial, deleted) so bar never goes backwards
                const effectiveTotal = Math.max(initialTotalResults, logEntry.deleted);
                currentTask = { 
                    name: taskName, 
                    progress: effectiveTotal > 0 ? `Deleted ${logEntry.deleted} / ${effectiveTotal}` : `Deleted ${logEntry.deleted}`, 
                    percentage: effectiveTotal > 0 ? Math.min((logEntry.deleted / effectiveTotal) * 100, 99) : Math.min((totalProcessed / (totalProcessed + 50)) * 100, 99) 
                };
                emit();
                
                await new Promise(resolve => setTimeout(resolve, getDeleteDelay())); // User-configured deletion speed
            }
        } catch (e: any) {
            if (e?.status === 429) {
                const retryAfter = e?.body?.retry_after ?? 30;
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            } else {
                break;
            }
        }
    }
}

async function processQueue() {
    if (isQueueRunning) return;
    isQueueRunning = true;
    shouldStop = false;
    emit();

    while (queue.length > 0 && !shouldStop) {
        const item = queue[0];
        
        const logEntry: LogEntry = {
            id: Math.random().toString(36).substring(7),
            type: item.type,
            targetId: item.targetId,
            targetName: item.name,
            deleted: 0,
            failed: 0,
            skipped: 0,
            timestamp: Date.now(),
            messages: []
        };
        logs.unshift(logEntry);
        
        let targetChannelId = item.targetId;
        
        if (item.type === "dm" && targetChannelId.startsWith("friend-")) {
            const userId = targetChannelId.replace("friend-", "");
            try {
                const res = await RestAPI.post({ url: '/users/@me/channels', body: { recipient_id: userId } });
                if (res && res.body && res.body.id) {
                    targetChannelId = res.body.id;
                }
            } catch (e) {
                console.error("Failed to open DM for friend", userId, e);
            }
        }

        if (item.type === "dm" || item.type === "channel") {
            await cleanChannel(targetChannelId, logEntry, item.name);
        } else if (item.type === "server") {
            await cleanGuild(item.targetId, logEntry, item.name);
        }
        
        if (!shouldStop) {
            queue.shift();
            showToast(`Cleaned ${item.name}`, Toasts.Type.SUCCESS);
        }
    }

    isQueueRunning = false;
    currentTask = null;
    emit();
}

function addToQueue(items: QueueItem[]) {
    queue.push(...items);
    if (!isQueueRunning) processQueue();
    else emit();
}

function stopQueue() {
    shouldStop = true;
    queue = [];
    emit();
}

function exportLogs() {
    if (logs.length === 0) {
        showToast("No logs to export", Toasts.Type.FAILURE);
        return;
    }
    
    let content = "MessageCleaner Logs\n=================================\n\n";
    for(const l of logs) {
        content += `[${new Date(l.timestamp).toLocaleString()}] ${l.type.toUpperCase()}: ${l.targetName} (${l.targetId})\n`;
        content += `Deleted: ${l.deleted} | Failed: ${l.failed} | Skipped: ${l.skipped}\n`;
        if (l.messages.length > 0) {
            content += `\n--- Messages ---\n${l.messages.join("\n")}\n`;
        }
        content += "\n=================================\n\n";
    }
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MessageCleaner_Logs_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── Components ───────────────────────────────────────────────────────────────

const MODAL_STYLES = `
.mcv2-root {
    display: flex;
    flex-direction: column;
    width: 600px;
    height: 600px;
    max-height: 80vh;
    border-radius: 12px;
    background: #313338;
    color: #dbdee1;
    overflow: hidden;
}
.mcv2-header {
    display: flex;
    align-items: center;
    padding: 20px;
    background: #2b2d31;
    gap: 12px;
}
.mcv2-icon-wrap {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: rgba(237, 66, 69, 0.2);
    color: #ed4245;
    display: flex;
    align-items: center;
    justify-content: center;
}
.mcv2-title {
    font-size: 18px;
    font-weight: 700;
    color: #f2f3f5;
}
.mcv2-subtitle {
    font-size: 13px;
    color: #b5bac1;
}
.mcv2-tabs {
    display: flex;
    gap: 2px;
    padding: 0 20px;
    background: #2b2d31;
    border-bottom: 1px solid #1e1f22;
}
.mcv2-tab {
    padding: 12px 16px;
    font-size: 14px;
    font-weight: 500;
    color: #b5bac1;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
}
.mcv2-tab:hover {
    color: #dbdee1;
    background: rgba(255,255,255,0.02);
}
.mcv2-tab.active {
    color: #f2f3f5;
    border-bottom-color: #ed4245;
}
.mcv2-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
}
.mcv2-list-item {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    background: #2b2d31;
    border-radius: 8px;
    margin-bottom: 8px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s;
}
.mcv2-list-item:hover {
    background: #3f4147;
}
.mcv2-list-item.selected {
    border-color: #ed4245;
    background: rgba(237, 66, 69, 0.05);
}
.mcv2-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    margin-right: 12px;
}
.mcv2-item-name {
    flex: 1;
    font-weight: 600;
    font-size: 14px;
    color: #dbdee1;
}
.mcv2-btn-row {
    display: flex;
    gap: 10px;
    margin-top: 15px;
}
.mcv2-primary-btn {
    background: #ed4245;
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
    flex: 1;
    border: none;
    transition: background 0.2s;
}
.mcv2-primary-btn:hover {
    background: #c9383b;
}
.mcv2-progress-card {
    background: #232428;
    border-radius: 8px;
    padding: 15px;
    margin-top: 20px;
    border: 1px solid #1e1f22;
}
.mcv2-progress-bar-wrap {
    height: 6px;
    background: #1e1f22;
    border-radius: 3px;
    margin-top: 10px;
    overflow: hidden;
}
.mcv2-progress-bar-fill {
    height: 100%;
    background: #ed4245;
    transition: width 0.3s;
}
.mcv2-log-item {
    padding: 12px;
    background: #2b2d31;
    border-radius: 8px;
    margin-bottom: 8px;
    border-left: 4px solid #ed4245;
}
.mcv2-scroller::-webkit-scrollbar {
    width: 6px;
}
.mcv2-scroller::-webkit-scrollbar-track {
    background: transparent;
}
.mcv2-scroller::-webkit-scrollbar-thumb {
    background: #1a1b1e;
    border-radius: 3px;
}
.mcv2-select-all-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 14px;
    border-radius: 8px;
    background: #2b2d31;
    color: #949ba4;
    border: 1px solid rgba(255, 255, 255, 0.08);
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
    user-select: none;
    white-space: nowrap;
}
.mcv2-select-all-btn:hover {
    background: #383a40;
    color: #dbdee1;
}
.mcv2-select-all-btn.active {
    background: rgba(237, 66, 69, 0.15);
    color: #ffffff;
    border-color: #ed4245;
}
.mcv2-select-all-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #80848e;
    transition: all 0.2s;
}
.mcv2-select-all-btn.active .mcv2-select-all-dot {
    background: #ed4245;
    box-shadow: 0 0 6px rgba(237, 66, 69, 0.8);
}
.mcv2-setting-card {
    background: #2b2d31;
    border-radius: 8px;
    padding: 18px;
    border: 1px solid rgba(255, 255, 255, 0.06);
}
.mcv2-speed-slider {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: #1e1f22;
    outline: none;
    cursor: pointer;
    accent-color: #ed4245;
    margin: 12px 0;
}
.mcv2-switch-btn {
    position: relative;
    width: 44px;
    height: 24px;
    border-radius: 12px;
    background: #4e5058;
    border: none;
    cursor: pointer;
    transition: background 0.2s ease;
    padding: 2px;
    flex-shrink: 0;
}
.mcv2-switch-btn.active {
    background: #23a55a;
}
.mcv2-switch-knob {
    display: block;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #ffffff;
    transition: transform 0.2s ease;
    transform: translateX(0);
}
.mcv2-switch-btn.active .mcv2-switch-knob {
    transform: translateX(20px);
}
`;

function useForceUpdate() {
    const [, setTick] = React.useState(0);
    return () => setTick(t => t + 1);
}

function ProgressBanner() {
    if (!isQueueRunning && queue.length === 0) return null;
    return (
        <div className="mcv2-progress-card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                <strong style={{ fontSize: "14px" }}>
                    {currentTask ? `Cleaning: ${currentTask.name}` : `Queued: ${queue.length} items`}
                </strong>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {currentTask ? currentTask.progress : "Waiting..."}
                </span>
            </div>
            <div className="mcv2-progress-bar-wrap">
                <div className="mcv2-progress-bar-fill" style={{ width: `${currentTask ? currentTask.percentage : 0}%` }} />
            </div>
            <button className="mcv2-primary-btn" style={{ marginTop: "12px", width: "100%", background: "transparent", border: "1px solid #ed4245", color: "#ed4245" }} onClick={stopQueue}>
                {t("Stop Cleaning")}
            </button>
        </div>
    );
}

function MessageCleanerTab() {
    const [selected, setSelected] = React.useState<string[]>([]);
    const [search, setSearch] = React.useState("");

    const channels = React.useMemo(() => {
        const dms = Object.values(ChannelStore.getMutablePrivateChannels()).filter((c: any) => c.type === 1 || c.type === 3);
        const dmUserIds = new Set(dms.filter((c: any) => c.type === 1 && c.recipients).map((c: any) => c.recipients[0]));
        
        const friendIds = RelationshipStore.getFriendIDs().filter((id: string) => !dmUserIds.has(id));
        const friendMockChannels = friendIds.map((id: string) => {
            const channelId = ChannelStore.getDMFromUserId?.(id) || `friend-${id}`;
            return {
                id: channelId,
                type: 1,
                recipients: [id]
            };
        });

        const allChannels = [...dms, ...friendMockChannels];

        return allChannels.map((c: any) => {
            let name = c.name;
            let icon = null;
            let rawUser = null;

            if (c.type === 1 && c.recipients?.length > 0) {
                rawUser = UserStore.getUser(c.recipients[0]);
                name = rawUser?.globalName || rawUser?.username || "Unknown User";
                icon = rawUser?.getAvatarURL?.(null, 64, false) || (rawUser?.avatar ? `https://cdn.discordapp.com/avatars/${rawUser.id}/${rawUser.avatar}.png?size=64` : null);
            } else if (c.type === 3) {
                name = c.name || c.recipients?.map((id: string) => UserStore.getUser(id)?.username).join(", ") || "Unknown Group";
                icon = c.icon ? `https://cdn.discordapp.com/channel-icons/${c.id}/${c.icon}.png?size=64` : null;
            }

            return {
                id: c.id,
                name: name || "Unknown DM",
                icon: icon,
                rawUser
            };
        }).filter((c: any) => {
            const term = search.toLowerCase();
            return c.name.toLowerCase().includes(term) || (c.rawUser && c.rawUser.username?.toLowerCase().includes(term));
        });
    }, [search]);

    const allSelected = channels.length > 0 && selected.length === channels.length;

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelected([]);
        } else {
            setSelected(channels.map((c: any) => c.id));
        }
    };

    const toggle = (id: string) => {
        if (selected.includes(id)) setSelected(selected.filter(x => x !== id));
        else setSelected([...selected, id]);
    };

    const handleStart = () => {
        if (selected.length === 0) return;
        const items = selected.map(id => {
            const ch = channels.find((c: any) => c.id === id);
            return { type: "dm" as const, targetId: id, name: ch?.name || id, id: Math.random().toString(36).substring(7) };
        });
        addToQueue(items);
        setSelected([]);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "0 0 auto", marginBottom: "15px" }}>
                <div style={{ flex: 1 }}>
                    <TextInput
                        placeholder={t("Search DMs...")}
                        value={search}
                        onChange={setSearch}
                    />
                </div>
                <button
                    className={`mcv2-select-all-btn ${allSelected ? "active" : ""}`}
                    onClick={toggleSelectAll}
                    type="button"
                    title={allSelected ? t("Deselect All") : t("Select All")}
                >
                    <span className="mcv2-select-all-dot" />
                    {allSelected ? t("Deselect All") : t("Select All")}
                </button>
            </div>
            <div className="mcv2-scroller" style={{ flex: 1, overflowY: "auto", paddingRight: "8px" }}>
                {channels.length === 0 ? <div style={{ textAlign: "center", color: "#b5bac1", padding: "20px" }}>{t("No DMs or Friends found.")}</div> : channels.map((ch: any) => (
                    <div key={ch.id} className={`mcv2-list-item ${selected.includes(ch.id) ? "selected" : ""}`} onClick={() => toggle(ch.id)}>
                        <img src={ch.icon || "https://cdn.discordapp.com/embed/avatars/0.png"} className="mcv2-avatar" onError={(e) => (e.currentTarget.src = 'https://cdn.discordapp.com/embed/avatars/0.png')} />
                        <div className="mcv2-item-name">
                            {ch.name}
                            {ch.rawUser?.username && ch.name !== ch.rawUser.username && (
                                <span style={{ color: "#b5bac1", fontSize: "12px", marginLeft: "8px", fontWeight: "normal" }}>{ch.rawUser.username}</span>
                            )}
                        </div>
                        <div style={{ color: selected.includes(ch.id) ? "#ed4245" : "#b5bac1", fontWeight: selected.includes(ch.id) ? "bold" : "normal", minWidth: "16px", textAlign: "center" }}>
                            {selected.includes(ch.id) ? (selected.indexOf(ch.id) + 1) : "○"}
                        </div>
                    </div>
                ))}
            </div>
            <div className="mcv2-btn-row">
                <button className="mcv2-primary-btn" onClick={handleStart} disabled={selected.length === 0 || isQueueRunning} style={{ opacity: selected.length === 0 || isQueueRunning ? 0.5 : 1 }}>
                    {t("Queue Deletion")} ({selected.length})
                </button>
            </div>
            <ProgressBanner />
        </div>
    );
}

function ServersCleanerTab() {
    const [selected, setSelected] = React.useState<string[]>([]);
    const [search, setSearch] = React.useState("");

    const guilds = React.useMemo(() => {
        const gs = Object.values(GuildStore.getGuilds());
        return gs.filter((g: any) => g.name.toLowerCase().includes(search.toLowerCase()));
    }, [search]);

    const allSelected = guilds.length > 0 && selected.length === guilds.length;

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelected([]);
        } else {
            setSelected(guilds.map((g: any) => g.id));
        }
    };

    const toggle = (id: string) => {
        if (selected.includes(id)) setSelected(selected.filter(x => x !== id));
        else setSelected([...selected, id]);
    };

    const handleStart = () => {
        if (selected.length === 0) return;
        const items = selected.map(id => {
            const g = guilds.find((g: any) => g.id === id);
            return { type: "server" as const, targetId: id, name: g?.name || id, id: Math.random().toString(36).substring(7) };
        });
        addToQueue(items);
        setSelected([]);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "0 0 auto", marginBottom: "15px" }}>
                <div style={{ flex: 1 }}>
                    <TextInput
                        placeholder={t("Search Servers...")}
                        value={search}
                        onChange={setSearch}
                    />
                </div>
                <button
                    className={`mcv2-select-all-btn ${allSelected ? "active" : ""}`}
                    onClick={toggleSelectAll}
                    type="button"
                    title={allSelected ? t("Deselect All") : t("Select All")}
                >
                    <span className="mcv2-select-all-dot" />
                    {allSelected ? t("Deselect All") : t("Select All")}
                </button>
            </div>
            <div className="mcv2-scroller" style={{ flex: 1, overflowY: "auto", paddingRight: "8px" }}>
                {guilds.map((g: any) => (
                    <div key={g.id} className={`mcv2-list-item ${selected.includes(g.id) ? "selected" : ""}`} onClick={() => toggle(g.id)}>
                        <img src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`} className="mcv2-avatar" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        <div className="mcv2-item-name">{g.name}</div>
                        <div style={{ color: selected.includes(g.id) ? "#ed4245" : "#b5bac1", fontWeight: selected.includes(g.id) ? "bold" : "normal", minWidth: "16px", textAlign: "center" }}>
                            {selected.includes(g.id) ? (selected.indexOf(g.id) + 1) : "○"}
                        </div>
                    </div>
                ))}
            </div>
            <div className="mcv2-btn-row">
                <button className="mcv2-primary-btn" onClick={handleStart} disabled={selected.length === 0 || isQueueRunning} style={{ opacity: selected.length === 0 || isQueueRunning ? 0.5 : 1 }}>
                    {t("Queue Deletion")} ({selected.length})
                </button>
            </div>
            <ProgressBanner />
        </div>
    );
}

function ChannelsCleanerTab() {
    const [input, setInput] = React.useState("");

    const handleStart = () => {
        const ids = input.split(",").map(s => s.trim()).filter(s => s.length > 10);
        if (ids.length === 0) return;
        
        const items = ids.map(id => ({ type: "channel" as const, targetId: id, name: `Channel ${id}`, id: Math.random().toString(36).substring(7) }));
        addToQueue(items);
        setInput("");
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ marginBottom: "20px" }}>
                <Forms.FormTitle>{t("Channel IDs (comma separated)")}</Forms.FormTitle>
                <TextInput
                    placeholder="e.g. 123456789012345678, 987654321098765432"
                    value={input}
                    onChange={setInput}
                />
            </div>
            <div className="mcv2-btn-row" style={{ marginTop: "auto" }}>
                <button className="mcv2-primary-btn" onClick={handleStart} disabled={input.trim() === "" || isQueueRunning} style={{ opacity: input.trim() === "" || isQueueRunning ? 0.5 : 1 }}>
                    {t("Queue Deletion")}
                </button>
            </div>
            <ProgressBanner />
        </div>
    );
}

function SettingsTab() {
    const [delay, setDelay] = React.useState(getDeleteDelay);
    const [silent, setSilent] = React.useState(getUseSilentDelete);

    const handleDelayChange = (val: number) => {
        setDelay(val);
        setDeleteDelay(val);
    };

    const handleSilentToggle = (val: boolean) => {
        setSilent(val);
        setUseSilentDelete(val);
    };

    const getSpeedLabel = (ms: number) => {
        if (ms <= 300) return `${ms}ms — ${t("Ultra Fast (Caution: high rate limits)")}`;
        if (ms <= 600) return `${ms}ms — ${t("Fast")}`;
        if (ms <= 1200) return `${ms}ms — ${t("Balanced / Recommended")}`;
        return `${ms}ms — ${t("Safe / Stealth (Low rate limit risk)")}`;
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", height: "100%" }}>
            <div className="mcv2-setting-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div>
                        <div style={{ fontSize: "15px", fontWeight: 600, color: "#ffffff" }}>
                            {t("Deletion Speed & Delay")}
                        </div>
                        <div style={{ fontSize: "13px", color: "#949ba4", marginTop: "4px" }}>
                            {t("Configure the time interval between each deleted message. Lower values delete faster.")}
                        </div>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: delay <= 400 ? "#f0b232" : "#23a55a", background: "rgba(255,255,255,0.06)", padding: "4px 10px", borderRadius: "6px", whiteSpace: "nowrap" }}>
                        {delay} ms
                    </span>
                </div>

                <input
                    type="range"
                    min={50}
                    max={2500}
                    step={50}
                    value={delay}
                    onChange={e => handleDelayChange(Number(e.target.value))}
                    className="mcv2-speed-slider"
                />

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px", fontSize: "12px", color: "#949ba4" }}>
                    <span>50ms ({t("Fast")})</span>
                    <span style={{ color: "#dbdee1", fontWeight: 600 }}>{getSpeedLabel(delay)}</span>
                    <span>2500ms ({t("Safe")})</span>
                </div>
            </div>

            <div className="mcv2-setting-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ paddingRight: "16px" }}>
                        <div style={{ fontSize: "15px", fontWeight: 600, color: "#ffffff" }}>
                            {t("Silent Delete Mode")}
                        </div>
                        <div style={{ fontSize: "13px", color: "#949ba4", marginTop: "4px" }}>
                            {t("When enabled, all messages are deleted using the SilentDelete technique (bypassing loggers). When disabled, regular messages are deleted normally and calls launched by you are silently deleted.")}
                        </div>
                    </div>
                    <button
                        className={`mcv2-switch-btn ${silent ? "active" : ""}`}
                        onClick={() => handleSilentToggle(!silent)}
                        type="button"
                        title={silent ? t("Enabled") : t("Disabled")}
                    >
                        <span className="mcv2-switch-knob" />
                    </button>
                </div>
            </div>
        </div>
    );
}

function LogsTab() {
    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div className="mcv2-scroller" style={{ flex: 1, overflowY: "auto", paddingRight: "8px", marginBottom: "15px" }}>
                {logs.length === 0 ? <div style={{ textAlign: "center", color: "#b5bac1", padding: "20px" }}>{t("No logs yet.")}</div> : logs.map(l => (
                    <div key={l.id} className="mcv2-log-item">
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                            <strong style={{ color: "#dbdee1" }}>{l.type.toUpperCase()}: {l.targetName}</strong>
                            <span style={{ fontSize: "12px", color: "#b5bac1" }}>{new Date(l.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div style={{ fontSize: "13px", color: "#b5bac1" }}>
                            <span style={{ color: "#3ba55c" }}>Deleted: {l.deleted}</span> | <span style={{ color: "#ed4245" }}>Failed: {l.failed}</span> | Skipped: {l.skipped}
                        </div>
                    </div>
                ))}
            </div>
            <div className="mcv2-btn-row">
                <button className="mcv2-primary-btn" onClick={exportLogs} style={{ background: "#4e5058" }}>
                    {t("Export Logs")}
                </button>
            </div>
        </div>
    );
}

function CleanerModal({ rootProps }: { rootProps: any }) {
    const [activeTab, setActiveTab] = React.useState("dms");
    const forceUpdate = useForceUpdate();

    React.useEffect(() => {
        listeners.add(forceUpdate);
        return () => { listeners.delete(forceUpdate); };
    }, []);

    const TABS = [
        { id: "dms", label: t("Message Cleaner") },
        { id: "servers", label: t("Servers Cleaner") },
        { id: "channels", label: t("Channels Cleaner") },
        { id: "settings", label: t("Settings") },
        { id: "logs", label: t("Logs") }
    ];

    return (
        <ModalRoot {...rootProps} size="large" className="mcv2-root">
            <style>{MODAL_STYLES}</style>
            
            <div className="mcv2-header">
                <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "8px", background: "#ed4245", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
                        <CleanerIcon width={24} height={24} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#ffffff" }}>Message Cleaner</h2>
                        <div style={{ fontSize: "12px", color: "#b5bac1", marginTop: "2px" }}>{t("MessageCleaner Description")}</div>
                    </div>
                    <ModalCloseButton onClick={rootProps.onClose} />
                </div>
            </div>

            <div className="mcv2-tabs">
                {TABS.map(t => (
                    <div 
                        key={t.id} 
                        className={`mcv2-tab ${activeTab === t.id ? "active" : ""}`}
                        onClick={() => setActiveTab(t.id)}
                    >
                        {t.label}
                    </div>
                ))}
            </div>

            <ModalContent className="mcv2-content">
                {activeTab === "dms" && <MessageCleanerTab />}
                {activeTab === "servers" && <ServersCleanerTab />}
                {activeTab === "channels" && <ChannelsCleanerTab />}
                {activeTab === "settings" && <SettingsTab />}
                {activeTab === "logs" && <LogsTab />}
            </ModalContent>
        </ModalRoot>
    );
}

// ─── Plugin Definition ────────────────────────────────────────────────────────

function IconWithProgress(props: any) {
    const forceUpdate = useForceUpdate();
    React.useEffect(() => {
        listeners.add(forceUpdate);
        return () => { listeners.delete(forceUpdate); };
    }, []);

    return (
        <div {...props} style={{ ...props.style, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: props.width || 24, height: props.height || 24 }}>
            <CleanerIcon width={props.width || 24} height={props.height || 24} />
            {isQueueRunning && currentTask && (
                <div style={{ position: "absolute", bottom: -4, left: 0, right: 0, height: 3, background: "white", borderRadius: 1.5, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "#ed4245", width: `${currentTask.percentage}%`, transition: "width 0.3s ease" }} />
                </div>
            )}
        </div>
    );
}

function HeaderButton() {
    return (
        <HeaderBarButton
            icon={IconWithProgress}
            tooltip="Message Cleaner"
            onClick={() => openModal(props => <CleanerModal rootProps={props} />)}
        />
    );
}

function handleContextClean(type: "channel" | "server" | "dm", targetId: string, name: string) {
    addToQueue([{ type, targetId, name, id: Math.random().toString(36).substring(7) }]);
    showToast(t("Added to Message Cleaner Queue"), Toasts.Type.SUCCESS);
}

const ChannelContextMenuPatch: NavContextMenuPatchCallback = (children, ctx: { channel?: any; message?: any; } = {}) => {
    const { channel } = ctx;
    if (!channel) return;

    const isPrivateDM = channel.type === 1 || channel.type === 3 || (typeof channel.isPrivate === "function" && channel.isPrivate());
    const menuItems: any[] = [];

    if (isQueueRunning) {
        menuItems.push(
            <Menu.MenuItem key="stop-cleaning" id="vc-stop-cleaning"
                label={t("Stop Cleaning")} color="danger" action={stopQueue} />
        );
    } else {
        menuItems.push(
            <Menu.MenuItem key="clean-messages" id="vc-clean-messages"
                label={t("Clean messages")} color="danger"
                action={() => handleContextClean(isPrivateDM ? "dm" : "channel", channel.id, channel.name || "Channel")} />
        );
    }

    const topGroup = (
        <Menu.MenuGroup key="vc-cleaner-top-group">
            {menuItems}
            <Menu.MenuSeparator key="separator-cleaner-top" />
        </Menu.MenuGroup>
    );

    // Place AT THE VERY TOP of the right-click menu
    children.unshift(topGroup);
};

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, ctx: { channel?: any; message?: any; user?: any; } = {}) => {
    const { channel, user } = ctx;
    if (!channel) return;

    const isPrivateDM = channel.type === 1 || channel.type === 3 || (typeof channel.isPrivate === "function" && channel.isPrivate());
    const menuItems: any[] = [];

    if (isQueueRunning) {
        menuItems.push(
            <Menu.MenuItem key="stop-cleaning-user" id="vc-stop-cleaning-user"
                label={t("Stop Cleaning")} color="danger" action={stopQueue} />
        );
    } else {
        menuItems.push(
            <Menu.MenuItem key="clean-messages-user" id="vc-clean-messages-user"
                label={t("Clean messages")} color="danger"
                action={() => handleContextClean(isPrivateDM ? "dm" : "channel", channel.id, channel.name || user?.username || "User")} />
        );
    }

    if (menuItems.length === 0) return;

    const topGroup = (
        <Menu.MenuGroup key="vc-user-cleaner-top-group">
            {menuItems}
            <Menu.MenuSeparator key="separator-user-cleaner-top" />
        </Menu.MenuGroup>
    );

    // Place AT THE VERY TOP of the right-click menu
    children.unshift(topGroup);
};

const GuildContextMenuPatch: NavContextMenuPatchCallback = (children, ctx: { guild?: any; } = {}) => {
    const { guild } = ctx;
    if (!guild) return;

    const menuItems: any[] = [];

    if (isQueueRunning) {
        menuItems.push(
            <Menu.MenuItem key="stop-cleaning-guild" id="vc-stop-cleaning-guild"
                label={t("Stop Cleaning")} color="danger" action={stopQueue} />
        );
    } else {
        menuItems.push(
            <Menu.MenuItem key="clean-guild-messages" id="vc-clean-guild-messages"
                label={t("Clean all my messages")} color="danger"
                action={() => handleContextClean("server", guild.id, guild.name || "Server")} />
        );
    }

    const topGroup = (
        <Menu.MenuGroup key="vc-guild-cleaner-top-group">
            {menuItems}
            <Menu.MenuSeparator key="separator-guild-cleaner-top" />
        </Menu.MenuGroup>
    );

    // Place AT THE VERY TOP of the right-click menu
    children.unshift(topGroup);
};

const MessageContextMenuPatch: NavContextMenuPatchCallback = (children, ctx: { channel?: any; message?: any; } = {}) => {
    const { channel } = ctx;
    if (!channel) return;

    const isPrivateDM = channel.type === 1 || channel.type === 3 || (typeof channel.isPrivate === "function" && channel.isPrivate());

    const menuItems: any[] = [];

    if (isQueueRunning) {
        menuItems.push(
            <Menu.MenuItem key="stop-cleaning-msg" id="vc-stop-cleaning-msg"
                label={t("Stop Cleaning")} color="danger" action={stopQueue} />
        );
    } else {
        menuItems.push(
            <Menu.MenuItem key="clean-messages-msg" id="vc-clean-messages-msg"
                label={t("Clean messages")} color="danger"
                action={() => handleContextClean(isPrivateDM ? "dm" : "channel", channel.id, channel.name || "Channel")} />
        );
    }

    const topGroup = (
        <Menu.MenuGroup key="vc-msg-cleaner-top-group">
            {menuItems}
            <Menu.MenuSeparator key="separator-msg-cleaner-top" />
        </Menu.MenuGroup>
    );

    // Place AT THE VERY TOP of the right-click menu
    children.unshift(topGroup);
};

export default definePlugin({
    name: "MessageCleaner",
    description: "An advanced UI for cleaning messages across DMs, Servers, and Channels. Includes context menu options.",
    authors: [
        { name: "LoliCord", id: 0n },
        { name: "Bash", id: 1327483363518582784n }
    ],
    enabledByDefault: true,
    dependencies: ["HeaderBarAPI", "ContextMenuAPI"],

    contextMenus: {
        "channel-context": ChannelContextMenuPatch,
        "gdm-context": ChannelContextMenuPatch,
        "user-context": UserContextMenuPatch,
        "guild-context": GuildContextMenuPatch,
        "message-context": MessageContextMenuPatch
    },

    start() {
        addHeaderBarButton("MessageCleaner", HeaderButton, 7);
    },

    stop() {
        removeHeaderBarButton("MessageCleaner");
        stopQueue();
    }
});

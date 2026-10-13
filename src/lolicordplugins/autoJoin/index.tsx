/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { User } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import {
    CallStore,
    ChannelActions,
    ChannelRouter,
    ChannelStore,
    FluxDispatcher,
    Menu,
    React,
    showToast,
    Toasts,
    UserStore,
    VoiceStateStore,
} from "@webpack/common";
import { t } from "../autoTranslateLoliCord";

const ChannelVoiceActions = findByPropsLazy("selectVoiceChannel", "disconnect");
const VoiceStateActions = findByPropsLazy("selectVoiceChannel", "connectToVoiceChannel");
const FallbackVoiceActions = findByPropsLazy("selectVoiceChannel");

const settings = definePluginSettings({
    allowedUserIds: {
        type: OptionType.STRING,
        name: "Allowed User IDs",
        description: "User IDs allowed to auto-join (separated by comma, space, or newline, or * for all)",
        default: "",
        restartNeeded: false,
    },
    video: {
        type: OptionType.BOOLEAN,
        name: "Answer with Video",
        description: "Answer calls with video/camera enabled.",
        default: false,
        restartNeeded: false,
    },
    delay: {
        type: OptionType.NUMBER,
        name: "Join Delay (ms)",
        description: "Delay before automatically answering in milliseconds (0 for instant).",
        default: 0,
        restartNeeded: false,
    },
    notify: {
        type: OptionType.BOOLEAN,
        name: "Show Notification",
        description: "Show a toast notification when automatically joining a call.",
        default: true,
        restartNeeded: false,
    },
});

function parseAllowedUserIds(raw: string): { set: Set<string>; all: boolean; } {
    if (!raw) return { set: new Set(), all: false };
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === "*" || trimmed === "all" || trimmed === "tous") {
        return { set: new Set(), all: true };
    }
    const matches = raw.match(/\d{15,22}/g);
    return { set: new Set(matches ?? []), all: false };
}

const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const lastJoinedTime = new Map<string, number>();
const manuallyLeftChannels = new Set<string>();
let lastUserChannel: string | null = null;
let checkInterval: ReturnType<typeof setInterval> | null = null;
let fluxSubscribed = false;

function getCurrentUserChannel(): string | null {
    try {
        const currentUser = UserStore?.getCurrentUser?.();
        if (!currentUser) return null;
        return VoiceStateStore?.getVoiceStateForUser?.(currentUser.id)?.channelId ?? null;
    } catch {
        return null;
    }
}

function updateCurrentUserChannelTracker() {
    const currentChannel = getCurrentUserChannel();
    if (lastUserChannel && currentChannel !== lastUserChannel) {
        // The user was in lastUserChannel and left or disconnected!
        manuallyLeftChannels.add(lastUserChannel);
    }
    lastUserChannel = currentChannel;
}

function isChannelStillActiveWithCaller(channelId: string): boolean {
    try {
        const currentUserId = UserStore.getCurrentUser()?.id;
        const all: any = VoiceStateStore?.getAllVoiceStates?.() ?? {};
        for (const guildMap of Object.values(all) as any[]) {
            if (!guildMap || typeof guildMap !== "object") continue;
            for (const [userId, vs] of Object.entries(guildMap) as any[]) {
                if (userId !== currentUserId && vs?.channelId === channelId) {
                    return true;
                }
            }
        }
        const call = CallStore?.getCall?.(channelId);
        if (call && Array.isArray(call.voiceStates) && call.voiceStates.some((vs: any) => vs?.userId !== currentUserId)) {
            return true;
        }
    } catch {}
    return false;
}

function joinChannel(channelId: string, callerId?: string) {
    const now = Date.now();
    const last = lastJoinedTime.get(channelId) ?? 0;
    if (now - last < 4000) return;
    lastJoinedTime.set(channelId, now);

    const withVideo = Boolean(settings.store.video);
    const ch = ChannelStore?.getChannel?.(channelId);
    const guildId = ch?.guild_id ?? null;

    lastUserChannel = channelId;

    // Instant microtask execution just like followUser to prevent dispatch-in-dispatch collision
    queueMicrotask(() => {
        try {
            FluxDispatcher?.dispatch?.({
                type: "VOICE_CHANNEL_SELECT",
                channelId,
                guildId,
                video: withVideo,
                stream: false,
                currentVoiceChannelId: null,
            });
        } catch {}

        try {
            if (typeof ChannelVoiceActions?.selectVoiceChannel === "function") {
                ChannelVoiceActions.selectVoiceChannel(channelId, withVideo);
            } else if (typeof VoiceStateActions?.selectVoiceChannel === "function") {
                VoiceStateActions.selectVoiceChannel(channelId, withVideo);
            } else if (typeof FallbackVoiceActions?.selectVoiceChannel === "function") {
                FallbackVoiceActions.selectVoiceChannel(channelId, withVideo);
            }
        } catch {}

        try {
            if (typeof ChannelActions?.selectChannel === "function") {
                ChannelActions.selectChannel(channelId);
            } else if (typeof ChannelRouter?.transitionToChannel === "function") {
                ChannelRouter.transitionToChannel(channelId);
            }
        } catch {}
    });

    if (settings.store.notify && callerId) {
        try {
            const caller = UserStore.getUser(callerId);
            const callerName = caller?.globalName || caller?.username || callerId;
            showToast(
                `${t("Auto-joined call from")} ${callerName}`,
                Toasts.Type.SUCCESS
            );
        } catch {}
    }
}

function scheduleOrJoin(channelId: string, callerId: string) {
    const currentChannel = getCurrentUserChannel();
    if (currentChannel === channelId) return;

    // If the user intentionally hung up or left this ongoing call session, do not re-join!
    if (manuallyLeftChannels.has(channelId)) return;

    const now = Date.now();
    const last = lastJoinedTime.get(channelId) ?? 0;
    if (now - last < 4000) return;
    if (pendingTimeouts.has(channelId)) return;

    const delayMs = Math.max(0, Number(settings.store.delay) || 0);
    if (delayMs <= 0) {
        joinChannel(channelId, callerId);
    } else {
        const timeout = setTimeout(() => {
            pendingTimeouts.delete(channelId);
            if (!manuallyLeftChannels.has(channelId)) {
                joinChannel(channelId, callerId);
            }
        }, delayMs);
        pendingTimeouts.set(channelId, timeout);
    }
}

function isDMChannel(channelId: string): boolean {
    try {
        const ch = ChannelStore?.getChannel?.(channelId);
        if (!ch) return true; // If unknown channel, treat as potential DM
        return Boolean(ch.isDM?.() || ch.isGroupDM?.() || (ch as any).type === 1 || (ch as any).type === 3 || !ch.guild_id);
    } catch {
        return true;
    }
}

function checkCallsAndVoice() {
    updateCurrentUserChannelTracker();

    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return;

    const myChannel = getCurrentUserChannel();

    // Clean up manually left channels if the call ended or the caller left
    for (const chId of Array.from(manuallyLeftChannels)) {
        if (!isChannelStillActiveWithCaller(chId)) {
            manuallyLeftChannels.delete(chId);
        }
    }

    const { set: allowedSet, all: allowAll } = parseAllowedUserIds(settings.store.allowedUserIds);
    if (!allowAll && allowedSet.size === 0) return;

    // 1. Check VoiceStateStore (Exact method used by followUser)
    try {
        const all: any = VoiceStateStore?.getAllVoiceStates?.() ?? {};
        for (const guildMap of Object.values(all) as any[]) {
            if (!guildMap || typeof guildMap !== "object") continue;
            for (const [userId, vs] of Object.entries(guildMap) as any[]) {
                if (userId === currentUserId) continue;
                const chId = vs?.channelId;
                if (!chId || chId === myChannel) continue;
                if (manuallyLeftChannels.has(chId)) continue;

                if (isDMChannel(chId)) {
                    if (allowAll || allowedSet.has(userId)) {
                        scheduleOrJoin(chId, userId);
                        return;
                    }
                }
            }
        }
    } catch {}

    // Check individual allowed users from VoiceStateStore
    if (!allowAll) {
        for (const userId of allowedSet) {
            try {
                const vs = VoiceStateStore?.getVoiceStateForUser?.(userId);
                if (vs?.channelId && vs.channelId !== myChannel && !manuallyLeftChannels.has(vs.channelId) && isDMChannel(vs.channelId)) {
                    scheduleOrJoin(vs.channelId, userId);
                    return;
                }
            } catch {}
        }
    }

    // 2. Check CallStore (Incoming / active calls in DMs)
    try {
        const calls = CallStore?.getCalls?.() ?? [];
        for (const call of calls) {
            const chId = call?.channelId;
            if (!chId || chId === myChannel) continue;
            if (manuallyLeftChannels.has(chId)) continue;
            if (!isDMChannel(chId)) continue;

            // Check ringing or voice states
            let targetUserId: string | null = null;
            if (Array.isArray(call.voiceStates)) {
                for (const vs of call.voiceStates) {
                    const uid = vs?.userId;
                    if (uid && uid !== currentUserId) {
                        if (allowAll || allowedSet.has(uid)) {
                            targetUserId = uid;
                            break;
                        }
                    }
                }
            }

            if (!targetUserId && Array.isArray(call.ringing)) {
                for (const uid of call.ringing) {
                    if (uid !== currentUserId && (allowAll || allowedSet.has(uid))) {
                        targetUserId = uid;
                        break;
                    }
                }
            }

            if (!targetUserId) {
                const ch = ChannelStore?.getChannel?.(chId);
                const recId = ch?.getRecipientId?.() ?? ch?.recipients?.[0];
                if (recId && recId !== currentUserId && (allowAll || allowedSet.has(recId))) {
                    targetUserId = recId;
                }
            }

            if (targetUserId) {
                scheduleOrJoin(chId, targetUserId);
                return;
            }
        }
    } catch {}
}

const ContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user || user.id === UserStore.getCurrentUser()?.id) return;

    const { set: allowed } = parseAllowedUserIds(settings.store.allowedUserIds);
    const isAllowed = allowed.has(user.id);
    const [checked, setChecked] = React.useState(isAllowed);

    children.push(
        <Menu.MenuCheckboxItem
            id="vc-auto-join-toggle"
            label={t("Auto-Join Calls")}
            checked={checked}
            action={() => {
                const { set: currentSet } = parseAllowedUserIds(settings.store.allowedUserIds);
                if (checked) {
                    currentSet.delete(user.id);
                } else {
                    currentSet.add(user.id);
                }
                settings.store.allowedUserIds = Array.from(currentSet).join(", ");
                setChecked(!checked);
                checkCallsAndVoice();
            }}
        />
    );
};

export default definePlugin({
    name: "AutoJoin",
    description: "Automatically and instantly answers incoming calls from specified users.",
    tags: ["Voice"],
    authors: [{ name: "Nightcord", id: 0n }],
    settings,
    contextMenus: {
        "user-context": ContextMenuPatch,
    },
    flux: {
        VOICE_CHANNEL_SELECT(action: any) {
            if (action?.channelId === null || action?.channelId === undefined) {
                // User disconnected from voice channel
                if (lastUserChannel) {
                    manuallyLeftChannels.add(lastUserChannel);
                }
            } else if (action?.channelId) {
                lastUserChannel = action.channelId;
            }
            updateCurrentUserChannelTracker();
        },
        VOICE_STATE_UPDATE() {
            checkCallsAndVoice();
        },
        VOICE_STATE_UPDATES() {
            checkCallsAndVoice();
        },
        CALL_CREATE(event: any) {
            const channelId =
                event?.channelId ??
                event?.channel_id ??
                event?.call?.channel_id ??
                event?.call?.channelId;
            if (channelId) {
                // A new incoming call is arriving, allow auto-join
                manuallyLeftChannels.delete(channelId);
            }
            checkCallsAndVoice();
        },
        CALL_UPDATE() {
            checkCallsAndVoice();
        },
        CALL_DELETE(event: any) {
            const channelId =
                event?.channelId ??
                event?.channel_id ??
                event?.call?.channel_id ??
                event?.call?.channelId;
            if (channelId) {
                manuallyLeftChannels.delete(channelId);
                if (pendingTimeouts.has(channelId)) {
                    clearTimeout(pendingTimeouts.get(channelId)!);
                    pendingTimeouts.delete(channelId);
                }
            }
        },
    },
    start() {
        lastUserChannel = getCurrentUserChannel();

        if (!fluxSubscribed) {
            fluxSubscribed = true;
            try { VoiceStateStore?.addChangeListener?.(checkCallsAndVoice); } catch {}
            try { CallStore?.addChangeListener?.(checkCallsAndVoice); } catch {}
        }

        if (checkInterval) clearInterval(checkInterval);
        checkInterval = setInterval(checkCallsAndVoice, 500);

        checkCallsAndVoice();
    },
    stop() {
        if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
        }

        if (fluxSubscribed) {
            fluxSubscribed = false;
            try { VoiceStateStore?.removeChangeListener?.(checkCallsAndVoice); } catch {}
            try { CallStore?.removeChangeListener?.(checkCallsAndVoice); } catch {}
        }

        for (const t of pendingTimeouts.values()) {
            clearTimeout(t);
        }
        pendingTimeouts.clear();
        lastJoinedTime.clear();
        manuallyLeftChannels.clear();
        lastUserChannel = null;
    },
});

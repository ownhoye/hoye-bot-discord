/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { React } from "@webpack/common";

const SurveillanceIcon = ({ width = 20, height = 20 }: { width?: number; height?: number; }) => (
    <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width={width} height={height} fill="none" viewBox="0 0 24 24">
        <path fill="currentColor" d="M15.56 11.77c.2-.1.44.02.44.23a4 4 0 1 1-4-4c.21 0 .33.25.23.44a2.5 2.5 0 0 0 3.32 3.32Z" />
        <path fill="currentColor" fillRule="evenodd" d="M22.89 11.7c.07.2.07.4 0 .6C22.27 13.9 19.1 21 12 21c-7.11 0-10.27-7.11-10.89-8.7a.83.83 0 0 1 0-.6C1.73 10.1 4.9 3 12 3c7.11 0 10.27 7.11 10.89 8.7Zm-4.5-3.62A15.11 15.11 0 0 1 20.85 12c-.38.88-1.18 2.47-2.46 3.92C16.87 17.62 14.8 19 12 19c-2.8 0-4.87-1.38-6.39-3.08A15.11 15.11 0 0 1 3.15 12c.38-.88 1.18-2.47 2.46-3.92C7.13 6.38 9.2 5 12 5c2.8 0 4.87 1.38 6.39 3.08Z" clipRule="evenodd" />
    </svg>
);
import SettingsPlugin from "@plugins/_core/settings";
import { LazyComponent } from "@utils/lazyReact";
import { removeFromArray } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import type { Activity, Channel, Guild, GuildMember, Message, OnlineStatus, Role, User } from "@vencord/discord-types";
import { ActivityType } from "@vencord/discord-types/enums";
import { ChannelStore, GuildActions, GuildStore, Menu, PresenceStore, RelationshipStore, SettingsRouter, UserStore, VoiceStateStore } from "@webpack/common";
import { fetchUserProfile } from "@utils/discord";
import { tPlugin } from "@api/pluginI18n";


import { recordEvent, trimEvents } from "./store";
import type { MessageSnapshot, SurveillanceEvent, SurveillanceEventType, SurveillanceScope, VoiceParticipant, VoiceState, VoiceStateFlag } from "./types";

const SETTINGS_ENTRY_KEY = "illegalcord_surveillance";
const NOTIFICATION_COLOR = "#5865f2";
const MESSAGE_PREVIEW_LIMIT = 220;
const MESSAGE_CACHE_LIMIT = 1000;
const TYPING_COOLDOWN = 15_000;
const TYPING_CACHE_LIMIT = 2000;
const MEMBER_JOIN_FRESHNESS = 300_000;
const UPDATE_EVENT_COOLDOWN = 10_000;
const UPDATE_EVENT_CACHE_LIMIT = 2000;

interface UserSnapshot {
    username: string;
    globalName?: string | null;
    avatar?: string | null;
}

let targets: string[] = [];
let serverTargets: string[] = [];
let targetIds = new Set<string>();
let serverTargetIds = new Set<string>();
const targetListeners = new Set<() => void>();
const serverTargetListeners = new Set<() => void>();
const messageCache = new Map<string, MessageSnapshot>();
const previousVoiceStates = new Map<string, VoiceState>();
const typingCooldowns = new Map<string, number>();
const updateCooldowns = new Map<string, number>();
const seenServerUsers = new Map<string, Set<string>>();
const SurveillanceTab = LazyComponent(() => require("./components/SurveillanceTab").default);
let lastStatuses = new Map<string, OnlineStatus>();
let lastActivities = new Map<string, Map<string, string>>();
const lastUserSnapshots = new Map<string, UserSnapshot>();
let presenceStartTimer: ReturnType<typeof setTimeout> | undefined;
let presenceTrackingStarted = false;
let hydrationInterval: ReturnType<typeof setInterval> | undefined;
let profileSyncInterval: ReturnType<typeof setInterval> | undefined;

interface UserContextProps {
    user?: User;
}

interface ChannelInfo {
    channelId?: string;
    channelName?: string;
    guildId?: string;
    guildName?: string;
}

interface ChannelFluxEvent {
    channel?: Channel;
    channelId?: string;
    guildId?: string;
}

interface GuildFluxEvent {
    guild?: Guild;
    guildId?: string;
}

interface GuildMemberFluxEvent {
    guildId?: string;
    guild_id?: string;
    member?: GuildMember;
    user?: User;
    userId?: string;
}

interface RoleFluxEvent {
    guildId?: string;
    guild_id?: string;
    role?: Role;
    roleId?: string;
}

interface ReactionEmoji {
    id?: string;
    name?: string;
    animated?: boolean;
}

interface MessageReactionFluxEvent {
    channelId: string;
    messageId: string;
    userId?: string;
    emoji?: ReactionEmoji;
}

type DisplayUser = User & { globalName?: string | null; };

const voiceStateLabels: Array<[VoiceStateFlag, string, string]> = [
    ["mute", "Server muted", "Server unmuted"],
    ["deaf", "Server deafened", "Server undeafened"],
    ["selfMute", "Muted", "Unmuted"],
    ["selfDeaf", "Deafened", "Undeafened"],
    ["selfVideo", "Enabled video", "Disabled video"],
    ["selfStream", "Started streaming", "Stopped streaming"],
    ["suppress", "Suppressed by stage", "Unsuppressed by stage"],
];

const updateTargets = (value: string): string[] => {
    targets = [...new Set(value.match(/\d+/g) ?? [])];
    targetIds = new Set(targets);
    for (const id of targets) {
        try {
            const vs = VoiceStateStore?.getVoiceStateForUser?.(id);
            if (vs?.channelId) {
                previousVoiceStates.set(id, vs);
            }
        } catch { }
        const user = UserStore.getUser(id);
        if (user) {
            lastUserSnapshots.set(id, {
                username: user.username,
                globalName: (user as DisplayUser).globalName,
                avatar: user.avatar,
            });
        }
    }
    if (presenceTrackingStarted) {
        seedPresence();
    }
    hydrateTargetPresences();
    void syncTargetProfiles();
    targetListeners.forEach(listener => listener());
    return targets;
};

const updateServerTargets = (value: string): string[] => {
    serverTargets = [...new Set(value.match(/\d+/g) ?? [])];
    serverTargetIds = new Set(serverTargets);
    serverTargetListeners.forEach(listener => listener());
    return serverTargets;
};

export const getTargets = () => targets;

export const getServerTargets = () => serverTargets;

export const subscribeTargets = (listener: () => void) => {
    targetListeners.add(listener);
    return () => targetListeners.delete(listener);
};

export const subscribeServerTargets = (listener: () => void) => {
    serverTargetListeners.add(listener);
    return () => serverTargetListeners.delete(listener);
};

export function setTargets(nextTargets: string[]) {
    settings.store.targets = [...new Set(nextTargets.filter(Boolean))].join(",");
    updateTargets(settings.store.targets);
}

export function addTarget(userId: string) {
    setTargets([...targets, userId]);
}

export function removeTarget(userId: string) {
    setTargets(targets.filter(target => target !== userId));
}

export function setServerTargets(nextServerTargets: string[]) {
    settings.store.serverTargets = [...new Set(nextServerTargets.filter(Boolean))].join(",");
    updateServerTargets(settings.store.serverTargets);
}

export function addServerTarget(guildId: string) {
    setServerTargets([...serverTargets, guildId]);
}

export function removeServerTarget(guildId: string) {
    setServerTargets(serverTargets.filter(target => target !== guildId));
}

function syncSettingsSidebar(show?: boolean) {
    const shouldShow = show ?? settings.store.showInSettingsSidebar ?? true;
    while (SettingsPlugin.customEntries.some(entry => entry.key === SETTINGS_ENTRY_KEY)) {
        removeFromArray(SettingsPlugin.customEntries, entry => entry.key === SETTINGS_ENTRY_KEY);
    }
    if (shouldShow) {
        const diagIndex = SettingsPlugin.customEntries.findIndex(entry => entry.key === "vc-client-diagnostics");
        const entry = {
            key: SETTINGS_ENTRY_KEY,
            title: "Surveillance",
            Component: ErrorBoundary.wrap(SurveillanceTab, { noop: true }),
            Icon: SurveillanceIcon,
        };
        if (diagIndex !== -1) {
            SettingsPlugin.customEntries.splice(diagIndex + 1, 0, entry);
        } else {
            SettingsPlugin.customEntries.push(entry);
        }
    }
}

export const settings = definePluginSettings({
    targets: {
        type: OptionType.STRING,
        placeholder: "1234,5678",
        description: "Discord user IDs to monitor from live visible events.",
        default: "",
        onChange: updateTargets,
    },
    serverTargets: {
        type: OptionType.STRING,
        placeholder: "1234,5678",
        description: "Discord server IDs to monitor from live visible events.",
        default: "",
        onChange: updateServerTargets,
    },
    showInSettingsSidebar: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Show Surveillance tab in settings sidebar.",
        onChange: (val: boolean) => syncSettingsSidebar(val),
    },
    addContextMenu: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Add a Surveillance toggle to user context menus.",
    },
    ignoreBots: {
        type: OptionType.BOOLEAN,
        default: false,
        description: "Ignore bot accounts while logging user activity.",
    },
    logMessages: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Log live messages from monitored users.",
    },
    captureMessageContent: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Include message previews in local logs.",
    },
    logMessageChanges: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Log edits and deletes for messages seen during this session.",
    },
    logTyping: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Log typing signals with a short cooldown.",
    },
    logReactions: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Log live reaction adds and removals.",
    },
    logStatus: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Log online, idle, dnd, and offline transitions.",
        onChange: syncPresenceTracking,
    },
    logActivities: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Log activity starts, stops, and updates.",
        onChange: syncPresenceTracking,
    },
    logVoice: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Log voice joins, leaves, moves, and state changes.",
    },
    logCalls: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Log direct calls and voice calls for monitored users.",
    },
    logMemberUpdates: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Log server member update events.",
    },
    notifyEvents: {
        type: OptionType.BOOLEAN,
        default: false,
        description: "Send notifications for high signal surveillance events.",
    },
    trackSelf: {
        type: OptionType.BOOLEAN,
        default: false,
        description: "Include your own account if its ID is in the target list.",
    },
    maxEvents: {
        type: OptionType.NUMBER,
        default: 1000,
        description: "Maximum number of local events to keep.",
        onChange: value => void trimEvents(value),
    },
});

const makeId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const getUsername = (userId: string, fallback?: string) =>
    fallback ?? UserStore.getUser(userId)?.username ?? userId;

const getDisplayUser = (userId: string) =>
    UserStore.getUser(userId) as DisplayUser | undefined;

const preview = (content: string) =>
    content.length > MESSAGE_PREVIEW_LIMIT
        ? `${content.slice(0, MESSAGE_PREVIEW_LIMIT)}...`
        : content;

const isCurrentUser = (userId: string) =>
    userId === UserStore.getCurrentUser()?.id;

const isBotUser = (userId: string, user?: User) =>
    Boolean(user?.bot ?? UserStore.getUser(userId)?.bot);

const shouldIgnoreUser = (userId: string, user?: User) =>
    settings.store.ignoreBots && isBotUser(userId, user);

const shouldTrackUser = (userId: string) => {
    if (!targetIds.has(userId)) return false;
    if (shouldIgnoreUser(userId)) return false;
    if (settings.store.trackSelf) return true;
    return !isCurrentUser(userId);
};

const shouldTrackServer = (guildId?: string) =>
    guildId != null && serverTargetIds.has(guildId);

const getScope = (userId: string, guildId?: string): SurveillanceScope | undefined => {
    if (shouldIgnoreUser(userId)) return;
    if (shouldTrackUser(userId)) return "person";
    if (shouldTrackServer(guildId) && !isCurrentUser(userId)) return "server";
};

const shouldTrackEvent = (userId: string, guildId?: string) =>
    getScope(userId, guildId) != null;

function shouldTrackPresence() {
    return settings.store.logActivities || settings.store.logStatus;
}

function syncPresenceTracking() {
    if (shouldTrackPresence()) startPresenceTracking();
    else stopPresenceTracking();
}

const formatChannelName = (channelId: string | undefined): string | undefined => {
    if (!channelId) return undefined;
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return undefined;
    if (channel.name) return channel.name;
    if (channel.isDM?.() || channel.type === 1) {
        const recipientId = channel.getRecipientId?.() ?? channel.recipients?.[0];
        if (recipientId) {
            const user = UserStore.getUser(recipientId);
            return user ? `@${(user as DisplayUser).globalName ?? user.username}` : `DM (${recipientId})`;
        }
        return "Direct Message";
    }
    if (channel.isGroupDM?.() || channel.type === 3) {
        const recipients: string[] = channel.recipients ?? [];
        const names = recipients.map(id => UserStore.getUser(id)?.username ?? id).filter(Boolean);
        return names.length > 0 ? `Group: ${names.slice(0, 3).join(", ")}` : "Group DM";
    }
    return undefined;
};

const getChannelInfo = (channelId: string | undefined): ChannelInfo => {
    if (!channelId) return {};

    const channel = ChannelStore.getChannel(channelId);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : undefined;

    return {
        channelId,
        channelName: formatChannelName(channelId),
        guildId: channel?.guild_id,
        guildName: guild?.name,
    };
};

const getVoiceParticipants = (channelId: string | undefined, userId: string): VoiceParticipant[] => {
    if (!channelId) return [];

    return Object.values(VoiceStateStore.getVoiceStatesForChannel(channelId) ?? {})
        .filter(state => state.userId !== userId)
        .map(state => {
            const user = getDisplayUser(state.userId);
            const username = user?.username ?? "Unknown user";

            return {
                userId: state.userId,
                username,
                displayName: user?.globalName ?? username,
                isFriend: RelationshipStore.isFriend(state.userId),
            };
        });
};

const getVoiceDetails = (details: string, channelId: string | undefined, userId: string) => {
    const voiceParticipants = getVoiceParticipants(channelId, userId);
    const people = voiceParticipants.length === 1 ? "1 other person" : `${voiceParticipants.length} other people`;

    return {
        details: `${details} ${voiceParticipants.length ? `${people} in voice.` : "No one else in voice."}`,
        voiceParticipants,
    };
};

const getGuildInfo = (guildId: string | undefined): Pick<SurveillanceEvent, "guildId" | "guildName"> => {
    const guild = guildId ? GuildStore.getGuild(guildId) : undefined;

    return {
        guildId,
        guildName: guild?.name,
    };
};

const getChannelEventInfo = (event: ChannelFluxEvent): ChannelInfo => {
    const channelId = event.channel?.id ?? event.channelId;
    const channelInfo = getChannelInfo(channelId);
    const guildId = event.channel?.guild_id ?? event.guildId ?? channelInfo.guildId;
    const guild = guildId ? GuildStore.getGuild(guildId) : undefined;

    return {
        channelId,
        channelName: event.channel?.name ?? channelInfo.channelName,
        guildId,
        guildName: guild?.name ?? channelInfo.guildName,
    };
};

const MAX_SEEN_SERVER_USERS = 500;

const rememberServerUser = (userId: string, guildId?: string) => {
    if (isCurrentUser(userId)) return;
    if (shouldIgnoreUser(userId)) return;
    if (!guildId || !serverTargetIds.has(guildId)) return;

    if (!seenServerUsers.has(userId) && seenServerUsers.size >= MAX_SEEN_SERVER_USERS) {
        const oldest = seenServerUsers.keys().next().value;
        if (oldest) {
            seenServerUsers.delete(oldest);
            lastStatuses.delete(oldest);
            lastActivities.delete(oldest);
        }
    }

    let guildIds = seenServerUsers.get(userId);
    if (!guildIds) {
        guildIds = new Set();
        seenServerUsers.set(userId, guildIds);
    }

    guildIds.add(guildId);

    if (!lastStatuses.has(userId)) {
        const status = PresenceStore.getStatus?.(userId) ?? PresenceStore.getState()?.statuses?.[userId] ?? "offline";
        lastStatuses.set(userId, status);
        if (settings.store.logActivities) lastActivities.set(userId, getActivityMap(userId));
    }
};

const getSeenServerGuildId = (userId: string) => {
    const guildIds = seenServerUsers.get(userId);
    if (!guildIds) return undefined;

    for (const guildId of guildIds) {
        if (serverTargetIds.has(guildId)) return guildId;
    }
};

const getPresenceUserIds = () => {
    const userIds = new Set(targets);

    for (const userId of seenServerUsers.keys()) {
        if (getSeenServerGuildId(userId)) userIds.add(userId);
    }

    return userIds;
};

const notify = (event: SurveillanceEvent) => {
    if (!settings.store.notifyEvents) return;
    if (event.type === "typing" || event.type === "message_edit" || event.type === "message_delete") return;

    const user = UserStore.getUser(event.userId);

    showNotification({
        title: "Surveillance",
        body: `${event.username}: ${event.details}`,
        color: NOTIFICATION_COLOR,
        icon: user?.getAvatarURL?.() ?? user?.avatar,
    });
};

const rememberMessage = (messageId: string, snapshot: MessageSnapshot) => {
    messageCache.set(messageId, snapshot);

    if (messageCache.size <= MESSAGE_CACHE_LIMIT) return;

    const oldest = messageCache.keys().next();
    if (!oldest.done) messageCache.delete(oldest.value);
};

const pruneTypingCooldowns = (now: number) => {
    if (typingCooldowns.size <= TYPING_CACHE_LIMIT) return;

    for (const [key, lastTypedAt] of typingCooldowns) {
        if (now - lastTypedAt > TYPING_COOLDOWN) typingCooldowns.delete(key);
    }
};

const pruneUpdateCooldowns = (now: number) => {
    if (updateCooldowns.size <= UPDATE_EVENT_CACHE_LIMIT) return;

    for (const [key, lastLoggedAt] of updateCooldowns) {
        if (now - lastLoggedAt > UPDATE_EVENT_COOLDOWN) updateCooldowns.delete(key);
    }
};

const shouldLogUpdateEvent = (key: string) => {
    const now = Date.now();
    const lastLoggedAt = updateCooldowns.get(key) ?? 0;
    if (now - lastLoggedAt < UPDATE_EVENT_COOLDOWN) return false;

    updateCooldowns.set(key, now);
    pruneUpdateCooldowns(now);
    return true;
};

const addEvent = (entry: Omit<SurveillanceEvent, "id" | "timestamp">) => {
    const event: SurveillanceEvent = {
        id: makeId(),
        timestamp: Date.now(),
        ...entry,
    };

    void recordEvent(event, settings.store.maxEvents);
    notify(event);
};

const addUserEvent = (type: SurveillanceEventType, userId: string, details: string, extra: Partial<SurveillanceEvent> = {}) => {
    const scope = extra.scope ?? getScope(userId, extra.guildId);
    if (!scope) return;

    addEvent({
        type,
        userId,
        username: getUsername(userId, extra.username),
        details,
        scope,
        ...extra,
    });
};

const addServerEvent = (type: SurveillanceEventType, guildId: string | undefined, details: string, extra: Partial<SurveillanceEvent> = {}) => {
    if (!shouldTrackServer(guildId)) return;

    addEvent({
        type,
        userId: extra.userId ?? guildId ?? "server",
        username: extra.username ?? "Server",
        details,
        scope: "server",
        ...getGuildInfo(guildId),
        ...extra,
    });
};

const getActivityKey = (activity: Activity) =>
    [activity.type, activity.application_id ?? "", activity.name, activity.platform ?? ""].join(":");

const formatActivityType = (type: ActivityType) => {
    switch (type) {
        case ActivityType.STREAMING:
            return "streaming";
        case ActivityType.LISTENING:
            return "listening to";
        case ActivityType.WATCHING:
            return "watching";
        case ActivityType.COMPETING:
            return "competing in";
        case ActivityType.HANG_STATUS:
            return "hanging out in";
        default:
            return "playing";
    }
};

const formatActivity = (activity: Activity) => {
    if (activity.type === ActivityType.CUSTOM_STATUS) {
        return [activity.emoji?.name, activity.state ?? activity.name].filter(Boolean).join(" ");
    }

    const details = activity.details ? `: ${activity.details}` : "";
    const state = activity.state ? ` (${activity.state})` : "";
    return `${formatActivityType(activity.type)} ${activity.name}${details}${state}`;
};

const getActivityMap = (userId: string) => {
    const activities = PresenceStore.getActivities(userId) ?? [];
    const activityMap = new Map<string, string>();

    for (const activity of activities) {
        activityMap.set(getActivityKey(activity), formatActivity(activity));
    }

    return activityMap;
};

const formatClientStatus = (clientStatus?: { desktop?: string; mobile?: string; web?: string; }) => {
    if (!clientStatus) return "";
    const devices: string[] = [];
    if (clientStatus.desktop) devices.push("Desktop");
    if (clientStatus.mobile) devices.push("Mobile");
    if (clientStatus.web) devices.push("Web");
    return devices.length > 0 ? ` (${devices.join(", ")})` : "";
};

export function hydrateTargetPresences() {
    if (!targetIds.size) return;
    const targetsArray = Array.from(targetIds);
    try {
        const guilds = GuildStore.getGuilds?.();
        if (!guilds) return;
        for (const guildId of Object.keys(guilds)) {
            try {
                (GuildActions as any)?.requestMembersById?.(guildId, targetsArray, true);
            } catch { }
        }
    } catch { }
}

export async function syncTargetProfiles() {
    if (!targetIds.size) return;
    for (const id of targetIds) {
        try {
            await fetchUserProfile(id, { with_mutual_guilds: true }, false);
        } catch { }
    }
}

function processStatusTransition(
    userId: string,
    currentStatus: OnlineStatus,
    clientStatus?: { desktop?: string; mobile?: string; web?: string; },
    guildId?: string
) {
    const scope = getScope(userId, guildId);
    if (!scope) return;

    const previousStatus = lastStatuses.get(userId);
    if (previousStatus === currentStatus) return;

    if (previousStatus === undefined) {
        lastStatuses.set(userId, currentStatus);
        return;
    }

    lastStatuses.set(userId, currentStatus);

    if (!settings.store.logStatus) return;

    const guildInfo = scope === "server" ? getGuildInfo(guildId) : {};
    const deviceStr = formatClientStatus(clientStatus);

    if (previousStatus === "offline" && currentStatus !== "offline") {
        addUserEvent("connection", userId, `Connected (${currentStatus})${deviceStr}.`, {
            scope,
            ...guildInfo,
            metadata: {
                previousStatus,
                currentStatus,
                desktop: clientStatus?.desktop ?? null,
                mobile: clientStatus?.mobile ?? null,
                web: clientStatus?.web ?? null,
            },
        });
    } else if (previousStatus !== "offline" && currentStatus === "offline") {
        addUserEvent("disconnection", userId, "Disconnected (went offline).", {
            scope,
            ...guildInfo,
            metadata: {
                previousStatus,
                currentStatus,
            },
        });
    } else {
        addUserEvent("status", userId, `Status changed from ${previousStatus} to ${currentStatus}${deviceStr}.`, {
            scope,
            ...guildInfo,
            metadata: {
                previousStatus,
                currentStatus,
                desktop: clientStatus?.desktop ?? null,
                mobile: clientStatus?.mobile ?? null,
                web: clientStatus?.web ?? null,
            },
        });
    }
}

const seedPresence = () => {
    const { logActivities } = settings.store;

    lastStatuses = new Map();
    lastActivities = new Map();

    for (const userId of getPresenceUserIds()) {
        const status = PresenceStore.getStatus?.(userId) ?? PresenceStore.getState()?.statuses?.[userId] ?? "offline";
        lastStatuses.set(userId, status);
        if (logActivities) lastActivities.set(userId, getActivityMap(userId));
    }
};

const startPresenceTracking = () => {
    presenceStartTimer = undefined;
    if (!shouldTrackPresence()) return;
    if (presenceTrackingStarted) return;

    seedPresence();
    PresenceStore.addChangeListener(handlePresenceChange);
    presenceTrackingStarted = true;
};

const stopPresenceTracking = () => {
    if (presenceStartTimer) {
        clearTimeout(presenceStartTimer);
        presenceStartTimer = undefined;
    }

    if (!presenceTrackingStarted) return;

    PresenceStore.removeChangeListener(handlePresenceChange);
    presenceTrackingStarted = false;
    lastStatuses.clear();
    lastActivities.clear();
};

const handlePresenceChange = () => {
    const { logActivities, logStatus } = settings.store;
    if (!logActivities && !logStatus) return;

    const userIds = getPresenceUserIds();
    if (!userIds.size) return;

    for (const userId of userIds) {
        const guildId = getSeenServerGuildId(userId);
        const scope = getScope(userId, guildId);
        if (!scope) continue;

        const currentStatus = PresenceStore.getStatus?.(userId) ?? PresenceStore.getState()?.statuses?.[userId] ?? "offline";

        if (logStatus) {
            processStatusTransition(userId, currentStatus, undefined, guildId);
        }

        if (logActivities) {
            const guildInfo = scope === "server" ? getGuildInfo(guildId) : {};
            const previousActivities = lastActivities.get(userId) ?? new Map<string, string>();
            const currentActivities = getActivityMap(userId);

            for (const [key, activity] of currentActivities) {
                const previousActivity = previousActivities.get(key);

                if (!previousActivity) {
                    addUserEvent("activity_start", userId, `Started ${activity}.`, { scope, ...guildInfo });
                    continue;
                }

                if (previousActivity !== activity) {
                    addUserEvent("activity_update", userId, `Changed activity from ${previousActivity} to ${activity}.`, { scope, ...guildInfo });
                }
            }

            for (const [key, activity] of previousActivities) {
                if (!currentActivities.has(key)) addUserEvent("activity_stop", userId, `Stopped ${activity}.`, { scope, ...guildInfo });
            }

            lastActivities.set(userId, currentActivities);
        }
    }
};

const getVoiceChanges = (previousState: VoiceState, currentState: VoiceState) => {
    const changes: string[] = [];

    for (const [key, enabledLabel, disabledLabel] of voiceStateLabels) {
        const wasEnabled = Boolean(previousState[key]);
        const isEnabled = Boolean(currentState[key]);

        if (wasEnabled !== isEnabled) changes.push(isEnabled ? enabledLabel : disabledLabel);
    }

    return changes;
};

const handleVoiceState = (state: VoiceState) => {
    if (!settings.store.logVoice || !state || !state.userId) return;

    const { userId } = state;
    const previousState = previousVoiceStates.get(userId);

    const prevChannelId = state.oldChannelId ?? previousState?.channelId;
    const currentChannelId = state.channelId;

    const guildId = state.guildId ?? getChannelInfo(currentChannelId ?? prevChannelId).guildId;
    if (!shouldTrackEvent(userId, guildId)) return;

    rememberServerUser(userId, guildId);

    // 1. Voice channel transition: Join, Leave, Move
    if (prevChannelId !== currentChannelId) {
        if (!prevChannelId && currentChannelId) {
            const channelInfo = getChannelInfo(currentChannelId);
            const voiceDetails = getVoiceDetails(`Joined voice channel ${channelInfo.channelName ?? "Unknown channel"}.`, currentChannelId, userId);

            addUserEvent("voice_join", userId, voiceDetails.details, {
                ...channelInfo,
                guildId: guildId ?? channelInfo.guildId,
                voiceParticipants: voiceDetails.voiceParticipants,
            });
        } else if (prevChannelId && !currentChannelId) {
            const channelInfo = getChannelInfo(prevChannelId);
            const voiceDetails = getVoiceDetails(`Left voice channel ${channelInfo.channelName ?? "Unknown channel"}.`, prevChannelId, userId);

            addUserEvent("voice_leave", userId, voiceDetails.details, {
                ...channelInfo,
                guildId: guildId ?? channelInfo.guildId,
                voiceParticipants: voiceDetails.voiceParticipants,
            });
        } else if (prevChannelId && currentChannelId) {
            const oldChannel = getChannelInfo(prevChannelId).channelName ?? "Unknown channel";
            const channelInfo = getChannelInfo(currentChannelId);
            const voiceDetails = getVoiceDetails(`Moved from ${oldChannel} to ${channelInfo.channelName ?? "Unknown channel"}.`, currentChannelId, userId);

            addUserEvent("voice_move", userId, voiceDetails.details, {
                ...channelInfo,
                guildId: guildId ?? channelInfo.guildId,
                voiceParticipants: voiceDetails.voiceParticipants,
            });
        }
    }

    // 2. Voice state changes in the same channel (Mute, Unmute, Stream/Screenshare, Video, Deafen)
    if (previousState && currentChannelId && prevChannelId === currentChannelId) {
        const changes = getVoiceChanges(previousState, state);
        if (changes.length) {
            const channelInfo = getChannelInfo(currentChannelId);
            const voiceDetails = getVoiceDetails(`Voice state changed: ${changes.join(", ")}.`, currentChannelId, userId);

            addUserEvent("voice_update", userId, voiceDetails.details, {
                ...channelInfo,
                guildId: guildId ?? channelInfo.guildId,
                voiceParticipants: voiceDetails.voiceParticipants,
            });
        }
    }

    if (currentChannelId) {
        previousVoiceStates.set(userId, {
            ...previousState,
            ...state,
            channelId: currentChannelId,
        });
    } else {
        previousVoiceStates.delete(userId);
    }
};

const logMessage = (message: any) => {
    if (!message) return;
    const author = message.author;
    if (!author?.id) return;
    if (!settings.store.logMessages && !settings.store.logMessageChanges) return;
    if (shouldIgnoreUser(author.id, author)) return;

    const channelId = message.channel_id ?? message.channelId;
    const info = getChannelInfo(channelId);
    if (!shouldTrackEvent(author.id, info.guildId)) return;

    rememberServerUser(author.id, info.guildId);

    const captureContent = settings.store.captureMessageContent;
    const rawContent = message.content ?? "";
    const content = captureContent ? preview(rawContent) : undefined;

    rememberMessage(message.id, {
        userId: author.id,
        username: author.username ?? getUsername(author.id),
        channelId: channelId ?? "",
        guildId: info.guildId,
        content: captureContent ? rawContent : "",
    });

    if (!settings.store.logMessages) return;

    addEvent({
        type: "message",
        userId: author.id,
        username: author.username ?? getUsername(author.id),
        details: content ? `Sent message: ${content}` : "Sent a message.",
        scope: getScope(author.id, info.guildId),
        content,
        ...info,
        metadata: {
            messageId: message.id,
            hasContent: rawContent.length > 0,
            attachmentCount: message.attachments?.length ?? 0,
        },
    });
};

const logMessageUpdate = (message: any) => {
    if (!message || !message.id) return;
    if (!settings.store.logMessageChanges) return;

    const previousMessage = messageCache.get(message.id);
    const author = message.author;
    const authorId = author?.id ?? previousMessage?.userId;
    if (!authorId) return;
    if (shouldIgnoreUser(authorId, author)) return;

    const channelId = message.channel_id ?? message.channelId ?? previousMessage?.channelId;
    const info = getChannelInfo(channelId);
    const guildId = info.guildId ?? previousMessage?.guildId;
    if (!shouldTrackEvent(authorId, guildId)) return;

    rememberServerUser(authorId, guildId);

    const captureContent = settings.store.captureMessageContent;
    const rawContent = message.content ?? "";
    const content = captureContent && rawContent ? preview(rawContent) : undefined;
    const previousContent = previousMessage?.content;
    const username = author?.username ?? previousMessage?.username ?? getUsername(authorId);

    rememberMessage(message.id, {
        userId: authorId,
        username,
        channelId: channelId ?? "",
        guildId,
        content: captureContent ? (rawContent || previousContent || "") : "",
    });

    addEvent({
        type: "message_edit",
        userId: authorId,
        username,
        details: content ? `Edited message: ${content}` : "Edited a message.",
        scope: getScope(authorId, guildId),
        before: captureContent && previousContent ? preview(previousContent) : undefined,
        after: content,
        ...info,
        guildId,
        metadata: {
            messageId: message.id,
            hadCachedOriginal: Boolean(previousContent),
        },
    });
};

const logMessageDelete = (messageId: string, channelId: string) => {
    if (!settings.store.logMessageChanges || !messageId) return;

    const snapshot = messageCache.get(messageId);
    const info = getChannelInfo(channelId);

    if (!snapshot) {
        if (shouldTrackServer(info.guildId)) {
            addServerEvent("message_delete", info.guildId, "Deleted an uncached message.", {
                username: "Unknown user",
                ...info,
                metadata: {
                    messageId,
                    cached: false,
                },
            });
        }
        return;
    }

    const guildId = snapshot.guildId ?? info.guildId;
    if (!shouldTrackEvent(snapshot.userId, guildId)) return;

    rememberServerUser(snapshot.userId, guildId);

    const content = settings.store.captureMessageContent && snapshot.content ? preview(snapshot.content) : undefined;

    addEvent({
        type: "message_delete",
        userId: snapshot.userId,
        username: snapshot.username,
        details: content ? `Deleted message: ${content}` : "Deleted a message.",
        scope: getScope(snapshot.userId, guildId),
        content,
        ...info,
        guildId,
        metadata: {
            messageId,
            cached: true,
        },
    });

    messageCache.delete(messageId);
};

const logTyping = (userId: string, channelId: string) => {
    if (!settings.store.logTyping) return;
    if (shouldIgnoreUser(userId)) return;

    const info = getChannelInfo(channelId);
    if (!shouldTrackEvent(userId, info.guildId)) return;

    const key = `${userId}:${channelId}`;
    const now = Date.now();
    const lastTypedAt = typingCooldowns.get(key) ?? 0;

    if (now - lastTypedAt < TYPING_COOLDOWN) return;

    typingCooldowns.set(key, now);
    pruneTypingCooldowns(now);
    rememberServerUser(userId, info.guildId);
    addUserEvent("typing", userId, "Started typing.", info);
};

const formatEmoji = (emoji: ReactionEmoji | undefined) =>
    emoji?.name ?? emoji?.id ?? "Unknown emoji";

const logReaction = (type: "reaction_add" | "reaction_remove", event: MessageReactionFluxEvent) => {
    if (!settings.store.logReactions || !event.userId) return;
    if (shouldIgnoreUser(event.userId)) return;

    const info = getChannelInfo(event.channelId);
    if (!shouldTrackEvent(event.userId, info.guildId)) return;

    rememberServerUser(event.userId, info.guildId);
    addUserEvent(
        type,
        event.userId,
        type === "reaction_add" ? `Added reaction ${formatEmoji(event.emoji)}.` : `Removed reaction ${formatEmoji(event.emoji)}.`,
        {
            ...info,
            metadata: {
                messageId: event.messageId,
                emojiId: event.emoji?.id ?? null,
                emojiName: event.emoji?.name ?? null,
                animated: event.emoji?.animated ?? false,
            },
        }
    );
};

const logReactionClear = (event: { channelId: string; messageId: string; }) => {
    if (!settings.store.logReactions) return;

    const info = getChannelInfo(event.channelId);
    addServerEvent("reaction_remove_all", info.guildId, "Removed all reactions from a message.", {
        ...info,
        metadata: {
            messageId: event.messageId,
        },
    });
};

const logChannelEvent = (type: "channel_create" | "channel_delete" | "channel_update", event: ChannelFluxEvent) => {
    const info = getChannelEventInfo(event);
    if (type === "channel_update" && !shouldLogUpdateEvent(`channel:${info.channelId ?? "unknown"}`)) return;

    const label = info.channelName ?? info.channelId ?? "Unknown channel";
    const verb = type === "channel_create" ? "Created" : type === "channel_delete" ? "Deleted" : "Updated";

    addServerEvent(type, info.guildId, `${verb} channel ${label}.`, {
        ...info,
        metadata: {
            channelId: info.channelId ?? null,
            channelType: event.channel?.type ?? null,
        },
    });
};

const logThreadEvent = (type: "thread_create" | "thread_delete" | "thread_update", event: ChannelFluxEvent) => {
    const info = getChannelEventInfo(event);
    if (type === "thread_update" && !shouldLogUpdateEvent(`thread:${info.channelId ?? "unknown"}`)) return;

    const label = info.channelName ?? info.channelId ?? "Unknown thread";
    const verb = type === "thread_create" ? "Created" : type === "thread_delete" ? "Deleted" : "Updated";

    addServerEvent(type, info.guildId, `${verb} thread ${label}.`, {
        ...info,
        metadata: {
            channelId: info.channelId ?? null,
            parentId: event.channel?.parent_id ?? null,
        },
    });
};

const logGuildMemberEvent = (
    type: "guild_member_add" | "guild_member_remove" | "guild_member_update",
    event: GuildMemberFluxEvent
) => {
    if (type === "guild_member_update" && !settings.store.logMemberUpdates) return;

    const guildId = event.guildId ?? event.guild_id ?? event.member?.guildId;
    if (!shouldTrackServer(guildId)) return;

    const userId = event.user?.id ?? event.userId ?? event.member?.userId;
    if (userId && isCurrentUser(userId)) return;
    if (userId && shouldIgnoreUser(userId, event.user)) return;
    if (type === "guild_member_update" && !shouldLogUpdateEvent(`member:${guildId ?? "unknown"}:${userId ?? "unknown"}`)) return;

    const joinedAt = event.member?.joinedAt ? Date.parse(event.member.joinedAt) : undefined;
    const isFreshJoin = joinedAt != null && Date.now() - joinedAt < MEMBER_JOIN_FRESHNESS;
    const username = userId ? getUsername(userId, event.user?.username) : "Unknown user";
    const details =
        type === "guild_member_add"
            ? isFreshJoin ? "Joined the server." : "Member became visible in the live cache."
            : type === "guild_member_remove"
                ? "Left the server."
                : "Updated server member.";

    if (userId) rememberServerUser(userId, guildId);

    addServerEvent(type, guildId, details, {
        userId: userId ?? guildId,
        username,
        metadata: {
            joinedAt: event.member?.joinedAt ?? null,
            realJoin: type === "guild_member_add" ? isFreshJoin : null,
            nick: event.member?.nick ?? null,
            roleCount: event.member?.roles.length ?? null,
        },
    });
};

const logGuildEvent = (event: GuildFluxEvent) => {
    const guildId = event.guild?.id ?? event.guildId;
    if (!shouldLogUpdateEvent(`guild:${guildId ?? "unknown"}`)) return;

    const guildName = event.guild?.name ?? GuildStore.getGuild(guildId ?? "")?.name;

    addServerEvent("guild_update", guildId, `Server settings changed${guildName ? ` for ${guildName}` : ""}.`, {
        guildName,
    });
};

const logRoleEvent = (type: "role_create" | "role_delete" | "role_update", event: RoleFluxEvent) => {
    const guildId = event.role?.guildId ?? event.guildId ?? event.guild_id;
    if (type === "role_update" && !shouldLogUpdateEvent(`role:${guildId ?? "unknown"}:${event.role?.id ?? event.roleId ?? "unknown"}`)) return;

    const roleName = event.role?.name ?? event.roleId ?? "Unknown role";
    const verb = type === "role_create" ? "Created" : type === "role_delete" ? "Deleted" : "Updated";

    addServerEvent(type, guildId, `${verb} role ${roleName}.`, {
        metadata: {
            roleId: event.role?.id ?? event.roleId ?? null,
            roleName,
        },
    });
};

const patchUserContext: NavContextMenuPatchCallback = (children, { user }: UserContextProps) => {
    if (!settings.store.addContextMenu || !user) return;

    const tracked = targetIds.has(user.id);
    const group = findGroupChildrenByChildId("apps", children) ?? children;
    let index = group.findLastIndex(child => child?.props?.id === "ignore");
    if (index < 0) index = group.length - 1;

    group.splice(index, 0,
        <Menu.MenuItem
            id="vc-surveillance-toggle"
            label={tracked ? tPlugin("Remove from Surveillance") : tPlugin("Add to Surveillance")}
            action={() => {
                if (tracked) removeTarget(user.id);
                else addTarget(user.id);
            }}
        />
    );
};

export default definePlugin({
    name: "Surveillance",
    enabledByDefault: false,
    description: "Adds a local live event dashboard for selected users and servers.",
    tags: ["Friends", "Utility"],
    authors: [{ name: "irritably",
     id: 928787166916640838n }],
    dependencies: ["Settings"],
    requiresRestart: false,
    settings,
    contextMenus: {
        "user-context": patchUserContext,
    },
    toolboxActions() {
        return (
            <Menu.MenuItem
                id="surveillance-open"
                label={tPlugin("Open Surveillance")}
                action={() => SettingsRouter.openUserSettings(`${SETTINGS_ENTRY_KEY}_panel`)}
            />
        );
    },

    start() {
        updateTargets(settings.store.targets);
        updateServerTargets(settings.store.serverTargets);
        if (shouldTrackPresence()) presenceStartTimer = setTimeout(startPresenceTracking, 3_000);

        hydrateTargetPresences();
        void syncTargetProfiles();
        hydrationInterval = setInterval(hydrateTargetPresences, 60_000);
        profileSyncInterval = setInterval(() => void syncTargetProfiles(), 120_000);

        syncSettingsSidebar(settings.store.showInSettingsSidebar);
    },

    stop() {
        stopPresenceTracking();
        if (hydrationInterval) {
            clearInterval(hydrationInterval);
            hydrationInterval = undefined;
        }
        if (profileSyncInterval) {
            clearInterval(profileSyncInterval);
            profileSyncInterval = undefined;
        }
        syncSettingsSidebar(false);
        previousVoiceStates.clear();
        messageCache.clear();
        typingCooldowns.clear();
        updateCooldowns.clear();
        seenServerUsers.clear();
        lastStatuses.clear();
        lastActivities.clear();
        lastUserSnapshots.clear();
    },

    flux: {
        MESSAGE_CREATE(event: any) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            const message = event?.message ?? event;
            logMessage(message);
        },

        MESSAGE_UPDATE(event: any) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            const message = event?.message ?? event;
            logMessageUpdate(message);
        },

        MESSAGE_DELETE(event: any) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            const id = event?.id ?? event?.messageId;
            const channelId = event?.channelId ?? event?.channel_id;
            if (id && channelId) logMessageDelete(id, channelId);
        },

        MESSAGE_DELETE_BULK(event: any) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            const ids = event?.ids;
            const channelId = event?.channelId ?? event?.channel_id;
            if (Array.isArray(ids) && channelId) {
                for (const id of ids) {
                    logMessageDelete(id, channelId);
                }
            }
        },

        MESSAGE_REACTION_ADD(event: any) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            logReaction("reaction_add", {
                channelId: event?.channelId ?? event?.channel_id,
                messageId: event?.messageId ?? event?.message_id,
                userId: event?.userId ?? event?.user_id,
                emoji: event?.emoji,
            });
        },

        MESSAGE_REACTION_REMOVE(event: any) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            logReaction("reaction_remove", {
                channelId: event?.channelId ?? event?.channel_id,
                messageId: event?.messageId ?? event?.message_id,
                userId: event?.userId ?? event?.user_id,
                emoji: event?.emoji,
            });
        },

        MESSAGE_REACTION_REMOVE_ALL(event: any) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            const channelId = event?.channelId ?? event?.channel_id;
            const messageId = event?.messageId ?? event?.message_id;
            if (channelId && messageId) {
                logReactionClear({ channelId, messageId });
            }
        },

        TYPING_START(event: any) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            const userId = event?.userId ?? event?.user_id;
            const channelId = event?.channelId ?? event?.channel_id;
            if (userId && channelId) logTyping(userId, channelId);
        },

        CALL_CREATE(event: any) {
            if (!settings.store.logCalls) return;
            const channelId = event?.channelId ?? event?.channel_id;
            const channel = ChannelStore.getChannel(channelId);
            const ringing: string[] = event?.ringing ?? [];
            const voiceStates: any[] = event?.voiceStates ?? [];

            const recipientId = channel?.isDM?.() ? (channel.getRecipientId?.() ?? channel.recipients?.[0]) : undefined;
            const involvedTargets = targets.filter(t =>
                t === recipientId || ringing.includes(t) || voiceStates.some((vs: any) => vs?.userId === t)
            );

            if (involvedTargets.length === 0) return;

            const chInfo = getChannelInfo(channelId);
            for (const targetId of involvedTargets) {
                addUserEvent("call_start", targetId, `Incoming/outgoing call started in ${chInfo.channelName ?? "Direct Message"}.`, {
                    ...chInfo,
                    metadata: {
                        channelId,
                        ringingCount: ringing.length,
                    },
                });
            }
        },

        CALL_UPDATE(event: any) {
            if (!settings.store.logCalls) return;
            const channelId = event?.channelId ?? event?.channel_id;
            const channel = ChannelStore.getChannel(channelId);
            const ringing: string[] = event?.ringing ?? [];
            const voiceStates: any[] = event?.voiceStates ?? [];

            const recipientId = channel?.isDM?.() ? (channel.getRecipientId?.() ?? channel.recipients?.[0]) : undefined;
            const involvedTargets = targets.filter(t =>
                t === recipientId || ringing.includes(t) || voiceStates.some((vs: any) => vs?.userId === t)
            );

            if (involvedTargets.length === 0) return;

            const chInfo = getChannelInfo(channelId);
            for (const targetId of involvedTargets) {
                addUserEvent("call_update", targetId, `Call updated in ${chInfo.channelName ?? "Direct Message"}.`, {
                    ...chInfo,
                    metadata: {
                        channelId,
                        ringingCount: ringing.length,
                    },
                });
            }
        },

        CALL_DELETE(event: any) {
            if (!settings.store.logCalls) return;
            const channelId = event?.channelId ?? event?.channel_id;
            const channel = ChannelStore.getChannel(channelId);
            const recipientId = channel?.isDM?.() ? (channel.getRecipientId?.() ?? channel.recipients?.[0]) : undefined;
            const involvedTargets = targets.filter(t => t === recipientId);

            if (involvedTargets.length === 0) return;

            const chInfo = getChannelInfo(channelId);
            for (const targetId of involvedTargets) {
                addUserEvent("call_end", targetId, `Call ended in ${chInfo.channelName ?? "Direct Message"}.`, {
                    ...chInfo,
                    metadata: {
                        channelId,
                    },
                });
            }
        },

        VOICE_STATE_UPDATES(event: any) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            const states = event?.voiceStates ?? (Array.isArray(event) ? event : [event]);
            if (Array.isArray(states)) {
                for (const voiceState of states) {
                    if (voiceState) handleVoiceState(voiceState);
                }
            }
        },

        VOICE_STATE_UPDATE(event: any) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            const state = event?.voiceState ?? event;
            if (state && typeof state === "object") {
                handleVoiceState(state);
            }
        },

        PRESENCE_UPDATE(event: any) {
            const userId = event?.user?.id;
            if (!userId || !shouldTrackUser(userId)) return;

            const status = event.status ?? PresenceStore.getStatus?.(userId) ?? "offline";
            const clientStatus = event.clientStatus ?? event.client_status;
            processStatusTransition(userId, status, clientStatus, event.guildId);

            if (settings.store.logActivities && Array.isArray(event.activities)) {
                const scope = getScope(userId, event.guildId);
                if (scope) {
                    const guildInfo = scope === "server" ? getGuildInfo(event.guildId) : {};
                    const previousActivities = lastActivities.get(userId) ?? new Map<string, string>();
                    const currentActivities = new Map<string, string>();
                    for (const act of event.activities) {
                        currentActivities.set(getActivityKey(act), formatActivity(act));
                    }
                    for (const [key, activity] of currentActivities) {
                        const previousActivity = previousActivities.get(key);
                        if (!previousActivity) {
                            addUserEvent("activity_start", userId, `Started ${activity}.`, { scope, ...guildInfo });
                        } else if (previousActivity !== activity) {
                            addUserEvent("activity_update", userId, `Changed activity from ${previousActivity} to ${activity}.`, { scope, ...guildInfo });
                        }
                    }
                    for (const [key, activity] of previousActivities) {
                        if (!currentActivities.has(key)) {
                            addUserEvent("activity_stop", userId, `Stopped ${activity}.`, { scope, ...guildInfo });
                        }
                    }
                    lastActivities.set(userId, currentActivities);
                }
            }
        },

        PRESENCES_REPLACE({ presences }: { presences: any[]; }) {
            if (!Array.isArray(presences)) return;
            for (const p of presences) {
                const userId = p?.user?.id;
                if (userId && shouldTrackUser(userId)) {
                    processStatusTransition(userId, p.status, p.clientStatus ?? p.client_status);
                }
            }
        },

        GUILD_MEMBERS_CHUNK(event: any) {
            if (!event?.presences || !Array.isArray(event.presences)) return;
            for (const p of event.presences) {
                const userId = p?.user?.id;
                if (userId && shouldTrackUser(userId)) {
                    processStatusTransition(userId, p.status, p.clientStatus ?? p.client_status, event.guildId);
                }
            }
        },

        USER_UPDATE(event: any) {
            const user = event?.user ?? event;
            const userId = user?.id;
            if (!userId || !shouldTrackUser(userId)) return;

            const cached = lastUserSnapshots.get(userId);
            const currentGlobal = user.global_name ?? user.globalName;
            const currentUsername = user.username;
            const currentAvatar = user.avatar;

            if (!cached) {
                lastUserSnapshots.set(userId, {
                    username: currentUsername,
                    globalName: currentGlobal,
                    avatar: currentAvatar,
                });
                return;
            }

            const changes: string[] = [];
            if (cached.username && currentUsername && cached.username !== currentUsername) {
                changes.push(`username: "${cached.username}" -> "${currentUsername}"`);
            }
            if (cached.globalName !== currentGlobal) {
                changes.push(`display name: "${cached.globalName ?? 'None'}" -> "${currentGlobal ?? 'None'}"`);
            }
            if (cached.avatar !== currentAvatar) {
                changes.push("avatar");
            }

            if (changes.length > 0) {
                lastUserSnapshots.set(userId, {
                    username: currentUsername,
                    globalName: currentGlobal,
                    avatar: currentAvatar,
                });
                addUserEvent("user_update", userId, `Profile updated: changed ${changes.join(", ")}.`, {
                    username: currentUsername,
                    metadata: {
                        changes: changes.join(", "),
                    },
                });
            }
        },

        RELATIONSHIP_ADD(event: any) {
            const relationship = event?.relationship;
            const userId = relationship?.id ?? event?.userId;
            if (!userId || !shouldTrackUser(userId)) return;
            const type = relationship?.type;
            const typeLabel = type === 1 ? "Added as friend" : type === 2 ? "Blocked" : type === 3 ? "Incoming friend request" : type === 4 ? "Outgoing friend request" : "Relationship updated";
            addUserEvent("user_update", userId, `${typeLabel}.`, {
                metadata: { relationshipType: type },
            });
        },

        RELATIONSHIP_REMOVE(event: any) {
            const relationship = event?.relationship;
            const userId = relationship?.id ?? event?.userId;
            if (!userId || !shouldTrackUser(userId)) return;
            addUserEvent("user_update", userId, "Removed friend / relationship.", {
                metadata: { userId },
            });
        },

        CHANNEL_CREATE(event: ChannelFluxEvent) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            logChannelEvent("channel_create", event);
        },

        CHANNEL_DELETE(event: ChannelFluxEvent) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            logChannelEvent("channel_delete", event);
        },

        CHANNEL_UPDATE(event: ChannelFluxEvent) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            logChannelEvent("channel_update", event);
        },

        CHANNEL_UPDATES({ channels }: { channels: Channel[]; }) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            for (const channel of channels) {
                logChannelEvent("channel_update", { channel });
            }
        },

        THREAD_CREATE(event: ChannelFluxEvent) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            logThreadEvent("thread_create", event);
        },

        THREAD_DELETE(event: ChannelFluxEvent) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            logThreadEvent("thread_delete", event);
        },

        THREAD_UPDATE(event: ChannelFluxEvent) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            logThreadEvent("thread_update", event);
        },

        GUILD_MEMBER_ADD(event: GuildMemberFluxEvent) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            logGuildMemberEvent("guild_member_add", event);
        },

        GUILD_MEMBER_REMOVE(event: GuildMemberFluxEvent) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            logGuildMemberEvent("guild_member_remove", event);
        },

        GUILD_MEMBER_UPDATE(event: GuildMemberFluxEvent) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            logGuildMemberEvent("guild_member_update", event);
        },

        GUILD_UPDATE(event: GuildFluxEvent) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            logGuildEvent(event);
        },

        GUILD_ROLE_CREATE(event: RoleFluxEvent) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            logRoleEvent("role_create", event);
        },

        GUILD_ROLE_DELETE(event: RoleFluxEvent) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            logRoleEvent("role_delete", event);
        },

        GUILD_ROLE_UPDATE(event: RoleFluxEvent) {
            if (targets.length === 0 && serverTargets.length === 0) return;
            logRoleEvent("role_update", event);
        },
    },
});

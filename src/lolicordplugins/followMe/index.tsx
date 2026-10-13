/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addContextMenuPatch, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { HeaderBarButton } from "@api/HeaderBar";
import { DataStore } from "@api/index";
import definePlugin from "@utils/types";
import { findStoreLazy } from "@webpack";
import { ChannelStore, Constants, Menu, PermissionsBits, PermissionStore, React, RestAPI, SelectedChannelStore, Toasts, useEffect, UserStore, useState } from "@webpack/common";
import { t } from "../autoTranslateLoliCord";

const VoiceStateStore = findStoreLazy("VoiceStateStore");

const DS_KEY = "followme-target-v1";

// ── Etat global ──────────────────────────────────────────────────────────────
let targetId: string | null = null;
let targetName: string = "";

const listeners = new Set<() => void>();
function notifyAll() { listeners.forEach(fn => fn()); }

function useFollowMeId(): string | null {
    const [, tick] = useState(0);
    useEffect(() => {
        const fn = () => tick(n => n + 1);
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    }, []);
    return targetId;
}

async function persist() {
    await DataStore.set(DS_KEY, targetId ? { id: targetId, name: targetName } : null);
}

function getVoiceState(userId: string, guildId?: string) {
    try {
        if (VoiceStateStore) {
            const state = VoiceStateStore.getVoiceStateForUser?.(userId);
            if (state) return state;
            if (guildId) {
                const guildStates = VoiceStateStore.getVoiceStates?.(guildId);
                if (guildStates && guildStates[userId]) return guildStates[userId];
            }
        }
    } catch {}
    return null;
}

async function moveTargetTo(guildId: string, channelId: string) {
    if (!targetId || !guildId || !channelId) return;

    const targetState = getVoiceState(targetId, guildId);
    if (!targetState || !targetState.channelId) return;

    if (targetState.channelId === channelId) return;

    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return;

    const canMove = PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel);
    if (!canMove) {
        console.warn("[FollowMe] Missing MOVE_MEMBERS permission in channel:", channelId);
        return;
    }

    try {
        await RestAPI.patch({
            url: Constants.Endpoints.GUILD_MEMBER(guildId, targetId),
            body: { channel_id: channelId }
        });
    } catch (e) {
        console.error("[FollowMe] Failed to move user:", e);
    }
}

function checkAndMoveTarget() {
    if (!targetId) return;
    const myId = UserStore.getCurrentUser()?.id;
    if (!myId) return;

    const myChannelId = SelectedChannelStore.getVoiceChannelId();
    if (!myChannelId) return;

    const myChannel = ChannelStore.getChannel(myChannelId);
    if (!myChannel?.guild_id) return;

    moveTargetTo(myChannel.guild_id, myChannelId);
}

function followMe(userId: string) {
    if (targetId === userId) return;
    const user = UserStore?.getUser?.(userId);
    targetId = userId;
    targetName = user?.globalName ?? user?.username ?? userId;

    checkAndMoveTarget();

    notifyAll();
    persist().catch(() => { });
    Toasts.show({ message: t("Following Me: {name}").replace("{name}", targetName), type: Toasts.Type.SUCCESS, id: Toasts.genId() });
}

function unfollowMe() {
    const name = targetName;
    targetId = null;
    targetName = "";
    notifyAll();
    persist().catch(() => { });
    Toasts.show({ message: t("Stopped forcing {name} to follow").replace("{name}", name), type: Toasts.Type.MESSAGE, id: Toasts.genId() });
}

// ── Icone ──
function FollowMeIcon({ color = "currentColor" }: { color?: string; }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                fill={color}
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2 4a2 2 0 1 1 4 0 2 2 0 0 1-4 0Zm-6.5 11c0-2.5 3.5-4 6.5-4 1.45 0 3.03.35 4.3 1.05a1 1 0 1 1-.9 1.78C12.18 15.44 11 15 10 15c-2.37 0-4.5 1.09-4.5 2v1h9a1 1 0 1 1 0 2h-10a1 1 0 0 1-1-1v-2Zm13.2-1.7a1 1 0 0 1 1.42 0l3 3a1 1 0 0 1 0 1.4l-3 3a1 1 0 0 1-1.42-1.4l1.3-1.3H15a1 1 0 1 1 0-2h3.08l-1.3-1.3a1 1 0 0 1 0-1.4Z"
            />
        </svg>
    );
}

// ── HeaderBar Button ──
function FollowMeHeaderButton() {
    const tid = useFollowMeId();
    if (!tid) return null;

    return (
        <HeaderBarButton
            icon={() => (
                <FollowMeIcon color="#b5bac1" />
            )}
            tooltip={t("Stop Follow Me: {name}").replace("{name}", targetName)}
            onClick={() => unfollowMe()}
        />
    );
}

// ── Context Menu ──
const ctxPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!children || !Array.isArray(children)) return;
    try {
        const userId: string | undefined = props?.user?.id;
        if (!userId || userId === UserStore.getCurrentUser()?.id) return;

        const isFollowed = targetId === userId;

        children.push(
            <Menu.MenuCheckboxItem
                id="follow-me-ctx"
                label={isFollowed ? t("Stop Follow Me") : t("Follow Me")}
                checked={isFollowed}
                action={() => { if (isFollowed) unfollowMe(); else followMe(userId); }}
            />
        );
    } catch (e) {
        console.error("[FollowMe] Context menu patch error:", e);
    }
};

// ── Plugin ───────────────────────────────────────────────────────────────────
export default definePlugin({
    name: "FollowMe",
    enabledByDefault: false,
    description: "Forces a user to follow you in voice channels (if you have permissions). Right-click a user -> Follow Me.",
    authors: [{ name: "Nightcord", id: 0n }],

    headerBarButton: {
        icon: () => <FollowMeIcon color="#949ba4" />,
        render: FollowMeHeaderButton,
        priority: 6,
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }) {
            if (!targetId) return;
            const myId = UserStore.getCurrentUser()?.id;

            for (const s of voiceStates) {
                if (s.userId === myId) {
                    if (s.channelId && s.guildId) {
                        moveTargetTo(s.guildId, s.channelId);
                    }
                } else if (s.userId === targetId) {
                    const myChannelId = SelectedChannelStore.getVoiceChannelId();
                    if (myChannelId) {
                        const myChannel = ChannelStore.getChannel(myChannelId);
                        if (myChannel?.guild_id && s.channelId !== myChannelId && s.guildId === myChannel.guild_id) {
                            moveTargetTo(myChannel.guild_id, myChannelId);
                        }
                    }
                }
            }
        },

        VOICE_CHANNEL_SELECT() {
            setTimeout(checkAndMoveTarget, 300);
        }
    },

    async start() {
        const saved = await DataStore.get(DS_KEY) as { id: string; name: string; } | null;
        if (saved?.id) {
            targetId = saved.id;
            targetName = saved.name ?? saved.id;
        }
        addContextMenuPatch("user-context", ctxPatch);
        addContextMenuPatch("user-profile-actions", ctxPatch);
    },

    stop() {
        targetId = null;
        targetName = "";
        removeContextMenuPatch("user-context", ctxPatch);
        removeContextMenuPatch("user-profile-actions", ctxPatch);
    },
});

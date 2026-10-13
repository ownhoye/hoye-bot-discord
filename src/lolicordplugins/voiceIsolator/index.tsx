/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { Button, Menu, React, SelectedChannelStore, UserStore, VoiceStateStore } from "@webpack/common";
import { Flex, FlexAlign, FlexJustify } from "@components/Flex";
import { Card } from "@components/Card";
import { voiceIsolatorEngine } from "./engine";
import { VoiceIsolatorState } from "./types";
import { t } from "../autoTranslateLoliCord";

const settings = definePluginSettings({
    attenuationVolume: {
        description: "Background volume level percentage for other users when isolation is active (0% = complete silence).",
        type: OptionType.SLIDER,
        markers: [0, 5, 10, 20, 30, 50],
        default: 0,
        restartNeeded: false
    },
    boostTarget: {
        description: "Boost isolated users' volume above 100% for maximum voice loudness and clarity.",
        type: OptionType.BOOLEAN,
        default: true,
        restartNeeded: false
    },
    targetVolume: {
        description: "Target user volume level percentage when boosted (up to 500% extreme loudness).",
        type: OptionType.SLIDER,
        markers: [100, 150, 200, 250, 300, 400, 500],
        default: 300,
        restartNeeded: false
    },
    autoIsolateNewJoiners: {
        description: "Automatically add users who join the voice channel to the isolated list.",
        type: OptionType.BOOLEAN,
        default: true,
        restartNeeded: false
    }
});

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }) => {
    if (!user || user.bot) return;

    const myId = UserStore.getCurrentUser()?.id;
    if (user.id === myId) return;

    const activeVoiceChannelId = SelectedChannelStore.getVoiceChannelId();
    if (!activeVoiceChannelId) return;

    // Check if target user is in the active voice channel
    const targetState = VoiceStateStore.getVoiceStateForUser(user.id)
        ?? (VoiceStateStore.getVoiceStatesForChannel(activeVoiceChannelId) || {})[user.id];

    if (!targetState || targetState.channelId !== activeVoiceChannelId) return;

    const state = voiceIsolatorEngine.getState();
    const isCurrentlyIsolated = voiceIsolatorEngine.isUserIsolated(user.id);

    const toggleItem = (
        <Menu.MenuItem
            id="voice-isolator-toggle"
            label={isCurrentlyIsolated ? t("Stop Voice Isolation") : t("Isolate Voice")}
            color={isCurrentlyIsolated ? "danger" : "default"}
            action={() => {
                voiceIsolatorEngine.toggleIsolate(user.id, {
                    attenuationVolume: settings.store.attenuationVolume,
                    boostTarget: settings.store.boostTarget,
                    targetVolume: settings.store.targetVolume,
                    autoIsolateNewJoiners: settings.store.autoIsolateNewJoiners
                });
            }}
        />
    );

    const items = [toggleItem];

    if (state.isolatedUserIds.length > 1) {
        items.push(
            <Menu.MenuItem
                id="voice-isolator-restore-all"
                label={t("Stop All Voice Isolations")}
                color="danger"
                action={() => {
                    voiceIsolatorEngine.restoreAll();
                }}
            />
        );
    }

    const targetGroup = findGroupChildrenByChildId("user-volume", children)
        ?? findGroupChildrenByChildId("mute", children)
        ?? findGroupChildrenByChildId("server-mute", children)
        ?? findGroupChildrenByChildId("user-profile-actions", children)
        ?? findGroupChildrenByChildId("roles", children);

    if (targetGroup && Array.isArray(targetGroup)) {
        targetGroup.push(...items);
    } else {
        children.push(<Menu.MenuGroup>{items}</Menu.MenuGroup>);
    }
};

function VoiceIsolatorSettingsComponent() {
    const [state, setState] = React.useState<VoiceIsolatorState>(() => voiceIsolatorEngine.getState());

    React.useEffect(() => {
        const unsub = voiceIsolatorEngine.subscribe(setState);
        return () => unsub();
    }, []);

    const count = state.isolatedUserIds.length;

    return (
        <div style={{ width: "100%", marginTop: "10px" }}>
            <Card
                variant="primary"
                outline
                style={{
                    padding: "16px",
                    background: count > 0 ? "rgba(88, 101, 242, 0.15)" : "var(--background-secondary, #2b2d31)",
                    borderRadius: "8px",
                    border: count > 0 ? "1px solid var(--brand-500, #5865f2)" : undefined,
                    marginBottom: "16px"
                }}
            >
                <Flex alignItems={FlexAlign.CENTER} justifyContent={FlexJustify.BETWEEN} style={{ width: "100%" }}>
                    <div>
                        <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "14px", display: "block" }}>
                            {t("Voice Isolation Status")}
                        </span>
                        <span style={{ color: count > 0 ? "var(--brand-500, #5865f2)" : "var(--text-muted, #949ba4)", fontSize: "12px", fontWeight: count > 0 ? 600 : 400 }}>
                            {count > 0
                                ? `● ${t("Active:")} ${count} ${count > 1 ? t("users isolated") : t("user isolated")} (${t("Boosted to")} ${settings.store.targetVolume}% • ${t("Others lowered to")} ${settings.store.attenuationVolume}%)`
                                : `○ ${t("Inactive / Normal voice mixing")}`}
                        </span>
                    </div>
                    {count > 0 && (
                        <Button
                            variant="dangerPrimary"
                            onClick={() => voiceIsolatorEngine.restoreAll()}
                        >
                            {t("Restore All Volumes")}
                        </Button>
                    )}
                </Flex>
            </Card>
        </div>
    );
}

export default definePlugin({
    name: "VoiceIsolator",
    description: "Allows you to isolate multiple people in a noisy voice channel to hear them clearly while lowering everyone else's volume.",
    authors: [
        { name: "LoliCord", id: 0n }
    ],
    enabledByDefault: false,
    settings,
    settingsAboutComponent: VoiceIsolatorSettingsComponent,

    contextMenus: {
        "user-context": UserContextMenuPatch
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: any[]; }) {
            if (Array.isArray(voiceStates)) {
                for (const st of voiceStates) {
                    voiceIsolatorEngine.handleVoiceStateUpdate(st, {
                        attenuationVolume: settings.store.attenuationVolume,
                        boostTarget: settings.store.boostTarget,
                        targetVolume: settings.store.targetVolume,
                        autoIsolateNewJoiners: settings.store.autoIsolateNewJoiners
                    });
                }
            }
        },
        VOICE_STATE_UPDATE(st: any) {
            voiceIsolatorEngine.handleVoiceStateUpdate(st, {
                attenuationVolume: settings.store.attenuationVolume,
                boostTarget: settings.store.boostTarget,
                targetVolume: settings.store.targetVolume,
                autoIsolateNewJoiners: settings.store.autoIsolateNewJoiners
            });
        },
        VOICE_CHANNEL_SELECT({ channelId }: { channelId: string | null; }) {
            voiceIsolatorEngine.handleChannelChange(channelId);
        }
    },

    start() {
    },

    stop() {
        voiceIsolatorEngine.restoreAll();
    }
});

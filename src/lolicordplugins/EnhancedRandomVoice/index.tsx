/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { UserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import { Button } from "@components/Button";
import { Switch } from "@components/Switch";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel, VoiceState } from "@vencord/discord-types";
import { findByCodeLazy, findByPropsLazy } from "@webpack";
import {
    ChannelActions,
    ChannelRouter,
    ChannelStore,
    ContextMenuApi,
    FluxDispatcher,
    GuildStore,
    MediaEngineStore,
    Menu,
    PermissionsBits,
    PermissionStore,
    React,
    RelationshipStore,
    SelectedChannelStore,
    SelectedGuildStore,
    Toasts,
    useEffect,
    UserStore,
    useState,
    VoiceActions,
    VoiceStateStore
} from "@webpack/common";

import { t } from "../autoTranslateLoliCord";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
const cl = (name: string) => `vc-random-voice-${name}`;

function makeRange(start: number, end: number, step = 1): number[] {
    const range: number[] = [];
    for (let i = start; i <= end; i += step) {
        range.push(i);
    }
    return range;
}

const STYLE_ID = "vc-random-voice-enhanced-styles";
const CSS_TEXT = `
.vc-random-voice-record {
    display: flex;
    flex-direction: column;
    margin-bottom: 12px;
}
.vc-random-voice-keybind {
    color: var(--header-primary, #ffffff) !important;
    font-size: 16px;
    font-weight: 600;
    line-height: 20px;
}
.vc-random-voice-recording {
    display: flex;
    gap: 8px;
    align-items: center;
}
`;

function injectStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS_TEXT;
    document.head.appendChild(style);
}

function removeStyles() {
    if (typeof document === "undefined") return;
    document.getElementById(STYLE_ID)?.remove();
}

function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
    let timeout: any;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

const startStream = findByCodeLazy('type:"STREAM_START"');
const getDesktopSources = findByCodeLazy("desktop sources");
const { isVideoEnabled } = findByPropsLazy("isVideoEnabled");
const selectVoiceModule = findByPropsLazy("selectVoiceChannel");
const DEFAULT_KEYBIND = IS_MAC ? ["Meta", "Shift", "R"] : ["Control", "Shift", "R"];
const MODIFIER_KEYS = new Set(["control", "ctrl", "shift", "alt", "option", "meta", "cmd", "command", "mod"]);

let isRecordingKeybind = false;
let isJoining = false;
let isSwitchingChannels = false;
let isUserManualDisconnect = false;
let lastUserManualDisconnectTime = 0;
let currentConnectedChannelId: string | null = null;
let lastAttemptedChannelId: string | null = null;
let lastConnectedGuildId: string | null = null;
let lastKickedChannelId: string | null = null;
let autoRejoinTimeout: any = null;
let lastDisconnectHandledTime = 0;
let lastDisconnectHandledChannel: string | null = null;

// Set pour mémoriser les salons visités lors du cycle actuel
const visitedChannelIds = new Set<string>();

type RandomVoiceOperation = "<" | ">" | "==" | string;
type StateFilterKey = "mute" | "deafen" | "video" | "stream";
type SelfSettingKey =
    | "selfMute"
    | "selfDeafen"
    | "autoCamera"
    | "autoStream"
    | "leaveEmpty"
    | "autoNavigate"
    | "avoidStages"
    | "avoidAfk"
    | "prioritizeFriends"
    | "avoidEmpty"
    | "avoidAllMuted"
    | "cycleMode"
    | "autoRejoinOnKick";

type PostJoinAction = () => void | Promise<void>;

interface OperationOption {
    label: string;
    value: RandomVoiceOperation;
    default: boolean;
}

interface ToggleOption<K extends string> {
    key: K;
    label: string;
}

const operationOptions: OperationOption[] = [
    { label: "More than", value: ">", default: false },
    { label: "Less than", value: "<", default: false },
    { label: "Equal to", value: "==", default: true },
];

const stateFilters: ToggleOption<StateFilterKey>[] = [
    { key: "mute", label: "Muted" },
    { key: "deafen", label: "Deafened" },
    { key: "video", label: "Camera" },
    { key: "stream", label: "Stream" },
];

const selfSettings: ToggleOption<SelfSettingKey>[] = [
    { key: "cycleMode", label: "Cycle Mode (No repeat until all visited)" },
    { key: "autoRejoinOnKick", label: "Auto Rejoin on Kick / Instant Disconnect" },
    { key: "avoidEmpty", label: "Skip Empty Channels (Min 1 user)" },
    { key: "avoidAllMuted", label: "Skip if All Muted / Deafened" },
    { key: "prioritizeFriends", label: "Prioritize Friends" },
    { key: "avoidStages", label: "Avoid Stage Channels" },
    { key: "avoidAfk", label: "Avoid AFK Channel" },
    { key: "selfMute", label: "Auto Self Mute" },
    { key: "selfDeafen", label: "Auto Self Deafen" },
    { key: "autoCamera", label: "Auto Camera" },
    { key: "autoStream", label: "Auto Stream" },
    { key: "leaveEmpty", label: "Leave when Empty" },
    { key: "autoNavigate", label: "Auto Navigate to Channel" },
];

const defaultSettings = {
    keybind: DEFAULT_KEYBIND,
    keybindEnabled: false,
    cycleMode: true,
    autoRejoinOnKick: true,
    avoidEmpty: true,
    avoidAllMuted: true,
    UserAmountOperation: ">",
    UserAmount: 0,
    spacesLeftOperation: ">",
    spacesLeft: 0,
    vcLimitOperation: ">",
    vcLimit: 1,
    autoNavigate: false,
    autoCamera: false,
    autoStream: false,
    selfMute: false,
    selfDeafen: false,
    leaveEmpty: false,
    prioritizeFriends: false,
    avoidStages: true,
    avoidAfk: true,
    video: false,
    stream: false,
    mute: false,
    deafen: false,
    includeStates: false,
    avoidStates: false,
};

function getStore(): typeof defaultSettings & Record<string, any> {
    try {
        if (settings && settings.store) {
            return settings.store;
        }
    } catch {}
    return defaultSettings;
}

function setStoreValue<K extends keyof typeof defaultSettings>(key: K, value: typeof defaultSettings[K]) {
    try {
        if (settings && settings.store) {
            settings.store[key] = value;
            return;
        }
    } catch {}
    (defaultSettings as any)[key] = value;
}

interface RandomVoiceStateLike {
    userId?: string | null;
    channelId?: string | null;
    user_id?: string | null;
    channel_id?: string | null;
    selfDeaf?: boolean | null;
    selfMute?: boolean | null;
    selfStream?: boolean | null;
    selfVideo?: boolean | null;
    self_deaf?: boolean | null;
    self_mute?: boolean | null;
    self_stream?: boolean | null;
    self_video?: boolean | null;
    mute?: boolean | null;
    deaf?: boolean | null;
    suppress?: boolean | null;
}

function isUserMutedOrDeafened(state: RandomVoiceStateLike): boolean {
    return Boolean(
        state.selfMute ||
        state.self_mute ||
        state.mute ||
        state.selfDeaf ||
        state.self_deaf ||
        state.deaf ||
        state.suppress
    );
}

function getCurrentUserId(): string | null {
    return UserStore.getCurrentUser()?.id ?? null;
}

function getCurrentVoiceChannelId(userId = getCurrentUserId()): string | null {
    if (!userId) return null;
    return VoiceStateStore.getVoiceStateForUser(userId)?.channelId
        ?? SelectedChannelStore.getVoiceChannelId()
        ?? null;
}

function getChannelGuildId(channel: any): string | null {
    if (!channel) return null;
    if (typeof channel.getGuildId === "function") {
        try {
            const gId = channel.getGuildId();
            if (gId) return gId;
        } catch {}
    }
    return channel.guild_id ?? channel.guildId ?? null;
}

function getActiveGuildId(): string | null {
    // 1. Depuis le vocal actuel
    const currentVoiceId = getCurrentVoiceChannelId();
    if (currentVoiceId) {
        const channel = ChannelStore.getChannel(currentVoiceId);
        const gId = getChannelGuildId(channel);
        if (gId && gId !== "@me") {
            lastConnectedGuildId = gId;
            return gId;
        }
    }

    // 2. Depuis le dernier serveur vocal mémorisé
    if (lastConnectedGuildId && lastConnectedGuildId !== "@me") {
        return lastConnectedGuildId;
    }

    // 3. Depuis SelectedGuildStore
    try {
        if (SelectedGuildStore && typeof SelectedGuildStore.getGuildId === "function") {
            const gId = SelectedGuildStore.getGuildId();
            if (gId && gId !== "@me") {
                lastConnectedGuildId = gId;
                return gId;
            }
        }
    } catch {}

    // 4. Depuis SelectedChannelStore
    try {
        const selChanId = SelectedChannelStore.getChannelId?.() ?? SelectedChannelStore.getVoiceChannelId?.();
        if (selChanId) {
            const chan = ChannelStore.getChannel(selChanId);
            const gId = getChannelGuildId(chan);
            if (gId && gId !== "@me") {
                lastConnectedGuildId = gId;
                return gId;
            }
        }
    } catch {}

    // 5. Depuis l'URL de la fenêtre (/channels/:guildId/:channelId)
    try {
        if (typeof window !== "undefined" && window.location) {
            const parts = window.location.pathname.split("/");
            if (parts[1] === "channels" && parts[2] && parts[2] !== "@me" && /^\d+$/.test(parts[2])) {
                lastConnectedGuildId = parts[2];
                return parts[2];
            }
        }
    } catch {}

    return lastConnectedGuildId;
}

function selectVoice(channelId: string) {
    try {
        if (selectVoiceModule && typeof selectVoiceModule.selectVoiceChannel === "function") {
            selectVoiceModule.selectVoiceChannel(channelId);
            return;
        }
    } catch {}

    try {
        if (ChannelActions && typeof ChannelActions.selectVoiceChannel === "function") {
            ChannelActions.selectVoiceChannel(channelId);
            return;
        }
    } catch {}

    try {
        if (VoiceActions && typeof (VoiceActions as any)?.selectVoiceChannel === "function") {
            (VoiceActions as any).selectVoiceChannel(channelId);
            return;
        }
    } catch {}

    try {
        const channel = ChannelStore.getChannel(channelId);
        FluxDispatcher.dispatch({
            type: "VOICE_CHANNEL_SELECT",
            channelId: channelId,
            guildId: getChannelGuildId(channel),
            video: false,
            stream: false,
            currentVoiceChannelId: null,
        });
    } catch {}
}

function navigateToChannel(channelId: string) {
    try {
        if (ChannelRouter && typeof ChannelRouter.transitionToChannel === "function") {
            ChannelRouter.transitionToChannel(channelId);
            return;
        }
        const channel = ChannelStore.getChannel(channelId);
        const guildId = getChannelGuildId(channel) ?? "@me";
        if (ChannelRouter && typeof ChannelRouter.transitionTo === "function") {
            ChannelRouter.transitionTo(`/channels/${guildId}/${channelId}`);
            return;
        }
    } catch {}
}

function toggleMute() {
    try {
        if (typeof (VoiceActions as any)?.toggleSelfMute === "function") {
            (VoiceActions as any).toggleSelfMute();
            return;
        }
        FluxDispatcher.dispatch({ type: "AUDIO_TOGGLE_SELF_MUTE" });
    } catch {}
}

function toggleDeaf() {
    try {
        if (typeof (VoiceActions as any)?.toggleSelfDeaf === "function") {
            (VoiceActions as any).toggleSelfDeaf();
            return;
        }
        FluxDispatcher.dispatch({ type: "AUDIO_TOGGLE_SELF_DEAF" });
    } catch {}
}

function getGuildVoiceStates(guildId: string): [string, RandomVoiceStateLike][] {
    try {
        const states = VoiceStateStore.getVoiceStates(guildId);
        if (!states) return [];
        if (states instanceof Map) {
            return Array.from(states.entries());
        }
        if (typeof states === "object") {
            return Object.entries(states);
        }
    } catch {}
    return [];
}

function hasStateFilters() {
    const store = getStore();
    return stateFilters.some(({ key }) => store[key]);
}

function matchesOperation(operation: RandomVoiceOperation, value: number, target: number) {
    if (operation === "==") return value === target;
    if (operation === ">") return value > target;
    if (operation === "<") return value < target;
    if (operation === ">=") return value >= target;
    if (operation === "<=") return value <= target;
    return true;
}

function isStageChannel(channel: Channel) {
    return channel.type === 13 || channel.isGuildStageVoice?.() === true;
}

function isAfkChannel(channel: Channel) {
    const guildId = getChannelGuildId(channel);
    if (!guildId) return false;
    return GuildStore.getGuild(guildId)?.afkChannelId === channel.id;
}

function matchesStateFilters(state: RandomVoiceStateLike) {
    const store = getStore();
    const isMuted = Boolean(state.selfMute || state.self_mute || state.mute);
    const isDeaf = Boolean(state.selfDeaf || state.self_deaf || state.deaf);
    const hasVideo = Boolean(state.selfVideo || state.self_video);
    const isStreaming = Boolean(state.selfStream || state.self_stream);

    if (store.mute && !isMuted) return false;
    if (store.deafen && !isDeaf) return false;
    if (store.video && !hasVideo) return false;
    if (store.stream && !isStreaming) return false;
    return true;
}

function isJoinableChannel(channelId: string, currentGuildId: string, allowAllMuted = false) {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return false;

    // Must belong to the exact same server
    const channelGuildId = getChannelGuildId(channel);
    if (channelGuildId !== currentGuildId) return false;

    // Do not rejoin the exact channel that just kicked/disconnected us
    if (lastKickedChannelId && channelId === lastKickedChannelId) return false;

    // Permissions check
    if (PermissionStore && typeof PermissionStore.can === "function") {
        try {
            const CONNECT = PermissionsBits?.CONNECT ?? 1048576n;
            if (!PermissionStore.can(CONNECT, channel)) return false;
        } catch {}
    }

    const store = getStore();
    if (store.avoidStages && isStageChannel(channel)) return false;
    if (store.avoidAfk && isAfkChannel(channel)) return false;

    const currentUserId = getCurrentUserId();
    const currentVoiceId = getCurrentVoiceChannelId(currentUserId);
    if (channelId === currentVoiceId) return false;

    const rawVoiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId) as Record<string, RandomVoiceStateLike> | null;
    const voiceStates = Object.values(rawVoiceStates ?? {}).filter(s => {
        const uId = s.userId ?? s.user_id;
        return uId && uId !== currentUserId;
    });
    const usersInChannel = voiceStates.length;

    // User limit check
    if (channel.userLimit > 0 && usersInChannel >= channel.userLimit) return false;

    // Condition 1: Exclude empty channels
    if (store.avoidEmpty && usersInChannel === 0 && !allowAllMuted) {
        return false;
    }

    // Condition 2: Exclude channels where all members are muted/deafened
    if (store.avoidAllMuted && !allowAllMuted && usersInChannel > 0) {
        const isEveryoneMutedOrDeaf = voiceStates.every(state => isUserMutedOrDeafened(state));
        if (isEveryoneMutedOrDeaf) return false;
    }

    return true;
}

function matchesChannelFilters(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return false;

    const store = getStore();
    const currentUserId = getCurrentUserId();
    const rawVoiceStates = VoiceStateStore.getVoiceStatesForChannel(channelId) as Record<string, RandomVoiceStateLike> | null;
    const voiceStates = Object.values(rawVoiceStates ?? {}).filter(s => {
        const uId = s.userId ?? s.user_id;
        return uId && uId !== currentUserId;
    });
    const usersInChannel = voiceStates.length;
    const channelLimit = channel.userLimit || 99;
    const spacesLeft = channelLimit - usersInChannel;

    if (!matchesOperation(store.spacesLeftOperation, spacesLeft, store.spacesLeft)) return false;
    if (!matchesOperation(store.UserAmountOperation, usersInChannel, store.UserAmount)) return false;
    if (!matchesOperation(store.vcLimitOperation, channelLimit, store.vcLimit)) return false;

    if (!hasStateFilters() || voiceStates.length === 0) return true;

    const hasMatch = voiceStates.some(voiceState => matchesStateFilters(voiceState));
    if (store.includeStates && !hasMatch) return false;
    if (store.avoidStates && hasMatch) return false;

    return true;
}

function getCandidateChannelIds(guildId: string, allowAllMuted = false) {
    const candidates = new Set<string>();

    for (const [, state] of getGuildVoiceStates(guildId)) {
        const channelId = state.channelId ?? state.channel_id;
        if (!channelId || candidates.has(channelId)) continue;
        if (!isJoinableChannel(channelId, guildId, allowAllMuted)) continue;
        if (!matchesChannelFilters(channelId)) continue;
        candidates.add(channelId);
    }

    // Secours si aucun salon trouvé : parcourir l'ensemble des salons du serveur
    if (candidates.size === 0 && allowAllMuted) {
        try {
            const allChannels = ChannelStore.getChannels ? Object.values(ChannelStore.getChannels()) : [];
            for (const ch of allChannels as Channel[]) {
                if (!ch || !ch.id) continue;
                if (getChannelGuildId(ch) !== guildId) continue;
                if (ch.type !== 2 && ch.type !== 13) continue;
                if (candidates.has(ch.id)) continue;
                if (!isJoinableChannel(ch.id, guildId, true)) continue;
                candidates.add(ch.id);
            }
        } catch {}
    }

    return [...candidates];
}

function getFriendChannelIds(guildId: string) {
    const friendChannelIds = new Set<string>();

    for (const userId of RelationshipStore.getFriendIDs()) {
        const channelId = VoiceStateStore.getVoiceStateForUser(userId)?.channelId;
        if (channelId != null && isJoinableChannel(channelId, guildId)) {
            friendChannelIds.add(channelId);
        }
    }

    return friendChannelIds;
}

function pickRandomChannel(guildId: string, isKickRejoin = false): string | null {
    const store = getStore();
    let allCandidates = getCandidateChannelIds(guildId, false);

    // Si aucun salon avec des membres non-mute n'est trouvé pendant un kick, fallback
    if (allCandidates.length === 0 && isKickRejoin) {
        allCandidates = getCandidateChannelIds(guildId, true);
    }

    if (allCandidates.length === 0) {
        return null;
    }

    let candidatesToUse = allCandidates;

    if (store.cycleMode) {
        const unvisitedCandidates = allCandidates.filter(id => !visitedChannelIds.has(id));

        if (unvisitedCandidates.length > 0) {
            candidatesToUse = unvisitedCandidates;
        } else {
            visitedChannelIds.clear();
            if (lastKickedChannelId) {
                visitedChannelIds.add(lastKickedChannelId);
            }
            candidatesToUse = allCandidates.filter(id => id !== lastKickedChannelId);
            if (candidatesToUse.length === 0) candidatesToUse = allCandidates;
            showToast("Cycle terminé ! Réinitialisation des salons visités sur ce serveur.", Toasts.Type.SUCCESS);
        }
    }

    const friendChannelIds = store.prioritizeFriends ? getFriendChannelIds(guildId) : null;
    const friendCandidates = store.prioritizeFriends
        ? candidatesToUse.filter(channelId => friendChannelIds?.has(channelId))
        : [];

    const pool = friendCandidates.length ? friendCandidates : candidatesToUse;
    const chosenChannelId = pool[Math.floor(Math.random() * pool.length)] ?? null;

    if (chosenChannelId && store.cycleMode) {
        visitedChannelIds.add(chosenChannelId);
    }

    return chosenChannelId;
}

async function enableCamera() {
    if (isVideoEnabled()) return;

    FluxDispatcher.dispatch({
        type: "MEDIA_ENGINE_SET_VIDEO_ENABLED",
        enabled: true,
    });
}

async function startChannelStream(channel: Channel) {
    if (isStageChannel(channel) || !PermissionStore.can(PermissionsBits.STREAM, channel)) return;

    const selectedChannelId = SelectedChannelStore.getVoiceChannelId();
    if (!selectedChannelId) return;

    const sources = await getDesktopSources(MediaEngineStore.getMediaEngine(), ["screen"], null);
    const source = sources?.[0];
    if (!source) return;

    startStream(channel.guild_id ?? null, selectedChannelId, {
        pid: null,
        sourceId: source.id,
        sourceName: source.name,
        audioSourceId: null,
        sound: true,
        previewDisabled: false,
    });
}

function runAfterVoiceJoin(channelId: string, callbacks: PostJoinAction[]) {
    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;

        if (getCurrentVoiceChannelId() !== channelId) {
            if (attempts < 20) return;
            clearInterval(interval);
            return;
        }

        clearInterval(interval);
        for (const callback of callbacks) {
            try {
                void callback();
            } catch (e) {}
        }
    }, 100);
}

async function joinRandomVoice(targetGuildId?: string, force = false) {
    if (isJoining && !force) return;
    isJoining = true;

    try {
        const guildId = targetGuildId ?? getActiveGuildId();

        if (!guildId) {
            showToast("Vous devez être dans un salon vocal d'un serveur pour utiliser Random Voice.", Toasts.Type.MESSAGE);
            return;
        }

        const channelId = pickRandomChannel(guildId, force);
        if (!channelId) {
            showToast("Aucun autre salon vocal actif éligible trouvé sur ce serveur.", Toasts.Type.MESSAGE);
            return;
        }

        const channel = ChannelStore.getChannel(channelId);
        if (!channel) {
            showToast("Le salon vocal est indisponible.", Toasts.Type.FAILURE);
            return;
        }

        const store = getStore();

        lastAttemptedChannelId = channelId;
        isSwitchingChannels = true;
        selectVoice(channelId);

        if (store.autoNavigate) {
            navigateToChannel(channelId);
        }

        const postJoinActions: PostJoinAction[] = [];
        if (store.selfMute && !MediaEngineStore.isSelfMute()) {
            postJoinActions.push(toggleMute);
        }
        if (store.selfDeafen && !MediaEngineStore.isSelfDeaf()) {
            postJoinActions.push(toggleDeaf);
        }
        if (store.autoCamera) {
            postJoinActions.push(enableCamera);
        }
        if (store.autoStream) {
            postJoinActions.push(() => startChannelStream(channel));
        }

        if (postJoinActions.length) {
            runAfterVoiceJoin(channelId, postJoinActions);
        }
    } finally {
        setTimeout(() => {
            isJoining = false;
            isSwitchingChannels = false;
        }, 200);
    }
}

function RandomVoiceKeybindSettings() {
    const [isListening, setIsListening] = useState(false);
    const store = getStore();
    const keybind = store.keybind;
    const keybindEnabled = store.keybindEnabled;

    useEffect(() => {
        isRecordingKeybind = isListening;
        if (!isListening) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopPropagation();

            if (isModifierKey(event.key)) return;

            setStoreValue("keybind", eventToKeybind(event));
            setIsListening(false);
        };

        const handleBlur = () => setIsListening(false);

        document.addEventListener("keydown", handleKeyDown, true);
        window.addEventListener("blur", handleBlur);

        return () => {
            isRecordingKeybind = false;
            document.removeEventListener("keydown", handleKeyDown, true);
            window.removeEventListener("blur", handleBlur);
        };
    }, [isListening]);

    return (
        <div className={cl("record")}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className={cl("keybind")} style={{ color: "var(--header-primary, #ffffff)", fontSize: 16, fontWeight: 600 }}>
                    {t("Keybind")}
                </span>
                <Switch checked={keybindEnabled} onChange={value => { setStoreValue("keybindEnabled", value); }} />
            </div>
            {keybindEnabled && (
                <div className={cl("recording")} style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                    <Button type="button" variant="secondary" onClick={() => setIsListening(true)} disabled={isListening}>
                        {isListening ? t("Recording...") : formatKeybind(keybind)}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => { setStoreValue("keybind", DEFAULT_KEYBIND); }} disabled={isListening}>
                        {t("Reset")}
                    </Button>
                </div>
            )}
        </div>
    );
}

function formatKeybind(keybind: string | string[]) {
    const keybindString = Array.isArray(keybind) ? keybind.join("+") : keybind;
    return IS_MAC
        ? keybindString.replace(/Control/gi, "^").replace(/Meta|Command|Cmd/gi, "⌘").replace(/Alt|Option/gi, "⌥").replace(/Shift/gi, "⇧")
        : keybindString;
}

function eventToKeybind(event: KeyboardEvent) {
    const keys: string[] = [];
    addPressedModifiers(event, keys);
    keys.push(normalizeKey(event.key));
    return keys;
}

function getConfiguredKeybind() {
    const raw = getStore().keybind;
    if (Array.isArray(raw) && raw.some(key => !isModifierKey(key))) return raw;
    return DEFAULT_KEYBIND;
}

function matchesKeybind(event: KeyboardEvent) {
    const keybind = getConfiguredKeybind().map(key => key.toLowerCase());
    const pressed = normalizeKey(event.key).toLowerCase();
    const code = normalizeCode(event.code);
    let nonModifierMatched = false;

    if (!matchesModifiers(event, keybind)) return false;

    for (const key of keybind) {
        if (isModifierKey(key)) continue;

        if (pressed !== key && code !== key) return false;
        nonModifierMatched = true;
    }

    return nonModifierMatched;
}

function isModifierKey(key: string) {
    return MODIFIER_KEYS.has(key.toLowerCase());
}

function matchesModifiers(event: KeyboardEvent, keybind: string[]) {
    const expected = new Set(keybind.map(getModifierKey).filter(key => key !== null));
    const pressed = new Set<string>();

    if (event.ctrlKey) pressed.add("control");
    if (event.shiftKey) pressed.add("shift");
    if (event.altKey) pressed.add("alt");
    if (event.metaKey) pressed.add("meta");

    return expected.size === pressed.size && [...expected].every(key => pressed.has(key));
}

function getModifierKey(key: string) {
    switch (key) {
        case "mod":
            return IS_MAC ? "meta" : "control";
        case "control":
        case "ctrl":
            return "control";
        case "shift":
            return "shift";
        case "alt":
        case "option":
            return "alt";
        case "meta":
        case "cmd":
        case "command":
            return "meta";
        default:
            return null;
    }
}

function addPressedModifiers(event: KeyboardEvent, keys: string[]) {
    if (event.metaKey) keys.push("Meta");
    if (event.ctrlKey) keys.push("Control");
    if (event.shiftKey) keys.push("Shift");
    if (event.altKey) keys.push("Alt");
}

function keybindUsesModifier() {
    return getConfiguredKeybind().some(isModifierKey);
}

function normalizeKey(key: string) {
    if (key === " ") return "Space";
    if (key === "Esc") return "Escape";
    return key.length === 1 ? key.toUpperCase() : key;
}

function normalizeCode(code: string) {
    return code
        .toLowerCase()
        .replace(/^key/, "")
        .replace(/^digit/, "")
        .replace(/^numpad/, "");
}

function shouldIgnoreKeybindTarget(target: EventTarget | null) {
    return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

const settings = definePluginSettings({
    keybind: {
        type: OptionType.COMPONENT,
        default: DEFAULT_KEYBIND,
        component: RandomVoiceKeybindSettings,
    },
    keybindEnabled: {
        description: "Show the random voice keybind controls",
        type: OptionType.BOOLEAN,
        default: false,
        hidden: true,
    },
    cycleMode: {
        type: OptionType.BOOLEAN,
        description: "Don't join a voice channel you've already visited until all active ones on the server are completed.",
        default: true,
    },
    autoRejoinOnKick: {
        type: OptionType.BOOLEAN,
        description: "Automatically join another active voice channel on the server if you get disconnected / kicked.",
        default: true,
    },
    avoidEmpty: {
        type: OptionType.BOOLEAN,
        description: "Do not join empty voice channels (requires at least 1 person).",
        default: true,
    },
    avoidAllMuted: {
        type: OptionType.BOOLEAN,
        description: "Do not join if everyone in the voice channel is muted or deafened.",
        default: true,
    },
    UserAmountOperation: {
        description: "Select an operation for the amounts of users",
        type: OptionType.SELECT,
        options: [
            { label: "More than", value: ">", default: true },
            { label: "Less than", value: "<", default: false },
            { label: "Equal to", value: "==", default: false },
        ],
    },
    UserAmount: {
        description: "Select amount of users",
        type: OptionType.SLIDER,
        markers: makeRange(0, 15, 1),
        default: 0,
        stickToMarkers: true,
    },
    spacesLeftOperation: {
        description: "Select an operation for the spaces left",
        type: OptionType.SELECT,
        options: [
            { label: "More than", value: ">", default: true },
            { label: "Less than", value: "<", default: false },
            { label: "Equal to", value: "==", default: false },
        ],
    },
    spacesLeft: {
        description: "Select amount of spaces left",
        type: OptionType.SLIDER,
        markers: makeRange(0, 15, 1),
        default: 0,
        stickToMarkers: true,
    },
    vcLimitOperation: {
        description: "Select an operation for the voice-channel limit.",
        type: OptionType.SELECT,
        options: [
            { label: "More than", value: ">", default: true },
            { label: "Less than", value: "<", default: false },
            { label: "Equal to", value: "==", default: false },
        ],
    },
    vcLimit: {
        description: "Select a voice-channel limit",
        type: OptionType.SLIDER,
        markers: makeRange(1, 15, 1),
        default: 1,
        stickToMarkers: true,
    },
    autoNavigate: {
        type: OptionType.BOOLEAN,
        description: "Automatically navigates to the voice-channel.",
        default: false,
    },
    autoCamera: {
        type: OptionType.BOOLEAN,
        description: "Automatically turns on camera",
        default: false,
    },
    autoStream: {
        type: OptionType.BOOLEAN,
        description: "Automatically turns on stream",
        default: false,
    },
    selfMute: {
        type: OptionType.BOOLEAN,
        description: "Automatically mutes your mic when joining voice-channel.",
        default: false,
    },
    selfDeafen: {
        type: OptionType.BOOLEAN,
        description: "Automatically deafens your audio when joining voice-channel.",
        default: false,
    },
    leaveEmpty: {
        type: OptionType.BOOLEAN,
        description: "Finds another random active call when the voice chat becomes empty.",
        default: false,
    },
    prioritizeFriends: {
        type: OptionType.BOOLEAN,
        description: "Prefer channels with your friends in them when possible.",
        default: false,
    },
    avoidStages: {
        type: OptionType.BOOLEAN,
        description: "Avoids joining stage voice-channels.",
        default: true,
    },
    avoidAfk: {
        type: OptionType.BOOLEAN,
        description: "Avoids joining AFK voice-channels.",
        default: true,
    },
    video: {
        type: OptionType.BOOLEAN,
        description: "Searches for users with their video on",
        default: false,
    },
    stream: {
        type: OptionType.BOOLEAN,
        description: "Searches for users who are streaming",
        default: false,
    },
    mute: {
        type: OptionType.BOOLEAN,
        description: "Searches for users who are muted",
        default: false,
    },
    deafen: {
        type: OptionType.BOOLEAN,
        description: "Searches for users who are deafened",
        default: false,
    },
    includeStates: {
        type: OptionType.BOOLEAN,
        description: "Option to include states",
        default: false,
    },
    avoidStates: {
        type: OptionType.BOOLEAN,
        description: "Option to avoid states",
        default: false,
    },
});

function showToast(message: string, type: (typeof Toasts.Type)[keyof typeof Toasts.Type]) {
    Toasts.show({
        message: t(message),
        type,
        id: Toasts.genId(),
        options: { position: Toasts.Position.BOTTOM },
    });
}

function RandomVoiceIcon({ className }: { className?: string; }) {
    return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24">
            <g fill="currentColor">
                <path d="M19,9H14a5.006,5.006,0,0,0-5,5v5a5.006,5.006,0,0,0,5,5h5a5.006,5.006,0,0,0,5-5V14A5.006,5.006,0,0,0,19,9Zm-5,6a1,1,0,1,1,1-1A1,1,0,0,1,14,15Zm5,5a1,1,0,1,1,1-1A1,1,0,0,1,19,20ZM15.6,5,12.069,1.462A5.006,5.006,0,0,0,5,1.462L1.462,5a5.006,5.006,0,0,0,0,7.071L5,15.6a4.961,4.961,0,0,0,2,1.223V14a7.008,7.008,0,0,1,7-7h2.827A4.961,4.961,0,0,0,15.6,5ZM5,10A1,1,0,1,1,6,9,1,1,0,0,1,5,10ZM9,6a1,1,0,1,1,1-1A1,1,0,0,1,9,6Z" />
            </g>
        </svg>
    );
}

function RandomVoiceButton({ iconForeground, hideTooltips, nameplate }: UserAreaRenderProps) {
    const tooltipText = hideTooltips ? void 0 : `Random Voice (${visitedChannelIds.size} ${t("visités")})`;

    return (
        <UserAreaButton
            onClick={() => void joinRandomVoice()}
            onContextMenu={event => ContextMenuApi.openContextMenu(event, () => <RandomVoiceMenu onClose={ContextMenuApi.closeContextMenu} />)}
            role="switch"
            tooltipText={tooltipText}
            icon={<RandomVoiceIcon className={iconForeground} />}
            plated={nameplate != null}
        />
    );
}

function RandomVoiceMenu({ onClose }: { onClose(): void; }) {
    const [, rerender] = React.useReducer(value => value + 1, 0);
    const store = getStore();

    const update = <K extends keyof typeof defaultSettings>(key: K, value: typeof defaultSettings[K]) => {
        setStoreValue(key, value);
        rerender();
    };
    const toggle = <K extends SelfSettingKey | StateFilterKey | "includeStates" | "avoidStates">(key: K) => update(key, !store[key]);

    const clearVisited = () => {
        visitedChannelIds.clear();
        lastKickedChannelId = null;
        lastAttemptedChannelId = null;
        showToast("Historique des salons visités réinitialisé.", Toasts.Type.SUCCESS);
        rerender();
    };

    const setSlider = <K extends "UserAmount" | "spacesLeft" | "vcLimit">(key: K) =>
        debounce((value: number) => {
            update(key, Math.round(value) as any);
        }, 50);

    return (
        <Menu.Menu navId="random-voice" onClose={onClose} aria-label="Random Voice">
            <Menu.MenuItem
                id="random-voice-reset-history"
                label={`${t("Réinitialiser l'historique du serveur")} (${visitedChannelIds.size} ${t("visités")})`}
                action={clearVisited}
            />

            <Menu.MenuSeparator />

            <Menu.MenuItem id="random-voice-state-filters" label={t("Filtres d'États (Membres)")}>
                <>
                    {stateFilters.map(({ key, label }) => (
                        <Menu.MenuCheckboxItem
                            key={key}
                            id={`random-voice-filter-${key}`}
                            label={t(label)}
                            checked={store[key]}
                            action={() => toggle(key)}
                        />
                    ))}
                    <Menu.MenuSeparator />
                    <Menu.MenuCheckboxItem
                        id="random-voice-include-states"
                        label={t("Inclure Filtres")}
                        checked={store.includeStates}
                        disabled={store.avoidStates || !hasStateFilters()}
                        action={() => toggle("includeStates")}
                    />
                    <Menu.MenuCheckboxItem
                        id="random-voice-avoid-states"
                        label={t("Éviter Filtres")}
                        checked={store.avoidStates}
                        disabled={store.includeStates || !hasStateFilters()}
                        action={() => toggle("avoidStates")}
                    />
                </>
            </Menu.MenuItem>

            <Menu.MenuSeparator />

            {renderOperationGroup({
                id: "users",
                label: t("Nombre d'Utilisateurs"),
                sliderKey: "UserAmount",
                operationKey: "UserAmountOperation",
                sliderValue: store.UserAmount,
                operationValue: store.UserAmountOperation,
                onOperationChange: value => update("UserAmountOperation", value),
                onSliderChange: setSlider("UserAmount"),
            })}

            <Menu.MenuSeparator />

            {renderOperationGroup({
                id: "spaces-left",
                label: t("Places Restantes"),
                sliderKey: "spacesLeft",
                operationKey: "spacesLeftOperation",
                sliderValue: store.spacesLeft,
                operationValue: store.spacesLeftOperation,
                onOperationChange: value => update("spacesLeftOperation", value),
                onSliderChange: setSlider("spacesLeft"),
            })}

            <Menu.MenuSeparator />

            {renderOperationGroup({
                id: "voice-limit",
                label: t("Limite Salon Vocal"),
                sliderKey: "vcLimit",
                operationKey: "vcLimitOperation",
                sliderValue: store.vcLimit,
                operationValue: store.vcLimitOperation,
                onOperationChange: value => update("vcLimitOperation", value),
                onSliderChange: setSlider("vcLimit"),
            })}

            <Menu.MenuSeparator />

            <Menu.MenuItem id="random-voice-self-settings" label={t("Options Avancées (Anti-Mute & Kick)")}>
                <>
                    {selfSettings.map(({ key, label }) => (
                        <Menu.MenuCheckboxItem
                            key={key}
                            id={`random-voice-setting-${key}`}
                            label={t(label)}
                            checked={store[key]}
                            action={() => toggle(key)}
                        />
                    ))}
                </>
            </Menu.MenuItem>
        </Menu.Menu>
    );
}

function renderOperationGroup({
    id,
    label,
    sliderKey,
    operationKey,
    sliderValue,
    operationValue,
    onOperationChange,
    onSliderChange,
}: {
    id: string;
    label: string;
    sliderKey: string;
    operationKey: string;
    sliderValue: number;
    operationValue: RandomVoiceOperation;
    onOperationChange(value: RandomVoiceOperation): void;
    onSliderChange(value: number): void;
}) {
    return (
        <Menu.MenuGroup label={label.toUpperCase()}>
            <Menu.MenuControlItem
                id={`random-voice-slider-${sliderKey}`}
                label={label}
                control={(props, ref) => (
                    <Menu.MenuSliderControl
                        ref={ref}
                        {...props}
                        minValue={0}
                        maxValue={15}
                        value={sliderValue}
                        onChange={onSliderChange}
                        renderValue={value => `${Math.round(value)} ${Math.round(value) === 1 ? t("utilisateur") : t("utilisateurs")}`}
                    />
                )}
            />
            <Menu.MenuItem id={`random-voice-operation-${operationKey}`} label={t("Paramètres")}>
                <>
                    {operationOptions.map(option => (
                        <Menu.MenuRadioItem
                            key={option.value}
                            id={`random-voice-operation-${id}-${option.value}`}
                            group={`random-voice-${id}`}
                            label={t(option.label)}
                            checked={operationValue === option.value}
                            action={() => onOperationChange(option.value)}
                        />
                    ))}
                </>
            </Menu.MenuItem>
        </Menu.MenuGroup>
    );
}

function triggerManualReset() {
    lastUserManualDisconnectTime = Date.now();
    isUserManualDisconnect = true;
    clearTimeout(autoRejoinTimeout);
    setTimeout(() => {
        isUserManualDisconnect = false;
    }, 2000);
}

// Hook sur les méthodes de déconnexion volontaire de Discord
let originalDisconnect: any = null;
let originalSelectVoiceChannel: any = null;

function patchVoiceActions() {
    try {
        if (VoiceActions && typeof VoiceActions.disconnect === "function" && !originalDisconnect) {
            originalDisconnect = VoiceActions.disconnect;
            VoiceActions.disconnect = function(...args: any[]) {
                triggerManualReset();
                return originalDisconnect.apply(this, args);
            };
        }

        if (VoiceActions && typeof VoiceActions.selectVoiceChannel === "function" && !originalSelectVoiceChannel) {
            originalSelectVoiceChannel = VoiceActions.selectVoiceChannel;
            VoiceActions.selectVoiceChannel = function(channelId: any, ...args: any[]) {
                if (!channelId && !isSwitchingChannels) {
                    triggerManualReset();
                }
                return originalSelectVoiceChannel.apply(this, args);
            };
        }
    } catch {}
}

function unpatchVoiceActions() {
    try {
        if (originalDisconnect && VoiceActions) {
            VoiceActions.disconnect = originalDisconnect;
            originalDisconnect = null;
        }
        if (originalSelectVoiceChannel && VoiceActions) {
            VoiceActions.selectVoiceChannel = originalSelectVoiceChannel;
            originalSelectVoiceChannel = null;
        }
    } catch {}
}

function handleVoiceDisconnect(disconnectedChannelId: string | null, targetGuildId: string | null) {
    const isManual = (Date.now() - lastUserManualDisconnectTime < 2000) || isUserManualDisconnect;

    if (isManual) {
        clearTimeout(autoRejoinTimeout);
        visitedChannelIds.clear();
        currentConnectedChannelId = null;
        lastConnectedGuildId = null;
        lastKickedChannelId = null;
        lastAttemptedChannelId = null;
        isJoining = false;
        isSwitchingChannels = false;
        isUserManualDisconnect = false;
        showToast("Déconnexion volontaire : historique réinitialisé.", Toasts.Type.MESSAGE);
        return;
    }

    const guildId = targetGuildId ?? getActiveGuildId();
    if (!guildId) return;

    const store = getStore();
    if (!store.autoRejoinOnKick) return;

    const kickedId = disconnectedChannelId || lastAttemptedChannelId || currentConnectedChannelId;
    if (kickedId) {
        lastKickedChannelId = kickedId;
        visitedChannelIds.add(kickedId);
    }

    currentConnectedChannelId = null;
    isJoining = false;
    isSwitchingChannels = false;

    const now = Date.now();
    if (now - lastDisconnectHandledTime < 250 && lastDisconnectHandledChannel === kickedId) {
        return;
    }
    lastDisconnectHandledTime = now;
    lastDisconnectHandledChannel = kickedId;

    clearTimeout(autoRejoinTimeout);
    autoRejoinTimeout = setTimeout(() => {
        const stillInVoice = getCurrentVoiceChannelId();
        const stillManual = (Date.now() - lastUserManualDisconnectTime < 2000);
        if (!stillInVoice && !stillManual) {
            showToast("Éjection détectée ! Reconnexion instantanée...", Toasts.Type.MESSAGE);
            void joinRandomVoice(guildId, true);
        }
    }, 40);
}

const handleGlobalKeyDown = (event: KeyboardEvent) => {
    if (isRecordingKeybind) return;
    if (!getStore().keybindEnabled) return;
    if (shouldIgnoreKeybindTarget(event.target) && !keybindUsesModifier()) return;
    if (!matchesKeybind(event)) return;

    event.preventDefault();
    event.stopPropagation();
    void joinRandomVoice();
};

export default definePlugin({
    name: "EnhancedRandomVoice",
    description: "Randomly joins another active voice channel on the same server (anti-kick, anti-empty-vc, anti-all-muted, cycle without repeat).",
    tags: ["Fun", "Voice"],
    authors: [
        {
            name: "Zeytox",
            id: 0n,
        }
    ],
    enabledByDefault: false,
    settings,

    userAreaButton: {
        icon: RandomVoiceIcon,
        render: RandomVoiceButton,
    },

    start() {
        injectStyles();
        patchVoiceActions();
        window.addEventListener("keydown", handleGlobalKeyDown, true);

        currentConnectedChannelId = getCurrentVoiceChannelId();
        lastConnectedGuildId = getActiveGuildId();
    },

    stop() {
        removeStyles();
        unpatchVoiceActions();
        window.removeEventListener("keydown", handleGlobalKeyDown, true);

        clearTimeout(autoRejoinTimeout);
        visitedChannelIds.clear();
        currentConnectedChannelId = null;
        lastAttemptedChannelId = null;
        lastConnectedGuildId = null;
        lastKickedChannelId = null;
        isJoining = false;
        isSwitchingChannels = false;
        isUserManualDisconnect = false;
        lastUserManualDisconnectTime = 0;
    },

    flux: {
        VOICE_CHANNEL_SELECT(action: { channelId?: string | null; guildId?: string | null; }) {
            if (action?.channelId) {
                currentConnectedChannelId = action.channelId;
                lastAttemptedChannelId = action.channelId;
                const channel = ChannelStore.getChannel(action.channelId);
                const gId = getChannelGuildId(channel) ?? action.guildId ?? null;
                if (gId) lastConnectedGuildId = gId;
            } else {
                if (Date.now() - lastUserManualDisconnectTime < 2000) {
                    triggerManualReset();
                } else if (currentConnectedChannelId || lastAttemptedChannelId) {
                    handleVoiceDisconnect(currentConnectedChannelId ?? lastAttemptedChannelId, lastConnectedGuildId);
                }
            }
        },

        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const currentUserId = getCurrentUserId();
            if (!currentUserId || !voiceStates?.length) return;

            const myVoiceState = voiceStates.find(state => {
                const uId = state.userId ?? (state as any).user_id;
                return uId === currentUserId;
            });

            if (myVoiceState) {
                const newChannelId = myVoiceState.channelId ?? (myVoiceState as any).channel_id ?? null;
                const previousChannelId = currentConnectedChannelId ?? lastAttemptedChannelId ?? myVoiceState.oldChannelId ?? null;
                const guildId = (myVoiceState as any).guildId
                    ?? (myVoiceState as any).guild_id
                    ?? (previousChannelId ? getChannelGuildId(ChannelStore.getChannel(previousChannelId)) : null)
                    ?? getActiveGuildId();

                if (newChannelId) {
                    currentConnectedChannelId = newChannelId;
                    lastAttemptedChannelId = newChannelId;
                    const channel = ChannelStore.getChannel(newChannelId);
                    const currentGuild = getChannelGuildId(channel) ?? guildId;

                    if (currentGuild) {
                        if (lastConnectedGuildId && currentGuild !== lastConnectedGuildId) {
                            visitedChannelIds.clear();
                        }
                        lastConnectedGuildId = currentGuild;
                    }
                    isUserManualDisconnect = false;
                    lastKickedChannelId = null;
                    clearTimeout(autoRejoinTimeout);
                } else {
                    handleVoiceDisconnect(previousChannelId, guildId);
                }
            }

            // Gestion de l'option "leaveEmpty"
            if (getStore().leaveEmpty && !isJoining && !isSwitchingChannels) {
                const myChannelId = getCurrentVoiceChannelId(currentUserId);
                if (!myChannelId) return;

                const touchedCurrentChannel = voiceStates.some(state => {
                    const uId = state.userId ?? (state as any).user_id;
                    const cId = state.channelId ?? (state as any).channel_id;
                    const oId = state.oldChannelId ?? (state as any).old_channel_id;
                    return uId === currentUserId || cId === myChannelId || oId === myChannelId;
                });
                if (!touchedCurrentChannel) return;

                const myOwnJoin = voiceStates.some(state => {
                    const uId = state.userId ?? (state as any).user_id;
                    const cId = state.channelId ?? (state as any).channel_id;
                    const oId = state.oldChannelId ?? (state as any).old_channel_id;
                    return uId === currentUserId && cId === myChannelId && oId !== myChannelId;
                });
                if (myOwnJoin) return;

                const channelStates = VoiceStateStore.getVoiceStatesForChannel(myChannelId) as Record<string, VoiceState> | null;
                const otherUsers = Object.values(channelStates ?? {}).filter(state => {
                    const uId = state.userId ?? (state as any).user_id;
                    return uId !== currentUserId;
                });
                if (!otherUsers.length) {
                    void joinRandomVoice();
                }
            }
        },
    },
});

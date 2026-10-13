/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin, { PluginNative } from "@utils/types";
import { FluxDispatcher, MediaEngineStore, Menu, React, RunningGameStore } from "@webpack/common";

import { t } from "../autoTranslateLoliCord";

const Native = (VencordNative?.pluginHelpers as any)?.EnhancedScreenshare as
    | PluginNative<typeof import("./native")>
    | undefined;

export interface StreamAudioState {
    selectedAppPids: number[];
}

export const streamAudioState: StreamAudioState = {
    selectedAppPids: []
};

export interface AudioAppItem {
    name: string;
    pid: number;
    allPids: number[];
    isActiveSound: boolean;
}

let _cachedAudioApps: AudioAppItem[] = [];
let _isFetchingAudioApps = false;
let _pollInterval: ReturnType<typeof setInterval> | undefined;

function StreamAudioIcon(props: any) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...props}>
            <path
                d="M4 4H20C21.1 4 22 4.9 22 6V16C22 17.1 21.1 18 20 18H14L15 20H17V22H7V20H9L10 18H4C2.9 18 2 17.1 2 16V6C2 4.9 2.9 4 4 4ZM4 6V16H20V6H4Z"
                fill="currentColor"
            />
        </svg>
    );
}

function RefreshIcon(props: any) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...props}>
            <path
                d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
                fill="currentColor"
            />
        </svg>
    );
}

export function formatCleanAppName(rawName: string, title?: string): string {
    const candidate = title && title.trim() ? title.trim() : rawName;
    if (!candidate) return "Application";

    // Detect common browsers and applications
    const lower = candidate.toLowerCase();
    if (lower.includes("youtube")) return "YouTube";
    if (lower.includes("spotify")) return "Spotify";
    if (lower.includes("chrome") || lower.includes("google chrome")) return "Google Chrome";
    if (lower.includes("brave")) return "Brave Browser";
    if (lower.includes("msedge") || lower.includes("edge")) return "Microsoft Edge";
    if (lower.includes("firefox")) return "Mozilla Firefox";
    if (lower.includes("vlc")) return "VLC Media Player";
    if (lower.includes("roblox")) return "Roblox";
    if (lower.includes("steam")) return "Steam";

    let clean = candidate.split(/[\\/]/).pop() ?? candidate;

    // Clean browser window subtitles
    if (clean.includes(" - Google Chrome")) clean = clean.replace(" - Google Chrome", "");
    if (clean.includes(" - Brave")) clean = clean.replace(" - Brave", "");
    if (clean.includes(" - Microsoft Edge")) clean = clean.replace(" - Microsoft Edge", "");
    if (clean.includes(" - Mozilla Firefox")) clean = clean.replace(" - Mozilla Firefox", "");

    if (clean.includes(" — ")) {
        clean = clean.split(" — ")[0];
    } else if (clean.includes(" - ")) {
        clean = clean.split(" - ")[0];
    }

    if (clean.toLowerCase().endsWith(".exe")) {
        clean = clean.slice(0, -4);
    }

    clean = clean.trim();
    if (clean.length > 30) {
        clean = clean.slice(0, 27) + "...";
    }

    return clean || "Application";
}

export async function fetchAudioApps(): Promise<AudioAppItem[]> {
    if (_isFetchingAudioApps) return _cachedAudioApps;
    _isFetchingAudioApps = true;

    try {
        if (Native?.getAudioProcesses) {
            const raw = await Native.getAudioProcesses();
            if (Array.isArray(raw)) {
                const grouped = new Map<string, AudioAppItem>();

                for (const p of raw) {
                    if (!p || !p.pid) continue;
                    const cleanName = formatCleanAppName(p.name, p.title);
                    const isActive = p.state === 1 || (typeof p.peak === "number" && p.peak > 0.001);

                    const existing = grouped.get(cleanName);
                    if (existing) {
                        // Merge PIDs
                        const set = new Set([...existing.allPids, ...(p.allPids || [p.pid])]);
                        existing.allPids = Array.from(set);
                        if (isActive) existing.isActiveSound = true;
                    } else {
                        grouped.set(cleanName, {
                            name: cleanName,
                            pid: p.pid,
                            allPids: p.allPids && p.allPids.length ? p.allPids : [p.pid],
                            isActiveSound: isActive
                        });
                    }
                }

                // Sort: applications with active sound first, then alphabetically
                const list = Array.from(grouped.values()).sort((a, b) => {
                    if (a.isActiveSound && !b.isActiveSound) return -1;
                    if (!a.isActiveSound && b.isActiveSound) return 1;
                    return a.name.localeCompare(b.name);
                });

                _cachedAudioApps = list;
                return list;
            }
        }

        // Non-Windows or Native fallback: filter RunningGameStore strictly
        const runningGames = (RunningGameStore as any)?.getRunningGames?.() ?? [];
        const visibleGames = (RunningGameStore as any)?.getVisibleRunningGames?.() ?? [];
        const fallbackMap = new Map<number, AudioAppItem>();

        const IGNORED_NAMES = new Set(["notepad", "bloc-notes", "cmd", "powershell", "calc", "regedit"]);

        for (const g of [...runningGames, ...visibleGames]) {
            if (g && typeof g.pid === "number" && g.pid > 0 && g.name) {
                const lower = g.name.toLowerCase();
                if (IGNORED_NAMES.has(lower)) continue;
                const clean = formatCleanAppName(g.name);
                fallbackMap.set(g.pid, {
                    name: clean,
                    pid: g.pid,
                    allPids: [g.pid],
                    isActiveSound: false
                });
            }
        }

        _cachedAudioApps = Array.from(fallbackMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        return _cachedAudioApps;
    } catch (err) {
        console.error("[EnhancedScreenshare] Failed to fetch audio apps:", err);
        return _cachedAudioApps;
    } finally {
        _isFetchingAudioApps = false;
    }
}

export function applyStreamAudio(pids?: number[]) {
    try {
        const engine = (MediaEngineStore as any)?.getMediaEngine?.();
        if (!engine) return;

        const effectivePids = pids !== undefined ? pids : streamAudioState.selectedAppPids;

        if (effectivePids.length > 0) {
            if (typeof engine.setSoundshareSources === "function") {
                engine.setSoundshareSources(effectivePids, true);
            } else if (typeof engine.setSoundshareSource === "function") {
                for (const pid of effectivePids) {
                    engine.setSoundshareSource(pid, true);
                }
            }

            if (engine.connections) {
                for (const conn of engine.connections) {
                    if (typeof conn.setSoundshareSource === "function") {
                        for (const pid of effectivePids) {
                            try {
                                conn.setSoundshareSource(pid, true);
                            } catch { }
                        }
                    }
                }
            }
        } else {
            if (typeof engine.setSoundshareSources === "function") {
                try {
                    engine.setSoundshareSources([], false);
                } catch { }
            }
            if (typeof engine.setSoundshareSource === "function") {
                try {
                    engine.setSoundshareSource(0, false);
                } catch { }
                try {
                    engine.setSoundshareSource(null, false);
                } catch { }
            }
            if (engine.connections) {
                for (const conn of engine.connections) {
                    if (typeof conn.setSoundshareSource === "function") {
                        try {
                            conn.setSoundshareSource(0, false);
                        } catch { }
                    }
                }
            }
        }
    } catch (err) {
        console.error("[EnhancedScreenshare] Failed to apply stream audio:", err);
    }
}

export const streamAudioContextMenuPatch: NavContextMenuPatchCallback = (children) => {
    // Trigger fresh async fetch on menu open so next ticks or subsequent opens have latest apps
    fetchAudioApps().catch(() => { });

    const appsList = _cachedAudioApps;
    const isEntireSystem = streamAudioState.selectedAppPids.length === 0;

    const toggleApp = (app: AudioAppItem) => {
        const isSelected = app.allPids.some(p => streamAudioState.selectedAppPids.includes(p));
        if (isSelected) {
            streamAudioState.selectedAppPids = streamAudioState.selectedAppPids.filter(
                p => !app.allPids.includes(p)
            );
        } else {
            const set = new Set([...streamAudioState.selectedAppPids, ...app.allPids]);
            streamAudioState.selectedAppPids = Array.from(set);
        }
        applyStreamAudio(streamAudioState.selectedAppPids);
    };

    const appMenuItems = (
        <Menu.MenuItem
            id="enhanced-screenshare-app-selector"
            label={t("Stream Audio Application")}
            icon={StreamAudioIcon}
        >
            <Menu.MenuCheckboxItem
                id="enhanced-screenshare-app-system"
                label={t("Entire System (Default - All Sounds)")}
                checked={isEntireSystem}
                action={() => {
                    streamAudioState.selectedAppPids = [];
                    applyStreamAudio([]);
                }}
            />
            <Menu.MenuSeparator />
            <Menu.MenuItem
                id="enhanced-screenshare-refresh-apps"
                label={t("Refresh Applications")}
                icon={RefreshIcon}
                action={() => {
                    fetchAudioApps().catch(() => { });
                }}
            />
            <Menu.MenuSeparator />
            {appsList.length > 0 ? (
                appsList.map(app => {
                    const isChecked = app.allPids.some(p => streamAudioState.selectedAppPids.includes(p));
                    const displayLabel = app.isActiveSound
                        ? `${app.name} (${t("Sound active")})`
                        : app.name;

                    return (
                        <Menu.MenuCheckboxItem
                            key={`app-${app.name}-${app.pid}`}
                            id={`enhanced-screenshare-app-chk-${app.pid}`}
                            label={displayLabel}
                            checked={isChecked}
                            action={() => toggleApp(app)}
                        />
                    );
                })
            ) : (
                <Menu.MenuItem
                    id="enhanced-screenshare-app-empty"
                    label={t("No audio-producing applications detected")}
                    disabled={true}
                />
            )}
        </Menu.MenuItem>
    );

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuGroup label={t("Enhanced Screenshare")}>
            {appMenuItems}
        </Menu.MenuGroup>
    );
};

let _streamStartTimer: ReturnType<typeof setTimeout> | undefined;

function onStreamStart() {
    if (_streamStartTimer !== undefined) clearTimeout(_streamStartTimer);
    _streamStartTimer = setTimeout(() => {
        _streamStartTimer = undefined;
        if (streamAudioState.selectedAppPids.length > 0) {
            applyStreamAudio();
        }
    }, 600);
}

export default definePlugin({
    name: "EnhancedScreenshare",
    description: "Allows choosing which application audio to share on screenshare (specific app or entire system).",
    authors: [{ name: "Nightcord", id: 0n }],
    tags: ["Voice", "Media", "Utility"],
    enabledByDefault: false,

    contextMenus: {
        "stream-options": streamAudioContextMenuPatch,
        "stream-context": streamAudioContextMenuPatch,
        "manage-streams": streamAudioContextMenuPatch,
        "stream-settings": streamAudioContextMenuPatch
    },

    start() {
        // Initial fetch of audio applications
        fetchAudioApps().catch(() => { });

        // Background polling every 2.5s to keep the audio process list always fresh
        if (!_pollInterval) {
            _pollInterval = setInterval(() => {
                fetchAudioApps().catch(() => { });
            }, 2500);
        }

        FluxDispatcher.subscribe("MEDIA_ENGINE_SET_GO_LIVE_SOURCE", onStreamStart);
        FluxDispatcher.subscribe("STREAM_START", onStreamStart);
    },

    stop() {
        if (_pollInterval !== undefined) {
            clearInterval(_pollInterval);
            _pollInterval = undefined;
        }

        if (_streamStartTimer !== undefined) {
            clearTimeout(_streamStartTimer);
            _streamStartTimer = undefined;
        }

        FluxDispatcher.unsubscribe("MEDIA_ENGINE_SET_GO_LIVE_SOURCE", onStreamStart);
        FluxDispatcher.unsubscribe("STREAM_START", onStreamStart);

        streamAudioState.selectedAppPids = [];
        applyStreamAudio([]);
        _cachedAudioApps = [];
    }
});

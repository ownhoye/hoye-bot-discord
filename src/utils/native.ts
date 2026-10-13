/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { flushSettings } from "@api/Settings";

export function quickReload() {
    try {
        flushSettings();
    } catch {}
    location.reload();
}

/**
 * Fast 1-second in-memory Webpack/renderer reload.
 * Applies all plugin toggles, Webpack patches, themes and settings instantly without closing Discord.
 */
export function relaunch() {
    quickReload();
}

/**
 * Full OS-level application restart (only used when native binaries strictly require it).
 */
export function relaunchApp() {
    try {
        flushSettings();
    } catch {}
    if (IS_DISCORD_DESKTOP)
        window.DiscordNative?.app?.relaunch?.();
    else if (IS_VESKTOP || IS_EQUIBOP)
        window.VesktopNative?.app?.relaunch?.();
    else
        location.reload();
}

export function showItemInFolder(path: string) {
    if (IS_DISCORD_DESKTOP)
        window.DiscordNative?.fileManager?.showItemInFolder(path);
    else
        window.VesktopNative?.fileManager?.showItemInFolder(path);
}


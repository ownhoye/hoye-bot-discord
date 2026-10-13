/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Plugin likes were served by the Nightcord API, which LoliCord no longer uses.
// The types remain so the plugin list can keep its (now empty) likes filter and sort.

export interface PluginLikeData {
    likes: number;
    likedByMe: boolean;
}

export interface PluginRatings {
    [pluginName: string]: PluginLikeData;
}

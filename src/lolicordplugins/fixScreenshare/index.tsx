/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher } from "@webpack/common";

const MediaEngineStore = findByPropsLazy("getMediaEngine");

function fixEngine() {
    try {
        const engine = MediaEngineStore.getMediaEngine();
        if (engine) {
            if (typeof engine.reconfigure === "function") {
                engine.reconfigure();
            }
        }
    } catch { }
}

const handleVoiceChannelSelect = () => {
    // Small delay to let Discord settle after joining voice
    setTimeout(fixEngine, 1000);
};

export default definePlugin({
    name: "FixScreenshare",
    description: "Fixes infinite loading and crashes on screenshare after reload (Ctrl+R) by forcing module re-initialization.",
    authors: [{ name: "Nightcord",
     id: 0n }],
    required: true,

    start() {
        // Listen for voice channel joins to re-apply fix when entering voice
        FluxDispatcher.subscribe("VOICE_CHANNEL_SELECT", handleVoiceChannelSelect);
    },

    stop() {
        FluxDispatcher.unsubscribe("VOICE_CHANNEL_SELECT", handleVoiceChannelSelect);
    }
});

/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Settings } from "@api/Settings";

const ALWAYS_HIDE_STYLE_ID = "lolicord-always-hide-native-buttons";
const INBOX_HIDE_STYLE_ID = "lolicord-hide-inbox-button";

const ALWAYS_HIDE_CSS = `
/* ── LoliCord : suppression permanente des boutons natifs superflus ── */
[aria-label="Open Logs"],
[aria-label="Help"],
[aria-label="Aide"],
[aria-label="DevTools"],
[aria-label="Last Meadow Online"],
[aria-label*="DevTools" i],
[aria-label*="Open Logs" i],
button[aria-label="Help"],
button[aria-label="Aide"],
button[aria-label="Open Logs"],
button[aria-label="DevTools"],
div[role="button"][aria-label="Help"],
div[role="button"][aria-label="Aide"],
div[role="button"][aria-label="Open Logs"],
div[role="button"][aria-label="DevTools"] {
    display: none !important;
    width: 0 !important;
    min-width: 0 !important;
    max-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    flex: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
}
`;

const INBOX_HIDE_CSS = `
/* ── LoliCord : masquage optionnel du bouton Boîte de réception / Inbox ── */
[aria-label="Inbox"],
[aria-label="Boîte de réception"],
[aria-label="Bandeja de entrada"],
[aria-label="Posteingang"],
[aria-label="Входящие"],
[aria-label="收件箱"],
[aria-label="صندوق الوارد"],
[aria-label*="Inbox" i],
[aria-label*="réception" i],
[aria-label*="Recent Mentions" i],
[aria-label*="Mentions récentes" i],
[aria-controls="recents-tab-panel"],
button[aria-label*="Inbox" i],
button[aria-label*="réception" i],
button[aria-controls="recents-tab-panel"],
div[role="button"][aria-label*="Inbox" i],
div[role="button"][aria-label*="réception" i],
div[role="button"][aria-controls="recents-tab-panel"] {
    display: none !important;
    width: 0 !important;
    min-width: 0 !important;
    max-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    flex: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
}
`;

function ensureAlwaysHidden() {
    if (typeof document === "undefined") return;
    if (!document.getElementById(ALWAYS_HIDE_STYLE_ID)) {
        const style = document.createElement("style");
        style.id = ALWAYS_HIDE_STYLE_ID;
        style.textContent = ALWAYS_HIDE_CSS;
        (document.head || document.documentElement).appendChild(style);
    }
}

export function updateNativeButtonsVisibility(hide?: boolean) {
    ensureAlwaysHidden();
    const shouldHide = hide ?? (Settings.hideNativeHeaderButtons ?? true);
    const existing = document.getElementById(INBOX_HIDE_STYLE_ID);
    if (shouldHide) {
        if (!existing) {
            const style = document.createElement("style");
            style.id = INBOX_HIDE_STYLE_ID;
            style.textContent = INBOX_HIDE_CSS;
            (document.head || document.documentElement).appendChild(style);
        }
    } else {
        existing?.remove();
    }
}

// Immediate eager execution on module load
try {
    updateNativeButtonsVisibility();
} catch {}

export default definePlugin({
    name: "HideNativeButtons",
    description: "Hides unwanted native Discord buttons (Inbox, Help, Logs)",
    authors: [Devs.Ven],
    required: true,
    patches: [],

    start() {
        ensureAlwaysHidden();
        updateNativeButtonsVisibility();
    },

    stop() {
        document.getElementById(ALWAYS_HIDE_STYLE_ID)?.remove();
        document.getElementById(INBOX_HIDE_STYLE_ID)?.remove();
    },
});

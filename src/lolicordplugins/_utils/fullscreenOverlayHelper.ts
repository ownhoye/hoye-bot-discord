/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const STYLE_ID = "nc-fullscreen-overlay-style";

const CSS_RULES = `
/* ── LoliCord Fullscreen Plugins Overlay Styles ──
   Hides Discord's bottom-left user profile panel and sidebar panels
   strictly when a fullscreen plugin overlay (YouTube, Private Browser, QxChat) is active.
   Restores instantly and completely when the plugin view is closed. */

body.ytd-is-open section[class*="panels_"],
body.ytd-is-open div[class*="panels_"],
body.ytd-is-open div[class*="container__37e49"],
body.ytd-is-open div[class*="accountPopoutButtonWrapper_"],
body.ytd-is-open div[class*="sidebar_"] > section,
body.ytd-is-open section[aria-label*="User"],
body.ytd-is-open section[aria-label*="user"],
body.ytd-is-open section[aria-label*="Zone utilisateur"],
body.ytd-is-open section[aria-label*="utilisateur"],
body.browser-is-open section[class*="panels_"],
body.browser-is-open div[class*="panels_"],
body.browser-is-open div[class*="container__37e49"],
body.browser-is-open div[class*="accountPopoutButtonWrapper_"],
body.browser-is-open div[class*="sidebar_"] > section,
body.browser-is-open section[aria-label*="User"],
body.browser-is-open section[aria-label*="user"],
body.browser-is-open section[aria-label*="Zone utilisateur"],
body.browser-is-open section[aria-label*="utilisateur"],
body.qxchat-is-open section[class*="panels_"],
body.qxchat-is-open div[class*="panels_"],
body.qxchat-is-open div[class*="container__37e49"],
body.qxchat-is-open div[class*="accountPopoutButtonWrapper_"],
body.qxchat-is-open div[class*="sidebar_"] > section,
body.qxchat-is-open section[aria-label*="User"],
body.qxchat-is-open section[aria-label*="user"],
body.qxchat-is-open section[aria-label*="Zone utilisateur"],
body.qxchat-is-open section[aria-label*="utilisateur"],
body.nc-overlay-active section[class*="panels_"],
body.nc-overlay-active div[class*="panels_"],
body.nc-overlay-active div[class*="container__37e49"],
body.nc-overlay-active div[class*="accountPopoutButtonWrapper_"],
body.nc-overlay-active div[class*="sidebar_"] > section,
body.nc-overlay-active section[aria-label*="User"],
body.nc-overlay-active section[aria-label*="user"],
body.nc-overlay-active section[aria-label*="Zone utilisateur"],
body.nc-overlay-active section[aria-label*="utilisateur"] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
}
`;

function ensureOverlayStyle(): void {
    if (typeof document === "undefined") return;
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = CSS_RULES;
        document.head.appendChild(style);
    }
}

const activeOverlays = new Set<string>();

/**
 * Marks a fullscreen plugin overlay as active or inactive.
 * Automatically adds/removes CSS classes on document.body to hide/restore the bottom-left profile panel.
 */
export function setOverlayActive(pluginKey: string, active: boolean): void {
    if (typeof document === "undefined") return;
    ensureOverlayStyle();

    const specificClass = `${pluginKey}-is-open`;

    if (active) {
        activeOverlays.add(pluginKey);
        document.body.classList.add("nc-overlay-active", specificClass);
    } else {
        activeOverlays.delete(pluginKey);
        document.body.classList.remove(specificClass);
        if (activeOverlays.size === 0) {
            document.body.classList.remove("nc-overlay-active");
        }
    }
}

/**
 * Removes all active overlay classes from document.body (used on plugin teardown).
 */
export function clearAllOverlays(): void {
    if (typeof document === "undefined") return;
    for (const key of activeOverlays) {
        document.body.classList.remove(`${key}-is-open`);
    }
    activeOverlays.clear();
    document.body.classList.remove("nc-overlay-active");
}

/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Settings, SettingsStore } from "@api/Settings";
import { createAndAppendStyle } from "@utils/css";
import { ThemeStore } from "@vencord/discord-types";
import { PopoutWindowStore } from "@webpack/common";

import { userStyleRootNode, vencordRootNode } from "./Styles";

let style: HTMLStyleElement;
let themesStyle: HTMLStyleElement;

// Track active online theme <link> elements for non-blocking loading
const onlineThemeLinks = new Map<string, HTMLLinkElement>();

async function toggle(isEnabled: boolean) {
    if (!style) {
        if (isEnabled) {
            style = createAndAppendStyle("vencord-custom-css", userStyleRootNode);
            VencordNative.quickCss.addChangeListener(css => {
                style.textContent = css;
                // At the time of writing this, changing textContent resets the disabled state
                style.disabled = !Settings.useQuickCss;
                updatePopoutWindows();
            });
            style.textContent = await VencordNative.quickCss.get();
        }
    } else
        style.disabled = !isEnabled;
}

/**
 * Collect all active online theme URLs from both sources:
 * - Settings.enabledThemeLinks  (ThemeLibrary plugin)
 * - Settings.themeLinks         (Online Themes tab — manual URLs)
 *
 * Both are merged, deduplicated, and filtered by light/dark preference.
 */
function collectOnlineLinks(activeTheme: "light" | "dark" | undefined): string[] {
    const { enabledThemeLinks, themeLinks } = Settings;

    // Merge both arrays and deduplicate
    const allRawLinks = [...new Set([...enabledThemeLinks, ...themeLinks])];

    return allRawLinks
        .map(rawLink => {
            const match = /^@(light|dark) (.*)/.exec(rawLink);
            if (!match) return rawLink;
            const [, mode, link] = match;
            return mode === activeTheme ? link : null;
        })
        .filter((link): link is string => link !== null && link.trim().length > 0);
}

/**
 * Apply online themes using non-blocking <link rel="stylesheet"> elements
 * instead of synchronous @import, which causes Discord to freeze while
 * waiting for remote CSS to download.
 *
 * Each URL gets its own <link> element created/removed as needed, so
 * toggling a single theme only touches that one element — no full reload.
 */
function applyOnlineThemesNonBlocking(links: string[]) {
    const newSet = new Set(links);

    // Remove links no longer active
    for (const [url, el] of onlineThemeLinks.entries()) {
        if (!newSet.has(url)) {
            el.remove();
            onlineThemeLinks.delete(url);
        }
    }

    // Add new links
    for (const url of links) {
        if (onlineThemeLinks.has(url)) continue;
        const el = document.createElement("link");
        el.rel = "stylesheet";
        el.type = "text/css";
        el.href = url.trim();
        // Append to userStyleRootNode so it lives in our isolated style tree
        userStyleRootNode.appendChild(el);
        onlineThemeLinks.set(url, el);
    }
}

async function initThemes() {
    themesStyle ??= createAndAppendStyle("vencord-themes", userStyleRootNode);

    const { enabledThemes } = Settings;

    const { ThemeStore } = require("@webpack/common/stores") as typeof import("@webpack/common/stores");

    // "darker" and "midnight" both count as dark
    // This function is first called on DOMContentLoaded, so ThemeStore may not have been loaded yet
    const activeTheme = ThemeStore == null
        ? undefined
        : ThemeStore.theme === "light" ? "light" : "dark";

    // --- Online themes: non-blocking <link> approach (no freeze on slow CDN) ---
    const onlineLinks = collectOnlineLinks(activeTheme);
    applyOnlineThemesNonBlocking(onlineLinks);

    // --- Local / desktop themes: @import is fine (vencord:// = local file, instant) ---
    const localImports: string[] = [];

    if (IS_WEB) {
        for (const theme of enabledThemes) {
            const themeData = await VencordNative.themes.getThemeData(theme);
            if (!themeData) continue;
            const blob = new Blob([themeData], { type: "text/css" });
            localImports.push(URL.createObjectURL(blob));
        }
    } else {
        const localThemes = enabledThemes.map(theme => `vencord:///themes/${theme}?v=${Date.now()}`);
        localImports.push(...localThemes);
    }

    themesStyle.textContent = localImports.map(link => `@import url("${link.trim()}");`).join("\n");
    updatePopoutWindows();
    themeChangeListeners.forEach(listener => listener());
}

const themeChangeListeners = new Set<() => void>();

export function addThemeChangeListener(listener: () => void) {
    themeChangeListeners.add(listener);
}

export function removeThemeChangeListener(listener: () => void) {
    themeChangeListeners.delete(listener);
}

function applyToPopout(popoutWindow: Window | undefined, key: string) {
    if (!popoutWindow?.document) return;
    // skip game overlay cuz it needs to stay transparent, themes broke it
    if (key === "DISCORD_OutOfProcessOverlay") return;

    const doc = popoutWindow.document;

    doc.querySelector("vencord-root")?.remove();

    doc.documentElement.appendChild(vencordRootNode.cloneNode(true));
}

function updatePopoutWindows() {
    if (!PopoutWindowStore) return;

    for (const key of PopoutWindowStore.getWindowKeys()) {
        applyToPopout(PopoutWindowStore.getWindow(key), key);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (IS_USERSCRIPT) return;

    initThemes();

    toggle(Settings.useQuickCss);
    SettingsStore.addChangeListener("useQuickCss", toggle);

    // Listen to ALL theme-related settings so any change triggers a reload
    SettingsStore.addChangeListener("enabledThemeLinks", initThemes);
    SettingsStore.addChangeListener("themeLinks", initThemes);
    SettingsStore.addChangeListener("enabledThemes", initThemes);

    window.addEventListener("message", event => {
        const { discordPopoutEvent } = event.data || {};
        if (discordPopoutEvent?.type !== "loaded") return;

        applyToPopout(PopoutWindowStore.getWindow(discordPopoutEvent.key), discordPopoutEvent.key);
    });

    if (!IS_WEB) {
        VencordNative.quickCss.addThemeChangeListener(initThemes);
    }
}, { once: true });

export function initQuickCssThemeStore(themeStore: ThemeStore) {
    if (IS_USERSCRIPT) return;

    initThemes();

    let currentTheme = themeStore.theme;
    themeStore.addChangeListener(() => {
        if (currentTheme === themeStore.theme) return;

        currentTheme = themeStore.theme;
        initThemes();
    });
}

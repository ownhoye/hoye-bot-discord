/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, UserStore } from "@webpack/common";
import { getPremiumSettings, readUserPremiumData } from "../sync";
import type { PremiumStory } from "../types";
import { StoryViewer } from "./StoryViewer";

let observer: MutationObserver | null = null;
let currentViewerEl: HTMLElement | null = null;
let active = false;

async function injectRingIntoAvatar(avatarEl: HTMLElement, userId: string) {
    if (avatarEl.parentElement?.classList.contains("ncp-story-ring-wrapper")) return;

    const data = await readUserPremiumData(userId);
    if (!data || data.storiesEnabled === false || !Array.isArray(data.stories) || data.stories.length === 0) {
        return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "ncp-story-ring-wrapper ncp-story-ring-container";
    wrapper.style.cssText = "display:inline-flex;position:relative;cursor:pointer;";

    const ring = document.createElement("div");
    ring.className = "ncp-story-ring";

    avatarEl.parentElement?.insertBefore(wrapper, avatarEl);
    wrapper.appendChild(ring);
    wrapper.appendChild(avatarEl);

    wrapper.addEventListener("click", e => {
        e.stopPropagation();
        e.preventDefault();
        openViewer(data.stories, userId);
    });
}

function openViewer(stories: PremiumStory[], userId: string) {
    if (currentViewerEl) currentViewerEl.remove();

    const container = document.createElement("div");
    container.id = "ncp-story-viewer-root";
    document.body.appendChild(container);
    currentViewerEl = container;

    const ReactDOM = (window as any).Vencord?.Webpack?.Common?.ReactDOM || (window as any).ReactDOM;
    if (!ReactDOM?.createRoot) return;

    const root = ReactDOM.createRoot(container);
    root.render(
        React.createElement(StoryViewer, {
            stories,
            user: { id: userId, username: UserStore.getUser(userId)?.username },
            onClose: () => {
                try { root.unmount(); } catch {}
                container.remove();
                currentViewerEl = null;
            }
        })
    );
}

let scanTimer: ReturnType<typeof setTimeout> | null = null;

function scanAvatars() {
    if (!active) return;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(async () => {
        const settings = await getPremiumSettings();
        if (!settings.enabled) return;

        const currentUserId = UserStore.getCurrentUser()?.id;

        const profileModals = document.querySelectorAll(
            '[class*="userProfile"] [class*="avatar"], [class*="UserProfile"] [class*="avatar"], [class*="userPopout"] [class*="avatar"]'
        );

        for (const el of Array.from(profileModals)) {
            const avatarEl = el as HTMLElement;
            const imgEl = avatarEl.querySelector("img, svg") as HTMLImageElement | null;
            if (!imgEl) continue;

            const src = imgEl.getAttribute("src") || "";
            const match = src.match(/\/avatars\/(\d+)\//);
            if (!match) continue;

            const userId = match[1];
            if (currentUserId && userId === currentUserId && !settings.storiesEnabled) {
                continue;
            }
            await injectRingIntoAvatar(avatarEl, userId);
        }
    }, 120);
}

export function startStories() {
    if (active) return;
    active = true;

    observer = new MutationObserver(() => {
        scanAvatars();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    scanAvatars();
}

export function stopStories() {
    active = false;
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
    }
    if (currentViewerEl) {
        currentViewerEl.remove();
        currentViewerEl = null;
    }
    document.querySelectorAll(".ncp-story-ring-wrapper").forEach(el => {
        const avatar = el.querySelector("[class*='avatar']");
        if (avatar && el.parentElement) {
            el.parentElement.insertBefore(avatar, el);
        }
        el.remove();
    });
}

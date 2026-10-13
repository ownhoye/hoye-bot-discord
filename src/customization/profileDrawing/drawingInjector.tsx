/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createRoot, React } from "@webpack/common";
import type { Root } from "react-dom/client";
import { ProfileDrawingSection } from "./ProfileDrawingSection";

let observer: MutationObserver | null = null;
let activeRoot: Root | null = null;
let mountedMountElement: HTMLElement | null = null;

function checkForProfileCustomizer() {
    // Check if the profile customization scroller/content exists
    const contents = document.querySelectorAll<HTMLElement>(
        "[class*='content__523e1'], [class*='scroller__523e1'] > [class*='content_'], [class*='scroller_'] > [class*='content_']"
    );

    for (const content of Array.from(contents)) {
        // Confirm this is the user profile edit settings list
        const groups = content.querySelectorAll<HTMLElement>("[class*='group__96e81'], [class*='group_']");
        if (groups.length === 0) continue;

        const hasProfileKeywords = Array.from(groups).some(g => {
            const txt = g.textContent?.toLowerCase() || "";
            return (
                txt.includes("avatar") ||
                txt.includes("banner") ||
                txt.includes("bannière") ||
                txt.includes("display name") ||
                txt.includes("profile effect") ||
                txt.includes("effet de profil")
            );
        });

        if (!hasProfileKeywords) continue;

        // Check if our mount is already present in this content
        let mountEl = content.querySelector<HTMLElement>("#nc-profile-drawing-mount");
        if (mountEl) {
            // Already mounted
            return;
        }

        // Find insertion anchor: preferably right after "Profile Effect & Frame" group
        let anchorGroup: HTMLElement | null = null;
        for (const g of Array.from(groups)) {
            const h3 = g.querySelector("h3");
            const text = (h3?.textContent || g.textContent || "").toLowerCase();
            if (
                text.includes("profile effect") ||
                text.includes("effet de profil") ||
                text.includes("frame") ||
                text.includes("cadre")
            ) {
                anchorGroup = g;
                break;
            }
        }

        if (!anchorGroup) {
            anchorGroup = groups[groups.length - 1];
        }

        mountEl = document.createElement("div");
        mountEl.id = "nc-profile-drawing-mount";
        mountEl.className = "nc-profile-drawing-mount";

        if (anchorGroup.nextSibling) {
            content.insertBefore(mountEl, anchorGroup.nextSibling);
        } else {
            content.appendChild(mountEl);
        }

        mountedMountElement = mountEl;
        activeRoot = createRoot(mountEl);
        activeRoot.render(<ProfileDrawingSection />);
        return;
    }

    // If content was unmounted, clean up root
    if (mountedMountElement && !document.contains(mountedMountElement)) {
        cleanupRoot();
    }
}

function cleanupRoot() {
    if (activeRoot) {
        try {
            activeRoot.unmount();
        } catch {}
        activeRoot = null;
    }
    mountedMountElement = null;
}

export function startDrawingInjector() {
    if (observer) return;

    checkForProfileCustomizer();

    observer = new MutationObserver(() => {
        checkForProfileCustomizer();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

export function stopDrawingInjector() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    cleanupRoot();
}

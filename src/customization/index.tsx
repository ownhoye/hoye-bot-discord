/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { t } from "@api/i18n";
import ErrorBoundary from "@components/ErrorBoundary";
import { React, UserStore } from "@webpack/common";

import { CustomizationTab } from "./CustomizationTab";
import { FavSongsProfileTab } from "./favSongs/FavSongsProfileTab";
import { startProfileEffects, stopProfileEffects } from "./profileEffects/effectsManager";
import { startStories, stopStories } from "./stories/storiesManager";
import { StoryGallery } from "./stories/StoryGallery";
import {
    getCachedPremiumSettings,
    getLocalEffectsConfig,
    getPremiumSettings,
    profileCache,
    readUserPremiumData,
    subscribePremiumSettings
} from "./sync";

export { CustomizationTab };

export const CustomizationIcon = ({ width = 24, height = 24, className, ...props }: any) => (
    <svg
        className={`vc-ic-save-icon ${className ?? ""}`}
        aria-hidden="true"
        role="img"
        xmlns="http://www.w3.org/2000/svg"
        width={width}
        height={height}
        fill="none"
        viewBox="0 0 24 24"
        {...props}
    >
        <path
            fill="currentColor"
            d="m9.17 12.67 2.16 2.16a1 1 0 0 0 .99.25l2.57-.75A3 3 0 0 0 16.6 13l4.91-8.05a1.8 1.8 0 0 0-2.47-2.47L11 7.39a3 3 0 0 0-1.32 1.72l-.75 2.57a1 1 0 0 0 .25.99ZM8.03 13.14c.27.07.51.23.7.43l1.7 1.7c.2.19.36.43.43.7A4 4 0 0 1 7 21H2a1 1 0 1 1 0-2c.68 0 1.13-.77 1.04-1.44a4 4 0 0 1 5-4.42Z"
        />
    </svg>
);

import { addPatch } from "@api/PluginManager";

export function isCustomizationEnabled(): boolean {
    const st = getCachedPremiumSettings();
    return st.enabled;
}

export function pushPremiumSections(sections: any[], user: any) {
    try {
        if (!user || !Array.isArray(sections)) return;
        const st = getCachedPremiumSettings();

        if (sections.some(s => s?.section === "MY_STORY" || s?.section === "FAV_SONGS")) return;

        const currentUserId = UserStore.getCurrentUser()?.id;
        const isSelf = user.id && String(user.id) === String(currentUserId);

        if (isSelf) {
            if (st.favSongsEnabled) {
                sections.unshift({ text: t("Song"), section: "FAV_SONGS" });
            }
            if (st.storiesEnabled) {
                sections.unshift({ text: t("Story"), section: "MY_STORY" });
            }
        } else {
            // For other users: ONLY show tabs if they actually have content and enabled the option
            const cached = profileCache.get(user.id);
            if (cached !== undefined) {
                if (cached.data) {
                    if (cached.data.favSongsEnabled !== false && Array.isArray(cached.data.favSongs) && cached.data.favSongs.length > 0) {
                        sections.unshift({ text: t("Song"), section: "FAV_SONGS" });
                    }
                    if (cached.data.storiesEnabled !== false && Array.isArray(cached.data.stories) && cached.data.stories.length > 0) {
                        sections.unshift({ text: t("Story"), section: "MY_STORY" });
                    }
                }
            } else {
                // Not cached yet: trigger background fetch and refresh profile when data arrives
                void readUserPremiumData(user.id).then(data => {
                    if (data && (
                        (data.favSongsEnabled !== false && data.favSongs?.length > 0) ||
                        (data.storiesEnabled !== false && data.stories?.length > 0)
                    )) {
                        try {
                            const UPS = (Vencord as any).Webpack?.findByStoreName?.("UserProfileStore") ??
                                        (Vencord as any).Webpack?.findByProps?.("getUserProfile");
                            if (UPS?.emitChange) {
                                UPS.emitChange();
                            }
                        } catch {}
                        try {
                            const { FluxDispatcher } = (Vencord as any).Webpack?.Common ?? {};
                            FluxDispatcher?.dispatch?.({
                                type: "USER_PROFILE_MODAL_OPEN",
                                userId: user.id,
                                section: "ACTIVITY"
                            });
                        } catch {}
                    }
                });
            }
        }
    } catch (e) {
        console.error("[LoliCordCustomization] pushPremiumSections error:", e);
    }
}

export function renderPremiumTab(section: string, props: any) {
    if (section === "MY_STORY") {
        return (
            <ErrorBoundary>
                <StoryGallery user={props.user} />
            </ErrorBoundary>
        );
    }
    if (section === "FAV_SONGS") {
        return (
            <ErrorBoundary>
                <FavSongsProfileTab user={props.user} />
            </ErrorBoundary>
        );
    }
    return null;
}

let patchesRegistered = false;
export function registerCustomizationPatches() {
    if (patchesRegistered) return;
    patchesRegistered = true;

    const globals = {
        pushPremiumSections,
        renderPremiumTab
    };

    (window as any).LoliCordCustomizationGlobals = globals;
    if (typeof Vencord !== "undefined") {
        (Vencord as any).Customization = globals;
    }

    try {
        addPatch(
            {
                find: "#{intl::USER_PROFILE_ACTIVITY}",
                replacement: {
                    match: /(\i)\.id!==\i\?\.id&&\i&&\(.{0,300}\.MUTUAL_GUILDS\}\)\)(?=,(\i))/,
                    replace: "$&,window.LoliCordCustomizationGlobals?.pushPremiumSections?.($2,$1)",
                }
            },
            "LoliCordCustomization",
            "window.LoliCordCustomizationGlobals"
        );

        addPatch(
            {
                find: ".WIDGETS?",
                replacement: {
                    match: /(\i)===\i\.\i\.WISHLIST/,
                    replace: '$1==="MY_STORY"||$1==="FAV_SONGS"?window.LoliCordCustomizationGlobals?.renderPremiumTab?.($1,arguments[0]):$&',
                }
            },
            "LoliCordCustomization",
            "window.LoliCordCustomizationGlobals"
        );
    } catch (err) {
        console.error("[LoliCordCustomization] Failed to register profile tab patches:", err);
    }
}

let initialized = false;
export async function initCustomization() {
    if (initialized) return;
    initialized = true;

    registerCustomizationPatches();

    const [st] = await Promise.all([
        getPremiumSettings(),
        getLocalEffectsConfig()
    ]);

    if (st.enabled) {
        startStories();
        startProfileEffects();
    }

    subscribePremiumSettings(next => {
        if (!next.enabled) {
            stopStories();
            stopProfileEffects();
        } else {
            startStories();
            startProfileEffects();
        }
    });
}

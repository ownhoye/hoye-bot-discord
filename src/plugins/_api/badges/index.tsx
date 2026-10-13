/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./fixDiscordBadgePadding.css";
import {domain} from "../../../../DOMAIN.json"

import { _getBadges, BadgePosition, BadgeUserArgs, ProfileBadge } from "@api/Badges";
import { loadOwnHiddenBadgeSources } from "@api/BadgeVisibility";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import { LOLICORD_IMAGE_ICON } from "@utils/lolicordLogo";
import { isLoliCordOwner } from "@utils/lolicordOwners";
import { Logger } from "@utils/Logger";
import { shouldShowContributorBadge, shouldShowEquicordContributorBadge } from "@utils/misc";
import definePlugin from "@utils/types";
import { ContextMenuApi, FluxDispatcher, Menu, Toasts, UserStore } from "@webpack/common";

import Plugins, { PluginMeta } from "~plugins";

import { t } from "../../../lolicordplugins/autoTranslateLoliCord";

import { EquicordDonorModal, EquicordTranslatorModal, VencordDonorModal, GenericBadgeModal } from "./modals";

const CONTRIBUTOR_BADGE = "https://cdn.discordapp.com/emojis/1092089799109775453.png?size=64";
const EQUICORD_CONTRIBUTOR_BADGE = "https://equicord.org/assets/favicon.png";
const USERPLUGIN_CONTRIBUTOR_BADGE = "https://equicord.org/assets/icons/misc/userplugin.png";

const LoliCordOwnerBadge: ProfileBadge = {
    get description() { return t("LoliCord Owner"); },
    iconSrc: LOLICORD_IMAGE_ICON,
    position: BadgePosition.START,
    shouldShow: ({ userId }) => isLoliCordOwner(userId),
    props: {
        style: {
            borderRadius: "50%",
            maxHeight: "22px",
            maxWidth: "22px"
        }
    },
};

const ContributorBadge: ProfileBadge = {
    description: "Vencord Contributor",
    iconSrc: CONTRIBUTOR_BADGE,
    position: BadgePosition.START,
    shouldShow: ({ userId }) => shouldShowContributorBadge(userId),
    onClick: (_, { userId }) => import("@components/settings/tabs/plugins/ContributorModal").then(m => m.openContributorModal(UserStore.getUser(userId)))
};

const EquicordContributorBadge: ProfileBadge = {
    description: "Equicord Contributor",
    iconSrc: EQUICORD_CONTRIBUTOR_BADGE,
    position: BadgePosition.START,
    shouldShow: ({ userId }) => shouldShowEquicordContributorBadge(userId),
    onClick: (_, { userId }) => import("@components/settings/tabs/plugins/ContributorModal").then(m => m.openContributorModal(UserStore.getUser(userId))),
    props: {
        style: {
            borderRadius: "0%",
            maxHeight: "22px",
            maxWidth: "22px"
        }
    },
};

const UserPluginContributorBadge: ProfileBadge = {
    description: "User Plugin Contributor",
    iconSrc: USERPLUGIN_CONTRIBUTOR_BADGE,
    position: BadgePosition.START,
    shouldShow: ({ userId }) => {
        if (!IS_DEV) return false;
        const allPlugins = Object.values(Plugins);
        return allPlugins.some(p => {
            const pluginMeta = PluginMeta[p.name];
            return pluginMeta?.userPlugin && p.authors.some(a => a.id.toString() === userId);
        });
    },
    onClick: (_, { userId }) => import("@components/settings/tabs/plugins/ContributorModal").then(m => m.openContributorModal(UserStore.getUser(userId))),
    props: {
        style: {
            borderRadius: "0%",
            maxHeight: "22px",
            maxWidth: "22px"
        }
    },
};

let DonorBadges = {} as Record<string, Array<Record<"tooltip" | "badge", string>>>;
let EquicordDonorBadges = {} as Record<string, Array<Record<"tooltip" | "badge", string>>>;
let LoliCordBadges = {} as Record<string, Array<{ icon: string; placeholder: string; uuid: string; }>>;
let IllegalcordBadges = {} as Record<string, Array<Record<"tooltip" | "badge", string>>>;

async function loadBadges(url: string, noCache = false) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
        const init: RequestInit = { signal: controller.signal };
        if (noCache) init.cache = "no-cache";

        const res = await fetch(url, init);
        if (!res.ok) return {};
        return await res.json();
    } catch {
        return {};
    } finally {
        clearTimeout(timeout);
    }
}

async function loadLoliCordBadges(noCache = false): Promise<Record<string, any>> {
    // Use main-process net.fetch to bypass CORS restrictions on the LoliCord API.
    // Only available in desktop (Electron) context.
    if (IS_WEB || typeof VencordNative?.lolicord?.netFetch !== "function") {
        return loadBadges(`https://api.${domain}/badges`, noCache);
    }
    try {
        const res = await VencordNative.lolicord.netFetch(`https://api.${domain}/badges`, { noCache });
        if (!res?.ok || !res.data || typeof res.data !== "object") return {};
        return res.data as Record<string, any>;
    } catch {
        return {};
    }
}

async function loadAllBadges(noCache = false) {
    const [vencord, equicord, lolicord, illegalcord] = await Promise.allSettled([
        loadBadges("https://badges.vencord.dev/badges.json", noCache),
        loadBadges("https://badge.equicord.org/badges.json", noCache),
        loadLoliCordBadges(noCache),
        loadBadges("https://raw.githubusercontent.com/ImHisako/ImHisako/refs/heads/main/Images/badges.json", noCache)
    ]);

    DonorBadges = (vencord.status === "fulfilled" && vencord.value) ? vencord.value : {};
    EquicordDonorBadges = (equicord.status === "fulfilled" && equicord.value) ? equicord.value : {};
    LoliCordBadges = (lolicord.status === "fulfilled" && lolicord.value) ? lolicord.value : {};
    IllegalcordBadges = (illegalcord.status === "fulfilled" && illegalcord.value) ? illegalcord.value : {};
}

let intervalId: any;

export function BadgeContextMenu({ badge }: { badge: ProfileBadge & BadgeUserArgs; }) {
    return (
        <Menu.Menu
            navId="vc-badge-context"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Badge Options"
        >
            {badge.description && (
                <Menu.MenuItem
                    id="vc-badge-copy-name"
                    label="Copy Badge Name"
                    action={() => copyWithToast(badge.description!)}
                />
            )}
            {badge.iconSrc && (
                <Menu.MenuItem
                    id="vc-badge-copy-link"
                    label="Copy Badge Image Link"
                    action={() => copyWithToast(badge.iconSrc!)}
                />
            )}
        </Menu.Menu>
    );
}

export default definePlugin({
    name: "BadgeAPI",
    description: "API to add badges to users",
    authors: [Devs.Megu, Devs.Ven, Devs.TheSun],
    required: true,
    patches: [
        {
            find: "#{intl::PROFILE_USER_BADGES}",
            replacement: [
                {
                    match: /alt:" ","aria-hidden":!0,src:.{0,50}(\i).iconSrc/,
                    replace: "...$1.props,$&"
                },
                // Path with 2026-04-badge-discovery OFF
                {
                    match: /(?<=forceOpen:.{0,40}?ariaHidden:!0,)children:(?=.{0,50}?(\i)\.id)/,
                    replace: "children:$1.component?$self.renderBadgeComponent({...$1}):"
                },
                // Path with 2026-04-badge-discovery ON
                {
                    match: /(?<=fallbackIconSrc:.{0,50}?)children:(?=.{0,50}?(\i)\.id)/,
                    replace: "children:$1.component?$self.renderBadgeComponent({...$1}):"
                },
                // handle onClick and onContextMenu
                {
                    match: /href:(\i)\.link/,
                    replace: "...$self.getBadgeMouseEventHandlers($1),$&"
                }
            ]
        },
        {
            find: "getLegacyUsername(){",
            replacement: {
                match: /getBadges\(\)\{.{0,100}?return\[/,
                replace: "$&...$self.getBadges(this),"
            }
        }
    ],

    // for access from the console or other plugins
    get DonorBadges() {
        return DonorBadges;
    },

    get EquicordDonorBadges() {
        return EquicordDonorBadges;
    },

    get LoliCordBadges() {
        return LoliCordBadges;
    },

    toolboxActions: {
        async "Refetch Badges"() {
            await loadAllBadges(true);
            Toasts.show({
                id: Toasts.genId(),
                message: "Successfully refetched badges!",
                type: Toasts.Type.SUCCESS
            });
        }
    },

    userProfileBadges: [LoliCordOwnerBadge, ContributorBadge, EquicordContributorBadge, UserPluginContributorBadge],

    start() {
        loadAllBadges().catch(() => {});

        clearInterval(intervalId);
        intervalId = setInterval(loadAllBadges, 1000 * 60 * 30); // 30 minutes

        // Charge la preference "badges caches" (locale + cloud) pour l'utilisateur courant.
        // Sans cet appel, myHiddenSources reste vide en memoire a chaque redemarrage,
        // meme si la sauvegarde existe deja dans localStorage/le cloud.
        const currentUserId = UserStore.getCurrentUser()?.id;
        if (currentUserId) {
            loadOwnHiddenBadgeSources(currentUserId).catch(() => {});
        }
        FluxDispatcher.subscribe("CONNECTION_OPEN", this.onConnectionOpen);
    },

    onConnectionOpen() {
        const currentUserId = UserStore.getCurrentUser()?.id;
        if (currentUserId) {
            loadOwnHiddenBadgeSources(currentUserId).catch(() => {});
        }
    },

    async stop() {
        clearInterval(intervalId);
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", this.onConnectionOpen);
    },

    dedupeBadges(badges: any[]) {
        if (!Array.isArray(badges)) return badges;
        const seenKeys = new Set<string>();

        return badges.filter(b => {
            if (!b) return false;

            const id = (b.id || b.key || b.uuid || "").toString().toLowerCase();
            const normId = id
                .replace("hypesquad_online_house_", "hypesquad_house_")
                .replace("premium_early_supporter", "early_supporter")
                .replace("moderator_programs_alumni", "certified_moderator");

            const icon = (b.iconSrc || b.icon || b.badge || "").toString();
            let iconHash = "";
            if (icon) {
                try {
                    const parts = icon.split("/");
                    const last = parts.pop() || icon;
                    iconHash = last.split("?")[0].replace(/\.(png|webp|jpg|svg|gif)$/i, "");
                } catch {
                    iconHash = icon;
                }
            }

            const primaryKey = icon || iconHash || (normId && !normId.startsWith("lolicord") ? normId : "");
            if (!primaryKey) return true;

            if (seenKeys.has(primaryKey)) return false;

            seenKeys.add(primaryKey);
            if (normId && !normId.startsWith("lolicord") && !normId.startsWith("nc-")) seenKeys.add(normId);
            if (iconHash) seenKeys.add(iconHash);

            return true;
        });
    },

    getBadges(profile: any) {
        if (!profile) return [];

        try {
            const userId = profile.userId || profile.id || profile.user?.id || profile.author?.id || (typeof profile.getId === "function" ? profile.getId() : "");
            const guildId = profile.guildId || profile.guild_id || "";
            return _getBadges({ ...profile, userId: String(userId || ""), guildId: String(guildId || "") });
        } catch (e) {
            new Logger("BadgeAPI#getBadges").error(e);
            return [];
        }
    },

    renderBadgeComponent: ErrorBoundary.wrap((badge: ProfileBadge & BadgeUserArgs) => {
        const Component = badge.component!;
        return <Component {...badge} />;
    }, { noop: true }),

    getBadgeMouseEventHandlers(badge: ProfileBadge & BadgeUserArgs) {
        const handlers = {} as Record<string, (e: React.MouseEvent) => void>;

        if (!badge) return handlers; // sanity check

        const { onClick, onContextMenu } = badge;

        if (onClick) handlers.onClick = e => {
            e.preventDefault();
            e.stopPropagation();
            onClick(e, badge);
        };
        if (onContextMenu) handlers.onContextMenu = e => onContextMenu(e, badge);

        return handlers;
    },

    getDonorBadges(userId: string) {
        if (!userId) return [];
        return DonorBadges[userId]?.map(badge => ({
            iconSrc: badge.badge,
            description: badge.tooltip,
            position: BadgePosition.START,
            props: {
                style: {
                    borderRadius: "0%",
                    maxHeight: "22px",
                    maxWidth: "22px"
                }
            },
            onContextMenu(event, badge) {
                ContextMenuApi.openContextMenu(event, () => <BadgeContextMenu badge={badge} />);
            },
            onClick() {
                return GenericBadgeModal(badge, "Vencord");
            },
        } satisfies ProfileBadge));
    },

    getEquicordDonorBadges(userId: string) {
        if (!userId) return [];
        return EquicordDonorBadges[userId]?.map(badge => ({
            iconSrc: badge.badge,
            description: badge.tooltip,
            position: BadgePosition.START,
            props: {
                style: {
                    borderRadius: "0%",
                    maxHeight: "22px",
                    maxWidth: "22px"
                }
            },
            onContextMenu(event, badge) {
                ContextMenuApi.openContextMenu(event, () => <BadgeContextMenu badge={badge} />);
            },
            onClick() {
                return badge.tooltip === "Equicord Translator" ? EquicordTranslatorModal() : GenericBadgeModal(badge, "Equicord");
            },
        } satisfies ProfileBadge));
    },

    getLoliCordBadges(userId: string) {
        try {
            if (!userId) return [];
            const userBadges = LoliCordBadges[userId] || LoliCordBadges[String(userId)];
            if (!userBadges || !Array.isArray(userBadges)) return [];

            return userBadges
                .filter(badge => badge && (badge.icon || badge.badge) && badge.visible !== false)
                .map(badge => {
                    const iconSrc = badge.icon || badge.badge;
                    const description = badge.placeholder || badge.description || badge.tooltip || "LoliCord Badge";
                    const badgeId = badge.uuid || badge.id || `lolicord-${description}-${userId}`;

                    return {
                        id: badgeId,
                        key: badgeId,
                        iconSrc,
                        description,
                        position: BadgePosition.START,
                        props: {
                            style: {
                                borderRadius: "50%",
                                maxHeight: "22px",
                                maxWidth: "22px"
                            }
                        },
                        onContextMenu(event, b) {
                            ContextMenuApi.openContextMenu(event, () => <BadgeContextMenu badge={b as any} />);
                        },
                        onClick() {
                            return GenericBadgeModal({
                                iconSrc,
                                icon: iconSrc,
                                description,
                                placeholder: description,
                                ...badge
                            }, "LoliCord");
                        }
                    } satisfies ProfileBadge;
                });
        } catch (e) {
            console.error("[BadgeAPI] Error processing lolicord badges for", userId, e);
            return [];
        }
    },

    getIllegalcordBadges(userId: string) {
        return IllegalcordBadges[userId]?.map(badge => ({
            iconSrc: badge.badge,
            description: badge.tooltip,
            position: BadgePosition.START,
            props: {
                style: {
                    borderRadius: "50%",
                    maxHeight: "22px",
                    maxWidth: "22px"
                }
            },
            onContextMenu(event, badge) {
                ContextMenuApi.openContextMenu(event, () => <BadgeContextMenu badge={badge} />);
            },
            onClick() {
                return GenericBadgeModal(badge, "Illegalcord");
            },
        } satisfies ProfileBadge));
    }
});



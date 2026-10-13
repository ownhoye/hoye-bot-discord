/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import BadgeAPIPlugin from "@plugins/_api/badges";
import { ComponentType, HTMLProps } from "react";

import { getHiddenBadgeSources } from "./BadgeVisibility";
import { isStealthModeEnabled } from "./stealthState";

export const enum BadgePosition {
    START,
    END
}

export interface ProfileBadge {
    /** The tooltip to show on hover. Required for image badges */
    description?: string;
    /** Custom component for the badge (tooltip not included) */
    component?: ComponentType<ProfileBadge & BadgeUserArgs>;
    /** The custom image to use */
    iconSrc?: string;
    link?: string;
    /** Action to perform when you click the badge */
    onClick?(event: React.MouseEvent, props: ProfileBadge & BadgeUserArgs): void;
    /** Action to perform when you right click the badge */
    onContextMenu?(event: React.MouseEvent, props: BadgeUserArgs & BadgeUserArgs): void;
    /** Should the user display this badge? */
    shouldShow?(userInfo: BadgeUserArgs): boolean;
    /** Optional props (e.g. style) for the badge, ignored for component badges */
    props?: HTMLProps<HTMLImageElement>;
    /** Insert at start or end? */
    position?: BadgePosition;
    /** The badge name to display, Discord uses this. Required for component badges */
    key?: string;

    /**
     * Allows dynamically returning multiple badges.
     * Must not call hooks
     */
    getBadges?(userInfo: BadgeUserArgs): ProfileBadge[];
}

const Badges = new Set<ProfileBadge>();

/**
 * Register a new badge with the Badges API
 * @param badge The badge to register
 */
export function addProfileBadge(badge: ProfileBadge) {
    badge.component &&= ErrorBoundary.wrap(badge.component, { noop: true });
    Badges.add(badge);
}

/**
 * Unregister a badge from the Badges API
 * @param badge The badge to remove
 */
export function removeProfileBadge(badge: ProfileBadge) {
    return Badges.delete(badge);
}

/**
 * Inject badges into the profile badges array.
 * You probably don't need to use this.
 */
export function _getBadges(args: any) {
    // ── Stealth Mode Bypass ──
    if (isStealthModeEnabled()) return [];

    const rawUserId = args?.userId || args?.id || args?.user?.id || args?.author?.id || (typeof args?.getId === "function" ? args.getId() : "");
    const userId = rawUserId ? String(rawUserId) : "";
    const guildId = String(args?.guildId || args?.guild_id || "");

    const normalizedArgs: BadgeUserArgs = {
        ...args,
        userId,
        guildId
    };

    if (!userId) return [];

    // ── Hidden badge sources (per-profile, synced via cloud) ──
    const hiddenSources = getHiddenBadgeSources(userId);
    const isHidden = (source: string) => hiddenSources.includes(source as any);

    const badges = [] as ProfileBadge[];

    const shieldBadge = (b: any) => {
        const iconSrc = typeof b.iconSrc === "string" ? b.iconSrc : (typeof b.icon === "string" ? b.icon : (typeof b.badge === "string" ? b.badge : ""));
        const description = b.description || b.placeholder || b.tooltip || "";
        const id = b.id || b.key || b.uuid || (iconSrc ? iconSrc.split("/").pop()?.split("?")[0] : null) || description || "nc-badge";

        return {
            ...normalizedArgs,
            ...b,
            iconSrc,
            link: typeof b.link === "string" ? b.link : "",
            id,
            key: id,
            description,
        };
    };

    for (const badge of Badges) {
        if (badge.shouldShow && !badge.shouldShow(normalizedArgs)) {
            continue;
        }

        const b = badge.getBadges
            ? badge.getBadges(normalizedArgs).map(badge => shieldBadge({
                ...badge,
                component: badge.component && ErrorBoundary.wrap(badge.component, { noop: true })
            }))
            : [shieldBadge(badge)];

        if (badge.position === BadgePosition.START) {
            badges.unshift(...b);
        } else {
            badges.push(...b);
        }
    }

    const donorBadges = BadgeAPIPlugin.getDonorBadges(userId);
    const equicordDonorBadges = BadgeAPIPlugin.getEquicordDonorBadges(userId);
    const lolicordBadges = (BadgeAPIPlugin as any).getLoliCordBadges?.(userId);
    const illegalcordBadges = (BadgeAPIPlugin as any).getIllegalcordBadges?.(userId);

    if (donorBadges && !isHidden("vencord")) {
        badges.unshift(...donorBadges.map(shieldBadge));
    }

    if (equicordDonorBadges && !isHidden("equicord")) {
        badges.unshift(...equicordDonorBadges.map(shieldBadge));
    }

    if (lolicordBadges && !isHidden("lolicord")) {
        badges.unshift(...lolicordBadges.map(shieldBadge));
    }

    if (illegalcordBadges && !isHidden("illegalcord")) {
        badges.unshift(...illegalcordBadges.map(shieldBadge));
    }

    const seen = new Set<string>();
    return badges.filter(b => {
        if (!b) return false;
        const key = (b.id && b.id !== "nc-badge")
            ? b.id
            : (b.iconSrc || b.key || b.description || "").toString();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export interface BadgeUserArgs {
    userId: string;
    guildId: string;
}

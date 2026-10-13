/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { proxyLazy } from "@utils/lazy";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { StartAt, OptionType } from "@utils/types";
import { closeModal, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { findAll, filters, findByCodeLazy, findByProps, findByPropsLazy, findComponentByCodeLazy, findStore, waitFor } from "@webpack";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { isLoliCordOwner } from "@utils/lolicordOwners";
import { ChannelActionCreators, ChannelStore, DisplayProfileUtils, FluxDispatcher, i18n, IconUtils, NavigationRouter, React, SelectedChannelStore, Menu, showToast, SnowflakeUtils, Toasts, UsernameUtils, UserProfileActions, UserStore } from "@webpack/common";
import ErrorBoundary from "@components/ErrorBoundary";
import { BaseText } from "@components/BaseText";
import { t } from "../autoTranslateLoliCord";
import { Announcement, deleteAnnouncement, fetchAnnouncements, getGithubToken } from "./announcements";
import { openAnnouncementModal } from "./AnnouncementModal";
import { LOLICORD_AVATAR_BASE64 } from "./avatarData";

export const LOLICORD_USER_ID = "999999999999999999";
export const LOLICORD_CHANNEL_ID = "999999999999999990";
export const LOLICORD_CREATED_AT = new Date("2024-01-01T00:00:00Z");

function formatDate(date: Date): string {
    try {
        return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    } catch {
        return date.toISOString().slice(0, 10);
    }
}

const LS_LAST_SEEN = "lolicord_official_dm_last_seen";
const LS_LAST_TS = "lolicord_official_dm_last_ts";

export const settings = definePluginSettings({
    isDmClosed: {
        type: OptionType.BOOLEAN,
        description: "Whether the official DM is closed",
        default: false,
        hidden: true,
    }
});

function getItemSafe(key: string): string | null {
    try {
        if (typeof localStorage !== "undefined") return localStorage.getItem(key);
    } catch {}
    return null;
}

function setItemSafe(key: string, val: string): void {
    try {
        if (typeof localStorage !== "undefined") localStorage.setItem(key, val);
    } catch {}
}

let lastSeenPostId = getItemSafe(LS_LAST_SEEN) || "";
let lastPostTimestamp = Number(getItemSafe(LS_LAST_TS) || 0);
let pollInterval: ReturnType<typeof setInterval> | null = null;
let unreadCount = 0;
let domObserver: MutationObserver | null = null;
let isAppLoaded = false;

const lolicordAvatarUrl = LOLICORD_AVATAR_BASE64;

const createChannelRecordFromServer = findByCodeLazy(".GUILD_TEXT]", "fromServer)");
const createMessageRecord = findByCodeLazy(".createFromServer(", ".isBlockedForMessage", "messageReference:");

function replaceDiscordWithLoliCord(text: string): string {
    if (!text || typeof text !== "string") return text;
    return text
        .replace(/Official Discord Message/gi, "Official LoliCord Message")
        .replace(/Message officiel de Discord/gi, "Message officiel de LoliCord")
        .replace(/Message de discorde officiel/gi, "Message officiel de LoliCord")
        .replace(/Team Discord/gi, "Team LoliCord")
        .replace(/l'équipe Discord/gi, "l'équipe LoliCord")
        .replace(/official Discord notifications/gi, "official LoliCord notifications")
        .replace(/notifications officielles de Discord/gi, "notifications officielles de LoliCord")
        .replace(/Discord ne vous demandera/gi, "LoliCord ne vous demandera")
        .replace(/Discord ne te demandera/gi, "LoliCord ne te demandera")
        .replace(/Discord will never ask/gi, "LoliCord will never ask")
        .replace(/Official Discord/gi, "Official LoliCord")
        .replace(/Discord Official/gi, "LoliCord Official");
}

function isLoliCordContext(node: Node): boolean {
    try {
        if (SelectedChannelStore?.getChannelId?.() === LOLICORD_CHANNEL_ID) return true;

        let curr: Element | null = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;

        if (curr?.closest) {
            const tooltip = curr.closest("[class*='tooltip'], [role='tooltip']");
            if (tooltip && /Discord/i.test(tooltip.textContent || "") && /Official|Message|Officiel|System/i.test(tooltip.textContent || "")) {
                return true;
            }
        }

        while (curr) {
            if (curr.getAttribute) {
                const href = curr.getAttribute("href");
                if (href && (href.includes(LOLICORD_CHANNEL_ID) || href.includes(LOLICORD_USER_ID))) return true;
                const ariaLabel = curr.getAttribute("aria-label");
                if (ariaLabel && ariaLabel.toLowerCase().includes("lolicord")) return true;
                const dataId = curr.getAttribute("data-list-item-id") || curr.getAttribute("data-channel-id");
                if (dataId && (dataId.includes(LOLICORD_CHANNEL_ID) || dataId.includes(LOLICORD_USER_ID))) return true;
            }

            if (curr.querySelector) {
                const hasLoliCord = curr.querySelector(`[href*="${LOLICORD_CHANNEL_ID}"], [href*="${LOLICORD_USER_ID}"], [data-list-item-id*="${LOLICORD_CHANNEL_ID}"]`);
                if (hasLoliCord) return true;
            }

            if (curr.textContent && curr.textContent.includes("LoliCord") && (curr.classList?.contains?.("channel") || curr.getAttribute?.("role") === "listitem" || curr.classList?.contains?.("interactive") || curr.classList?.contains?.("layout"))) {
                return true;
            }

            curr = curr.parentElement;
        }
    } catch {}
    return false;
}

let isUpdatingDom = false;
let hoveredIsLoliCord = false;

function scanAndFixLoliCordDmElements() {
    if (isUpdatingDom) return;
    isUpdatingDom = true;
    try {
        // 1. Target specifically the LoliCord DM list item
        const lolicordDmElements = document.querySelectorAll(
            `[href*="${LOLICORD_CHANNEL_ID}"], [href*="${LOLICORD_USER_ID}"], [data-list-item-id*="${LOLICORD_CHANNEL_ID}"]`
        );

        for (const el of Array.from(lolicordDmElements)) {
            // Fix subtext inside this specific LoliCord DM element
            const subtexts = el.querySelectorAll('[class*="subtext"], [class*="activityText"]');
            for (const sub of Array.from(subtexts)) {
                if (sub.textContent && /Official Discord Message|Message officiel de Discord|Message de discorde officiel/i.test(sub.textContent)) {
                    sub.textContent = replaceDiscordWithLoliCord(sub.textContent);
                }
            }

            // Fix aria-labels
            const aria = el.getAttribute("aria-label");
            if (aria && /Discord/i.test(aria)) {
                el.setAttribute("aria-label", replaceDiscordWithLoliCord(aria));
            }

            // Track hover for tooltip
            if (!(el as any).__ncHoverBound) {
                (el as any).__ncHoverBound = true;
                el.addEventListener("mouseenter", () => { hoveredIsLoliCord = true; });
                el.addEventListener("mouseleave", () => { hoveredIsLoliCord = false; });
            }
        }

        // 2. If tooltip is visible and hovered element is LoliCord, fix tooltip text
        if (hoveredIsLoliCord) {
            const tooltips = document.querySelectorAll('[role="tooltip"], [class*="tooltip"]');
            for (const tip of Array.from(tooltips)) {
                if (tip.textContent && /Official Discord Message|Message officiel de Discord|Message de discorde officiel/i.test(tip.textContent)) {
                    tip.textContent = replaceDiscordWithLoliCord(tip.textContent);
                }
            }
        }
    } catch {} finally {
        isUpdatingDom = false;
    }
}

let dmDebounceTimer: ReturnType<typeof setTimeout> | undefined;

function startDomObserver() {
    if (domObserver) return;
    scanAndFixLoliCordDmElements();
    domObserver = new MutationObserver(() => {
        if (dmDebounceTimer) return;
        dmDebounceTimer = setTimeout(() => {
            dmDebounceTimer = undefined;
            scanAndFixLoliCordDmElements();
        }, 300);
    });
    const target =
        document.querySelector<Element>("[class*=\"privateChannels\"]") ??
        document.querySelector<Element>("nav[aria-label]") ??
        document.querySelector<Element>("[class*=\"sidebar\"]") ??
        document.body;
    domObserver.observe(target, { childList: true, subtree: true });
}

function stopDomObserver() {
    if (domObserver) {
        domObserver.disconnect();
        domObserver = null;
    }
    if (dmDebounceTimer) {
        clearTimeout(dmDebounceTimer);
        dmDebounceTimer = undefined;
    }
}

const LEARN_MORE_LABELS = ["learn more", "en savoir plus"];
const isBannerButtonLabel = (text: string | null | undefined) => {
    const txt = text?.trim().toLowerCase() ?? "";
    return LEARN_MORE_LABELS.includes(txt) || txt === t("Write an announcement").toLowerCase();
};

// Discord renders its own system-DM footer for this channel (not the plugin banner),
// so the owner tools are attached to that footer's "Learn more" button.
function relabelBannerButtonForOwner() {
    if (SelectedChannelStore.getChannelId() !== LOLICORD_CHANNEL_ID || !isCurrentUserOwner()) return;
    for (const btn of Array.from(document.querySelectorAll("main button, [class*='chatContent'] button"))) {
        const label = btn.querySelector("span, div") ?? btn;
        if (LEARN_MORE_LABELS.includes(label.textContent?.trim().toLowerCase() ?? "")) {
            label.textContent = t("Write an announcement");
        }
    }
}

function handleGlobalClick(e: MouseEvent) {
    if (SelectedChannelStore.getChannelId() !== LOLICORD_CHANNEL_ID) return;
    const target = e.target as HTMLElement;
    if (!target) return;

    const btn = target.closest("button") || target.closest("a");
    if (btn && isBannerButtonLabel(btn.textContent)) {
        e.preventDefault();
        e.stopPropagation();
        if (isCurrentUserOwner()) openOwnerComposer();
        else window.open("https://github.com/ownhoye/hoye-bot-discord", "_blank");
    }
}

const rawLoliCordUser = {
    id: LOLICORD_USER_ID,
    username: "lolicord",
    discriminator: "0",
    globalName: "LoliCord",
    global_name: "LoliCord",
    avatar: "lolicord_avatar",
    avatarURL: lolicordAvatarUrl,
    accentColor: 5793266, // #5865F2 Blue
    accent_color: 5793266,
    bannerColor: "#5865f2",
    banner_color: "#5865f2",
    bot: true,
    system: true,
    publicFlags: 1, // 1 << 0 STAFF
    public_flags: 1,
    flags: 1,
    premiumType: 0,
    mfaEnabled: false,
    verified: true,
    email: null,
    phone: null,
    nsfwAllowed: true,
    createdAt: new Date("2009-11-07T12:00:00.000Z"),
    getCreatedAt: () => new Date("2009-11-07T12:00:00.000Z"),
    isSystemUser: () => true,
    isVerifiedBot: () => true,
    isOfficialSystem: () => true,
    isStaff: () => true,
    isStaffPersonal: () => true,
    isBot: () => true,
    isNonUserBot: () => true,
    isObfuscated: () => false,
    hasUniqueUsername: () => true,
    hasFlag: (flag: number) => (flag & 1) !== 0,
    hasPublicFlag: (flag: number) => (flag & 1) !== 0,
    getAvatarURL: () => lolicordAvatarUrl,
    getAvatarSource: () => ({ uri: lolicordAvatarUrl }),
    getAvatarDecorationURL: () => null,
    getBannerURL: () => null,
    toString: () => `<@${LOLICORD_USER_ID}>`,
};

const rawLoliCordUserProxy = new Proxy(rawLoliCordUser, {
    get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        if (typeof prop === "string") {
            if (prop.startsWith("is") || prop.startsWith("has") || prop.startsWith("can")) {
                return () => false;
            }
            if (prop.startsWith("get")) {
                return () => null;
            }
        }
        return undefined;
    }
});

export const LOLICORD_USER = proxyLazy(() => {
    try {
        const URec: any = UserStore.getCurrentUser()?.constructor;
        if (URec) {
            const u = new URec({
                id: LOLICORD_USER_ID,
                username: "lolicord",
                discriminator: "0",
                globalName: "LoliCord",
                global_name: "LoliCord",
                avatar: "lolicord_avatar",
                accent_color: 5793266,
                accentColor: 5793266,
                banner_color: "#5865f2",
                bannerColor: "#5865f2",
                bot: true,
                system: true,
                public_flags: 1,
                flags: 1,
                verified: true,
            });
            u.isSystemUser = () => true;
            u.isVerifiedBot = () => true;
            u.isOfficialSystem = () => true;
            u.isStaff = () => true;
            u.isStaffPersonal = () => true;
            u.hasFlag = (flag: number) => (flag & 1) !== 0;
            u.hasPublicFlag = (flag: number) => (flag & 1) !== 0;
            u.getAvatarURL = () => lolicordAvatarUrl;
            u.getAvatarSource = () => ({ uri: lolicordAvatarUrl });
            u.createdAt = new Date("2009-11-07T12:00:00.000Z");
            u.getCreatedAt = () => new Date("2009-11-07T12:00:00.000Z");
            u.accentColor = 5793266;
            u.bannerColor = "#5865f2";
            return u;
        }
    } catch {}
    return rawLoliCordUserProxy;
});

const rawLoliCordChannel = {
    id: LOLICORD_CHANNEL_ID,
    type: 1, // DM
    name: "LoliCord",
    guild_id: null,
    guildId: null,
    getGuildId: () => null,
    getRecipientId: () => LOLICORD_USER_ID,
    recipients: [LOLICORD_USER_ID],
    rawRecipients: [LOLICORD_USER],
    isSystem: () => true,
    isOfficialSystem: () => true,
    isSystemDM: () => true,
    isDM: () => true,
    isGroupDM: () => false,
    isMultiUserDM: () => false,
    isPrivate: () => true,
    isArchivedThread: () => false,
    isThread: () => false,
    isSpam: () => false,
    isMessageRequest: () => false,
    isSystemMessage: () => false,
    isNsfw: () => false,
    isNSFW: () => false,
    isObfuscated: () => false,
    isVS: () => false,
    isDirectory: () => false,
    isManaged: () => false,
    isOwner: () => false,
    isGuildVocal: () => false,
    isVoice: () => false,
    isCategory: () => false,
    isGuildStageVoice: () => false,
    isMediaChannel: () => false,
    isForumLikeChannel: () => false,
    isForumPost: () => false,
    isRoleSubscriptionTemplateSupported: () => false,
    isListenable: () => false,
    isVocal: () => false,
    flags: 0,
    hasFlag: () => false,
    hasPublicFlag: () => false,
    getApplicationId: () => null,
    isGuildVoice: () => false,
    isGuildText: () => false,
    isGuildAnnouncement: () => false,
    isModeratorReportChannel: () => false,
    computedPosition: 0,
    position: 0,
    permissionOverwrites: {},
};

const rawLoliCordChannelProxy = new Proxy(rawLoliCordChannel, {
    get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        if (typeof prop === "string") {
            if (prop.startsWith("is") || prop.startsWith("has") || prop.startsWith("can")) {
                return () => false;
            }
            if (prop.startsWith("get")) {
                return () => null;
            }
        }
        return undefined;
    }
});

export const LOLICORD_CHANNEL = proxyLazy(() => {
    try {
        if (typeof createChannelRecordFromServer === "function") {
            const ch = createChannelRecordFromServer({
                id: LOLICORD_CHANNEL_ID,
                type: 1, // DM
                name: "LoliCord",
                recipients: [LOLICORD_USER],
                rawRecipients: [LOLICORD_USER],
                is_spam: false,
                is_message_request: false,
            });
            if (ch) {
                ch.isSystem = () => true;
                ch.isOfficialSystem = () => true;
                ch.isSystemDM = () => true;
                ch.getRecipientId = () => LOLICORD_USER_ID;
                return ch;
            }
        }
    } catch {}
    return rawLoliCordChannelProxy;
});

let unpatchUserStore: (() => void) | null = null;
let unpatchUserStoreGetUsers: (() => void) | null = null;
let unpatchChannelStore: (() => void) | null = null;
let unpatchChannelStoreGetPrivate: (() => void) | null = null;
let unpatchPrivateChannelSortStore: (() => void) | null = null;
let unpatchFetchMessages: (() => void) | null = null;
let unpatchHTTPGet: (() => void) | null = null;
let unpatchHTTPPost: (() => void) | null = null;
let unpatchOpenPrivateChannel: (() => void) | null = null;
let unpatchClosePrivateChannel: (() => void) | null = null;
let unpatchFluxDispatch: (() => void) | null = null;
let unpatchReadStateGetMention: (() => void) | null = null;
let unpatchReadStateGetUnread: (() => void) | null = null;
let unpatchReadStateHasUnread: (() => void) | null = null;
let unpatchIntlString: (() => void) | null = null;
let unpatchIntlFormat: (() => void) | null = null;
let unpatchUserProfileStore: (() => void) | null = null;
let unpatchSnowflakeUtils: (() => void) | null = null;
let unpatchDisplayProfile: (() => void) | null = null;
let unpatchSectionStores: (() => void)[] = [];
let unpatchAvatarFns: (() => void)[] = [];

const knownPostIds = new Set<string>();
function convertPostToMessage(post: any): any {
    const postId = String(post.id);

    const embeds: any[] = [];
    if (typeof post.image === "string" && /^https:\/\//.test(post.image)) {
        embeds.push({ type: "image", url: post.image, image: { url: post.image, proxy_url: post.image } });
    }

    const rawAuthor = {
        id: LOLICORD_USER_ID,
        username: "lolicord",
        discriminator: "0",
        global_name: "LoliCord",
        avatar: "lolicord_avatar",
        bot: true,
        system: true,
        public_flags: 1,
        flags: 1,
    };

    const rawMsg = {
        id: postId,
        channel_id: LOLICORD_CHANNEL_ID,
        author: rawAuthor,
        content: post.content,
        timestamp: new Date(post.created_at).toISOString(),
        edited_timestamp: null,
        tts: false,
        mention_everyone: false,
        mentions: [],
        mention_roles: [],
        attachments: [],
        embeds,
        pinned: false,
        type: 0,
        flags: 0,
    };

    let msgRecord = rawMsg;
    try {
        if (typeof createMessageRecord === "function") {
            msgRecord = createMessageRecord(rawMsg);
        }
    } catch {}

    return msgRecord;
}

function injectSinglePost(post: any) {
    if (!post || !post.id || settings.store.isDmClosed) return;
    const postId = String(post.id);
    if (knownPostIds.has(postId)) return;
    knownPostIds.add(postId);

    const postDate = new Date(post.created_at).getTime();
    if (postDate > lastPostTimestamp) {
        lastPostTimestamp = postDate;
        setItemSafe(LS_LAST_TS, String(lastPostTimestamp));
    }

    const isNew = Boolean(lastSeenPostId) && (function() {
        try { return BigInt(postId) > BigInt(lastSeenPostId); } catch { return postId !== lastSeenPostId; }
    })();

    if (!lastSeenPostId || isNew) {
        lastSeenPostId = postId;
        setItemSafe(LS_LAST_SEEN, lastSeenPostId);
    }

    const msgRecord = convertPostToMessage(post);

    // Make sure channel is created in store
    try {
        FluxDispatcher.dispatch({
            type: "CHANNEL_CREATE",
            channel: LOLICORD_CHANNEL,
        });
    } catch {}

    // Instant zero-delay message creation in UI
    try {
        FluxDispatcher.dispatch({
            type: "MESSAGE_CREATE",
            channelId: LOLICORD_CHANNEL_ID,
            message: msgRecord,
            optimistic: false,
            isPushNotification: true
        });
    } catch {}

    if (SelectedChannelStore.getChannelId() !== LOLICORD_CHANNEL_ID) {
        unreadCount++;
        try { (findStore("ReadStateStore") as any)?.emitChange(); } catch {}
        try { (findStore("PrivateChannelSortStore") as any)?.emitChange(); } catch {}
        try { (findStore("ChannelStore") as any)?.emitChange(); } catch {}
    }
}

// ─── Urgent Message Modal (System Alert for LoliCord Messages) ──────────────

interface UrgentMessageModalProps extends ModalProps {
    onClose: () => void;
}

export function UrgentMessageModal({ onClose, transitionState }: UrgentMessageModalProps) {
    const handleConfirm = () => {
        onClose();
        try {
            NavigationRouter.transitionTo(`/channels/@me/${LOLICORD_CHANNEL_ID}`);
        } catch {}
    };

    return (
        <ModalRoot transitionState={transitionState} size={ModalSize.DYNAMIC} className="lolicord-urgent-modal-root">
            <div data-mana-component="modal" className="lolicord-urgent-container container__8a031 size-md__8a031 padding-size-lg__8a031" style={{ opacity: 1, transform: "scale(1)" }}>
                <div className="lolicord-urgent-header-gradient container_a62383 blue_a62383 headerGradient__8a031" style={{ "--custom-gradient-offset-bottom": "0%" } as any}>
                    <header className="section__8a031 header__8a031 headerCentered__8a031">
                        <div data-align="stretch" data-justify="start" data-direction="vertical" data-wrap="false" data-full-width="true" className="stack_dbd263" style={{ gap: "var(--space-8)", padding: "var(--space-0)" }}>
                            <div className="lolicord-urgent-header-top headerLayout__8a031">
                                <div className="headerLeading__8a031 headerLeadingAbsolute__8a031"></div>
                                <div className="headerLeadingSpacer__8a031" style={{ height: 35, width: 45 }}></div>
                                <div className="lolicord-urgent-graphic-wrap headerMain__8a031">
                                    <div className="headerGraphic__8a031">
                                        <div className="headerGraphicContainer__8a031">
                                            <div className="container__8ef77 aspect-ratio-16/9__8ef77">
                                                <img className="lolicord-urgent-img image__8ef77" alt="" draggable={false} src="https://cdn.discordapp.com/assets/content/88cde2b0ab4c8015cee8fdb8732b85b01df4fc78a75b3aa5e621539ea94b1803.svg" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="headerTrailingSpacer__8a031" style={{ height: 35, width: 45 }}></div>
                                <div className="headerTrailing__8a031 headerTrailingAbsolute__8a031">
                                    <button data-mana-component="button" role="button" className="lolicord-urgent-close-btn button_a22cb0 md_a22cb0 color-mix_a22cb0" type="button" aria-label="Close" onClick={onClose}>
                                        <div className="buttonChildrenWrapper_a22cb0">
                                            <div className="buttonChildren_a22cb0">
                                                <svg className="icon_a22cb0" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24">
                                                    <path fill="currentColor" d="M19.3 20.7a1 1 0 0 0 1.4-1.4L13.42 12l7.3-7.3a1 1 0 0 0-1.42-1.4L12 10.58l-7.3-7.3a1 1 0 0 0-1.4 1.42L10.58 12l-7.3 7.3a1 1 0 1 0 1.42 1.4L12 13.42l7.3 7.3Z"></path>
                                                </svg>
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            </div>
                            <h1 className="lolicord-urgent-title heading-xl/semibold_cf4812 defaultColor__5345c headerTitle__8a031" id="heading-_r_53_" data-text-variant="heading-xl/semibold" style={{ color: "var(--text-strong, #ffffff)" }}>
                                {t("Urgent Message")}
                            </h1>
                            <div className="headerSubtitleWrapper__8a031">
                                <div className="lolicord-urgent-subtitle text-md/normal_cf4812 headerSubtitle__8a031" data-text-variant="text-md/normal" style={{ color: "var(--text-subtle, #dbdee1)" }}>
                                    {t("There's an official message from the LoliCord team that needs your attention.")}
                                </div>
                            </div>
                        </div>
                    </header>
                </div>
                <footer className="lolicord-urgent-footer actionBar__8a031 section__8a031">
                    <div className="actionBarTrailing__8a031 actionBarTrailingFullWidth__8a031">
                        <div data-align="stretch" data-justify="start" data-direction="horizontal" data-wrap="true" data-full-width="true" className="stack_dbd263" style={{ gap: "var(--space-8)", padding: "var(--space-0)" }}>
                            <button
                                data-mana-component="button"
                                role="button"
                                className="lolicord-urgent-ok-btn button_a22cb0 md_a22cb0 primary_a22cb0 hasText_a22cb0 fullWidth_a22cb0"
                                type="button"
                                onClick={handleConfirm}
                            >
                                <div className="buttonChildrenWrapper_a22cb0">
                                    <div className="buttonChildren_a22cb0">
                                        <span className="lineClamp1__4bd52 text-md/medium_cf4812" data-text-variant="text-md/medium">
                                            {t("Okay")}
                                        </span>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>
                </footer>
            </div>
        </ModalRoot>
    );
}

let activeUrgentModalKey: string | null = null;
export function openUrgentMessageModal() {
    if (activeUrgentModalKey) return;
    activeUrgentModalKey = openModal(props => (
        <UrgentMessageModal
            {...props}
            onClose={() => {
                if (activeUrgentModalKey) {
                    closeModal(activeUrgentModalKey);
                    activeUrgentModalKey = null;
                }
            }}
        />
    ));
}

function removeMessage(id: string) {
    knownPostIds.delete(id);
    try {
        FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", channelId: LOLICORD_CHANNEL_ID, id });
    } catch {}
}

function removeDeletedAnnouncements(current: Announcement[]) {
    const currentIds = new Set(current.map(a => a.id));
    for (const id of [...knownPostIds]) {
        if (!currentIds.has(id)) removeMessage(id);
    }
}

const isCurrentUserOwner = () => isLoliCordOwner(UserStore.getCurrentUser()?.id);

function openOwnerComposer() {
    openAnnouncementModal(announcement => injectSinglePost(announcement));
}

async function deleteOwnAnnouncement(id: string) {
    const token = await getGithubToken();
    if (!token) {
        showToast(t("Publish an announcement once to save your GitHub token."), Toasts.Type.FAILURE);
        return;
    }
    try {
        await deleteAnnouncement(token, id);
        removeMessage(id);
        showToast(t("Announcement deleted"), Toasts.Type.SUCCESS);
    } catch (e: any) {
        showToast(e?.message ?? String(e), Toasts.Type.FAILURE);
    }
}

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, { message }) => {
    if (message?.channel_id !== LOLICORD_CHANNEL_ID || !isCurrentUserOwner()) return;
    children.push(
        <Menu.MenuItem
            id="lolicord-write-announcement"
            label={t("Write an announcement")}
            action={openOwnerComposer}
        />,
        <Menu.MenuItem
            id="lolicord-delete-announcement"
            label={t("Delete announcement")}
            color="danger"
            action={() => deleteOwnAnnouncement(String(message.id))}
        />
    );
};

async function checkAndInjectPosts(isInitialLoad = false) {
    if (settings.store.isDmClosed) return;
    try {
        const posts = await fetchAnnouncements();
        if (!posts) return;
        removeDeletedAnnouncements(posts);
        if (posts.length === 0) return;

        const previousLastTs = Number(getItemSafe(LS_LAST_TS) || 0);
        const previousLastSeenId = getItemSafe(LS_LAST_SEEN);

        if (!settings.store.isDmClosed) {
            setTimeout(() => {
                try {
                    FluxDispatcher.dispatch({
                        type: "CHANNEL_CREATE",
                        channel: LOLICORD_CHANNEL,
                    });
                } catch {}
            }, 0);
        }

        // Keep posts ordered NEWEST FIRST (descending timestamp order) for LOAD_MESSAGES_SUCCESS
        const sortedPosts = [...posts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        let newPostCount = 0;
        const messageRecords: any[] = [];

        if (sortedPosts.length > 0) {
            const newestDate = new Date(sortedPosts[0].created_at).getTime();

            // Detect if new posts arrived while Discord was closed
            if (isInitialLoad && previousLastTs > 0) {
                const isNewerThanSaved = newestDate > previousLastTs || (previousLastSeenId && String(sortedPosts[0].id) !== previousLastSeenId);
                if (isNewerThanSaved && !settings.store.isDmClosed) {
                    setTimeout(() => {
                        openUrgentMessageModal();
                    }, 1200);
                }
            }

            if (newestDate > lastPostTimestamp) {
                lastPostTimestamp = newestDate;
                setItemSafe(LS_LAST_TS, String(lastPostTimestamp));
            }
        }

        for (const post of sortedPosts) {
            const postId = String(post.id);
            knownPostIds.add(postId);

            const msgRecord = convertPostToMessage(post);
            messageRecords.push(msgRecord);

            const isNew = Boolean(lastSeenPostId) && (function() {
                try { return BigInt(postId) > BigInt(lastSeenPostId); } catch { return postId !== lastSeenPostId; }
            })();

            if (isNew && !isInitialLoad) {
                newPostCount++;
            }

            if (!lastSeenPostId || isNew) {
                lastSeenPostId = postId;
                setItemSafe(LS_LAST_SEEN, lastSeenPostId);
            }
        }

        setTimeout(() => {
            if (isInitialLoad || newPostCount > 0) {
                try {
                    FluxDispatcher.dispatch({
                        type: "LOAD_MESSAGES_SUCCESS",
                        channelId: LOLICORD_CHANNEL_ID,
                        messages: messageRecords,
                        isBefore: false,
                        isAfter: false,
                        hasMoreBefore: false,
                        hasMoreAfter: false,
                        limit: 50,
                    });
                } catch {}
            }

            if (newPostCount > 0) {
                if (!settings.store.isDmClosed && SelectedChannelStore.getChannelId() !== LOLICORD_CHANNEL_ID) {
                    unreadCount += newPostCount;
                    try { (findStore("ReadStateStore") as any)?.emitChange(); } catch {}
                    try { (findStore("PrivateChannelSortStore") as any)?.emitChange(); } catch {}
                    try { (findStore("ChannelStore") as any)?.emitChange(); } catch {}
                }
            }
        }, 10);
    } catch (e) {
        console.warn("[LoliCordOfficialDM] Error checking posts:", e);
    }
}

function handleChannelClose(e: any) {
    const id = typeof e === "string" ? e : (e?.channelId || e?.channel_id || e?.channel?.id || e?.id || (typeof e?.channel === "string" ? e.channel : null));
    if (id === LOLICORD_CHANNEL_ID || id === "999999999999999990") {
        settings.store.isDmClosed = true;
                unreadCount = 0;
        if (SelectedChannelStore.getChannelId() === LOLICORD_CHANNEL_ID) {
            try {
                FluxDispatcher.dispatch({
                    type: "CHANNEL_SELECT",
                    channelId: null,
                    guildId: null,
                });
            } catch {}
        }
        try { (findStore("ReadStateStore") as any)?.emitChange(); } catch {}
        try { (findStore("PrivateChannelSortStore") as any)?.emitChange(); } catch {}
        try { (findStore("ChannelStore") as any)?.emitChange(); } catch {}
    }
}

function handleChannelSelect(e: any) {
    const id = typeof e === "string" ? e : (e?.channelId || e?.channel_id || e?.channel?.id || e?.id);
    if (id === LOLICORD_CHANNEL_ID || id === "999999999999999990") {
        if (settings.store.isDmClosed) {
            // Reopen the DM — remove isAppLoaded guard so this works from search too
            settings.store.isDmClosed = false;
            setTimeout(() => {
                try {
                    FluxDispatcher.dispatch({
                        type: "CHANNEL_CREATE",
                        channel: LOLICORD_CHANNEL,
                    });
                } catch {}
                try { (findStore("PrivateChannelSortStore") as any)?.emitChange(); } catch {}
                try { (findStore("ChannelStore") as any)?.emitChange(); } catch {}
            }, 0);
        }
        unreadCount = 0;
        setTimeout(() => {
            try { (findStore("ReadStateStore") as any)?.emitChange(); } catch {}
        }, 0);
        checkAndInjectPosts(true);
        // The footer mounts after the channel switch: retry until it is in the DOM
        for (const delay of [300, 1000, 2500]) setTimeout(relabelBannerButtonForOwner, delay);
    }
}

const Section = findComponentByCodeLazy("headingVariant:", '"section"', "headingIcon:");


const LoliCordProfileSections = ErrorBoundary.wrap(({ isSideBar }: { isSideBar: boolean }) => (
    <>
        <Section
            heading="Nom d'utilisateur"
            headingVariant={isSideBar ? "text-xs/semibold" : "text-xs/medium"}
            headingColor={isSideBar ? "text-strong" : "text-default"}
        >
            <BaseText size="sm" color="text-normal" style={{ userSelect: "text" }}>
                @lolicord
            </BaseText>
        </Section>
        <Section
            heading="Compte créé le"
            headingVariant={isSideBar ? "text-xs/semibold" : "text-xs/medium"}
            headingColor={isSideBar ? "text-strong" : "text-default"}
        >
            <BaseText size="sm" color="text-normal">
                {formatDate(LOLICORD_CREATED_AT)}
            </BaseText>
        </Section>
    </>
), { noop: true });

export function LoliCordSystemBanner() {
    return (
        <div className="lolicord-official-banner">
            <div className="lolicord-official-banner-content">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#5865F2" fillRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v-6h-2v6zm0-8h2V7h-2v2z" clipRule="evenodd" />
                </svg>
                <div>
                    <div className="lolicord-official-banner-title">
                        Ce salon est réservé aux notifications officielles de LoliCord.
                    </div>
                    <div className="lolicord-official-banner-sub">
                        LoliCord ne te demandera jamais ton mot de passe ou ton token de compte.
                    </div>
                </div>
            </div>
            {isCurrentUserOwner()
                ? (
                    <button className="lolicord-official-banner-btn" onClick={openOwnerComposer}>
                        {t("Write an announcement")}
                    </button>
                )
                : (
                    <button
                        className="lolicord-official-banner-btn"
                        onClick={() => window.open("https://github.com/ownhoye/hoye-bot-discord", "_blank")}
                    >
                        En savoir plus
                    </button>
                )}
        </div>
    );
}

export default definePlugin({
    name: "LoliCordOfficialDM",
    description: "Official LoliCord System DM channel with announcements from the LoliCord owner",
    enabledByDefault: true,
    required: true,
    startAt: StartAt.WebpackReady,
    authors: [{ name: "Nightcord", id: 0n }],
    settings,

    contextMenus: {
        "message": messageContextMenuPatch
    },

    flux: {
        CHANNEL_DELETE: handleChannelClose,
        CHANNEL_CLOSE: handleChannelClose,
        PRIVATE_CHANNEL_CLOSE: handleChannelClose,
        CHANNEL_SELECT: handleChannelSelect,
    },

    patches: [
        {
            find: '"sticker")',
            replacement: {
                match: /0===(\i)\.length(?=.{0,25}?\(0,\i\.jsxs?\)\(.{0,75}?children:\1)/,
                replace: "(Vencord.Api.ChatButtons._injectButtons($1,arguments[0]),$self.isLoliCordChannel(arguments[0])?$self.renderBanner():$&)"
            }
        },
        // Inject username + creation date in DM sidebar profile panel
        {
            find: "#{intl::PROVISIONAL_ACCOUNT}),headingIcon:",
            replacement: {
                match: /(#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id)}\)}\))/,
                replace: "$1,$self.renderLoliCordProfileSections({userId:$2,isSideBar:true})"
            }
        },
        // Inject in profile modal
        {
            find: ",applicationRoleConnection:",
            replacement: {
                match: /(#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id),.{0,100}}\)}\)),/,
                replace: "$1,$self.renderLoliCordProfileSections({userId:$2,isSideBar:false}),"
            }
        },
        // Inject in profile modal v2
        {
            find: ".MODAL_V2,onClose:",
            replacement: {
                match: /(#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id),.{0,100}}\)}\)),/,
                replace: "$1,$self.renderLoliCordProfileSections({userId:$2,isSideBar:false}),"
            }
        },
        // Direct React Component patch for DM list — filters out LoliCord DM when closed
        {
            find: '"dm-quick-launcher"===',
            replacement: {
                match: /privateChannelIds:([^,]+)(?=,listRef:)/,
                replace: "privateChannelIds:$self.filterLoliCordDm($1)"
            }
        }
    ],

    filterLoliCordDm(channelIds: any) {
        if (!Array.isArray(channelIds)) return channelIds;
        const closed = settings.store.isDmClosed;
        if (closed) {
            return channelIds.filter((id: string) => id !== LOLICORD_CHANNEL_ID);
        }
        return channelIds;
    },

    renderLoliCordProfileSections({ userId, isSideBar }: { userId: string, isSideBar: boolean }) {
        if (userId !== LOLICORD_USER_ID) return null;
        return <LoliCordProfileSections isSideBar={isSideBar} />;
    },

    isLoliCordChannel(props: any) {
        const id = props?.channel?.id || props?.id;
        if (id === LOLICORD_CHANNEL_ID) return true;
        if (props?.channel?.name === "LoliCord" || props?.name === "LoliCord") return true;
        if (props?.channel?.recipients?.includes?.(LOLICORD_USER_ID)) return true;
        if (SelectedChannelStore.getChannelId() === LOLICORD_CHANNEL_ID) return true;
        return false;
    },

    getLoliCordSystemText() {
        return "Official LoliCord Message";
    },

    renderBanner() {
        return <LoliCordSystemBanner />;
    },

    start() {
        window.addEventListener("click", handleGlobalClick, true);

        // --- Core fix: intercept FluxDispatcher.dispatch ---
        // When settings.store.isDmClosed=true, we must NEVER let CHANNEL_CREATE for our fake channel
        // reach Discord's stores, otherwise Discord caches it in IndexedDB and shows
        // it again on next startup even before our other patches fire.
        try {
            const fd = FluxDispatcher as any;
            const origDispatch = fd.dispatch.bind(fd);
            fd.dispatch = function(action: any, ...args: any[]) {
                if (
                    action?.type === "CHANNEL_CREATE" &&
                    (action?.channel?.id === LOLICORD_CHANNEL_ID || action?.channelId === LOLICORD_CHANNEL_ID) &&
                    settings.store.isDmClosed
                ) {
                    return Promise.resolve();
                }
                return origDispatch(action, ...args);
            };
            unpatchFluxDispatch = () => { fd.dispatch = origDispatch; };
        } catch {}

        // If the DM was closed, purge any stale entry Discord may have cached
        // in its IndexedDB from a previous session where the DM was open.
        if (settings.store.isDmClosed) {
            setTimeout(() => {
                try {
                    FluxDispatcher.dispatch({
                        type: "CHANNEL_DELETE",
                        channelId: LOLICORD_CHANNEL_ID,
                        channel: { id: LOLICORD_CHANNEL_ID, type: 1 },
                    });
                } catch {}
                try { (findStore("ChannelStore") as any)?.emitChange(); } catch {}
                try { (findStore("PrivateChannelSortStore") as any)?.emitChange(); } catch {}
            }, 500);
        }


        // Defer all heavy store-patching (findByProps/findAll/prototype wrapping) to the
        // next macrotask so Discord's own startup rendering completes first. The FluxDispatcher
        // guard above stays synchronous because it must intercept CHANNEL_CREATE before
        // Discord's stores process it. Everything else is safe to defer by ~0 ms.
        setTimeout(() => {

        // Safely patch SnowflakeUtils as soon as loaded
        waitFor(["fromTimestamp", "extractTimestamp"], (m: any) => {
            if (m && typeof m.extractTimestamp === "function" && !unpatchSnowflakeUtils) {
                const origExtract = m.extractTimestamp;
                m.extractTimestamp = function(snowflake: string) {
                    if (snowflake === LOLICORD_USER_ID || snowflake === "999999999999999999") {
                        return new Date("2009-11-07T12:00:00Z").getTime();
                    }
                    return origExtract.apply(this, arguments as any);
                };
                unpatchSnowflakeUtils = () => { m.extractTimestamp = origExtract; };
            }
        });

        // Safely patch UsernameUtils as soon as loaded
        waitFor(["useName", "getGlobalName"], (m: any) => {
            if (m && typeof m.formatForDisplay === "function") {
                const origFmt = m.formatForDisplay;
                m.formatForDisplay = function(user: any, ...args: any[]) {
                    const id = typeof user === "string" ? user : user?.id;
                    if (id === LOLICORD_USER_ID || id === "999999999999999999") return "lolicord";
                    return origFmt.apply(this, arguments as any);
                };
            }
        });

        // Patch DisplayProfileUtils for blue profile theme
        try {
            if (DisplayProfileUtils?.getDisplayProfile) {
                const origGetDP = DisplayProfileUtils.getDisplayProfile;
                DisplayProfileUtils.getDisplayProfile = function(userId: string, ...args: any[]) {
                    if (userId === LOLICORD_USER_ID || userId === "999999999999999999") {
                        const dp = origGetDP.apply(this, arguments as any) || {};
                        dp.accentColor = 5793266;
                        dp.banner = null;
                        dp.themeColors = [5793266, 5793266];
                        return dp;
                    }
                    return origGetDP.apply(this, arguments as any);
                };
                unpatchDisplayProfile = () => { DisplayProfileUtils.getDisplayProfile = origGetDP; };
            }
        } catch {}

        // Patch IconUtils and all Webpack modules that have getUserAvatarURL or getAvatarURL
        try {
            if (IconUtils) {
                if (typeof IconUtils.getUserAvatarURL === "function") {
                    const orig = IconUtils.getUserAvatarURL;
                    IconUtils.getUserAvatarURL = function(user: any, ...args: any[]) {
                        const id = typeof user === "string" ? user : (user?.id ?? user?.userId);
                        if (id === LOLICORD_USER_ID || id === "999999999999999999") return lolicordAvatarUrl;
                        return orig.apply(this, arguments as any);
                    };
                    unpatchAvatarFns.push(() => { IconUtils.getUserAvatarURL = orig; });
                }
                if (typeof (IconUtils as any).getAvatarURL === "function") {
                    const origAv = (IconUtils as any).getAvatarURL;
                    (IconUtils as any).getAvatarURL = function(guildId: any, user: any, ...args: any[]) {
                        const id = typeof user === "string" ? user : (user?.id ?? user?.userId);
                        if (id === LOLICORD_USER_ID || id === "999999999999999999") return lolicordAvatarUrl;
                        return origAv.apply(this, arguments as any);
                    };
                    unpatchAvatarFns.push(() => { (IconUtils as any).getAvatarURL = origAv; });
                }
                if (typeof (IconUtils as any).getDefaultAvatarURL === "function") {
                    const origDef = (IconUtils as any).getDefaultAvatarURL;
                    (IconUtils as any).getDefaultAvatarURL = function(user: any, ...args: any[]) {
                        const id = typeof user === "string" ? user : (user?.id ?? user?.userId);
                        if (id === LOLICORD_USER_ID || id === "999999999999999999") return lolicordAvatarUrl;
                        return origDef.apply(this, arguments as any);
                    };
                    unpatchAvatarFns.push(() => { (IconUtils as any).getDefaultAvatarURL = origDef; });
                }
            }

            const modsWithAvatar = findAll(filters.byProps("getUserAvatarURL"));
            for (const mod of modsWithAvatar) {
                if (mod && typeof mod.getUserAvatarURL === "function") {
                    const origFn = mod.getUserAvatarURL;
                    mod.getUserAvatarURL = function(user: any, ...args: any[]) {
                        const id = typeof user === "string" ? user : (user?.id ?? user?.userId);
                        if (id === LOLICORD_USER_ID || id === "999999999999999999") return lolicordAvatarUrl;
                        return origFn.apply(this, arguments as any);
                    };
                    unpatchAvatarFns.push(() => { mod.getUserAvatarURL = origFn; });
                }
            }

            const URec: any = UserStore.getCurrentUser()?.constructor;
            if (URec?.prototype) {
                if (typeof URec.prototype.getAvatarURL === "function") {
                    const origProto = URec.prototype.getAvatarURL;
                    URec.prototype.getAvatarURL = function(this: any, ...args: any[]) {
                        if (this?.id === LOLICORD_USER_ID || this?.id === "999999999999999999") return lolicordAvatarUrl;
                        return origProto.apply(this, args as any);
                    };
                    unpatchAvatarFns.push(() => { URec.prototype.getAvatarURL = origProto; });
                }
                if (typeof URec.prototype.getAvatarSource === "function") {
                    const origProtoSrc = URec.prototype.getAvatarSource;
                    URec.prototype.getAvatarSource = function(this: any, ...args: any[]) {
                        if (this?.id === LOLICORD_USER_ID || this?.id === "999999999999999999") return { uri: lolicordAvatarUrl };
                        return origProtoSrc.apply(this, args as any);
                    };
                    unpatchAvatarFns.push(() => { URec.prototype.getAvatarSource = origProtoSrc; });
                }
            }
        } catch {}

        // Patch UserProfileStore to return Staff badge, blue banner and LoliCord profile
        try {
            const UserProfileStore = (findStore("UserProfileStore") || findByProps("getUserProfile")) as any;
            if (UserProfileStore) {
                const origGetProfile = UserProfileStore.getUserProfile;
                UserProfileStore.getUserProfile = function(userId: string) {
                    if (userId === LOLICORD_USER_ID || userId === "999999999999999999") {
                        const createdAt = new Date("2009-11-07T12:00:00.000Z");
                        return {
                            user: LOLICORD_USER,
                            connectedAccounts: [],
                            connected_accounts: [],
                            premiumSince: null,
                            premiumType: null,
                            accentColor: 5793266,
                            accent_color: 5793266,
                            banner: null,
                            banner_color: "#5865f2",
                            themeColors: [5793266, 5793266],
                            theme_colors: [5793266, 5793266],
                            profileSince: createdAt,
                            memberSince: createdAt,
                            createdAt: createdAt,
                            badges: [
                                {
                                    id: "staff",
                                    description: "Discord Staff",
                                    icon: "5e74e9b61934fc1f67c65515d1f7e60d",
                                    link: "https://discord.com/company"
                                }
                            ],
                            bio: null,
                            userProfile: {
                                bio: null,
                                accentColor: 5793266,
                                banner: null,
                                themeColors: [5793266, 5793266],
                                profileSince: createdAt,
                                memberSince: createdAt,
                                createdAt: createdAt,
                            },
                            user_profile: {
                                bio: null,
                                accent_color: 5793266,
                                banner: null,
                                theme_colors: [5793266, 5793266],
                                profile_since: createdAt.toISOString(),
                                member_since: createdAt.toISOString(),
                                created_at: createdAt.toISOString(),
                            }
                        };
                    }
                    return origGetProfile.apply(this, arguments as any);
                };
                unpatchUserProfileStore = () => { UserProfileStore.getUserProfile = origGetProfile; };

                if (typeof UserProfileStore.isFetchingProfile === "function") {
                    const origFetch = UserProfileStore.isFetchingProfile;
                    UserProfileStore.isFetchingProfile = function(userId: string) {
                        if (userId === LOLICORD_USER_ID) return false;
                        return origFetch.apply(this, arguments as any);
                    };
                }

                if (typeof UserProfileStore.getUserProfileFetchStatus === "function") {
                    const origStat = UserProfileStore.getUserProfileFetchStatus;
                    UserProfileStore.getUserProfileFetchStatus = function(userId: string) {
                        if (userId === LOLICORD_USER_ID) return "SUCCESS";
                        return origStat.apply(this, arguments as any);
                    };
                }
            }
        } catch {}

        // Patch i18n intl methods for LoliCord official strings (only when in LoliCord context)
        try {
            if (i18n?.intl?.string) {
                const origString = i18n.intl.string;
                i18n.intl.string = function(descriptor: any) {
                    try {
                        const res = origString.apply(this, arguments as any);
                        if (typeof res === "string" && SelectedChannelStore?.getChannelId?.() === LOLICORD_CHANNEL_ID) {
                            return replaceDiscordWithLoliCord(res);
                        }
                        return res;
                    } catch {
                        return origString.apply(this, arguments as any);
                    }
                };
                unpatchIntlString = () => { i18n.intl.string = origString; };
            }

            if (i18n?.intl?.format) {
                const origFormat = i18n.intl.format;
                i18n.intl.format = function(descriptor: any, values: any) {
                    try {
                        const res = origFormat.apply(this, arguments as any);
                        if (SelectedChannelStore?.getChannelId?.() === LOLICORD_CHANNEL_ID) {
                            if (typeof res === "string") {
                                return replaceDiscordWithLoliCord(res);
                            }
                            if (Array.isArray(res)) {
                                return res.map(item => typeof item === "string" ? replaceDiscordWithLoliCord(item) : item);
                            }
                        }
                        return res;
                    } catch {
                        return origFormat.apply(this, arguments as any);
                    }
                };
                unpatchIntlFormat = () => { i18n.intl.format = origFormat; };
            }
        } catch {}

        startDomObserver();

        // Patch ReadStateStore to show red ping badge for new unread LoliCord posts
        try {
            const ReadStateStore = findStore("ReadStateStore") as any;
            if (ReadStateStore) {
                const origGetMentionCount = ReadStateStore.getMentionCount;
                ReadStateStore.getMentionCount = function(channelId: string) {
                    if (channelId === LOLICORD_CHANNEL_ID) return unreadCount;
                    return origGetMentionCount.apply(this, arguments as any);
                };
                unpatchReadStateGetMention = () => { ReadStateStore.getMentionCount = origGetMentionCount; };

                const origGetUnreadCount = ReadStateStore.getUnreadCount;
                ReadStateStore.getUnreadCount = function(channelId: string) {
                    if (channelId === LOLICORD_CHANNEL_ID) return unreadCount;
                    return origGetUnreadCount.apply(this, arguments as any);
                };
                unpatchReadStateGetUnread = () => { ReadStateStore.getUnreadCount = origGetUnreadCount; };

                const origHasUnread = ReadStateStore.hasUnread;
                ReadStateStore.hasUnread = function(channelId: string) {
                    if (channelId === LOLICORD_CHANNEL_ID) return unreadCount > 0;
                    return origHasUnread.apply(this, arguments as any);
                };
                unpatchReadStateHasUnread = () => { ReadStateStore.hasUnread = origHasUnread; };
            }
        } catch {}

        // Intercept MessageActions.fetchMessages to prevent 404 REST calls
        try {
            const MessageActions = findByProps("fetchMessages", "sendMessage") as any;
            if (MessageActions?.fetchMessages) {
                const origFetchMessages = MessageActions.fetchMessages;
                MessageActions.fetchMessages = function(opts: any) {
                    if (opts?.channelId === LOLICORD_CHANNEL_ID) {
                        checkAndInjectPosts(true);
                        return Promise.resolve();
                    }
                    return origFetchMessages.apply(this, arguments as any);
                };
                unpatchFetchMessages = () => { MessageActions.fetchMessages = origFetchMessages; };
            }
        } catch {}

        // Intercept HTTP.get and HTTP.post REST calls to prevent 404 errors for fake channel/user ID
        try {
            const HTTP = (findByProps("get", "post", "put", "del") || findByProps("get", "post")) as any;
            if (HTTP) {
                if (HTTP.get) {
                    const origGet = HTTP.get;
                    HTTP.get = function(opts: any) {
                        const url = typeof opts === "string" ? opts : opts?.url;
                        if (url && (url.includes(LOLICORD_CHANNEL_ID) || url.includes(LOLICORD_USER_ID) || url.includes("999999999999999999"))) {
                            if (url.includes("/profile")) {
                                return Promise.resolve({
                                    ok: true,
                                    status: 200,
                                    body: {
                                        user: {
                                            id: LOLICORD_USER_ID,
                                            username: "lolicord",
                                            global_name: "LoliCord",
                                            avatar: "lolicord_avatar",
                                            bot: true,
                                            system: true,
                                            public_flags: 1,
                                            flags: 1,
                                            accent_color: 5793266,
                                            banner_color: "#5865f2",
                                        },
                                        connected_accounts: [],
                                        premium_since: null,
                                        premium_type: null,
                                        accent_color: 5793266,
                                        banner_color: "#5865f2",
                                        theme_colors: [5793266, 5793266],
                                        badges: [
                                            {
                                                id: "staff",
                                                description: "Discord Staff",
                                                icon: "5e74e9b61934fc1f67c65515d1f7e60d",
                                                link: "https://discord.com/company"
                                            }
                                        ]
                                    },
                                    text: "{}",
                                    headers: {},
                                });
                            }
                            return Promise.resolve({
                                ok: true,
                                status: 200,
                                body: [],
                                text: "[]",
                                headers: {},
                            });
                        }
                        return origGet.apply(this, arguments as any);
                    };
                    unpatchHTTPGet = () => { HTTP.get = origGet; };
                }

                if (HTTP.post) {
                    const origPost = HTTP.post;
                    HTTP.post = function(opts: any) {
                        const url = typeof opts === "string" ? opts : opts?.url;
                        if (url && (url.includes(LOLICORD_CHANNEL_ID) || url.includes(LOLICORD_USER_ID) || url.includes("999999999999999999"))) {
                            return Promise.resolve({
                                ok: true,
                                status: 200,
                                body: {
                                    id: LOLICORD_CHANNEL_ID,
                                    type: 1,
                                    last_message_id: null,
                                    recipients: [LOLICORD_USER],
                                },
                                text: "{}",
                                headers: {},
                            });
                        }
                        return origPost.apply(this, arguments as any);
                    };
                    unpatchHTTPPost = () => { HTTP.post = origPost; };
                }

                const httpAny = HTTP as any;
                if (httpAny.del || httpAny.delete) {
                    const fnName = httpAny.del ? "del" : "delete";
                    const origDel = httpAny[fnName];
                    httpAny[fnName] = function(opts: any) {
                        const url = typeof opts === "string" ? opts : opts?.url;
                        if (url && (url.includes(LOLICORD_CHANNEL_ID) || url.includes(LOLICORD_USER_ID) || url.includes("999999999999999999"))) {
                            return Promise.resolve({
                                ok: true,
                                status: 200,
                                body: {},
                                text: "{}",
                                headers: {},
                            });
                        }
                        return origDel.apply(this, arguments as any);
                    };
                }
            }
        } catch {}

        // Patch UserStore.getUser
        const origGetUser = UserStore.getUser;
        UserStore.getUser = function(id: string) {
            if (id === LOLICORD_USER_ID || id === "999999999999999999") return LOLICORD_USER;
            return origGetUser.apply(this, arguments as any);
        };
        unpatchUserStore = () => { UserStore.getUser = origGetUser; };

        // Patch UserStore.getUsers if exists
        if ((UserStore as any).getUsers) {
            const origGetUsers = (UserStore as any).getUsers;
            (UserStore as any).getUsers = function() {
                const users = origGetUsers.apply(this, arguments as any) || {};
                if (!users[LOLICORD_USER_ID]) {
                    return { ...users, [LOLICORD_USER_ID]: LOLICORD_USER };
                }
                return users;
            };
            unpatchUserStoreGetUsers = () => { (UserStore as any).getUsers = origGetUsers; };
        }

        // Patch ChannelActionCreators & ChannelActionsMod methods (closePrivateChannel, closeChannel, deletePrivateChannel, closeDM)
        try {
            const actionMods = [ChannelActionCreators, findByProps("closePrivateChannel"), findByProps("openPrivateChannel")].filter(Boolean);
            actionMods.forEach((mod: any) => {
                const closeMethods = ["closePrivateChannel", "closeChannel", "deletePrivateChannel", "closeDM"];
                closeMethods.forEach(methodName => {
                    if (typeof mod[methodName] === "function" && !mod[methodName].__lolicordPatched) {
                        const orig = mod[methodName];
                        mod[methodName] = function(...args: any[]) {
                            const arg = args[0];
                            const targetId = typeof arg === "string" ? arg : (arg?.channelId || arg?.id || arg?.channel_id || arg?.userId || arg?.recipientId);
                            if (targetId === LOLICORD_CHANNEL_ID || targetId === "999999999999999990") {
                                settings.store.isDmClosed = true;
                                                                unreadCount = 0;
                                try {
                                    FluxDispatcher.dispatch({
                                        type: "CHANNEL_CLOSE",
                                        channelId: LOLICORD_CHANNEL_ID,
                                    });
                                } catch {}
                                try {
                                    FluxDispatcher.dispatch({
                                        type: "CHANNEL_DELETE",
                                        channelId: LOLICORD_CHANNEL_ID,
                                        channel: { id: LOLICORD_CHANNEL_ID, type: 1 },
                                    });
                                } catch {}
                                if (SelectedChannelStore.getChannelId() === LOLICORD_CHANNEL_ID) {
                                    try {
                                        FluxDispatcher.dispatch({
                                            type: "CHANNEL_SELECT",
                                            channelId: null,
                                            guildId: null,
                                        });
                                    } catch {}
                                }
                                try { (findStore("ReadStateStore") as any)?.emitChange(); } catch {}
                                try { (findStore("PrivateChannelSortStore") as any)?.emitChange(); } catch {}
                                try { (findStore("ChannelStore") as any)?.emitChange(); } catch {}
                                return;
                            }
                            return orig.apply(this, args);
                        };
                        mod[methodName].__lolicordPatched = true;
                    }
                });

                if (typeof mod.openPrivateChannel === "function" && !mod.openPrivateChannel.__lolicordPatched) {
                    const origOpen = mod.openPrivateChannel;
                    mod.openPrivateChannel = function(...args: any[]) {
                        const arg = args[0];
                        const targetId = typeof arg === "string" ? arg : (arg?.recipientId || arg?.userId || arg?.id || arg?.channelId);
                        if (targetId === LOLICORD_USER_ID || targetId === "999999999999999999") {
                            settings.store.isDmClosed = false;
                                                        unreadCount = 0;
                            setTimeout(() => {
                                try {
                                    FluxDispatcher.dispatch({
                                        type: "CHANNEL_CREATE",
                                        channel: LOLICORD_CHANNEL,
                                    });
                                } catch {}
                                try {
                                    FluxDispatcher.dispatch({
                                        type: "CHANNEL_SELECT",
                                        channelId: LOLICORD_CHANNEL_ID,
                                        guildId: null,
                                    });
                                } catch {}
                                try { (findStore("ReadStateStore") as any)?.emitChange(); } catch {}
                                try { (findStore("PrivateChannelSortStore") as any)?.emitChange(); } catch {}
                                try { (findStore("ChannelStore") as any)?.emitChange(); } catch {}
                            }, 0);
                            return Promise.resolve(LOLICORD_CHANNEL_ID);
                        }
                        return origOpen.apply(this, args);
                    };
                    mod.openPrivateChannel.__lolicordPatched = true;
                }
            });
        } catch {}

        // Patch ChannelStore.getChannel & getDMFromUserId
        const origGetChannel = ChannelStore.getChannel;
        ChannelStore.getChannel = function(id: string) {
            if (id === LOLICORD_CHANNEL_ID) {
                // Always return the channel so navigation works (even when closed)
                // Visibility in the DM list sidebar is handled by filterLoliCordDm
                return LOLICORD_CHANNEL;
            }
            return origGetChannel.apply(this, arguments as any);
        };
        unpatchChannelStore = () => { ChannelStore.getChannel = origGetChannel; };

        const channelStoreAny = ChannelStore as any;
        if (typeof channelStoreAny.getDMFromUserId === "function") {
            const origGetDM = channelStoreAny.getDMFromUserId;
            channelStoreAny.getDMFromUserId = function(userId: string) {
                if (userId === LOLICORD_USER_ID || userId === "999999999999999999") {
                    // Always return channel ID so Discord can navigate to it
                    return LOLICORD_CHANNEL_ID;
                }
                return origGetDM.apply(this, arguments as any);
            };
        }

        // Patch ChannelStore.getMutablePrivateChannels / getPrivateChannels if exists
        if (channelStoreAny.getMutablePrivateChannels) {
            const origGetMut = channelStoreAny.getMutablePrivateChannels;
            channelStoreAny.getMutablePrivateChannels = function() {
                const chs = origGetMut.apply(this, arguments as any) || {};
                const closed = settings.store.isDmClosed;
                if (!closed && !chs[LOLICORD_CHANNEL_ID]) {
                    return { ...chs, [LOLICORD_CHANNEL_ID]: LOLICORD_CHANNEL };
                }
                if (closed && chs[LOLICORD_CHANNEL_ID]) {
                    const copy = { ...chs };
                    delete copy[LOLICORD_CHANNEL_ID];
                    return copy;
                }
                return chs;
            };
            unpatchChannelStoreGetPrivate = () => { channelStoreAny.getMutablePrivateChannels = origGetMut; };
        }

        if (channelStoreAny.getPrivateChannels) {
            const origGetPriv = channelStoreAny.getPrivateChannels;
            channelStoreAny.getPrivateChannels = function() {
                const chs = origGetPriv.apply(this, arguments as any) || {};
                const closed = settings.store.isDmClosed;
                if (!closed && !chs[LOLICORD_CHANNEL_ID]) {
                    return { ...chs, [LOLICORD_CHANNEL_ID]: LOLICORD_CHANNEL };
                }
                if (closed && chs[LOLICORD_CHANNEL_ID]) {
                    const copy = { ...chs };
                    delete copy[LOLICORD_CHANNEL_ID];
                    return copy;
                }
                return chs;
            };
        }

        // Instantaneous patch for PrivateChannelSortStore (0ms overhead)
        const patchPrivateChannelSortStore = (SortStore: any) => {
            if (!SortStore || (SortStore as any).__lolicordPatched) return;
            (SortStore as any).__lolicordPatched = true;
            const sortUnpatches: (() => void)[] = [];
            const patchSortFn = (fnName: string) => {
                if (typeof SortStore[fnName] === "function") {
                    const orig = SortStore[fnName];
                    const isObjectArray = fnName === "getSortedPrivateChannels";
                    const entryToInsert = isObjectArray ? LOLICORD_CHANNEL : LOLICORD_CHANNEL_ID;

                    SortStore[fnName] = function(...args: any[]) {
                        const list: any = orig.apply(this, args);
                        if (!list || !Array.isArray(list) || settings.store.isDmClosed) return list;

                        const filtered = list.filter((item: any) => {
                            const id = typeof item === "string" ? item : (item?.id || item?.channelId);
                            return id !== LOLICORD_CHANNEL_ID;
                        });

                        filtered.unshift(entryToInsert);
                        return filtered;
                    };
                    sortUnpatches.push(() => {
                        SortStore[fnName] = orig;
                        delete (SortStore as any).__lolicordPatched;
                    });
                }
            };

            ["getPrivateChannelIds", "getSortedPrivateChannels", "getSortedPrivateChannelIds"].forEach(patchSortFn);
            unpatchPrivateChannelSortStore = () => { sortUnpatches.forEach(fn => fn()); };
        };

        const existingSortStore = (findStore("PrivateChannelSortStore") || findByProps("getPrivateChannelIds")) as any;
        if (existingSortStore) {
            patchPrivateChannelSortStore(existingSortStore);
        }
        waitFor(["getPrivateChannelIds"], (store: any) => {
            patchPrivateChannelSortStore(store);
        });

        FluxDispatcher.subscribe("CHANNEL_DELETE", handleChannelClose);
        FluxDispatcher.subscribe("CHANNEL_CLOSE", handleChannelClose);
        FluxDispatcher.subscribe("PRIVATE_CHANNEL_CLOSE", handleChannelClose);
        FluxDispatcher.subscribe("CHANNEL_SELECT", handleChannelSelect);

        setTimeout(() => {
            isAppLoaded = true;
            checkAndInjectPosts(true);
            relabelBannerButtonForOwner();
            pollInterval = setInterval(() => checkAndInjectPosts(false), 120000);
        }, 1000);
        }, 500); // end deferred startup — all store patches run after first paint + CONNECTION_OPEN
    },

    stop() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        window.removeEventListener("click", handleGlobalClick, true);
        stopDomObserver();

        if (unpatchUserStore) unpatchUserStore();
        if (unpatchUserStoreGetUsers) unpatchUserStoreGetUsers();
        if (unpatchChannelStore) unpatchChannelStore();
        if (unpatchChannelStoreGetPrivate) unpatchChannelStoreGetPrivate();
        if (unpatchPrivateChannelSortStore) unpatchPrivateChannelSortStore();
        if (unpatchFetchMessages) unpatchFetchMessages();
        if (unpatchHTTPGet) unpatchHTTPGet();
        if (unpatchHTTPPost) unpatchHTTPPost();
        if (unpatchOpenPrivateChannel) unpatchOpenPrivateChannel();
        if (unpatchClosePrivateChannel) unpatchClosePrivateChannel();
        if (unpatchFluxDispatch) unpatchFluxDispatch();
        if (unpatchReadStateGetMention) unpatchReadStateGetMention();
        if (unpatchReadStateGetUnread) unpatchReadStateGetUnread();
        if (unpatchReadStateHasUnread) unpatchReadStateHasUnread();
        if (unpatchIntlString) unpatchIntlString();
        if (unpatchIntlFormat) unpatchIntlFormat();
        if (unpatchUserProfileStore) unpatchUserProfileStore();
        if (unpatchSnowflakeUtils) unpatchSnowflakeUtils();
        if (unpatchDisplayProfile) unpatchDisplayProfile();

        unpatchSectionStores.forEach(fn => { try { fn(); } catch {} });
        unpatchSectionStores = [];

        unpatchAvatarFns.forEach(fn => { try { fn(); } catch {} });
        unpatchAvatarFns = [];

        FluxDispatcher.unsubscribe("CHANNEL_DELETE", handleChannelClose);
        FluxDispatcher.unsubscribe("PRIVATE_CHANNEL_CLOSE", handleChannelClose);
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", handleChannelSelect);

        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }
});

/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, FluxDispatcher, GuildMemberStore, SelectedGuildStore, UserStore } from "@webpack/common";
import { startDrawingInjector, stopDrawingInjector } from "../profileDrawing/drawingInjector";
import { isDrawingModeActive, renderDrawingOverlay } from "../profileDrawing/drawingManager";
import { getCachedEffectsConfig, getCachedPremiumSettings, profileCache, readUserPremiumData } from "../sync";
import type { ProfileEffectsConfig } from "../types";

let observer: MutationObserver | null = null;
let active = false;
let scanTimer: ReturnType<typeof setTimeout> | null = null;

export function cleanDuplicateText(str: string): string {
    if (!str) return str;
    const trimmed = str.trim();
    const len = trimmed.length;
    if (len >= 2 && len % 2 === 0) {
        const half = len / 2;
        if (trimmed.slice(0, half) === trimmed.slice(half)) {
            return trimmed.slice(0, half);
        }
    }
    return trimmed;
}

const PROFILE_INNER_LIST_OR_TAB_SELECTOR =
    "[role='tabpanel'], [class*='tabBarPanel'], [class*='listScroller'], [class*='listRow'], [class*='mutual'], [class*='friend_'], [class*='friendsRow'], [class*='peopleListItem'], [role='listitem'], [class*='activity'], [class*='connectedAccount']";

const PROFILE_CARD_SELECTOR =
    "[class*='userProfileModalOuter'], [class*='userProfileOuter'], [class*='userPopoutOuter'], [class*='userPopout_'], [class*='user-profile-popout'], .user-profile-popout, [class*='biteSize_'], [class*='fullSize_'], [class*='outer_'][class*='theme-'], [id='account'], [class*='accountProfileCard_'], [class*='accountProfile_']";

function extractUserIdFromAvatarSrc(src: string | null | undefined): string | null {
    if (!src) return null;
    const match = src.match(/\/users\/(\d+)\/avatars\//) || src.match(/\/avatars\/(\d+)\//);
    return match ? match[1] : null;
}

function extractUserIdFromFiber(el: Element | null): string | null {
    if (!el) return null;
    try {
        const fiberKey = Object.keys(el).find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
        if (!fiberKey) return null;
        let fiber = (el as any)[fiberKey];
        let fallbackCurrentUserId: string | null = null;
        for (let i = 0; i < 45 && fiber; i++) {
            const props = fiber.memoizedProps || fiber.pendingProps;
            if (props) {
                if (props.user?.id) return String(props.user.id);
                if (props.displayProfile?.userId) return String(props.displayProfile.userId);
                if (props.profile?.userId) return String(props.profile.userId);
                if (props.userId) return String(props.userId);
                if (props.channel?.getRecipientId?.()) return String(props.channel.getRecipientId());
                if (props.channel?.recipients?.[0]) return String(props.channel.recipients[0]);
                if (props.author?.id) return String(props.author.id);
                if (props.message?.author?.id) return String(props.message.author.id);
                if (props.member?.userId) return String(props.member.userId);
                if (props.member?.user?.id) return String(props.member.user.id);
                if (props.recipient?.id) return String(props.recipient.id);
                if (!fallbackCurrentUserId && props.currentUser?.id) {
                    fallbackCurrentUserId = String(props.currentUser.id);
                }
            }
            fiber = fiber.return;
        }
        return fallbackCurrentUserId;
    } catch {}
    return null;
}

function getProfileCardOwnerId(cardEl: HTMLElement): string | null {
    if (cardEl.dataset.authorId) return cardEl.dataset.authorId;
    if (cardEl.dataset.userId) return cardEl.dataset.userId;

    // 1. Check React Fiber on the card element itself (walks UP the component tree, never into tab children)
    const directFiberId = extractUserIdFromFiber(cardEl);
    if (directFiberId) return directFiberId;

    // 2. Check React Fiber on profile header elements outside of any tabpanel or list
    const headerCandidates = cardEl.querySelectorAll<HTMLElement>(
        "[class*='avatar_'], [class*='avatarWrapper_'], [class*='header_'], [class*='heading-xxl'], [data-text-variant*='heading-xxl'], [class*='nickname_'], [class*='userTag_']"
    );
    for (const candidate of Array.from(headerCandidates)) {
        if (candidate.closest(PROFILE_INNER_LIST_OR_TAB_SELECTOR)) continue;
        const headerFiberId = extractUserIdFromFiber(candidate);
        if (headerFiberId) return headerFiberId;
    }

    // 3. Check avatar images strictly in the profile header (never inside tabpanels or mutual friend lists)
    const imgs = cardEl.querySelectorAll<HTMLImageElement>("img[src*='/avatars/']");
    for (const img of Array.from(imgs)) {
        if (img.closest(PROFILE_INNER_LIST_OR_TAB_SELECTOR)) continue;
        const id = extractUserIdFromAvatarSrc(img.getAttribute("src"));
        if (id) return id;
    }

    return null;
}

function getAuthorIdFromElement(el: HTMLElement): string | null {
    if (el.dataset.authorId) return el.dataset.authorId;
    if (el.dataset.userId) return el.dataset.userId;

    // Check DM channel links: a[href*='/channels/@me/']
    const channelLink = el.closest<HTMLAnchorElement>("a[href*='/channels/@me/']");
    if (channelLink) {
        const href = channelLink.getAttribute("href") || "";
        const m = href.match(/\/channels\/@me\/(\d+)/);
        if (m && ChannelStore) {
            try {
                const channel = ChannelStore.getChannel(m[1]);
                if (channel) {
                    const recId = channel.getRecipientId?.() || (Array.isArray(channel.recipients) && channel.recipients[0]);
                    if (recId) return String(recId);
                }
            } catch {}
        }
    }

    const insideListItem = el.closest<HTMLElement>(
        "[class*='message_'], [class*='member_'], [class*='peopleListItem'], [class*='listRow'], [class*='friend_'], [class*='channel_'], [role='listitem']"
    );

    // If this element is part of a profile card (and not inside a list/tab row), resolve the profile card owner
    if (!insideListItem && !el.closest(PROFILE_INNER_LIST_OR_TAB_SELECTOR)) {
        const profileCard = el.closest<HTMLElement>(PROFILE_CARD_SELECTOR);
        if (profileCard) {
            return getProfileCardOwnerId(profileCard);
        }
    }

    // Check React Fiber on the element itself first
    const selfFiberId = extractUserIdFromFiber(el);
    if (selfFiberId) return selfFiberId;

    if (insideListItem) {
        const itemFiberId = extractUserIdFromFiber(insideListItem);
        if (itemFiberId) return itemFiberId;

        const itemImg = insideListItem.querySelector<HTMLImageElement>("img[src*='/avatars/']");
        const itemImgId = extractUserIdFromAvatarSrc(itemImg?.getAttribute("src"));
        if (itemImgId) return itemImgId;
    }

    const directImg = el.querySelector<HTMLImageElement>("img[src*='/avatars/']");
    if (directImg && (insideListItem || !directImg.closest(PROFILE_INNER_LIST_OR_TAB_SELECTOR))) {
        const id = extractUserIdFromAvatarSrc(directImg.getAttribute("src"));
        if (id) return id;
    }

    const container = el.closest<HTMLElement>(
        "[class*='message_'], [class*='member_'], [class*='userPopout'], [class*='userProfile'], [class*='user-profile-popout'], [class*='outer_'], [class*='userInfo_'], [class*='peopleListItem'], [class*='channel_'], a[href*='/channels/@me/'], [class*='interactive_'], [role='listitem'], [role='dialog'], [class*='modalRoot'], [class*='root_']"
    );
    if (container && container !== el) {
        const containerFiberId = extractUserIdFromFiber(container);
        if (containerFiberId) return containerFiberId;
    }

    return null;
}

export function getElementRawText(el: HTMLElement): string {
    const raw =
        el.getAttribute("data-cpe-original-text") ||
        el.getAttribute("data-cpe-text") ||
        el.querySelector("[data-cpe-original-text]")?.getAttribute("data-cpe-original-text") ||
        el.getAttribute("data-username-with-effects") ||
        el.getAttribute("data-text") ||
        el.textContent ||
        "";
    return cleanDuplicateText(raw);
}

function isForbiddenElement(el: HTMLElement): boolean {
    // Ensure conversation headers (e.g. top of DM, chat headers) are NEVER treated as profile headers
    if (el.closest("[class*='chatContent_'] [class*='container_'], [class*='title_'][class*='container_'], [class*='chat_'] [class*='subtitleContainer_'], [class*='upperContainer_'], [class*='children_'] > [class*='title_']")) {
        return true;
    }

    const isProfileNameHeader =
        (el.matches("[class*='header__00de6'], [class*='heading-xxl'], [data-text-variant*='heading-xxl'], [data-text-variant*='heading-lg/bold'], [class*='displayName_'], [class*='displayNameRow_'], [class*='heading-lg'], [data-text-variant*='heading-lg']") ||
        !!el.closest("[class*='header__00de6'], [class*='heading-xxl'], [data-text-variant*='heading-xxl'], [class*='displayNameRow_']")) &&
        !el.closest("[class*='chat_'], [class*='chatContent_'], [class*='messagesWrapper_']");

    const tag = el.tagName.toLowerCase();
    if (!isProfileNameHeader && ["h1", "h2", "h3", "h4", "h5", "h6", "label", "p", "button", "input", "textarea", "svg", "path"].includes(tag)) {
        return true;
    }

    // Explicitly forbid username handles/tags (e.g. eaooe) and wrapper containers with discriminators
    if (
        el.matches("[class*='userTag_'], [class*='userTagUsername'], [class*='userTag'], [class*='discriminator_'], [class*='userTagDiscriminator_'], [class*='subText_'], [class*='nameTag_']") ||
        el.closest("[class*='userTag_'], [class*='userTagUsername'], [class*='userTag'], [class*='discriminator_'], [class*='userTagDiscriminator_'], [class*='subText_']")
    ) {
        return true;
    }

    // Disallow wrapper containers holding both username and discriminator directly
    if (el.querySelector("[class*='discriminator_'], [class*='userTagDiscriminator_']")) {
        return true;
    }

    const text = getElementRawText(el).toLowerCase();
    if (!text) return true;

    // Disallow common section headers
    const forbiddenTexts = [
        "bio", "about me", "à propos de moi",
        "member since", "membre depuis",
        "connections", "connexions",
        "note", "notes",
        "mutual servers", "serveurs en commun", "mutual guilds",
        "mutual friends", "amis en commun",
        "activity", "activité",
        "display name", "nom d'affichage",
        "pronouns", "pronoms",
        "user profile", "profil d'utilisateur"
    ];
    if (forbiddenTexts.includes(text)) return true;

    // Disallow section containers unless specifically display name / username
    if (el.matches("[class*='section_'], [class*='userInfoSection_'], [class*='tabBar_'], [class*='banner_']")) {
        return true;
    }

    return false;
}

export function getTargetNameElement(el: HTMLElement): HTMLElement {
    // If this element contains both a username and a discriminator (like in Friends List peopleListItem):
    // Target strictly the display name span!
    const usernameSpan = el.querySelector<HTMLElement>("[class*='username_']:not([class*='discriminator_'])");
    if (usernameSpan && el.querySelector("[class*='discriminator_'], [class*='userTagDiscriminator_']")) {
        return usernameSpan;
    }

    const decorated = el.querySelector<HTMLElement>("[data-username-with-effects], [class*='innerContainer_']");
    if (decorated) return decorated;
    let curr = el;
    while (
        curr.children.length === 1 &&
        curr.firstElementChild instanceof HTMLElement &&
        curr.firstElementChild.textContent?.trim() === el.textContent?.trim()
    ) {
        curr = curr.firstElementChild;
    }
    return curr;
}

interface TypewriterState {
    fullText: string;
    currentIndex: number;
    isDeleting: boolean;
    pauseUntil: number;
}

const activeTypewriters = new Map<HTMLElement, TypewriterState>();
let typewriterTimer: ReturnType<typeof setInterval> | null = null;

function findTextTargetElement(el: HTMLElement): HTMLElement {
    let curr = el;
    while (
        curr.children.length === 1 &&
        curr.firstElementChild instanceof HTMLElement &&
        curr.firstElementChild.textContent?.trim() === curr.textContent?.trim()
    ) {
        curr = curr.firstElementChild;
    }
    return curr;
}

function updateElementText(el: HTMLElement, text: string) {
    const safeText = text || "\u200B";
    const target = findTextTargetElement(el);

    if (target.children.length === 0) {
        target.textContent = safeText;
        return;
    }

    let updated = false;
    for (let i = 0; i < target.childNodes.length; i++) {
        const node = target.childNodes[i];
        if (node.nodeType === Node.TEXT_NODE) {
            node.nodeValue = safeText;
            updated = true;
            for (let j = target.childNodes.length - 1; j > i; j--) {
                if (target.childNodes[j].nodeType === Node.TEXT_NODE) {
                    target.removeChild(target.childNodes[j]);
                }
            }
            break;
        }
    }

    if (!updated) {
        let leaf = target;
        while (leaf.children.length > 0) {
            const childWithText = Array.from(leaf.children).find(
                c => c instanceof HTMLElement && c.textContent?.trim()
            ) as HTMLElement | undefined;
            if (childWithText) {
                leaf = childWithText;
            } else {
                break;
            }
        }
        leaf.textContent = safeText;
    }
}

function startTypewriterLoop() {
    if (typewriterTimer !== null) return;
    typewriterTimer = setInterval(() => {
        if (!active || activeTypewriters.size === 0) {
            stopTypewriterLoop();
            return;
        }

        const now = Date.now();
        for (const [el, state] of Array.from(activeTypewriters.entries())) {
            if (!el.isConnected) {
                activeTypewriters.delete(el);
                continue;
            }

            if (state.pauseUntil > now) continue;

            if (!state.isDeleting) {
                if (state.currentIndex < state.fullText.length) {
                    state.currentIndex++;
                    updateElementText(el, state.fullText.slice(0, state.currentIndex));
                    if (state.currentIndex === state.fullText.length) {
                        state.pauseUntil = now + 1800; // Pause 1.8s once full username is displayed
                    }
                } else {
                    state.isDeleting = true;
                }
            } else {
                if (state.currentIndex > 0) {
                    state.currentIndex--;
                    updateElementText(el, state.fullText.slice(0, state.currentIndex));
                    if (state.currentIndex === 0) {
                        state.pauseUntil = now + 600; // Pause 0.6s at empty cursor before re-typing
                    }
                } else {
                    state.isDeleting = false;
                }
            }
        }

        if (activeTypewriters.size === 0) {
            stopTypewriterLoop();
        }
    }, 90);
}

function stopTypewriterLoop() {
    if (typewriterTimer !== null) {
        clearInterval(typewriterTimer);
        typewriterTimer = null;
    }
}

export function removeNameEffectFromElement(nameEl: HTMLElement) {
    if (
        !nameEl.dataset.ncAppliedEffect &&
        !nameEl.classList.contains("cpe-glow") &&
        !nameEl.classList.contains("cpe-glitch") &&
        !nameEl.classList.contains("cpe-rainbow-letter") &&
        !nameEl.classList.contains("cpe-type-cursor") &&
        !nameEl.hasAttribute("data-cpe-font")
    ) {
        return;
    }
    delete nameEl.dataset.ncAppliedEffect;
    delete nameEl.dataset.ncGlowColor;
    nameEl.classList.remove(
        "cpe-glow", "cpe-glitch", "cpe-rainbow-letter", "cpe-type-cursor",
        "cpe-font-gothic", "cpe-font-signature", "cpe-font-pixel", "cpe-font-nerd", "cpe-font-cyberpunk", "cpe-font-handwritten"
    );
    nameEl.style.removeProperty("--cpe-glow-color");
    nameEl.style.removeProperty("color");
    nameEl.style.removeProperty("-webkit-text-fill-color");
    nameEl.style.removeProperty("background-image");
    nameEl.style.removeProperty("background");
    nameEl.style.removeProperty("-webkit-background-clip");
    nameEl.style.removeProperty("background-clip");
    nameEl.style.removeProperty("text-shadow");

    const innerDecorations = nameEl.querySelectorAll<HTMLElement>("[data-username-with-effects], [class*='innerContainer_'], span");
    for (const inn of Array.from(innerDecorations)) {
        inn.style.removeProperty("color");
        inn.style.removeProperty("-webkit-text-fill-color");
        inn.style.removeProperty("background-image");
        inn.style.removeProperty("background");
        inn.style.removeProperty("-webkit-background-clip");
        inn.style.removeProperty("background-clip");
    }

    const parentUsername = nameEl.closest<HTMLElement>("[class*='username_']");
    if (parentUsername && parentUsername !== nameEl) {
        parentUsername.style.removeProperty("color");
        parentUsername.style.removeProperty("-webkit-text-fill-color");
    }

    if (activeTypewriters.has(nameEl)) {
        const state = activeTypewriters.get(nameEl);
        if (state) {
            const originalText = cleanDuplicateText(nameEl.getAttribute("data-cpe-original-text") || state.fullText);
            updateElementText(nameEl, originalText);
        }
        nameEl.removeAttribute("data-cpe-original-text");
        activeTypewriters.delete(nameEl);
        if (activeTypewriters.size === 0) {
            stopTypewriterLoop();
        }
    } else {
        const originalText = nameEl.getAttribute("data-cpe-original-text");
        if (originalText) {
            updateElementText(nameEl, cleanDuplicateText(originalText));
            nameEl.removeAttribute("data-cpe-original-text");
        }
    }
}

export function applyNameEffectToElement(nameEl: HTMLElement, effectType: string, glowColor = "#a78bfa") {
    if (!effectType || effectType === "none" || isForbiddenElement(nameEl)) {
        removeNameEffectFromElement(nameEl);
        return;
    }

    const currentText = getElementRawText(nameEl);
    if (!currentText) {
        removeNameEffectFromElement(nameEl);
        return;
    }

    const alreadyApplied =
        nameEl.dataset.ncAppliedEffect === effectType &&
        nameEl.dataset.ncGlowColor === glowColor &&
        (effectType === "type"
            ? activeTypewriters.has(nameEl)
            : effectType === "glitch"
                ? nameEl.getAttribute("data-cpe-text") === currentText
                : ["gothic", "signature", "pixel", "nerd", "cyberpunk", "handwritten"].includes(effectType)
                    ? nameEl.getAttribute("data-cpe-font") === effectType
                    : true);
    if (alreadyApplied) {
        return;
    }

    if (effectType !== "type" && activeTypewriters.has(nameEl)) {
        const state = activeTypewriters.get(nameEl);
        if (state) {
            updateElementText(nameEl, cleanDuplicateText(state.fullText));
        }
        nameEl.removeAttribute("data-cpe-original-text");
        activeTypewriters.delete(nameEl);
        if (activeTypewriters.size === 0) {
            stopTypewriterLoop();
        }
    }

    nameEl.dataset.ncAppliedEffect = effectType;
    nameEl.dataset.ncGlowColor = glowColor;

    nameEl.classList.remove(
        "cpe-glow", "cpe-glitch", "cpe-rainbow-letter", "cpe-type-cursor",
        "cpe-font-gothic", "cpe-font-signature", "cpe-font-pixel", "cpe-font-nerd", "cpe-font-cyberpunk", "cpe-font-handwritten"
    );
    nameEl.removeAttribute("data-cpe-text");
    nameEl.removeAttribute("data-cpe-font");
    if (effectType === "glow") {
        nameEl.classList.add("cpe-glow");
        nameEl.style.setProperty("--cpe-glow-color", glowColor);
        nameEl.style.setProperty("color", glowColor, "important");
        nameEl.style.setProperty("-webkit-text-fill-color", glowColor, "important");
        nameEl.style.setProperty("background-image", "none", "important");
        nameEl.style.setProperty("background", "transparent", "important");
        nameEl.style.setProperty("-webkit-background-clip", "border-box", "important");
        nameEl.style.setProperty("background-clip", "border-box", "important");
        nameEl.style.setProperty("text-shadow", `0 0 2px rgba(0, 0, 0, 0.7), 0 0 5px ${glowColor}`, "important");

        const innerDecorations = nameEl.querySelectorAll<HTMLElement>("[data-username-with-effects], [class*='innerContainer_'], span");
        for (const inn of Array.from(innerDecorations)) {
            inn.style.setProperty("color", glowColor, "important");
            inn.style.setProperty("-webkit-text-fill-color", glowColor, "important");
            inn.style.setProperty("background-image", "none", "important");
            inn.style.setProperty("background", "transparent", "important");
            inn.style.setProperty("-webkit-background-clip", "border-box", "important");
            inn.style.setProperty("background-clip", "border-box", "important");
        }

        const parentUsername = nameEl.closest<HTMLElement>("[class*='username_']");
        if (parentUsername && parentUsername !== nameEl) {
            parentUsername.style.setProperty("color", glowColor, "important");
            parentUsername.style.setProperty("-webkit-text-fill-color", glowColor, "important");
        }
    } else if (effectType === "glitch") {
        nameEl.classList.add("cpe-glitch");
        nameEl.setAttribute("data-cpe-text", currentText);
    } else if (effectType === "rainbow") {
        nameEl.classList.add("cpe-rainbow-letter");
    } else if (effectType === "type") {
        nameEl.classList.add("cpe-type-cursor");
        if (!activeTypewriters.has(nameEl)) {
            const fullText = cleanDuplicateText(nameEl.getAttribute("data-cpe-original-text") || currentText);
            nameEl.setAttribute("data-cpe-original-text", fullText);
            activeTypewriters.set(nameEl, {
                fullText,
                currentIndex: fullText.length,
                isDeleting: false,
                pauseUntil: Date.now() + 1800
            });
            startTypewriterLoop();
        }
    } else if (["gothic", "signature", "pixel", "nerd", "cyberpunk", "handwritten"].includes(effectType)) {
        nameEl.setAttribute("data-cpe-font", effectType);
        nameEl.classList.add(`cpe-font-${effectType}`);
    }
}

const GOOGLE_FONTS_URL = "https://fonts.googleapis.com/css2?family=Alex+Brush&family=Caveat:wght@500;600;700&family=Cinzel:wght@600;800&family=Comfortaa:wght@600;700&family=Creepster&family=Dancing+Script:wght@600;700&family=JetBrains+Mono:wght@500;700&family=Monoton&family=Orbitron:wght@600;800&family=Pacifico&family=Playfair+Display:wght@600;700&family=Poppins:wght@400;600;700&family=Press+Start+2P&family=Righteous&family=Roboto+Mono:wght@400;600&family=UnifrakturMaguntia&display=swap";

export function ensureProfileFontsLoaded() {
    if (typeof document === "undefined") return;
    if (document.getElementById("lolicord-custom-profile-fonts")) return;
    const link = document.createElement("link");
    link.id = "lolicord-custom-profile-fonts";
    link.rel = "stylesheet";
    link.href = GOOGLE_FONTS_URL;
    document.head.appendChild(link);
}

function applyProfileFont(el: HTMLElement, font: string) {
    const current = el.getAttribute("data-nc-profile-font") || "none";
    const target = (font && font !== "none") ? font : "none";
    if (current === target) return;

    if (target !== "none") {
        el.setAttribute("data-nc-profile-font", target);
        const inners = el.querySelectorAll<HTMLElement>("[class*='profileContentInner_'], [class*='inner_'], [class*='userInfo_']");
        for (const inn of Array.from(inners)) inn.setAttribute("data-nc-profile-font", target);
        const outer = el.closest<HTMLElement>(
            "[class*='userProfileOuter'], [class*='userProfileModalOuter'], [class*='userPopout'], [class*='user-profile-popout'], [class*='themeContainer_'], [class*='outer_']"
        );
        if (outer && outer !== el) outer.setAttribute("data-nc-profile-font", target);
    } else {
        el.removeAttribute("data-nc-profile-font");
        const inners = el.querySelectorAll<HTMLElement>("[data-nc-profile-font]");
        for (const inn of Array.from(inners)) inn.removeAttribute("data-nc-profile-font");
        const outer = el.closest<HTMLElement>(
            "[class*='userProfileOuter'], [class*='userProfileModalOuter'], [class*='userPopout'], [class*='user-profile-popout'], [class*='themeContainer_'], [class*='outer_']"
        );
        if (outer && outer !== el) outer.removeAttribute("data-nc-profile-font");
    }
}

async function injectBackground(profileEl: HTMLElement, _config: ProfileEffectsConfig) {
    profileEl.querySelector(".cpe-bg-layer")?.remove();
}

export function scanAndApplyEffects() {
    if (!active || (typeof document !== "undefined" && document.hidden)) return;

    const settings = getCachedPremiumSettings();
    if (!settings.enabled) return;

    const curUser = UserStore.getCurrentUser();
    if (!curUser?.id) return;

    const ownConfig = getCachedEffectsConfig();
    const selfEffectsActive = !!settings.profileEffectsEnabled ||
        (ownConfig.nameEffect && ownConfig.nameEffect !== "none") ||
        (ownConfig.profileFont && ownConfig.profileFont !== "none") ||
        !!ownConfig.showBanner;

    const userNames = new Set<string>();
    if (curUser.username) userNames.add(curUser.username.trim().toLowerCase());
    if (curUser.globalName) userNames.add(curUser.globalName.trim().toLowerCase());
    if ((curUser as any).displayName) userNames.add(String((curUser as any).displayName).trim().toLowerCase());
    try {
        const curGuildId = SelectedGuildStore?.getGuildId?.();
        if (curGuildId) {
            const nick = GuildMemberStore?.getNick?.(curGuildId, curUser.id);
            if (nick) userNames.add(nick.trim().toLowerCase());
        }
    } catch {}

    // 0. Active Cleanup: Strip effects from any forbidden headings/labels/userTags
    const allApplied = document.querySelectorAll<HTMLElement>(
        "[data-nc-applied-effect], [data-cpe-font], [class*='cpe-font-'], .cpe-glitch, .cpe-glow, .cpe-rainbow-letter, .cpe-type-cursor"
    );
    for (const el of Array.from(allApplied)) {
        if (isForbiddenElement(el)) {
            removeNameEffectFromElement(el);
        }
    }

    // 1. All Display Names across Discord (Settings preview sizer, Account popout menu, User popouts, Profile modals)
    const allDisplayNames = document.querySelectorAll<HTMLElement>(
        "[class*='displayNameContent_'], [class*='displayName_'], [class*='header__00de6'], [class*='heading-xxl'], [data-text-variant*='heading-xxl']"
    );
    for (const el of Array.from(allDisplayNames)) {
        if (isForbiddenElement(el)) {
            removeNameEffectFromElement(el);
            continue;
        }

        const authorId = getAuthorIdFromElement(el);
        const txt = getElementRawText(el).toLowerCase();
        const isAccountOrSizer = !!el.closest("[id='account'], [class*='accountProfile'], [class*='sizer_']");
        const isSelf = isAccountOrSizer || (authorId ? authorId === curUser.id : (!!txt && userNames.has(txt)));

        const targetEl = getTargetNameElement(el);

        if (isSelf) {
            if (selfEffectsActive && ownConfig.nameEffect && ownConfig.nameEffect !== "none") {
                applyNameEffectToElement(targetEl, ownConfig.nameEffect, ownConfig.glowColor);
            } else {
                removeNameEffectFromElement(targetEl);
            }
        } else if (authorId) {
            const cached = profileCache.get(authorId);
            if (cached && cached.data?.effects?.nameEffect && cached.data.effects.nameEffect !== "none") {
                applyNameEffectToElement(targetEl, cached.data.effects.nameEffect, cached.data.effects.glowColor);
            } else if (!cached) {
                void readUserPremiumData(authorId).then(data => {
                    if (data?.effects?.nameEffect && data.effects.nameEffect !== "none") {
                        applyNameEffectToElement(targetEl, data.effects.nameEffect, data.effects.glowColor);
                    }
                });
            }
        }
    }

    // 2. Profile Popouts, Modals and Live Previews (Banners, Nicknames & Profile Fonts)
    const profileElements = document.querySelectorAll<HTMLElement>(
        `${PROFILE_CARD_SELECTOR}, [class*='preview_']`
    );

    const processedContainers = new Set<HTMLElement>();
    for (const rawEl of Array.from(profileElements)) {
        if (rawEl.closest(PROFILE_INNER_LIST_OR_TAB_SELECTOR)) {
            rawEl.querySelector(".nc-profile-drawing-overlay")?.remove();
            continue;
        }

        let el = rawEl.closest<HTMLElement>(PROFILE_CARD_SELECTOR) || rawEl;
        while (el.parentElement) {
            const outerMatch = el.parentElement.closest<HTMLElement>(PROFILE_CARD_SELECTOR);
            if (!outerMatch || outerMatch.closest("[class*='content__523e1'], [class*='scroller__523e1']")) break;
            el = outerMatch;
        }

        if (el.closest(PROFILE_INNER_LIST_OR_TAB_SELECTOR)) {
            el.querySelector(".nc-profile-drawing-overlay")?.remove();
            continue;
        }

        if (processedContainers.has(el)) continue;
        processedContainers.add(el);

        // Clean up any stray drawing overlays that might have been placed inside inner tab panels or list rows
        for (const strayCanvas of Array.from(el.querySelectorAll<HTMLElement>(".nc-profile-drawing-overlay"))) {
            if (strayCanvas.parentElement !== el || strayCanvas.closest(PROFILE_INNER_LIST_OR_TAB_SELECTOR)) {
                if (!strayCanvas.classList.contains("nc-profile-drawing-interactive")) {
                    strayCanvas.remove();
                }
            }
        }

        const authorId = getProfileCardOwnerId(el);
        const rawNameEls = el.querySelectorAll<HTMLElement>(
            "[class*='header__00de6'], [class*='heading-xxl'], [data-text-variant*='heading-xxl'], [data-text-variant*='heading-lg/bold'], [class*='displayNameContent_'], [class*='displayName_'], [class*='nickname'], [class*='globalName']"
        );
        const nameEls = Array.from(rawNameEls).filter(n => !n.closest(PROFILE_INNER_LIST_OR_TAB_SELECTOR));

        let hasOwnName = false;
        for (const n of nameEls) {
            const txt = getElementRawText(n).toLowerCase();
            if (txt && userNames.has(txt)) {
                hasOwnName = true;
                break;
            }
        }

        const isAccountOrPreview = !!el.closest("[id='account'], [class*='accountProfile'], [class*='preview_'], [class*='profileCustomizationPreview']");
        const isSelf = isAccountOrPreview || (authorId ? authorId === curUser.id : hasOwnName);

        if (isSelf) {
            const targetFont = (selfEffectsActive && ownConfig.profileFont) ? ownConfig.profileFont : "none";
            applyProfileFont(el, targetFont);

            if (ownConfig.profileDrawing && ownConfig.profileDrawing.enabled && ownConfig.profileDrawing.strokes?.length > 0) {
                renderDrawingOverlay(el, ownConfig.profileDrawing);
            } else if (!isDrawingModeActive()) {
                el.querySelector(".nc-profile-drawing-overlay:not(.nc-profile-drawing-interactive)")?.remove();
            }

            if (selfEffectsActive) {
                void injectBackground(el, ownConfig);
                for (const n of nameEls) {
                    if (isForbiddenElement(n)) {
                        removeNameEffectFromElement(n);
                        continue;
                    }
                    const targetEl = getTargetNameElement(n);
                    if (ownConfig.nameEffect && ownConfig.nameEffect !== "none") {
                        applyNameEffectToElement(targetEl, ownConfig.nameEffect, ownConfig.glowColor);
                    } else {
                        removeNameEffectFromElement(targetEl);
                    }
                }
            } else {
                el.querySelector(".cpe-bg-layer")?.remove();
                for (const n of nameEls) {
                    removeNameEffectFromElement(getTargetNameElement(n));
                }
            }
        } else if (authorId) {
            const cached = profileCache.get(authorId);
            if (cached && cached.data?.effects) {
                applyProfileFont(el, cached.data.effects.profileFont || "none");
                if (cached.data.effects.showBanner) void injectBackground(el, cached.data.effects);
                if (cached.data.effects.profileDrawing && cached.data.effects.profileDrawing.enabled && cached.data.effects.profileDrawing.strokes?.length > 0) {
                    renderDrawingOverlay(el, cached.data.effects.profileDrawing);
                } else {
                    el.querySelector(".nc-profile-drawing-overlay")?.remove();
                }
                if (cached.data.effects.nameEffect && cached.data.effects.nameEffect !== "none") {
                    for (const n of nameEls) {
                        if (!isForbiddenElement(n)) {
                            applyNameEffectToElement(getTargetNameElement(n), cached.data.effects.nameEffect, cached.data.effects.glowColor);
                        }
                    }
                } else {
                    for (const n of nameEls) {
                        removeNameEffectFromElement(getTargetNameElement(n));
                    }
                }
            } else if (cached) {
                applyProfileFont(el, "none");
                el.querySelector(".nc-profile-drawing-overlay")?.remove();
            } else if (!cached) {
                void readUserPremiumData(authorId).then(data => {
                    if (!el.isConnected || getProfileCardOwnerId(el) !== authorId) return;
                    if (!data?.effects) {
                        applyProfileFont(el, "none");
                        el.querySelector(".nc-profile-drawing-overlay")?.remove();
                        return;
                    }
                    applyProfileFont(el, data.effects.profileFont || "none");
                    if (data.effects.showBanner) void injectBackground(el, data.effects);
                    if (data.effects.profileDrawing && data.effects.profileDrawing.enabled && data.effects.profileDrawing.strokes?.length > 0) {
                        renderDrawingOverlay(el, data.effects.profileDrawing);
                    } else {
                        el.querySelector(".nc-profile-drawing-overlay")?.remove();
                    }
                    if (data.effects.nameEffect && data.effects.nameEffect !== "none") {
                        for (const n of nameEls) {
                            if (!isForbiddenElement(n)) {
                                applyNameEffectToElement(getTargetNameElement(n), data.effects.nameEffect, data.effects.glowColor);
                            }
                        }
                    }
                });
            }
        } else {
            // Unknown non-self profile card: ensure no stale drawing overlay remains
            if (!isDrawingModeActive()) {
                el.querySelector(".nc-profile-drawing-overlay:not(.nc-profile-drawing-interactive)")?.remove();
            }
        }
    }

    // 3. Bottom-Left Current User Bar
    const currentUserBar = document.querySelectorAll<HTMLElement>(
        "[class*='panels_'] [class*='title_'], [class*='panels_'] [class*='nameTag_'] [class*='title_'], [class*='panels_'] [class*='displayName_']"
    );
    for (const el of Array.from(currentUserBar)) {
        if (isForbiddenElement(el)) {
            removeNameEffectFromElement(el);
            continue;
        }
        const targetEl = getTargetNameElement(el);
        if (selfEffectsActive && ownConfig.nameEffect && ownConfig.nameEffect !== "none") {
            applyNameEffectToElement(targetEl, ownConfig.nameEffect, ownConfig.glowColor);
        } else {
            removeNameEffectFromElement(targetEl);
        }
    }

    // 4. Chat Usernames & Decorators (strictly inside messages!)
    const chatNames = document.querySelectorAll<HTMLElement>(
        "[class*='message_'] [class*='username_'], " +
        "[class*='message_'] [id^='message-username-'], " +
        "[class*='message_'] [class*='usernameFont_'], " +
        "[class*='message_'] [class*='innerContainer_'], " +
        "[class*='message_'] [data-username-with-effects]"
    );
    for (const el of Array.from(chatNames)) {
        if (el.closest("[class*='userProfileOuter'], [class*='userProfileModalOuter'], [class*='userPopout'], [class*='user-profile-popout'], [class*='themeContainer_'], [class*='biteSize_'], [class*='panels_'], [id='account'], [class*='accountProfile'], [class*='peopleListItem_'], [class*='member_'], [role='listitem']")) {
            continue;
        }
        if (isForbiddenElement(el)) {
            removeNameEffectFromElement(el);
            continue;
        }
        // Skip outer message wrappers if they contain another username element; we only style the inner target!
        if (el.querySelector("[class*='username_'], [class*='usernameFont_'], [id^='message-username-']")) {
            continue;
        }
        // If an ancestor already has effect, don't nest effects on inner spans
        const parentEffect = el.parentElement?.closest("[data-nc-applied-effect], [data-cpe-font], [class*='cpe-font-'], .cpe-glitch, .cpe-glow, .cpe-rainbow-letter, .cpe-type-cursor");
        if (parentEffect) {
            removeNameEffectFromElement(el);
            continue;
        }
        if (el.querySelector("[class*='innerContainer_'], [data-username-with-effects]")) {
            removeNameEffectFromElement(el);
            continue;
        }

        const targetEl = getTargetNameElement(el);
        const authorId = getAuthorIdFromElement(el);
        const txt = getElementRawText(el).toLowerCase();
        const isSelf = authorId ? authorId === curUser.id : (!!txt && userNames.has(txt));

        if (isSelf) {
            const effect = (ownConfig.chatUsernameEffect && ownConfig.chatUsernameEffect !== "none")
                ? ownConfig.chatUsernameEffect
                : ownConfig.nameEffect;
            if (selfEffectsActive && effect && effect !== "none") {
                applyNameEffectToElement(targetEl, effect, ownConfig.glowColor);
            } else {
                removeNameEffectFromElement(targetEl);
            }
        } else if (authorId) {
            const cached = profileCache.get(authorId);
            if (cached && cached.data?.effects) {
                const effect = cached.data.effects.chatUsernameEffect || cached.data.effects.nameEffect;
                if (effect && effect !== "none") {
                    applyNameEffectToElement(targetEl, effect, cached.data.effects.glowColor);
                } else {
                    removeNameEffectFromElement(targetEl);
                }
            } else if (!cached) {
                void readUserPremiumData(authorId).then(data => {
                    if (data?.effects) {
                        const effect = data.effects.chatUsernameEffect || data.effects.nameEffect;
                        if (effect && effect !== "none") {
                            applyNameEffectToElement(targetEl, effect, data.effects.glowColor);
                        }
                    }
                });
            }
        }
    }

    // 5. Member List & Friends List
    const memberNames = document.querySelectorAll<HTMLElement>(
        "[class*='member_'] [class*='name_']:not([class*='nameTag_']), " +
        "[class*='member_'] [class*='username_']:not([class*='discriminator_']), " +
        "[class*='peopleListItem_'] [class*='username_']:not([class*='discriminator_']), " +
        "[role='listitem'] [class*='username_']:not([class*='discriminator_'])"
    );
    for (const el of Array.from(memberNames)) {
        if (isForbiddenElement(el)) {
            removeNameEffectFromElement(el);
            continue;
        }

        const memberItem = el.closest<HTMLElement>("[class*='member_'], [class*='peopleListItem_'], [role='listitem']") || el;
        const authorId = getAuthorIdFromElement(memberItem) || getAuthorIdFromElement(el);
        const txt = getElementRawText(el).toLowerCase();
        const isSelf = authorId ? authorId === curUser.id : (!!txt && userNames.has(txt));
        const targetEl = getTargetNameElement(el);

        if (isSelf) {
            const effect = (ownConfig.memberListEffect && ownConfig.memberListEffect !== "none")
                ? ownConfig.memberListEffect
                : ownConfig.nameEffect;
            if (selfEffectsActive && effect && effect !== "none") {
                applyNameEffectToElement(targetEl, effect, ownConfig.glowColor);
            } else {
                removeNameEffectFromElement(targetEl);
            }
        } else if (authorId) {
            const cached = profileCache.get(authorId);
            if (cached && cached.data?.effects) {
                const effect = cached.data.effects.memberListEffect || cached.data.effects.nameEffect;
                if (effect && effect !== "none") {
                    applyNameEffectToElement(targetEl, effect, cached.data.effects.glowColor);
                } else {
                    removeNameEffectFromElement(targetEl);
                }
            } else if (!cached) {
                void readUserPremiumData(authorId).then(data => {
                    if (data?.effects) {
                        const effect = data.effects.memberListEffect || data.effects.nameEffect;
                        if (effect && effect !== "none") {
                            applyNameEffectToElement(targetEl, effect, data.effects.glowColor);
                        }
                    }
                });
            }
        }
    }

    // 6. Direct Messages (DM) Channel List
    const dmNames = document.querySelectorAll<HTMLElement>(
        "[class*='privateChannels_'] [class*='overflowTooltip_'], " +
        "[class*='privateChannels_'] [class*='overflow_'], " +
        "[class*='privateChannels_'] [class*='name__'], " +
        "a[href^='/channels/@me/'] [class*='overflowTooltip_'], " +
        "a[href^='/channels/@me/'] [class*='overflow_'], " +
        "a[href^='/channels/@me/'] [class*='name__']"
    );
    for (const el of Array.from(dmNames)) {
        if (isForbiddenElement(el)) {
            removeNameEffectFromElement(el);
            continue;
        }
        if (el.querySelector("[class*='overflowTooltip_'], [class*='overflow_']")) {
            continue;
        }
        const parentEffect = el.parentElement?.closest("[data-nc-applied-effect], [data-cpe-font], [class*='cpe-font-'], .cpe-glitch, .cpe-glow, .cpe-rainbow-letter, .cpe-type-cursor");
        if (parentEffect) {
            removeNameEffectFromElement(el);
            continue;
        }

        const targetEl = getTargetNameElement(el);
        const channelItem = el.closest<HTMLElement>("a[href^='/channels/@me/'], [class*='channel_'], [class*='interactive_']") || el;
        const authorId = getAuthorIdFromElement(channelItem) || getAuthorIdFromElement(el);
        const txt = getElementRawText(el).toLowerCase();
        const isSelf = authorId ? authorId === curUser.id : (!!txt && userNames.has(txt));

        if (isSelf) {
            const effect = (ownConfig.memberListEffect && ownConfig.memberListEffect !== "none")
                ? ownConfig.memberListEffect
                : ownConfig.nameEffect;
            if (selfEffectsActive && effect && effect !== "none") {
                applyNameEffectToElement(targetEl, effect, ownConfig.glowColor);
            } else {
                removeNameEffectFromElement(targetEl);
            }
        } else if (authorId) {
            const cached = profileCache.get(authorId);
            if (cached && cached.data?.effects) {
                const effect = cached.data.effects.memberListEffect || cached.data.effects.nameEffect;
                if (effect && effect !== "none") {
                    applyNameEffectToElement(targetEl, effect, cached.data.effects.glowColor);
                } else {
                    removeNameEffectFromElement(targetEl);
                }
            } else if (!cached) {
                void readUserPremiumData(authorId).then(data => {
                    if (data?.effects) {
                        const effect = data.effects.memberListEffect || data.effects.nameEffect;
                        if (effect && effect !== "none") {
                            applyNameEffectToElement(targetEl, effect, data.effects.glowColor);
                        }
                    }
                });
            }
        }
    }
}

export function triggerEffectsUpdate() {
    if (!active) {
        startProfileEffects();
    }
    if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
    }
    scanAndApplyEffects();
}

function debouncedScan() {
    if (!active || (typeof document !== "undefined" && document.hidden)) return;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
        scanAndApplyEffects();
    }, 35);
}

function onConnectionOpen() {
    triggerEffectsUpdate();
}

function onDocumentPointerDown(e: MouseEvent) {
    if (!active) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Check if clicked element relates to an avatar, username or member item to prefetch immediately
    const userEl = target.closest<HTMLElement>(
        "img[src*='/avatars/'], [class*='avatar'], [class*='username'], [class*='member_'], [class*='peopleListItem_'], [class*='message_'], [class*='wrapper_'][role='img'], [role='listitem']"
    );
    if (userEl) {
        const curUser = UserStore.getCurrentUser();
        const userId = getAuthorIdFromElement(userEl);
        if (userId && userId !== curUser?.id) {
            void readUserPremiumData(userId);
        }
    }

    // Trigger instant scanning
    requestAnimationFrame(() => scanAndApplyEffects());
    setTimeout(() => scanAndApplyEffects(), 20);
}

function onDocumentClick() {
    if (!active) return;
    requestAnimationFrame(() => scanAndApplyEffects());
    setTimeout(() => scanAndApplyEffects(), 16);
    setTimeout(() => scanAndApplyEffects(), 50);
}

function onUserProfileModalOpen(action: any) {
    if (!active) return;
    const curUser = UserStore.getCurrentUser();
    if (action?.userId && action.userId !== curUser?.id) {
        void readUserPremiumData(action.userId);
    }
    scanAndApplyEffects();
    requestAnimationFrame(() => scanAndApplyEffects());
    setTimeout(() => scanAndApplyEffects(), 25);
    setTimeout(() => scanAndApplyEffects(), 80);
}

function onModalPush() {
    if (!active) return;
    scanAndApplyEffects();
    requestAnimationFrame(() => scanAndApplyEffects());
    setTimeout(() => scanAndApplyEffects(), 25);
}

export function startProfileEffects() {
    if (active) return;
    active = true;

    ensureProfileFontsLoaded();

    observer = new MutationObserver(mutations => {
        let hasProfileMutation = false;
        for (let i = 0; i < mutations.length; i++) {
            const m = mutations[i];
            for (let j = 0; j < m.addedNodes.length; j++) {
                const node = m.addedNodes[j];
                if (node instanceof HTMLElement) {
                    if (
                        node.matches?.("[class*='userProfile'], [class*='userPopout'], [class*='user-profile-popout'], [class*='themeContainer'], [class*='outer_'], [class*='profileContentInner'], [class*='modalRoot'], [role='dialog'], [class*='biteSize'], [class*='fullSize'], [class*='displayName']") ||
                        node.querySelector?.("[class*='userProfile'], [class*='userPopout'], [class*='user-profile-popout'], [class*='themeContainer'], [class*='outer_'], [class*='profileContentInner'], [class*='biteSize'], [class*='fullSize'], [class*='displayName']")
                    ) {
                        hasProfileMutation = true;
                        break;
                    }
                }
            }
            if (hasProfileMutation) break;
        }

        if (hasProfileMutation) {
            scanAndApplyEffects();
            requestAnimationFrame(() => scanAndApplyEffects());
        } else {
            debouncedScan();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    try {
        FluxDispatcher.subscribe("CONNECTION_OPEN", onConnectionOpen);
        FluxDispatcher.subscribe("CURRENT_USER_UPDATE", onConnectionOpen);
        FluxDispatcher.subscribe("USER_PROFILE_MODAL_OPEN", onUserProfileModalOpen);
        FluxDispatcher.subscribe("USER_POPOUT_OPEN", onUserProfileModalOpen);
        FluxDispatcher.subscribe("MODAL_PUSH", onModalPush);
        FluxDispatcher.subscribe("CHANNEL_SELECT", debouncedScan);
        FluxDispatcher.subscribe("PASSIVE_UPDATE_V2", debouncedScan);
    } catch {}

    if (typeof document !== "undefined") {
        document.addEventListener("mousedown", onDocumentPointerDown, true);
        document.addEventListener("click", onDocumentClick, true);
    }

    startDrawingInjector();
    triggerEffectsUpdate();
}

export function stopProfileEffects() {
    active = false;
    stopDrawingInjector();
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
    }
    stopTypewriterLoop();
    for (const [el, state] of Array.from(activeTypewriters.entries())) {
        if (el.isConnected) {
            updateElementText(el, state.fullText);
            el.removeAttribute("data-cpe-original-text");
        }
    }
    activeTypewriters.clear();

    try {
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", onConnectionOpen);
        FluxDispatcher.unsubscribe("CURRENT_USER_UPDATE", onConnectionOpen);
        FluxDispatcher.unsubscribe("USER_PROFILE_MODAL_OPEN", onUserProfileModalOpen);
        FluxDispatcher.unsubscribe("USER_POPOUT_OPEN", onUserProfileModalOpen);
        FluxDispatcher.unsubscribe("MODAL_PUSH", onModalPush);
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", debouncedScan);
        FluxDispatcher.unsubscribe("PASSIVE_UPDATE_V2", debouncedScan);
    } catch {}

    if (typeof document !== "undefined") {
        document.removeEventListener("mousedown", onDocumentPointerDown, true);
        document.removeEventListener("click", onDocumentClick, true);
        document.querySelectorAll("[data-nc-profile-font]").forEach(el => {
            el.removeAttribute("data-nc-profile-font");
        });
    }

    document.querySelectorAll(".cpe-bg-layer").forEach(el => el.remove());
    document.querySelectorAll(".nc-profile-drawing-overlay").forEach(el => el.remove());
    document.querySelectorAll("[data-nc-applied-effect], [data-cpe-font], [class*='cpe-font-'], .cpe-glow, .cpe-glitch, .cpe-rainbow-letter, .cpe-type-cursor").forEach(el => {
        removeNameEffectFromElement(el as HTMLElement);
    });
}

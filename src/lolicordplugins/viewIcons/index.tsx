/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * LoliCord, a modification for Discord's desktop app
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

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { ImageIcon } from "@components/Icons";
import { copyMediaImage, isVideoUrl, normalizeDiscordMediaUrl, resolveDiscordMedia, saveMediaFile } from "@plugins/fileUpload/utils/getMediaUrl";
import { copyToClipboard } from "@utils/clipboard";
import { Devs } from "@utils/constants";
import { openImageModal } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel, Guild, User } from "@vencord/discord-types";
import { ContextMenuApi, GuildMemberStore, IconUtils, Menu, Toasts, UserProfileStore } from "@webpack/common";
import { t } from "../autoTranslateLoliCord";

interface UserContextProps {
    channel: Channel;
    guildId?: string;
    user: User;
}

interface GuildContextProps {
    guild?: Guild;
}

interface GroupDMContextProps {
    channel: Channel;
}

const settings = definePluginSettings({
    format: {
        type: OptionType.SELECT,
        description: "Choose the image format to use for non animated images. Animated images will always use .gif",
        options: [
            {
                label: "webp",
                value: "webp",
                default: true
            },
            {
                label: "png",
                value: "png",
            },
            {
                label: "jpg",
                value: "jpg",
            }
        ]
    },
    imgSize: {
        type: OptionType.SELECT,
        description: "The image size to use",
        options: ["128", "256", "512", "1024", "2048", "4096"].map(n => ({ label: n, value: n, default: n === "1024" }))
    }
});

const openAvatar = (url: string) => openImage(url, 512, 512);
const openBanner = (url: string) => openImage(url, 1024, 410);

function openImage(url: string, width: number, height?: number) {
    if (!url) return;

    if (url.startsWith("data:")) {
        openImageModal({
            url,
            original: url,
            width,
            height
        });
        return;
    }

    try {
        const u = new URL(url, window.location.href);

        const isAnimated = u.searchParams.get("animated") === "true" || u.pathname.includes("/a_");
        const format = url.startsWith("/")
            ? "png"
            : isAnimated
                ? "gif"
                : settings.store.format;

        u.searchParams.set("size", settings.store.imgSize);
        u.pathname = u.pathname.replace(/\.(png|jpe?g|webp)$/, `.${format}`);
        const finalUrl = u.toString();

        u.searchParams.set("size", "4096");
        const original = u.toString();

        openImageModal({
            url: finalUrl,
            original,
            width,
            height
        });
    } catch {
        openImageModal({
            url,
            original: url,
            width,
            height
        });
    }
}

import { iconsModule } from "@plugins/_core/concatenatedModules";

const SaveFallbackIcon = () => (
    <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24">
        <path fill="currentColor" d="M12 2a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V3a1 1 0 0 1 1-1ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z" />
    </svg>
);

function hasMenuItem(node: any, ids: string[], labels: string[] = []): boolean {
    if (!node) return false;
    if (Array.isArray(node)) {
        return node.some(item => hasMenuItem(item, ids, labels));
    }
    if (typeof node === "object") {
        const id = node.props?.id ?? node.key;
        if (typeof id === "string" && ids.some(targetId => id === targetId || id.includes(targetId))) {
            return true;
        }
        const label = node.props?.label;
        if (typeof label === "string" && labels.includes(label)) {
            return true;
        }
        if (node.props?.children) {
            return hasMenuItem(node.props.children, ids, labels);
        }
    }
    return false;
}

const mediaDownloadContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!props) return;
    const media = resolveDiscordMedia(props);
    if (!media?.url) return;

    const alreadyHasSave = Boolean(
        findGroupChildrenByChildId(["save-image", "fastpfp-save-image", "fastpfp-save-image-msg", "viewicons-save-media"], children, true) ||
        hasMenuItem(
            children,
            ["save-image", "fastpfp-save-image", "fastpfp-save-image-msg", "viewicons-save-media"],
            ["Save Image", t("Save Image"), "Save Video", t("Save Video")]
        )
    );
    if (alreadyHasSave) return;

    // For standard non-blob images in chat where Discord already provides native media link options,
    // Discord already renders its own Copy Image / Save Image with icons.
    const hasNativeImageGroup = Boolean(
        findGroupChildrenByChildId(["copy-native-link", "open-native-link"], children, true)
    );
    if (!media.isVideo && hasNativeImageGroup && !media.url.startsWith("blob:") && !media.url.startsWith("data:")) {
        return;
    }

    const alreadyHasCopy = Boolean(
        findGroupChildrenByChildId(["copy-image", "fastpfp-copy-image", "fastpfp-copy-image-msg", "viewicons-copy-image"], children, true) ||
        hasMenuItem(
            children,
            ["copy-image", "fastpfp-copy-image", "fastpfp-copy-image-msg", "viewicons-copy-image"],
            ["Copy Image", t("Copy Image")]
        )
    );

    const group = findGroupChildrenByChildId("copy-native-link", children)
        ?? findGroupChildrenByChildId("open-native-link", children)
        ?? findGroupChildrenByChildId("copy-link", children)
        ?? findGroupChildrenByChildId("copy-image", children);

    const SaveIconComp = (media.isVideo
        ? (iconsModule?.DownloadIcon || iconsModule?.VideoIcon || iconsModule?.ImageIcon)
        : (iconsModule?.ImageIcon || iconsModule?.DownloadIcon)) || ImageIcon || SaveFallbackIcon;
    const CopyIconComp = iconsModule?.ImageIcon || ImageIcon || SaveFallbackIcon;

    const items: React.ReactElement[] = [];
    if (!media.isVideo && !alreadyHasCopy) {
        items.push(
            <Menu.MenuItem
                key="viewicons-copy-image"
                id="viewicons-copy-image"
                label={t("Copy Image")}
                icon={CopyIconComp}
                iconLeft={CopyIconComp}
                leadingAccessory={{
                    type: "icon",
                    icon: CopyIconComp
                }}
                action={() => void copyMediaImage(media.url)}
            />
        );
    }
    items.push(
        <Menu.MenuItem
            key="viewicons-save-media"
            id="viewicons-save-media"
            label={t(media.isVideo ? "Save Video" : "Save Image")}
            icon={SaveIconComp}
            iconLeft={SaveIconComp}
            leadingAccessory={{
                type: "icon",
                icon: SaveIconComp
            }}
            action={() => void saveMediaFile(media.url, media.filename, media.isVideo)}
        />
    );

    if (group) {
        group.unshift(...items);
    } else {
        children.unshift(
            <Menu.MenuGroup key="viewicons-media-group" id="viewicons-media-group">
                {items}
            </Menu.MenuGroup>
        );
    }
};

function ImageModalContextMenu({ src, target }: { src: string; target?: HTMLElement | null }) {
    const cleanedUrl = normalizeDiscordMediaUrl(src);
    const isVideo = isVideoUrl(cleanedUrl) || isVideoUrl(src);

    const SaveIconComp = (isVideo
        ? (iconsModule?.DownloadIcon || iconsModule?.VideoIcon || iconsModule?.ImageIcon)
        : (iconsModule?.ImageIcon || iconsModule?.DownloadIcon)) || ImageIcon || SaveFallbackIcon;
    const CopyIconComp = iconsModule?.ImageIcon || ImageIcon || SaveFallbackIcon;
    const LinkIconComp = iconsModule?.LinkIcon || ImageIcon;
    const OpenIconComp = iconsModule?.WindowLaunchIcon || iconsModule?.LaunchIcon || ImageIcon;

    return (
        <Menu.Menu
            navId="image-context"
            onClose={() => ContextMenuApi.closeContextMenu()}
            aria-label={t("Image Options")}
            contextMenuAPIArguments={[{ src: cleanedUrl, target }]}
        >
            <Menu.MenuGroup id="copy-native-link">
                {!isVideo && (
                    <Menu.MenuItem
                        id="copy-image"
                        label={t("Copy Image")}
                        icon={CopyIconComp}
                        iconLeft={CopyIconComp}
                        leadingAccessory={{
                            type: "icon",
                            icon: CopyIconComp
                        }}
                        action={() => void copyMediaImage(cleanedUrl)}
                    />
                )}
                <Menu.MenuItem
                    id="save-image"
                    label={t(isVideo ? "Save Video" : "Save Image")}
                    icon={SaveIconComp}
                    iconLeft={SaveIconComp}
                    leadingAccessory={{
                        type: "icon",
                        icon: SaveIconComp
                    }}
                    action={() => void saveMediaFile(cleanedUrl, undefined, isVideo)}
                />
                <Menu.MenuSeparator />
                <Menu.MenuItem
                    id="copy-native-link"
                    label={t("Copy Link")}
                    icon={LinkIconComp}
                    iconLeft={LinkIconComp}
                    leadingAccessory={{
                        type: "icon",
                        icon: LinkIconComp
                    }}
                    action={() => {
                        copyToClipboard(cleanedUrl);
                        Toasts.show(Toasts.create(t("Link copied!"), Toasts.Type.SUCCESS));
                    }}
                />
                <Menu.MenuItem
                    id="open-native-link"
                    label={t("Open Link")}
                    icon={OpenIconComp}
                    iconLeft={OpenIconComp}
                    leadingAccessory={{
                        type: "icon",
                        icon: OpenIconComp
                    }}
                    action={() => window.open(cleanedUrl, "_blank")}
                />
            </Menu.MenuGroup>
        </Menu.Menu>
    );
}

let onContextMenuListener: ((e: MouseEvent) => void) | null = null;

function setupModalContextMenuListener() {
    if (onContextMenuListener) return;

    onContextMenuListener = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        // Only ever activate inside an explicit fullscreen modal dialog
        const fullscreenDialog = target.closest?.("[role='dialog'], [class*='carouselModal'], [class*='mediaViewerModal']") as HTMLElement | null;
        if (!fullscreenDialog) return;

        // Never hijack user profiles, popouts, settings, or standard chat content
        if (target.closest?.("[class*='chatContent'], [class*='messageListItem'], [class*='userPopout'], [class*='userProfile'], [class*='profileModal'], [class*='settings']")) {
            return;
        }

        const isMediaModal = fullscreenDialog.matches?.("[class*='carouselModal'], [class*='mediaViewerModal']")
            || Boolean(fullscreenDialog.querySelector?.("[class*='mediaViewer'], [class*='carouselModal'], [class*='imageWrapper'] img, video"));
        if (!isMediaModal) return;

        const media = resolveDiscordMedia({ target });
        let mediaSrc: string | null = media?.url ?? null;

        if (!mediaSrc) {
            if (target instanceof HTMLImageElement && target.src) {
                mediaSrc = target.src;
            } else if (target instanceof HTMLVideoElement && (target.currentSrc || target.src)) {
                mediaSrc = target.currentSrc || target.src;
            } else {
                const mediaTag = (target.querySelector?.("video, img") ||
                    fullscreenDialog.querySelector?.("video, img")) as HTMLImageElement | HTMLVideoElement | null;
                if (mediaTag && "src" in mediaTag && mediaTag.src) {
                    mediaSrc = mediaTag.src;
                }
            }
        }

        if (!mediaSrc) {
            const bg = target.style?.backgroundImage || (window.getComputedStyle ? window.getComputedStyle(target).backgroundImage : "");
            if (bg && bg.includes("url(")) {
                const match = bg.match(/url\(["']?(.*?)["']?\)/);
                if (match?.[1]) mediaSrc = match[1];
            }
        }

        if (mediaSrc) {
            e.preventDefault();
            e.stopPropagation();

            ContextMenuApi.openContextMenu(e as any, () => (
                <ImageModalContextMenu
                    src={mediaSrc!}
                    target={target}
                />
            ));
        }
    };

    window.addEventListener("contextmenu", onContextMenuListener, true);
}

// ── Banner Click & Hover Listeners ─────────────────────────────────────────────

const BANNER_STYLE_ID = "lolicord-viewicons-banner-style";

function injectBannerCursorStyle() {
    if (document.getElementById(BANNER_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = BANNER_STYLE_ID;
    style.textContent = `
        [class*="userPopout"] [class*="banner"][style*="background-image"]:not([class*="tab"]):not([class*="item"]):not([role="tab"]),
        [class*="userProfile"] [class*="banner"][style*="background-image"]:not([class*="tab"]):not([class*="item"]):not([role="tab"]),
        [class*="profilePanel"] [class*="banner"][style*="background-image"]:not([class*="tab"]):not([class*="item"]):not([role="tab"]),
        [class*="bannerPremium"][style*="background-image"]:not([class*="tab"]):not([class*="item"]):not([role="tab"]),
        [class*="customBanner"][style*="background-image"]:not([class*="tab"]):not([class*="item"]):not([role="tab"]),
        [class*="profileBanner"][style*="background-image"]:not([class*="tab"]):not([class*="item"]):not([role="tab"]),
        [class*="popoutBanner"][style*="background-image"]:not([class*="tab"]):not([class*="item"]):not([role="tab"]) {
            cursor: pointer !important;
        }
    `;
    document.head.appendChild(style);
}

function removeBannerCursorStyle() {
    document.getElementById(BANNER_STYLE_ID)?.remove();
}

function extractUrlFromBg(styleString: string | null | undefined): string | null {
    if (!styleString || styleString === "none") return null;
    const match = styleString.match(/url\(["']?(https?:\/\/[^"')]+|data:[^"')]+)["']?\)/i);
    return match ? match[1] : null;
}

const EXCLUDED_BANNER_TARGETS = [
    "button",
    "[role='button']",
    "[role='tab']",
    "[role='tablist']",
    "a",
    "input",
    "textarea",
    "select",
    "[class*='avatar']",
    "[class*='badge']",
    "[class*='tabBar']",
    "[class*='tab_']",
    "[class*='tabItem']",
    "[class*='mutual']",
    "[class*='listRow']",
    "[class*='scroller']",
    "[class*='body']",
    "[class*='content']",
    "[role='listitem']",
    "[class*='userInfo']"
].join(", ");

function isExcludedBannerTarget(target: HTMLElement | null): boolean {
    if (!target) return true;
    return !!target.closest(EXCLUDED_BANNER_TARGETS);
}

function getBannerUrlFromTarget(target: HTMLElement): string | null {
    if (isExcludedBannerTarget(target)) {
        return null;
    }

    const bannerEl = target.closest?.(
        "[class*='banner'], [class*='profileBanner'], [class*='bannerPremium'], [class*='customBanner'], [class*='popoutBanner'], [class*='bannerSVG']"
    ) as HTMLElement | null;

    const profileHeader = target.closest?.(
        "header, [class*='userPopout'], [class*='userProfile'], [class*='profilePanel'], [class*='root-'], [class*='modal-'], [role='dialog'], [class*='header-']"
    ) as HTMLElement | null;

    if (!bannerEl && !profileHeader) return null;

    const candidate = bannerEl || target;

    // 1. Direct or computed background-image
    let url = extractUrlFromBg(candidate.style?.backgroundImage);
    if (url) return url;

    url = extractUrlFromBg(window.getComputedStyle?.(candidate)?.backgroundImage);
    if (url) return url;

    // SVG image element
    const svgImg = candidate.querySelector?.("image") || (candidate.tagName.toLowerCase() === "image" ? candidate : null);
    if (svgImg) {
        const href = svgImg.getAttribute("xlink:href") || svgImg.getAttribute("href");
        if (href && (href.startsWith("http") || href.startsWith("data:"))) return href;
    }

    // img tag
    const img = candidate.querySelector?.("img");
    if (img?.src && (img.src.startsWith("http") || img.src.startsWith("data:"))) {
        return img.src;
    }

    // Child elements with inline background-image
    const childWithBg = candidate.querySelector?.("[style*='background-image']") as HTMLElement | null;
    if (childWithBg) {
        url = extractUrlFromBg(childWithBg.style?.backgroundImage) ||
              extractUrlFromBg(window.getComputedStyle?.(childWithBg)?.backgroundImage);
        if (url) return url;
    }

    // 2. React Fiber extraction for high-res banner URL or displayProfile / user
    try {
        const fiberKey = Object.keys(candidate).find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
        if (fiberKey) {
            let fiber = (candidate as any)[fiberKey];
            for (let i = 0; i < 20 && fiber; i++) {
                const props = fiber.memoizedProps;
                if (props) {
                    if (props.bannerSrc && typeof props.bannerSrc === "string") {
                        return props.bannerSrc;
                    }
                    if (props.banner && typeof props.banner === "string" && (props.banner.startsWith("http") || props.banner.startsWith("data:"))) {
                        return props.banner;
                    }
                    if (props.displayProfile) {
                        const dp = props.displayProfile;
                        if (typeof dp.getBannerURL === "function") {
                            const bUrl = dp.getBannerURL({ canAnimate: true, size: 2048 });
                            if (bUrl) return bUrl;
                        }
                        if (dp.banner && dp.userId && IconUtils?.getUserBannerURL) {
                            return IconUtils.getUserBannerURL({ id: dp.userId, banner: dp.banner, canAnimate: true, size: 2048 });
                        }
                    }
                    if (props.user) {
                        const u = props.user;
                        if (u.banner && IconUtils?.getUserBannerURL) {
                            return IconUtils.getUserBannerURL({ id: u.id, banner: u.banner, canAnimate: true, size: 2048 });
                        }
                        if (u.id && UserProfileStore?.getUserProfile) {
                            const prof = UserProfileStore.getUserProfile(u.id);
                            if (prof?.banner && IconUtils?.getUserBannerURL) {
                                return IconUtils.getUserBannerURL({ id: u.id, banner: prof.banner, canAnimate: true, size: 2048 });
                            }
                        }
                    }
                    if (props.guild && props.guild.banner && IconUtils?.getGuildBannerURL) {
                        return IconUtils.getGuildBannerURL(props.guild, true);
                    }
                }
                fiber = fiber.return;
            }
        }
    } catch {}

    // 3. Fallback: Check header's banner element
    if (profileHeader && !bannerEl) {
        const innerBanner = profileHeader.querySelector?.(
            "[class*='banner'], [class*='profileBanner'], [class*='bannerPremium']"
        ) as HTMLElement | null;
        if (innerBanner && innerBanner.contains(target)) {
            url = extractUrlFromBg(innerBanner.style?.backgroundImage) ||
                  extractUrlFromBg(window.getComputedStyle?.(innerBanner)?.backgroundImage);
            if (url) return url;
        }
    }

    return null;
}

let onBannerClickListener: ((e: MouseEvent) => void) | null = null;
let onBannerMouseOverListener: ((e: MouseEvent) => void) | null = null;

function setupBannerListeners() {
    injectBannerCursorStyle();

    if (!onBannerClickListener) {
        onBannerClickListener = (e: MouseEvent) => {
            if (e.button !== 0) return;

            const target = e.target as HTMLElement | null;
            if (!target || isExcludedBannerTarget(target)) return;

            const bannerEl = target.closest?.(
                "[class*='banner'], [class*='profileBanner'], [class*='bannerPremium'], [class*='customBanner'], [class*='popoutBanner'], [class*='bannerSVG']"
            ) as HTMLElement | null;

            if (!bannerEl) return;

            const bannerUrl = getBannerUrlFromTarget(target);
            if (bannerUrl) {
                e.preventDefault();
                e.stopPropagation();
                openBanner(bannerUrl);
            }
        };
        window.addEventListener("click", onBannerClickListener, true);
    }

    if (!onBannerMouseOverListener) {
        onBannerMouseOverListener = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target || isExcludedBannerTarget(target)) return;

            const bannerEl = target.closest?.(
                "[class*='banner'], [class*='profileBanner'], [class*='bannerPremium'], [class*='customBanner'], [class*='popoutBanner'], [class*='bannerSVG']"
            ) as HTMLElement | null;

            if (bannerEl) {
                const bannerUrl = getBannerUrlFromTarget(target);
                if (bannerUrl) {
                    bannerEl.style.cursor = "pointer";
                }
            }
        };
        window.addEventListener("mouseover", onBannerMouseOverListener, true);
    }
}

function cleanupBannerListeners() {
    removeBannerCursorStyle();

    if (onBannerClickListener) {
        window.removeEventListener("click", onBannerClickListener, true);
        onBannerClickListener = null;
    }
    if (onBannerMouseOverListener) {
        window.removeEventListener("mouseover", onBannerMouseOverListener, true);
        onBannerMouseOverListener = null;
    }
}

const UserContext: NavContextMenuPatchCallback = (children, { user, guildId }: UserContextProps) => {
    if (!user) return;
    const member = guildId ? GuildMemberStore.getMember(guildId, user.id) : null;
    const memberAvatar = member?.avatar || null;

    const userProfile = UserProfileStore?.getUserProfile?.(user.id);
    const bannerHash = userProfile?.banner || user.banner;
    const userBanner = bannerHash && IconUtils?.getUserBannerURL
        ? IconUtils.getUserBannerURL({ id: user.id, banner: bannerHash, canAnimate: true, size: 2048 })
        : null;

    const memberBannerHash = member?.banner;
    const serverBanner = memberBannerHash && guildId && (IconUtils as any)?.getGuildMemberBannerURL
        ? (IconUtils as any).getGuildMemberBannerURL({
            userId: user.id,
            banner: memberBannerHash,
            guildId,
            canAnimate: true,
            size: 2048
        })
        : null;

    children.splice(-1, 0, (
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="view-avatar"
                label={t("View Avatar")}
                action={() => openAvatar(IconUtils.getUserAvatarURL(user, true))}
                icon={ImageIcon}
            />
            {memberAvatar && (
                <Menu.MenuItem
                    id="view-server-avatar"
                    label={t("View Server Avatar")}
                    action={() => openAvatar(IconUtils.getGuildMemberAvatarURLSimple({
                        userId: user.id,
                        avatar: memberAvatar,
                        guildId: guildId!,
                        canAnimate: true
                    }))}
                    icon={ImageIcon}
                />
            )}
            {userBanner && (
                <Menu.MenuItem
                    id="view-banner"
                    label={t("View Banner")}
                    action={() => openBanner(userBanner)}
                    icon={ImageIcon}
                />
            )}
            {serverBanner && (
                <Menu.MenuItem
                    id="view-server-banner"
                    label={t("View Server Banner")}
                    action={() => openBanner(serverBanner)}
                    icon={ImageIcon}
                />
            )}
        </Menu.MenuGroup>
    ));
};

const GuildContext: NavContextMenuPatchCallback = (children, { guild }: GuildContextProps) => {
    if (!guild) return;

    const { id, icon, banner } = guild;
    if (!banner && !icon) return;

    children.splice(-1, 0, (
        <Menu.MenuGroup>
            {icon ? (
                <Menu.MenuItem
                    id="view-icon"
                    label={t("View Icon")}
                    action={() =>
                        openAvatar(IconUtils.getGuildIconURL({
                            id,
                            icon,
                            canAnimate: true
                        })!)
                    }
                    icon={ImageIcon}
                />
            ) : null}
            {banner ? (
                <Menu.MenuItem
                    id="view-banner"
                    label={t("View Banner")}
                    action={() =>
                        openBanner(IconUtils.getGuildBannerURL(guild, true)!)
                    }
                    icon={ImageIcon}
                />
            ) : null}
        </Menu.MenuGroup>
    ));
};

const GroupDMContext: NavContextMenuPatchCallback = (children, { channel }: GroupDMContextProps) => {
    if (!channel) return;

    children.splice(-1, 0, (
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="view-group-channel-icon"
                label={t("View Icon")}
                action={() =>
                    openAvatar(IconUtils.getChannelIconURL(channel)!)
                }
                icon={ImageIcon}
            />
        </Menu.MenuGroup>
    ));
};

export default definePlugin({
    name: "ViewIcons",
    enabledByDefault: true,
    authors: [Devs.Ven, Devs.TheKodeToad, Devs.Nuckyz, Devs.nyx],
    description: "Makes avatars and banners in user profiles clickable, adds View Icon/Banner entries in the user, server and group channel context menu.",
    tags: ["Media", "Servers", "Appearance"],
    searchTerms: ["ImageUtilities"],
    dependencies: ["DynamicImageModalAPI"],

    settings,

    openAvatar,
    openBanner,

    start() {
        setupModalContextMenuListener();
        setupBannerListeners();
    },

    stop() {
        if (onContextMenuListener) {
            window.removeEventListener("contextmenu", onContextMenuListener, true);
            onContextMenuListener = null;
        }
        cleanupBannerListeners();
    },

    contextMenus: {
        "guild-context": GuildContext,
        "gdm-context": GroupDMContext,
        "message": mediaDownloadContextMenuPatch,
        "image-context": mediaDownloadContextMenuPatch
    },

    patches: [
        // Avatar component used in User DMs "User Profile" popup in the right and User Profile Modal pfp
        {
            find: "return{avatarProps:{",
            replacement: {
                match: /(?<=avatarProps:(\i),eventHandlers:(\i).{0,50}?)return null==/,
                replace: 'Object.assign($2,{style:{cursor:"pointer"},onClick:()=>$self.openAvatar($1.src)});$&',
            }
        },
        // Banners
        {
            find: 'backgroundColor:"COMPLETE"',
            noWarn: true,
            replacement: {
                match: /(overflow:"visible",.{0,125}?!1\),)style:{(?=.+?backgroundImage:null!=(\i)\?`url\(\$\{\2\}\))/,
                replace: (_, rest, bannerSrc) => `${rest}onClick:()=>${bannerSrc}!=null&&$self.openBanner(${bannerSrc}),style:{cursor:${bannerSrc}!=null?"pointer":void 0,`
            }
        },
        // Group DMs top small & large icon
        {
            find: '["aria-hidden"],"aria-label":',
            replacement: {
                match: /null==\i\.icon\?.+?src:(\(0,\i\.\i\).+?\))(?=[,}])/,
                // We have to check that icon is not an unread GDM in the server bar
                replace: (m, iconUrl) => `${m},onClick:()=>arguments[0]?.size!=="SIZE_48"&&$self.openAvatar(${iconUrl})`
            }
        },
        // User DMs top small icon
        {
            find: ".channel.getRecipientId(),",
            replacement: {
                match: /(?=,src:(\i.getAvatarURL\(.+?[)]))/,
                replace: (_, avatarUrl) => `,onClick:()=>$self.openAvatar(${avatarUrl})`
            }
        },
        // User Dms top large icon
        {
            find: ".EMPTY_GROUP_DM)",
            replacement: {
                match: /(?<=SIZE_80,)(?=src:(.+?\))[,}])/,
                replace: (_, avatarUrl) => `onClick:()=>$self.openAvatar(${avatarUrl}),`
            }
        }
    ]
});

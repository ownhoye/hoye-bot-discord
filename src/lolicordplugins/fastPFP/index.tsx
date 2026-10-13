/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { copyMediaImage, resolveDiscordMedia, saveMediaFile } from "@plugins/fileUpload/utils/getMediaUrl";
import definePlugin from "@utils/types";
import { Menu, RestAPI, Toasts } from "@webpack/common";
import { t } from "../autoTranslateLoliCord";

const openLink = (url: string) => {
    window.open(url, "_blank");
};

const uploadImageToProfile = async (url: string, type: "avatar" | "banner") => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();

        // Convert Blob to Base64
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            const base64data = reader.result;
            try {
                await RestAPI.patch({
                    url: "/users/@me",
                    body: {
                        [type]: base64data
                    }
                });
                Toasts.show(Toasts.create(t(`Successfully updated your ${type}!`), Toasts.Type.SUCCESS));
            } catch (error) {
                Toasts.show(Toasts.create(t(`Failed to update ${type}.`), Toasts.Type.FAILURE));
                console.error("FastPFP Error:", error);
            }
        };
    } catch (err) {
        Toasts.show(Toasts.create(t("Failed to download image."), Toasts.Type.FAILURE));
        console.error("FastPFP Error:", err);
    }
};

import { iconsModule } from "@plugins/_core/concatenatedModules";
import { ImageIcon } from "@components/Icons";

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

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!props) return;

    const media = resolveDiscordMedia(props);
    if (!media?.url) return;

    const { url, isVideo, filename } = media;

    const group = findGroupChildrenByChildId("open-native-link", children)
        ?? findGroupChildrenByChildId("copy-native-link", children)
        ?? findGroupChildrenByChildId("copy-link", children)
        ?? findGroupChildrenByChildId("save-image", children);

    if (hasMenuItem(children, ["fastpfp-avatar", "fastpfp-save-image-msg"])) return;

    const hasNativeImageGroup = Boolean(
        findGroupChildrenByChildId(["copy-native-link", "open-native-link"], children, true)
    );

    const hasSaveAlready = Boolean(
        (!isVideo && hasNativeImageGroup && !url.startsWith("blob:") && !url.startsWith("data:")) ||
        findGroupChildrenByChildId(["save-image", "viewicons-save-media", "fastpfp-save-image"], children, true) ||
        hasMenuItem(
            children,
            ["save-image", "viewicons-save-media", "fastpfp-save-image"],
            ["Save Image", t("Save Image"), "Save Video", t("Save Video")]
        )
    );
    const hasCopyAlready = Boolean(
        (!isVideo && hasNativeImageGroup && !url.startsWith("blob:") && !url.startsWith("data:")) ||
        findGroupChildrenByChildId(["copy-image", "viewicons-copy-image", "fastpfp-copy-image"], children, true) ||
        hasMenuItem(
            children,
            ["copy-image", "viewicons-copy-image", "fastpfp-copy-image"],
            ["Copy Image", t("Copy Image")]
        )
    );
    const hasOpenAlready = Boolean(
        hasNativeImageGroup ||
        findGroupChildrenByChildId(["open-native-link", "fastpfp-open-link"], children, true) ||
        hasMenuItem(children, ["open-native-link", "fastpfp-open-link"], ["Open Link", t("Open Link")])
    );

    const UserIconComp = iconsModule?.UserIcon || iconsModule?.ImageIcon || ImageIcon;
    const SaveIconComp = (isVideo
        ? (iconsModule?.DownloadIcon || iconsModule?.VideoIcon || iconsModule?.ImageIcon)
        : (iconsModule?.ImageIcon || iconsModule?.DownloadIcon)) || ImageIcon || SaveFallbackIcon;
    const CopyIconComp = iconsModule?.ImageIcon || ImageIcon || SaveFallbackIcon;
    const OpenIconComp = iconsModule?.WindowLaunchIcon || iconsModule?.LaunchIcon || ImageIcon;

    const items: React.ReactElement[] = [];

    if (!isVideo) {
        items.push(
            <Menu.MenuItem
                label={t("Add To PFP")}
                key="fastpfp-avatar"
                id="fastpfp-avatar"
                icon={UserIconComp}
                iconLeft={UserIconComp}
                leadingAccessory={{
                    type: "icon",
                    icon: UserIconComp
                }}
                action={() => void uploadImageToProfile(url, "avatar")}
            />,
            <Menu.MenuItem
                label={t("Add To Banner")}
                key="fastpfp-banner"
                id="fastpfp-banner"
                icon={CopyIconComp}
                iconLeft={CopyIconComp}
                leadingAccessory={{
                    type: "icon",
                    icon: CopyIconComp
                }}
                action={() => void uploadImageToProfile(url, "banner")}
            />
        );
    }

    if (!hasSaveAlready || (!isVideo && !hasCopyAlready) || !hasOpenAlready) {
        if (items.length > 0) {
            items.push(<Menu.MenuSeparator key="fastpfp-sep-msg" />);
        }
        if (!isVideo && !hasCopyAlready) {
            items.push(
                <Menu.MenuItem
                    label={t("Copy Image")}
                    key="fastpfp-copy-image-msg"
                    id="fastpfp-copy-image-msg"
                    icon={CopyIconComp}
                    iconLeft={CopyIconComp}
                    leadingAccessory={{
                        type: "icon",
                        icon: CopyIconComp
                    }}
                    action={() => void copyMediaImage(url)}
                />
            );
        }
        if (!hasSaveAlready) {
            items.push(
                <Menu.MenuItem
                    label={t(isVideo ? "Save Video" : "Save Image")}
                    key="fastpfp-save-image-msg"
                    id="fastpfp-save-image-msg"
                    icon={SaveIconComp}
                    iconLeft={SaveIconComp}
                    leadingAccessory={{
                        type: "icon",
                        icon: SaveIconComp
                    }}
                    action={() => void saveMediaFile(url, filename, isVideo)}
                />
            );
        }
        if (!hasOpenAlready) {
            items.push(
                <Menu.MenuItem
                    label={t("Open Link")}
                    key="fastpfp-open-link-msg"
                    id="fastpfp-open-link-msg"
                    icon={OpenIconComp}
                    iconLeft={OpenIconComp}
                    leadingAccessory={{
                        type: "icon",
                        icon: OpenIconComp
                    }}
                    action={() => openLink(url)}
                />
            );
        }
    }

    if (items.length === 0) return;

    if (group) {
        group.push(...items);
    } else {
        children.push(
            <Menu.MenuGroup key="fastpfp-msg-group" id="fastpfp-msg-group">
                {items}
            </Menu.MenuGroup>
        );
    }
};

const imageContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!props) return;
    if ("href" in props && !props.src) return;

    const media = resolveDiscordMedia(props);
    if (!media?.url) return;

    const { url, isVideo, filename } = media;

    if (children.some(child => child?.props?.id === "fastpfp-group")) return;

    const hasSaveAlready = Boolean(
        findGroupChildrenByChildId(["save-image", "viewicons-save-media", "fastpfp-save-image-msg"], children, true) ||
        hasMenuItem(
            children,
            ["save-image", "viewicons-save-media", "fastpfp-save-image-msg"],
            ["Save Image", t("Save Image"), "Save Video", t("Save Video")]
        )
    );
    const hasCopyAlready = Boolean(
        findGroupChildrenByChildId(["copy-image", "viewicons-copy-image", "fastpfp-copy-image-msg"], children, true) ||
        hasMenuItem(
            children,
            ["copy-image", "viewicons-copy-image", "fastpfp-copy-image-msg"],
            ["Copy Image", t("Copy Image")]
        )
    );
    const hasOpenAlready = Boolean(
        findGroupChildrenByChildId(["open-native-link", "fastpfp-open-link-msg"], children, true) ||
        hasMenuItem(children, ["open-native-link", "fastpfp-open-link-msg"], ["Open Link", t("Open Link")])
    );

    const UserIconComp = iconsModule?.UserIcon || iconsModule?.ImageIcon || ImageIcon;
    const SaveIconComp = (isVideo
        ? (iconsModule?.DownloadIcon || iconsModule?.VideoIcon || iconsModule?.ImageIcon)
        : (iconsModule?.ImageIcon || iconsModule?.DownloadIcon)) || ImageIcon || SaveFallbackIcon;
    const CopyIconComp = iconsModule?.ImageIcon || ImageIcon || SaveFallbackIcon;
    const OpenIconComp = iconsModule?.WindowLaunchIcon || iconsModule?.LaunchIcon || ImageIcon;

    const items: React.ReactElement[] = [];

    if (!isVideo) {
        items.push(
            <Menu.MenuItem
                label={t("Add To PFP")}
                key="fastpfp-avatar"
                id="fastpfp-avatar"
                icon={UserIconComp}
                iconLeft={UserIconComp}
                leadingAccessory={{
                    type: "icon",
                    icon: UserIconComp
                }}
                action={() => void uploadImageToProfile(url, "avatar")}
            />,
            <Menu.MenuItem
                label={t("Add To Banner")}
                key="fastpfp-banner"
                id="fastpfp-banner"
                icon={CopyIconComp}
                iconLeft={CopyIconComp}
                leadingAccessory={{
                    type: "icon",
                    icon: CopyIconComp
                }}
                action={() => void uploadImageToProfile(url, "banner")}
            />
        );
    }

    if (!hasSaveAlready || (!isVideo && !hasCopyAlready) || !hasOpenAlready) {
        if (items.length > 0) {
            items.push(<Menu.MenuSeparator key="fastpfp-sep" />);
        }
        if (!isVideo && !hasCopyAlready) {
            items.push(
                <Menu.MenuItem
                    label={t("Copy Image")}
                    key="fastpfp-copy-image"
                    id="fastpfp-copy-image"
                    icon={CopyIconComp}
                    iconLeft={CopyIconComp}
                    leadingAccessory={{
                        type: "icon",
                        icon: CopyIconComp
                    }}
                    action={() => void copyMediaImage(url)}
                />
            );
        }
        if (!hasSaveAlready) {
            items.push(
                <Menu.MenuItem
                    label={t(isVideo ? "Save Video" : "Save Image")}
                    key="fastpfp-save-image"
                    id="fastpfp-save-image"
                    icon={SaveIconComp}
                    iconLeft={SaveIconComp}
                    leadingAccessory={{
                        type: "icon",
                        icon: SaveIconComp
                    }}
                    action={() => void saveMediaFile(url, filename, isVideo)}
                />
            );
        }
        if (!hasOpenAlready) {
            items.push(
                <Menu.MenuItem
                    label={t("Open Link")}
                    key="fastpfp-open-link"
                    id="fastpfp-open-link"
                    icon={OpenIconComp}
                    iconLeft={OpenIconComp}
                    leadingAccessory={{
                        type: "icon",
                        icon: OpenIconComp
                    }}
                    action={() => openLink(url)}
                />
            );
        }
    }

    if (items.length === 0) return;

    children.push(
        <Menu.MenuGroup key="fastpfp-group" id="fastpfp-group">
            {items}
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "FastPFP",
    enabledByDefault: true,
    description: "Allows you to quickly set any image as your profile picture or banner from the context menu.",
    authors: [{ name: "Nightcord", id: 0n }],
    contextMenus: {
        "message": messageContextMenuPatch,
        "image-context": imageContextMenuPatch
    }
});



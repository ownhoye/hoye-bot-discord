/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Nightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import definePlugin from "@utils/types";
import { Avatar, Button, closeModal, Menu, openModal, React, ScrollerThin, SortedGuildStore, Text } from "@webpack/common";
import { Card } from "@components/Card";
import { Flex, FlexAlign, FlexDirection, FlexJustify } from "@components/Flex";
import { findByPropsLazy } from "@webpack";
import { FolderIconEditModal, int2rgba } from "./modal";
import { CustomFolderIconData, FolderIconsMap, ServerFolderProps } from "./types";
import { t } from "../autoTranslateLoliCord";

const folderClasses = findByPropsLazy("folderPreviewWrapper", "folderPreview") as any;

const folderIconsStore: FolderIconsMap = {};
const listeners = new Set<() => void>();

function notifyChange() {
    listeners.forEach(l => l());
}

async function loadFolderIcons() {
    try {
        const saved = await DataStore.get<FolderIconsMap>("ServerFolderIcons_data");
        if (saved && typeof saved === "object") {
            Object.keys(folderIconsStore).forEach(k => delete folderIconsStore[k]);
            Object.assign(folderIconsStore, saved);
            notifyChange();
        }
    } catch { }
}

async function saveFolderIcons() {
    try {
        await DataStore.set("ServerFolderIcons_data", folderIconsStore);
        notifyChange();
    } catch { }
}

function openEditFolderModal(props: ServerFolderProps) {
    const folderIdStr = String(props.folderId);
    const initialData = folderIconsStore[folderIdStr];

    openModal(modalProps => (
        <FolderIconEditModal
            folderProps={props}
            initialData={initialData}
            onSave={(data) => {
                folderIconsStore[folderIdStr] = data;
                saveFolderIcons();
            }}
            onReset={() => {
                delete folderIconsStore[folderIdStr];
                saveFolderIcons();
            }}
            onClose={modalProps.onClose}
            transitionState={modalProps.transitionState}
        />
    ));
}

function FolderIconComponent({ folderNode, data }: { folderNode: any; data: CustomFolderIconData; }) {
    const bgMode = data.bgMode || "folderColor";
    let bg = "transparent";
    if (bgMode === "folderColor") {
        bg = int2rgba(folderNode.color ?? 0x5865F2, 0.4);
    } else if (bgMode === "solid") {
        bg = int2rgba(folderNode.color ?? 0x5865F2, 1.0);
    }

    const radius = data.radius !== undefined ? `${data.radius}%` : "33%";
    const userSize = (data.size !== undefined ? Number(data.size) : 100) / 100;

    const wrapperClass = folderClasses?.folderPreviewWrapper || "folderPreviewWrapper__48112";
    const previewClass = folderClasses?.folderPreview || "folderPreview__48112";

    return (
        <div
            className={wrapperClass}
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden"
            }}
        >
            <div
                className={previewClass}
                style={{
                    borderRadius: radius,
                    backgroundColor: bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    boxSizing: "border-box"
                }}
            >
                <img
                    src={data.url}
                    alt=""
                    style={{
                        width: `${Math.round(userSize * 100)}%`,
                        height: `${Math.round(userSize * 100)}%`,
                        maxWidth: "100%",
                        maxHeight: "100%",
                        objectFit: "contain",
                        pointerEvents: "none"
                    }}
                />
            </div>
        </div>
    );
}

function FolderRow({ folderId, data }: { folderId: string; data: CustomFolderIconData; }) {
    const folders = SortedGuildStore.getGuildFolders();
    const folder = folders.find((f: any) => String(f.folderId) === folderId);
    const folderName = folder?.folderName || `Folder #${folderId}`;
    const serverCount = folder?.guildIds?.length || 0;

    return (
        <Card variant="primary" outline style={{ padding: "10px 14px", background: "var(--background-secondary, #2b2d31)", borderRadius: "8px" }}>
            <Flex alignItems={FlexAlign.CENTER} justifyContent={FlexJustify.BETWEEN} style={{ width: "100%" }}>
                <Flex alignItems={FlexAlign.CENTER} gap="12px">
                    <div style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: `${data.radius ?? 33}%`,
                        backgroundColor: data.bgMode === "transparent" ? "transparent" : int2rgba(folder?.folderColor ?? 0x5865F2, 0.4),
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,0.08)"
                    }}>
                        <img src={data.url} alt="" style={{ width: `${data.size ?? 100}%`, height: `${data.size ?? 100}%`, objectFit: "contain" }} />
                    </div>
                    <Flex flexDirection={FlexDirection.VERTICAL} style={{ gap: "2px" }}>
                        <span style={{ color: "#ffffff", fontWeight: 600, fontSize: "13px" }}>{folderName}</span>
                        <span style={{ color: "var(--text-muted, #949ba4)", fontSize: "11px" }}>
                            {serverCount} {serverCount === 1 ? t("Server") : t("Servers")} • ID: {folderId}
                        </span>
                    </Flex>
                </Flex>
                <Flex alignItems={FlexAlign.CENTER} gap="8px">
                    <Button
                        variant="secondary"
                        size="small"
                        onClick={() => openEditFolderModal({ folderId, folderName, folderColor: folder?.folderColor })}
                    >
                        {t("Edit")}
                    </Button>
                    <Button
                        variant="dangerPrimary"
                        size="small"
                        onClick={() => {
                            delete folderIconsStore[folderId];
                            saveFolderIcons();
                        }}
                    >
                        {t("Remove")}
                    </Button>
                </Flex>
            </Flex>
        </Card>
    );
}

function ServerFolderIconsSettings() {
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);

    React.useEffect(() => {
        const listener = () => forceUpdate();
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    }, []);

    const entries = Object.entries(folderIconsStore).filter(([_, data]) => data && data.url);

    if (entries.length === 0) {
        return (
            <Card variant="primary" style={{ padding: "16px", textAlign: "center", color: "var(--text-muted, #949ba4)", marginTop: "8px" }}>
                <span style={{ fontSize: "13px", color: "var(--text-muted, #949ba4)" }}>
                    {t("No custom folder icons configured yet. Right-click any server folder to set a custom icon.")}
                </span>
            </Card>
        );
    }

    return (
        <div style={{ width: "100%", marginTop: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: "#ffffff", fontWeight: 600, fontSize: "13px" }}>
                    {t("Configured Folder Icons")}
                </span>
                <span style={{ color: "var(--text-muted, #949ba4)", fontSize: "12px" }}>
                    {entries.length} {entries.length === 1 ? "icône" : "icônes"}
                </span>
            </div>
            <ScrollerThin fade style={{ maxHeight: "280px", paddingRight: "6px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {entries.map(([folderId, data]) => (
                        <FolderRow key={folderId} folderId={folderId} data={data!} />
                    ))}
                </div>
            </ScrollerThin>
        </div>
    );
}

export default definePlugin({
    name: "ServerFolderIcons",
    description: "Allows you to replace default folder miniatures with custom icons, transparent PNGs, or logos.",
    authors: [
        { name: "LoliCord", id: 0n }
    ],
    enabledByDefault: false,

    settingsAboutComponent: ServerFolderIconsSettings,

    patches: [
        {
            find: "#{intl::GUILD_FOLDER_TOOLTIP_A11Y_LABEL}",
            replacement: {
                match: /(\(0,\i\.jsx\)\(\i,\{folderNode:(\i),hovered:\i,sorting:\i\}\))/,
                replace: "($self.shouldReplace({folderNode:$2})?$self.replace({folderNode:$2}):$1)"
            }
        }
    ],

    contextMenus: {
        "guild-context": (menuItems, props: any) => {
            if (!props || !("folderId" in props)) return;

            menuItems.push(
                <Menu.MenuItem
                    id="nc-server-folder-icons"
                    key="nc-server-folder-icons"
                    label={t("Customize Folder Icon")}
                    action={() => {
                        openEditFolderModal({
                            folderId: props.folderId,
                            folderColor: props.folderColor,
                            folderName: props.folderName,
                            guildIds: props.guildIds
                        });
                    }}
                />
            );
        }
    },

    shouldReplace(props: any): boolean {
        if (!props?.folderNode?.id) return false;
        const key = String(props.folderNode.id);
        return !!(folderIconsStore[key]?.url);
    },

    replace(props: any) {
        const key = String(props.folderNode.id);
        const data = folderIconsStore[key];
        if (!data?.url) return null;

        return <FolderIconComponent folderNode={props.folderNode} data={data} />;
    },

    start() {
        loadFolderIcons();
    },

    stop() {
        // Clean memory
        listeners.clear();
    }
});

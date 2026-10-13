/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Nightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, React, ScrollerThin, Text, TextInput, showToast, Toasts } from "@webpack/common";
import { ModalSize } from "@utils/modal";
import { Flex, FlexAlign, FlexDirection, FlexJustify } from "@components/Flex";
import { Card } from "@components/Card";
import { SnipedAttachment } from "./types";
import { t } from "../autoTranslateLoliCord";

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function SnipeGalleryModal({
    snipedList,
    onDeleteEntry,
    onClearAll,
    savePath,
    onClose,
    transitionState
}: {
    snipedList: SnipedAttachment[];
    onDeleteEntry: (id: string) => void;
    onClearAll: () => void;
    savePath: string;
    onClose: () => void;
    transitionState: any;
}) {
    const [search, setSearch] = React.useState("");
    const [filterType, setFilterType] = React.useState<"all" | "image" | "video" | "audio" | "file">("all");

    const Native = (window as any).VencordNative?.pluginHelpers?.SnipeAttachments;

    const filtered = snipedList.filter(item => {
        if (search) {
            const q = search.toLowerCase();
            const matchName = item.filename.toLowerCase().includes(q);
            const matchAuthor = item.authorName.toLowerCase().includes(q);
            const matchChannel = item.channelName.toLowerCase().includes(q);
            const matchGuild = (item.guildName || "").toLowerCase().includes(q);
            if (!matchName && !matchAuthor && !matchChannel && !matchGuild) return false;
        }

        if (filterType === "image") {
            return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(item.filename) || item.contentType?.startsWith("image/");
        } else if (filterType === "video") {
            return /\.(mp4|webm|mkv|mov|avi)$/i.test(item.filename) || item.contentType?.startsWith("video/");
        } else if (filterType === "audio") {
            return /\.(mp3|ogg|wav|flac|m4a|opus)$/i.test(item.filename) || item.contentType?.startsWith("audio/");
        } else if (filterType === "file") {
            const isMedia = /\.(png|jpe?g|webp|gif|bmp|svg|mp4|webm|mkv|mov|avi|mp3|ogg|wav|flac|m4a|opus)$/i.test(item.filename);
            return !isMedia;
        }

        return true;
    });

    const totalSize = snipedList.reduce((acc, item) => acc + (item.size || 0), 0);
    const deletedCount = snipedList.filter(i => i.isDeleted).length;

    return (
        <ModalRoot transitionState={transitionState} size={ModalSize.LARGE}>
            <ModalHeader separator={false} style={{ padding: "20px 24px 12px 24px" }}>
                <Flex alignItems={FlexAlign.CENTER} justifyContent={FlexJustify.BETWEEN} style={{ width: "100%" }}>
                    <div>
                        <h2 style={{ color: "#ffffff", fontSize: "18px", fontWeight: 700, margin: 0 }}>
                            {t("Snipe Attachments Gallery")}
                        </h2>
                        <span style={{ color: "var(--text-muted, #949ba4)", fontSize: "13px" }}>
                            {snipedList.length} {t("saved files")} • {formatBytes(totalSize)}
                            {deletedCount > 0 && ` • ${deletedCount} ${t("preserved after deletion")}`}
                        </span>
                    </div>
                    <ModalCloseButton onClick={onClose} />
                </Flex>
            </ModalHeader>

            <ModalContent style={{ padding: "12px 24px 24px 24px" }}>
                {/* Search & Filter Bar */}
                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px" }}>
                    <TextInput
                        value={search}
                        onChange={(val: string) => setSearch(val)}
                        placeholder={t("Search by filename, author, or channel...")}
                        style={{ flex: 1 }}
                    />
                    <div style={{ display: "flex", gap: "6px" }}>
                        {(["all", "image", "video", "audio", "file"] as const).map(type => (
                            <Button
                                key={type}
                                variant={filterType === type ? "primary" : "secondary"}
                                size="small"
                                onClick={() => setFilterType(type)}
                                style={{ textTransform: "capitalize", fontSize: "12px" }}
                            >
                                {type === "all" ? t("All") : type}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Items Grid/List */}
                {filtered.length === 0 ? (
                    <Card variant="primary" style={{ padding: "32px", textAlign: "center", color: "var(--text-muted, #949ba4)" }}>
                        <span style={{ fontSize: "14px" }}>
                            {search ? t("No matching sniped attachments found.") : t("No attachments sniped yet.")}
                        </span>
                    </Card>
                ) : (
                    <ScrollerThin fade style={{ maxHeight: "420px", paddingRight: "6px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                            {filtered.map(item => {
                                const isImage = /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(item.filename) || item.contentType?.startsWith("image/");
                                const isVideo = /\.(mp4|webm|mkv|mov|avi)$/i.test(item.filename) || item.contentType?.startsWith("video/");

                                return (
                                    <div
                                        key={item.id}
                                        style={{
                                            background: "var(--background-secondary, #2b2d31)",
                                            borderRadius: "8px",
                                            border: item.isDeleted ? "1px solid rgba(240, 71, 71, 0.4)" : "1px solid rgba(255, 255, 255, 0.06)",
                                            overflow: "hidden",
                                            display: "flex",
                                            flexDirection: "column"
                                        }}
                                    >
                                        {/* Media Preview Thumbnail */}
                                        <div style={{
                                            height: "140px",
                                            backgroundColor: "#18191c",
                                            position: "relative",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            overflow: "hidden"
                                        }}>
                                            {isImage ? (
                                                <img
                                                    src={item.url}
                                                    alt=""
                                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                    onError={(e: any) => { e.target.style.display = "none"; }}
                                                />
                                            ) : isVideo ? (
                                                <video
                                                    src={item.url}
                                                    muted
                                                    playsInline
                                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                />
                                            ) : (
                                                <span style={{ color: "var(--text-muted, #949ba4)", fontSize: "12px", textTransform: "uppercase", fontWeight: 700 }}>
                                                    {item.filename.split(".").pop() || "FILE"}
                                                </span>
                                            )}

                                            {/* Tag if deleted from Discord */}
                                            {item.isDeleted && (
                                                <div style={{
                                                    position: "absolute",
                                                    top: "6px",
                                                    right: "6px",
                                                    backgroundColor: "rgba(240, 71, 71, 0.9)",
                                                    color: "#ffffff",
                                                    padding: "2px 6px",
                                                    borderRadius: "4px",
                                                    fontSize: "10px",
                                                    fontWeight: 700
                                                }}>
                                                    {t("DELETED")}
                                                </div>
                                            )}
                                        </div>

                                        {/* Meta & Info */}
                                        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                                            <span
                                                style={{ color: "#ffffff", fontWeight: 600, fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                                title={item.filename}
                                            >
                                                {item.filename}
                                            </span>
                                            <span style={{ color: "var(--text-muted, #949ba4)", fontSize: "11px" }}>
                                                {item.authorName} • {item.guildName || "DM"} #{item.channelName}
                                            </span>
                                            <span style={{ color: "var(--text-muted, #949ba4)", fontSize: "11px" }}>
                                                {formatBytes(item.size)} • {new Date(item.timestamp).toLocaleDateString()} {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                        </div>

                                        {/* Actions */}
                                        <div style={{ padding: "8px 12px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                                            <Button
                                                variant="secondary"
                                                size="small"
                                                onClick={() => {
                                                    if (Native?.openInFolder && item.savedPath) {
                                                        Native.openInFolder(item.savedPath);
                                                    } else {
                                                        window.open(item.url, "_blank");
                                                    }
                                                }}
                                            >
                                                {t("Open")}
                                            </Button>
                                            <Button
                                                variant="dangerPrimary"
                                                size="small"
                                                onClick={() => onDeleteEntry(item.id)}
                                            >
                                                {t("Delete")}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollerThin>
                )}
            </ModalContent>

            <ModalFooter>
                <Flex alignItems={FlexAlign.CENTER} justifyContent={FlexJustify.BETWEEN} style={{ width: "100%" }}>
                    <Flex alignItems={FlexAlign.CENTER} gap="8px">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                if (Native?.openFolder && savePath) {
                                    Native.openFolder(savePath);
                                }
                            }}
                        >
                            {t("Open Save Folder")}
                        </Button>
                        <Button
                            variant="dangerPrimary"
                            onClick={onClearAll}
                            disabled={snipedList.length === 0}
                        >
                            {t("Clear History")}
                        </Button>
                    </Flex>
                    <Button variant="primary" onClick={onClose}>
                        {t("Close")}
                    </Button>
                </Flex>
            </ModalFooter>
        </ModalRoot>
    );
}

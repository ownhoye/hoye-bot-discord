/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Nightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { Button, ChannelStore, GuildStore, MessageStore, openModal, React, SelectedChannelStore, TextInput, UserStore, showToast, Toasts } from "@webpack/common";
import { Flex, FlexAlign, FlexDirection, FlexJustify } from "@components/Flex";
import { Card } from "@components/Card";
import { SnipeGalleryModal } from "./modal";
import { SnipedAttachment, SnipePluginSettings } from "./types";
import { t } from "../autoTranslateLoliCord";

function getNative() {
    return (window as any).VencordNative?.pluginHelpers?.SnipeAttachments as PluginNative<typeof import("./native")> | undefined;
}

const settings = definePluginSettings({
    savePath: {
        type: OptionType.STRING,
        description: "Custom folder path on your PC where sniped attachments will be stored.",
        default: "",
        restartNeeded: false
    },
    autoDownload: {
        type: OptionType.BOOLEAN,
        description: "Automatically download and cache incoming attachments in the background.",
        default: true,
        restartNeeded: false
    },
    maxFileSizeMB: {
        type: OptionType.SLIDER,
        description: "Maximum file size in megabytes (MB) to download automatically.",
        markers: [5, 10, 25, 50, 100, 250],
        default: 50,
        restartNeeded: false
    },
    saveImages: {
        type: OptionType.BOOLEAN,
        description: "Automatically download images (PNG, JPG, WebP, GIF, SVG).",
        default: true,
        restartNeeded: false
    },
    saveVideos: {
        type: OptionType.BOOLEAN,
        description: "Automatically download videos (MP4, WebM, MKV, MOV).",
        default: true,
        restartNeeded: false
    },
    saveAudio: {
        type: OptionType.BOOLEAN,
        description: "Automatically download audio files (MP3, OGG, WAV, FLAC, M4A).",
        default: true,
        restartNeeded: false
    },
    saveDocuments: {
        type: OptionType.BOOLEAN,
        description: "Automatically download documents and archives (PDF, ZIP, TXT, etc.).",
        default: true,
        restartNeeded: false
    },
    notifyOnDeleted: {
        type: OptionType.BOOLEAN,
        description: "Display a notification when an author deletes an attachment that was sniped.",
        default: true,
        restartNeeded: false
    }
});

const snipedStore: SnipedAttachment[] = [];
const processedUrls = new Set<string>();

async function loadSnipedStore() {
    try {
        const saved = await DataStore.get<SnipedAttachment[]>("SnipeAttachments_history");
        if (Array.isArray(saved)) {
            snipedStore.length = 0;
            snipedStore.push(...saved);
            saved.forEach(s => {
                if (s.url) processedUrls.add(s.url);
                if (s.id) processedUrls.add(s.id);
            });
        }
    } catch { }
}

async function saveSnipedStore() {
    try {
        await DataStore.set("SnipeAttachments_history", snipedStore);
    } catch { }
}

function isEligibleMediaType(filename: string, contentType: string | undefined): boolean {
    const isImage = /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(filename) || contentType?.startsWith("image/");
    const isVideo = /\.(mp4|webm|mkv|mov|avi|flv|wmv)$/i.test(filename) || contentType?.startsWith("video/");
    const isAudio = /\.(mp3|ogg|wav|flac|m4a|opus|aac)$/i.test(filename) || contentType?.startsWith("audio/");

    if (isImage) return settings.store.saveImages !== false;
    if (isVideo) return settings.store.saveVideos !== false;
    if (isAudio) return settings.store.saveAudio !== false;
    return settings.store.saveDocuments !== false;
}

interface MediaItemToDownload {
    id: string;
    url: string;
    filename: string;
    contentType?: string;
    size?: number;
}

function extractMediaFromMessage(message: any): MediaItemToDownload[] {
    const items: MediaItemToDownload[] = [];
    if (!message) return items;

    // 1. Regular Attachments
    if (Array.isArray(message.attachments)) {
        for (const att of message.attachments) {
            const url = att.url || att.proxy_url || att.proxyUrl;
            if (!url) continue;
            const filename = att.filename || att.name || url.split("/").pop()?.split("?")[0] || "file";
            const contentType = att.content_type || att.contentType;
            const size = att.size;
            items.push({ id: att.id || url, url, filename, contentType, size });
        }
    }

    // 2. Embeds (Images, Videos, GIFs)
    if (Array.isArray(message.embeds)) {
        for (const embed of message.embeds) {
            const mediaUrl = embed.video?.url || embed.image?.url || embed.thumbnail?.url;
            if (mediaUrl && !items.some(i => i.url === mediaUrl)) {
                const filename = mediaUrl.split("/").pop()?.split("?")[0] || "embed_media";
                items.push({
                    id: mediaUrl,
                    url: mediaUrl,
                    filename,
                    contentType: embed.video ? "video/mp4" : "image/jpeg"
                });
            }
        }
    }

    // 3. Discord CDN URLs in message content
    if (typeof message.content === "string") {
        const cdnMatches = message.content.match(/https?:\/\/(?:cdn|media)\.discordapp\.(?:com|net)\/attachments\/[^\s]+/gi);
        if (cdnMatches) {
            for (const url of cdnMatches) {
                if (!items.some(i => i.url === url)) {
                    const filename = url.split("/").pop()?.split("?")[0] || "discord_media";
                    items.push({ id: url, url, filename });
                }
            }
        }
    }

    return items;
}

async function processIncomingMessage(rawMessage: any) {
    if (!settings.store.autoDownload) return;
    if (!rawMessage) return;

    const message = rawMessage.message || rawMessage;
    const mediaItems = extractMediaFromMessage(message);
    if (mediaItems.length === 0) return;

    const channelId = message.channel_id || message.channelId || rawMessage.channelId;
    const channel = channelId ? ChannelStore.getChannel(channelId) : null;
    const channelName = channel?.name || (channel?.isDM() ? "DirectMessage" : "Chat");
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
    const guildName = guild?.name || "DirectMessages";

    const author = message.author;
    const authorName = author?.global_name || author?.globalName || author?.username || "DiscordUser";
    const authorId = author?.id || "0";

    const maxBytes = (settings.store.maxFileSizeMB || 50) * 1024 * 1024;
    const customDir = settings.store.savePath || "";
    const Native = getNative();

    for (const item of mediaItems) {
        if (processedUrls.has(item.url) || processedUrls.has(item.id)) continue;
        if (item.size && item.size > maxBytes) continue;
        if (!isEligibleMediaType(item.filename, item.contentType)) continue;

        processedUrls.add(item.url);
        processedUrls.add(item.id);

        try {
            let savedPath = "";
            let finalSize = item.size || 0;

            if (Native?.downloadAndSaveMedia) {
                const res = await Native.downloadAndSaveMedia({
                    url: item.url,
                    filename: item.filename,
                    guildName,
                    channelName,
                    authorName,
                    customDir
                });
                savedPath = res.savedPath;
                finalSize = res.size;
            }

            const record: SnipedAttachment = {
                id: item.id,
                messageId: message.id,
                channelId: channelId || "",
                channelName,
                guildId: channel?.guild_id,
                guildName,
                authorId,
                authorName,
                filename: item.filename,
                url: item.url,
                size: finalSize,
                contentType: item.contentType,
                savedPath,
                timestamp: Date.now()
            };

            snipedStore.unshift(record);
            if (snipedStore.length > 1000) snipedStore.pop();
            saveSnipedStore();

        } catch (err) {
            console.debug("[SnipeAttachments] Download error:", err);
        }
    }
}

function handleMessageDelete(deletedIds: string[]) {
    if (!deletedIds || deletedIds.length === 0) return;
    const deletedSet = new Set(deletedIds);

    let updated = false;
    for (const record of snipedStore) {
        if (deletedSet.has(record.messageId) && !record.isDeleted) {
            record.isDeleted = true;
            updated = true;

            if (settings.store.notifyOnDeleted !== false) {
                showToast(
                    `Attachment sniped from ${record.authorName}: ${record.filename}`,
                    Toasts.Type.INFO
                );
            }
        }
    }

    if (updated) {
        saveSnipedStore();
    }
}

export function snipeCurrentChannelMedia() {
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;

    const messages = MessageStore.getMessages(channelId);
    if (!messages) return;

    let count = 0;
    const rawArray = typeof (messages as any).toArray === "function" ? (messages as any).toArray() : messages;

    for (const msg of rawArray) {
        processIncomingMessage(msg);
        count++;
    }

    showToast(`Scanned ${count} messages for attachments in channel`, Toasts.Type.SUCCESS);
}

function SnipeAttachmentsSettingsComponent() {
    const [pathValue, setPathValue] = React.useState(settings.store.savePath || "");
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);

    React.useEffect(() => {
        const Native = getNative();
        if (!settings.store.savePath && Native?.getDefaultSaveDirectory) {
            Native.getDefaultSaveDirectory().then(def => {
                if (def && !settings.store.savePath) {
                    settings.store.savePath = def;
                    setPathValue(def);
                }
            });
        }
    }, []);

    const handleSelectFolder = async () => {
        const Native = getNative();
        if (!Native?.selectSaveDirectory) return;
        const chosen = await Native.selectSaveDirectory();
        if (chosen) {
            settings.store.savePath = chosen;
            setPathValue(chosen);
            showToast("Save folder updated", Toasts.Type.SUCCESS);
        }
    };

    const handleOpenFolder = () => {
        const Native = getNative();
        const target = settings.store.savePath || pathValue;
        if (Native?.openFolder && target) {
            Native.openFolder(target);
        }
    };

    const handleOpenGallery = () => {
        openModal(props => (
            <SnipeGalleryModal
                snipedList={[...snipedStore]}
                savePath={settings.store.savePath || pathValue}
                onDeleteEntry={(id) => {
                    const idx = snipedStore.findIndex(s => s.id === id);
                    if (idx !== -1) {
                        const item = snipedStore[idx];
                        const Native = getNative();
                        if (item.savedPath && Native?.deleteSavedFile) {
                            Native.deleteSavedFile(item.savedPath);
                        }
                        snipedStore.splice(idx, 1);
                        saveSnipedStore();
                        forceUpdate();
                    }
                }}
                onClearAll={() => {
                    snipedStore.length = 0;
                    saveSnipedStore();
                    forceUpdate();
                }}
                onClose={props.onClose}
                transitionState={props.transitionState}
            />
        ));
    };

    const totalCount = snipedStore.length;
    const deletedCount = snipedStore.filter(s => s.isDeleted).length;

    return (
        <div style={{ width: "100%", marginTop: "10px" }}>
            {/* Gallery Launcher & Stats Card */}
            <Card variant="primary" outline style={{ padding: "16px", background: "var(--background-secondary, #2b2d31)", borderRadius: "8px", marginBottom: "16px" }}>
                <Flex alignItems={FlexAlign.CENTER} justifyContent={FlexJustify.BETWEEN} style={{ width: "100%" }}>
                    <div>
                        <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "14px", display: "block" }}>
                            {t("Snipe Attachments Storage")}
                        </span>
                        <span style={{ color: "var(--text-muted, #949ba4)", fontSize: "12px" }}>
                            {totalCount} {t("cached files")}
                            {deletedCount > 0 && ` • ${deletedCount} ${t("preserved after author deleted message")}`}
                        </span>
                    </div>
                    <Flex alignItems={FlexAlign.CENTER} gap="8px">
                        <Button
                            variant="secondary"
                            onClick={snipeCurrentChannelMedia}
                        >
                            {t("Scan Current Channel")}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleOpenGallery}
                        >
                            {t("Open Sniped Attachments Gallery")}
                        </Button>
                    </Flex>
                </Flex>
            </Card>

            {/* Custom Save Folder Picker */}
            <div style={{ marginBottom: "16px" }}>
                <span style={{ color: "#ffffff", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>
                    {t("Save Folder Directory")}
                </span>
                <Flex alignItems={FlexAlign.CENTER} gap="8px" style={{ width: "100%" }}>
                    <TextInput
                        value={pathValue}
                        onChange={(val: string) => {
                            setPathValue(val);
                            settings.store.savePath = val.trim();
                        }}
                        placeholder="C:\Users\...\LoliCord_SnipeAttachments"
                        style={{ flex: 1 }}
                    />
                    <Button
                        variant="secondary"
                        onClick={handleSelectFolder}
                    >
                        {t("Browse Folder")}
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handleOpenFolder}
                    >
                        {t("Open Folder")}
                    </Button>
                </Flex>
            </div>
        </div>
    );
}

export default definePlugin({
    name: "SnipeAttachments",
    description: "Automatically downloads and caches incoming photos, videos, and files in the background so you can view them even if deleted.",
    authors: [
        { name: "LoliCord", id: 0n }
    ],
    enabledByDefault: false,
    settings,
    settingsAboutComponent: SnipeAttachmentsSettingsComponent,

    flux: {
        MESSAGE_CREATE(event: any) {
            processIncomingMessage(event);
        },
        MESSAGE_UPDATE(event: any) {
            processIncomingMessage(event);
        },
        LOAD_MESSAGES_SUCCESS(event: any) {
            if (Array.isArray(event.messages)) {
                for (const msg of event.messages) {
                    processIncomingMessage(msg);
                }
            }
        },
        MESSAGE_DELETE({ id }: any) {
            if (id) handleMessageDelete([id]);
        },
        MESSAGE_DELETE_BULK({ ids }: any) {
            if (Array.isArray(ids)) handleMessageDelete(ids);
        }
    },

    start() {
        loadSnipedStore();
    },

    stop() {
        processedUrls.clear();
    }
});

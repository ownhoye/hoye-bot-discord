/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Nightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface SnipedAttachment {
    id: string;
    messageId: string;
    channelId: string;
    channelName: string;
    guildId?: string;
    guildName?: string;
    authorId: string;
    authorName: string;
    filename: string;
    url: string;
    size: number;
    contentType?: string;
    savedPath: string;
    timestamp: number;
    isDeleted?: boolean;
}

export interface SnipePluginSettings {
    savePath: string;
    autoDownload: boolean;
    maxFileSizeMB: number;
    saveImages: boolean;
    saveVideos: boolean;
    saveAudio: boolean;
    saveDocuments: boolean;
    notifyOnDeleted: boolean;
}

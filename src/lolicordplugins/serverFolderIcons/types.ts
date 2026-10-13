/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Nightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type BackgroundMode = "transparent" | "folderColor" | "solid";

export interface CustomFolderIconData {
    url: string;
    size?: number; // 20 - 150 (percentage, default 100)
    radius?: number; // 0 - 50 (percentage, default 33 for standard discord shape)
    bgMode?: BackgroundMode; // default "folderColor"
    customBgColor?: string;
}

export type FolderIconsMap = Record<string, CustomFolderIconData | null | undefined>;

export interface ServerFolderProps {
    folderId: number | string;
    folderColor?: number;
    folderName?: string;
    guildIds?: string[];
}

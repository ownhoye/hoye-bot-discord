/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface VoiceIsolatorState {
    isolatedUserIds: string[];
    isolatedUserId: string | null;
    isolatedUserName: string | null;
    isolatedUserAvatar: string | null;
    channelId: string | null;
    originalVolumes: Record<string, number>;
}

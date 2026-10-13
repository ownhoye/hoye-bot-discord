/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Nightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface ScreenFreezeState {
    isFrozen: boolean;
    frozenTimestamp?: number;
    hasActiveStream: boolean;
}

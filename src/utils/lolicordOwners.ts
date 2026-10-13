/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Discord user IDs allowed to see the owner tools (writing / deleting announcements).
 * This only controls the UI: publishing still requires a GitHub token with write
 * access to the repository, so adding an ID here grants nothing by itself.
 */
export const LOLICORD_OWNER_IDS: readonly string[] = [
    "1403456424461467708",
];

export const isLoliCordOwner = (userId: string | null | undefined) => !!userId && LOLICORD_OWNER_IDS.includes(userId);

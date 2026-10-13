/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** Discord user IDs shown with the "LoliCord Owner" profile badge. */
export const LOLICORD_OWNER_IDS: readonly string[] = [
    "1403456424461467708",
];

export const isLoliCordOwner = (userId: string) => LOLICORD_OWNER_IDS.includes(userId);

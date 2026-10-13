/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Per-plugin cloud configs were stored on the Nightcord API, which LoliCord no longer uses.
// The functions keep their signatures so plugins degrade to local-only behaviour.

import { LOLICORD_ACCOUNT_UNAVAILABLE } from "./OAuth2";

export async function getOwnPluginConfig(_pluginName: string, _token: string): Promise<any> {
    throw new Error(LOLICORD_ACCOUNT_UNAVAILABLE);
}

export async function saveOwnPluginConfig(_pluginName: string, _token: string, _settings: Record<string, unknown>): Promise<any> {
    throw new Error(LOLICORD_ACCOUNT_UNAVAILABLE);
}

export async function getPublicPluginConfig(_pluginName: string, _userId: string): Promise<any> {
    return null;
}

export function clearPublicProfileCache() {}

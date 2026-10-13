/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The LoliCord account API was hosted by Nightcord (api.nightcord.st). LoliCord no longer
// talks to that server, so these helpers keep their signatures but never reach the network.
export const API_BASE = "";
export const LOLICORD_ACCOUNT_UNAVAILABLE = "LoliCord accounts are not available.";

import * as DataStore from "./DataStore";

export const OAUTH_TOKEN_KEY = "lolicord_oauth_token";

export async function beginDiscordOAuth(_state?: string): Promise<{ url: string; redirectUri: string; scopes: string[]; }> {
    throw new Error(LOLICORD_ACCOUNT_UNAVAILABLE);
}

export async function checkOAuthToken(_token: string): Promise<any> {
    return null;
}

/** Always null: tokens from the old Nightcord account API are never reused. */
export async function getStoredToken(): Promise<string | null> {
    return null;
}

export async function storeToken(token: string) {
    await DataStore.set(OAUTH_TOKEN_KEY, token);
}

export async function clearToken() {
    await DataStore.del(OAUTH_TOKEN_KEY);
}

export async function authorizeUser(): Promise<string | null> {
    return null;
}

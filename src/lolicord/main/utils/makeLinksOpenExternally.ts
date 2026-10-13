/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { type BrowserWindow, shell } from "electron";
import { RendererSettings } from "../../../main/settings";

const DISCORD_HOSTNAMES = [
    "discord.com",
    "canary.discord.com",
    "ptb.discord.com",
    "discordapp.com"
];

export function handleExternalUrl(url: string, protocol?: string): { action: "deny" | "allow" } {
    if (protocol == null) {
        try {
            protocol = new URL(url).protocol;
        } catch {
            return { action: "deny" };
        }
    }

    try {
        const u = new URL(url);
        const isDiscord = DISCORD_HOSTNAMES.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`));
        if (isDiscord) {
            const target = u.searchParams.get("target");
            if (target) {
                try {
                    const targetHost = new URL(target).hostname.toLowerCase();
                    if (!DISCORD_HOSTNAMES.some(h => targetHost === h || targetHost.endsWith(`.${h}`))) {
                        return handleExternalUrl(target);
                    }
                } catch {}
            }
            return { action: "allow" };
        }
    } catch {}

    switch (protocol) {
        case "http:":
        case "https:":
            if (RendererSettings?.store?.openLinksWithElectron) {
                return { action: "allow" };
            }
            shell.openExternal(url).catch(() => {});
            break;
        case "mailto:":
        case "spotify:":
        case "steam:":
            shell.openExternal(url).catch(() => {});
            break;
    }

    return { action: "deny" };
}

export function makeLinksOpenExternally(win: BrowserWindow) {
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (!url || url === "about:blank") {
            return { action: "allow" };
        }

        try {
            var { protocol, hostname } = new URL(url);
        } catch {
            return { action: "deny" };
        }

        const isDiscord = DISCORD_HOSTNAMES.some(h => hostname === h || hostname.endsWith(`.${h}`));
        if (isDiscord) {
            return { action: "allow" };
        }

        // Allow captchas
        if (
            hostname.includes("hcaptcha.com") ||
            hostname.includes("recaptcha.net") ||
            (hostname.includes("google.com") && url.includes("recaptcha"))
        ) {
            return { action: "allow" };
        }

        return handleExternalUrl(url, protocol);
    });
}

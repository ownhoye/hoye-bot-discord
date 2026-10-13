/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { showToast, Toasts } from "@webpack/common";
import { t } from "../autoTranslateLoliCord";

const GatewaySocket = findByPropsLazy("getSocket");

function getSpoofedProperties() {
    const platform = settings.store.platform ?? "desktop";
    switch (platform) {
        case "desktop":
            return {
                os: "Windows",
                browser: "Discord Client",
                device: "",
                system_locale: "en-US"
            };
        case "web":
            return {
                os: "Windows",
                browser: "Discord Web",
                device: "",
                browser_user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                browser_version: "128.0.0.0"
            };
        case "android":
            return {
                os: "Android",
                browser: "Discord Android",
                device: "Samsung Galaxy S24",
                os_version: "14",
                browser_user_agent: "Discord-Android/240000; Mozilla/5.0 (Linux; Android 14; SM-S928B)",
                system_locale: "en-US"
            };
        case "ios":
            return {
                os: "iOS",
                browser: "Discord iOS",
                device: "iPhone 15,3",
                os_version: "17.4",
                browser_user_agent: "Discord-iOS/240000; Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)",
                system_locale: "en-US"
            };
        case "xbox":
            return {
                os: "Xbox",
                browser: "Discord Embedded",
                device: "Xbox Series X"
            };
        case "playstation":
            return {
                os: "PlayStation 5",
                browser: "Discord Embedded",
                device: "PlayStation 5"
            };
        case "vr":
            return {
                os: "Android",
                browser: "Discord VR",
                device: "Meta Quest 3"
            };
        default:
            return {
                os: "Windows",
                browser: "Discord Client",
                device: ""
            };
    }
}

function reconnectGateway() {
    try {
        const socket = GatewaySocket?.getSocket?.();
        if (socket) {
            if (typeof socket.close === "function") {
                socket.close();
            } else if (socket.ws && typeof socket.ws.close === "function") {
                socket.ws.close();
            }
            showToast(t("Platform updated! Reconnecting Gateway..."), Toasts.Type.SUCCESS);
        } else {
            showToast(t("Platform updated!"), Toasts.Type.SUCCESS);
        }
    } catch {
        showToast(t("Platform updated!"), Toasts.Type.SUCCESS);
    }
}

const settings = definePluginSettings({
    platform: {
        type: OptionType.SELECT,
        description: "What platform to show up as on",
        options: [
            { label: "Desktop (Windows)", value: "desktop", default: true },
            { label: "Web Browser", value: "web" },
            { label: "Android Mobile", value: "android" },
            { label: "iOS (iPhone)", value: "ios" },
            { label: "Xbox Series", value: "xbox" },
            { label: "PlayStation 5", value: "playstation" },
            { label: "VR (Meta Quest)", value: "vr" },
        ],
        onChange: () => {
            reconnectGateway();
        }
    }
});

let unpatches: (() => void)[] = [];

export default definePlugin({
    name: "PlatformSpoofer",
    description: "Spoof what platform or device you're on instantly without reloading Discord",
    tags: ["Utility"],
    authors: [Devs.Ven],
    settings,

    start() {
        unpatches = [];
        const socket = GatewaySocket?.getSocket?.();
        if (!socket) return;

        const proto = Object.getPrototypeOf(socket);
        if (proto && typeof proto.send === "function") {
            const origSend = proto.send;
            proto.send = function (op: number, data: any, ...rest: any[]) {
                if (op === 2 && data?.properties) {
                    try {
                        const spoofed = getSpoofedProperties();
                        Object.assign(data.properties, spoofed);
                    } catch {}
                }
                return origSend.call(this, op, data, ...rest);
            };
            unpatches.push(() => {
                proto.send = origSend;
            });
        }

        // Also patch direct socket instance if present
        if (typeof socket.send === "function" && socket.send !== proto.send) {
            const origInstSend = socket.send;
            socket.send = function (op: number, data: any, ...rest: any[]) {
                if (op === 2 && data?.properties) {
                    try {
                        const spoofed = getSpoofedProperties();
                        Object.assign(data.properties, spoofed);
                    } catch {}
                }
                return origInstSend.call(this, op, data, ...rest);
            };
            unpatches.push(() => {
                socket.send = origInstSend;
            });
        }

        // Reconnect if platform is non-default to immediately apply spoof
        if (settings.store.platform && settings.store.platform !== "desktop") {
            reconnectGateway();
        }
    },

    stop() {
        for (const unpatch of unpatches) {
            try { unpatch(); } catch {}
        }
        unpatches = [];
        // Reconnect to restore original platform identification
        reconnectGateway();
    }
});

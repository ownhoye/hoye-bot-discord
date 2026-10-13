/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import definePlugin, { OptionType } from "@utils/types";
import { React } from "@webpack/common";
import plugins from "~plugins";

import { t } from "../autoTranslateLoliCord";

// ── Settings ───────────────────────────────────────────────────────────────────

export const settings = definePluginSettings({
    isActive: {
        type: OptionType.BOOLEAN,
        description: "Enable automatic conversion of ALL CAPS messages to lowercase",
        default: true,
    },
    threshold: {
        type: OptionType.SLIDER,
        description: "Uppercase threshold percentage to trigger conversion (default: 60%)",
        markers: [40, 50, 60, 70, 80, 90, 100],
        default: 60,
    },
    minLetters: {
        type: OptionType.SLIDER,
        description: "Minimum letter count in the message to evaluate (default: 4 letters)",
        markers: [2, 3, 4, 5, 8, 10],
        default: 4,
    },
    capitalizeFirstLetter: {
        type: OptionType.BOOLEAN,
        description: "Capitalize the very first letter of the sentence when converted",
        default: false,
    },
    preserveAcronyms: {
        type: OptionType.BOOLEAN,
        description: "Preserve common short acronyms (e.g. GG, LOL, AFK, OMG, LMAO, WIP, BRB)",
        default: true,
    },
    showChatBarButton: {
        type: OptionType.BOOLEAN,
        description: "Show a quick toggle button in the chat bar",
        default: true,
    },
});

const COMMON_ACRONYMS = new Set([
    "GG", "LOL", "AFK", "OMG", "LMAO", "LMFAO", "WIP", "BRB", "IDK", "TBH",
    "IMO", "IMHO", "BTW", "FYI", "NGL", "GGWP", "MVP", "RIP", "NPC", "POV",
    "TLDR", "DM", "PM", "OOF", "WTF", "WTH", "EZ", "WP", "SMH", "IRL", "FR"
]);

// ── Icon Component ─────────────────────────────────────────────────────────────

function NoCapsIcon({ enabled }: { enabled: boolean; }) {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {/* Letter 'a' and 'A' typography representation */}
            <path d="M4 19L8 5l4 14" />
            <path d="M5.5 14h5" />
            <circle cx="18" cy="15" r="4" />
            <path d="M22 11v8" />
            {!enabled && (
                <line
                    x1="2"
                    y1="2"
                    x2="22"
                    y2="22"
                    stroke="var(--status-danger, #ed4245)"
                    strokeWidth="2.5"
                />
            )}
        </svg>
    );
}

const NoCapsChatBarButton: ChatBarButtonFactory = ({ type }) => {
    const [enabled, setEnabled] = React.useState(settings.store.isActive);
    const validChat = ["normal", "sidebar"].some(x => type.analyticsName === x);
    if (!validChat || !settings.store.showChatBarButton) return null;

    const toggle = () => {
        settings.store.isActive = !settings.store.isActive;
        setEnabled(settings.store.isActive);
    };

    const tooltip = enabled
        ? t("NoCaps: enabled — click to disable")
        : t("NoCaps: disabled — click to enable");

    return (
        <ChatBarButton
            tooltip={tooltip}
            onClick={toggle}
            onContextMenu={e => {
                e.preventDefault();
                openPluginModal(plugins["NoCaps"] ?? plugins["noCaps"]);
            }}
        >
            <NoCapsIcon enabled={enabled} />
        </ChatBarButton>
    );
};

// ── Helper: Process text ───────────────────────────────────────────────────────

export function convertNoCaps(text: string): string {
    if (!text || typeof text !== "string") return text;

    // Isolate URLs, code blocks, Discord mentions (<@123>, <#123>, <:emoji:123>)
    const placeholderMap: string[] = [];
    const protectedText = text.replace(
        /(https?:\/\/[^\s]+|```[\s\S]*?```|`[^`]+`|<[@#&!a-z0-9_:]+>)/gi,
        match => {
            const idx = placeholderMap.length;
            placeholderMap.push(match);
            return `__NOCAPS_PLACEHOLDER_${idx}__`;
        }
    );

    // Extract all alphabetical letters (including accented characters)
    const letterMatches = protectedText.match(/[\p{L}]/gu) || [];
    if (letterMatches.length < (settings.store.minLetters || 4)) {
        return text;
    }

    // Count uppercase letters
    let upperCount = 0;
    for (const letter of letterMatches) {
        if (letter === letter.toUpperCase() && letter !== letter.toLowerCase()) {
            upperCount++;
        }
    }

    const ratio = (upperCount / letterMatches.length) * 100;
    const threshold = settings.store.threshold ?? 60;

    if (ratio < threshold) {
        return text;
    }

    // Convert text
    let converted: string;

    if (settings.store.preserveAcronyms) {
        // Tokenize by words and preserve recognized short acronyms
        converted = protectedText.replace(/\b[\p{L}\p{N}]+\b/gu, word => {
            if (COMMON_ACRONYMS.has(word.toUpperCase()) && word.length <= 5) {
                return word;
            }
            return word.toLowerCase();
        });
    } else {
        converted = protectedText.toLowerCase();
    }

    // Optional: capitalize first letter of converted text
    if (settings.store.capitalizeFirstLetter) {
        converted = converted.replace(/^([\s\p{P}]*)([\p{L}])/u, (_, prefix, firstLetter) => {
            return prefix + firstLetter.toUpperCase();
        });
    }

    // Restore protected tokens (URLs, mentions, code blocks)
    for (let i = 0; i < placeholderMap.length; i++) {
        converted = converted.replace(`__NOCAPS_PLACEHOLDER_${i}__`, placeholderMap[i]);
    }

    return converted;
}

// ── Plugin Definition ──────────────────────────────────────────────────────────

export default definePlugin({
    name: "NoCaps",
    description: "Automatically converts messages containing 60%+ uppercase letters into lowercase before sending.",
    authors: [{ name: "Nightcord", id: 0n }],
    settings,

    chatBarButton: {
        icon: () => <NoCapsIcon enabled={settings.store.isActive} />,
        render: NoCapsChatBarButton,
    },

    onBeforeMessageSend(_channelId: string, message: { content: string; }) {
        if (!settings.store.isActive || !message.content) return;

        const transformed = convertNoCaps(message.content);
        if (transformed && transformed !== message.content) {
            message.content = transformed;
        }
    },
});

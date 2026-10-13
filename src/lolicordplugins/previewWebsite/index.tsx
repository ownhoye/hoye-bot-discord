/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addMessageAccessory, removeMessageAccessory } from "@api/MessageAccessories";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { React } from "@webpack/common";

import { t } from "../autoTranslateLoliCord";

// ── Settings ───────────────────────────────────────────────────────────────────

export const settings = definePluginSettings({
    autoExpand: {
        type: OptionType.BOOLEAN,
        description: "Automatically expand website previews (off by default)",
        default: false,
    },
    defaultScale: {
        type: OptionType.SELECT,
        description: "Default preview zoom scale (display full desktop layout in miniature)",
        options: [
            { label: "50% (Full Desktop Miniature)", value: 0.5, default: true },
            { label: "65% (Medium Miniature)", value: 0.65 },
            { label: "75% (Comfortable)", value: 0.75 },
            { label: "100% (Native 1:1 Responsive)", value: 1.0 },
        ],
        default: 0.5,
    },
    defaultHeight: {
        type: OptionType.SELECT,
        description: "Default preview frame height",
        options: [
            { label: "Compact (300px)", value: 300 },
            { label: "Medium (420px)", value: 420, default: true },
            { label: "Large (560px)", value: 560 },
        ],
        default: 420,
    },
    maxPreviewsPerMessage: {
        type: OptionType.SELECT,
        description: "Maximum previews to display per message",
        options: [
            { label: "MAX (All links)", value: 0, default: true },
            { label: "1 preview", value: 1 },
            { label: "2 previews", value: 2 },
            { label: "3 previews", value: 3 },
            { label: "5 previews", value: 5 },
            { label: "10 previews", value: 10 },
        ],
        default: 0,
    },
    allowScripts: {
        type: OptionType.BOOLEAN,
        description: "Allow interactive JavaScript execution inside the preview sandbox",
        default: true,
    },
});

// ── URL Extraction & Filtering ─────────────────────────────────────────────────

const MEDIA_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov|mkv|mp3|ogg|wav|flac|m4a|pdf)(\?[^#]*)?(#.*)?$/i;

// Strictly block only Discord domains to prevent nested routing or UI hijacking
const BLOCKED_DOMAINS = [
    "discord.com",
    "discord.gg",
    "discordapp.com",
    "discordapp.net",
    "discord.media",
    "discord.gift",
    "cdn.discordapp.com",
    "media.discordapp.net",
    "localhost",
    "127.0.0.1",
    "nightcord.st"
];

function getIframeSrc(rawUrl: string): string {
    try {
        const u = new URL(rawUrl);
        const host = u.hostname.toLowerCase();
        // YouTube video link -> embed link so it renders and plays smoothly in iframe
        if (host === "youtu.be") {
            const videoId = u.pathname.slice(1);
            if (videoId) return `https://www.youtube-nocookie.com/embed/${videoId}`;
        }
        if (host === "youtube.com" || host.endsWith(".youtube.com")) {
            if (u.pathname === "/watch") {
                const v = u.searchParams.get("v");
                if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
            }
            if (u.pathname.startsWith("/shorts/")) {
                const v = u.pathname.replace("/shorts/", "");
                if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
            }
        }
    } catch { }
    return rawUrl;
}

function extractValidUrls(content: string): string[] {
    if (!content) return [];

    const urlRegex = /https?:\/\/[^\s<>"`{}|\\^]+/gi;
    const matches = content.match(urlRegex) || [];
    const valid: string[] = [];

    for (let rawUrl of matches) {
        // Strip trailing punctuation and markdown syntax
        rawUrl = rawUrl.replace(/[.,!?;:)>\]]+$/, "");

        try {
            const parsed = new URL(rawUrl);

            // Filter out non-http protocols
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;

            // Filter out direct media files
            if (MEDIA_EXTENSIONS.test(parsed.pathname)) continue;

            // Filter out blocked domains
            const h = parsed.hostname.toLowerCase();
            if (BLOCKED_DOMAINS.some(d => h === d || h.endsWith("." + d))) continue;

            if (!valid.includes(rawUrl)) {
                valid.push(rawUrl);
            }
        } catch { }
    }

    const limit = Number(settings.store.maxPreviewsPerMessage);
    return (limit && limit > 0) ? valid.slice(0, limit) : valid;
}

// ── Single Preview Card Component ──────────────────────────────────────────────

function PreviewCard({ url }: { url: string; }) {
    const [isExpanded, setIsExpanded] = React.useState(settings.store.autoExpand);
    const [heightMode, setHeightMode] = React.useState<"normal" | "tall">("normal");
    const [scaleMode, setScaleMode] = React.useState<number>(Number(settings.store.defaultScale) || 0.5);
    const [isLoading, setIsLoading] = React.useState(true);
    const [reloadKey, setReloadKey] = React.useState(0);

    let hostname = "";
    let faviconUrl = "";
    try {
        const u = new URL(url);
        hostname = u.hostname;
        faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=64`;
    } catch {
        hostname = url;
    }

    const baseHeight = Number(settings.store.defaultHeight) || 420;
    const currentHeight = heightMode === "tall" ? baseHeight + 200 : baseHeight;

    // Desktop virtual width (e.g. 1240px) so the full desktop layout renders in miniature
    const virtualWidth = scaleMode < 1 ? Math.round(620 / scaleMode) : 620;
    const virtualHeight = Math.round(currentHeight / scaleMode);

    const sandboxFlags = settings.store.allowScripts
        ? "allow-scripts allow-forms allow-same-origin allow-popups"
        : "allow-forms allow-same-origin";

    const handleToggle = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isExpanded) setIsLoading(true);
        setIsExpanded(!isExpanded);
    };

    const cycleScale = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (scaleMode <= 0.5) setScaleMode(0.75);
        else if (scaleMode <= 0.75) setScaleMode(1.0);
        else setScaleMode(0.5);
    };

    return (
        <div
            className={`pw-card ${isExpanded ? "pw-card--expanded" : "pw-card--collapsed"}`}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
        >
            {/* Header / Trigger bar */}
            <div
                className="pw-header"
                onClick={handleToggle}
                title={isExpanded ? t("Click to collapse preview") : t("Click to preview website")}
            >
                <div className="pw-header-left">
                    {faviconUrl && (
                        <img
                            className="pw-favicon"
                            src={faviconUrl}
                            alt=""
                            onError={e => { (e.target as HTMLElement).style.display = "none"; }}
                        />
                    )}
                    <span className="pw-hostname">{hostname}</span>
                    <span className="pw-privacy-badge">{t("SANDBOXED")}</span>
                    {!isExpanded && (
                        <span className="pw-expand-hint">{t("Click to preview")}</span>
                    )}
                </div>

                <div className="pw-controls" onClick={e => e.stopPropagation()}>
                    {/* Zoom / Scale Toggle */}
                    {isExpanded && (
                        <button
                            className="pw-btn pw-scale-badge"
                            onClick={cycleScale}
                            title={`${t("Scale")}: ${Math.round(scaleMode * 100)}% — ${t("Click to change zoom")}`}
                        >
                            <span>{Math.round(scaleMode * 100)}%</span>
                        </button>
                    )}

                    {/* Expand/Shrink Height */}
                    {isExpanded && (
                        <button
                            className={`pw-btn ${heightMode === "tall" ? "pw-btn--active" : ""}`}
                            onClick={e => {
                                e.stopPropagation();
                                setHeightMode(heightMode === "normal" ? "tall" : "normal");
                            }}
                            title={heightMode === "normal" ? t("Expand height") : t("Shrink height")}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                {heightMode === "normal" ? (
                                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                                ) : (
                                    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14L3 21" />
                                )}
                            </svg>
                        </button>
                    )}

                    {/* Refresh */}
                    {isExpanded && (
                        <button
                            className="pw-btn"
                            onClick={e => {
                                e.stopPropagation();
                                setIsLoading(true);
                                setReloadKey(k => k + 1);
                            }}
                            title={t("Reload preview")}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                            </svg>
                        </button>
                    )}

                    {/* Open in external browser */}
                    <button
                        className="pw-btn"
                        onClick={e => {
                            e.stopPropagation();
                            window.open(url, "_blank", "noopener,noreferrer");
                        }}
                        title={t("Open in external browser")}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                    </button>

                    {/* Toggle Chevron */}
                    <button
                        className="pw-btn"
                        onClick={handleToggle}
                        title={isExpanded ? t("Collapse") : t("Expand")}
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            style={{
                                transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                                transition: "transform 0.2s ease"
                            }}
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Interactive Scaled Viewport: ONLY mounted when expanded */}
            {isExpanded && (
                <div className="pw-viewport-wrapper" style={{ height: `${currentHeight}px` }}>
                    {isLoading && (
                        <div className="pw-loading-overlay">
                            <div className="pw-spinner" />
                            <span>{t("Loading secure preview...")}</span>
                        </div>
                    )}
                    <div
                        className="pw-scaler"
                        style={{
                            width: `${virtualWidth}px`,
                            height: `${virtualHeight}px`,
                            transform: `scale(${scaleMode})`,
                            transformOrigin: "0 0",
                        }}
                    >
                        <iframe
                            key={reloadKey}
                            className="pw-iframe"
                            src={getIframeSrc(url)}
                            sandbox={sandboxFlags}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            onLoad={() => setIsLoading(false)}
                            title={`Preview of ${hostname}`}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Message Accessory Component ────────────────────────────────────────────────

function WebsitePreviewAccessory({ message }: { message: any; }) {
    const urls = React.useMemo(() => {
        return extractValidUrls(message?.content || "");
    }, [message?.content]);

    if (!urls || urls.length === 0) return null;

    return (
        <div className="pw-container" onClick={e => e.stopPropagation()}>
            {urls.map(url => (
                <PreviewCard key={url} url={url} />
            ))}
        </div>
    );
}

// ── Plugin Definition ──────────────────────────────────────────────────────────

const ACCESSORY_ID = "lolicord-website-preview";

export default definePlugin({
    name: "PreviewWebsite",
    description: "Displays a live, scrollable and sandboxed website preview directly below links in messages with full privacy protection.",
    authors: [{ name: "Nightcord", id: 0n }],
    settings,

    start() {
        addMessageAccessory(ACCESSORY_ID, props => (
            <WebsitePreviewAccessory message={props.message} />
        ));
    },

    stop() {
        removeMessageAccessory(ACCESSORY_ID);
    },
});

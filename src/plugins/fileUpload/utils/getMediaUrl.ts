/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Toasts } from "@webpack/common";
import { t } from "../../../lolicordplugins/autoTranslateLoliCord";

const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "tiff", "avif", "svg", "apng"];
const videoExtensions = ["mp4", "webm", "ogg", "avi", "wmv", "flv", "mov", "mkv", "m4v"];
const supportedExtensions = [...imageExtensions, ...videoExtensions];

const mimeToExtension: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/x-icon": "ico",
    "image/tiff": "tiff",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/ogg": "ogg",
    "video/x-msvideo": "avi",
    "video/x-ms-wmv": "wmv",
    "video/x-flv": "flv",
    "video/quicktime": "mov",
    "video/x-matroska": "mkv"
};

export function getExtensionFromMime(mimeType: string): string | undefined {
    const baseMime = mimeType.split(";")[0].trim().toLowerCase();
    return mimeToExtension[baseMime];
}

const extensionToMime: Record<string, string> = {
    "png": "image/png",
    "apng": "image/apng",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "bmp": "image/bmp",
    "ico": "image/x-icon",
    "tiff": "image/tiff",
    "avif": "image/avif",
    "svg": "image/svg+xml",
    "mp4": "video/mp4",
    "webm": "video/webm",
    "ogg": "video/ogg",
    "avi": "video/x-msvideo",
    "wmv": "video/x-ms-wmv",
    "flv": "video/x-flv",
    "mov": "video/quicktime",
    "mkv": "video/x-matroska"
};

export function getMimeFromExtension(ext?: string): string {
    return extensionToMime[ext?.toLowerCase() ?? ""] || "application/octet-stream";
}

export async function getExtensionFromBytes(blob: Blob): Promise<string | undefined> {
    const buffer = await blob.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
        return "gif";
    }

    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
        const fullBuffer = await blob.slice(0, 4096).arrayBuffer();
        const fullBytes = new Uint8Array(fullBuffer);
        for (let i = 0; i < fullBytes.length - 4; i++) {
            if (fullBytes[i] === 0x61 && fullBytes[i + 1] === 0x63 &&
                fullBytes[i + 2] === 0x54 && fullBytes[i + 3] === 0x4C) {
                return "apng";
            }
        }
        return "png";
    }

    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        return "webp";
    }

    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
        return "jpg";
    }

    // MP4 / MOV ftyp box at offset 4
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        return "mp4";
    }

    // WebM / MKV EBML header
    if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
        return "webm";
    }

    return undefined;
}

export function getUrlExtension(url: string): string | undefined {
    if (!url) return undefined;
    if (url.startsWith("data:")) {
        const mimeMatch = url.match(/^data:([^;,]+)/i);
        return mimeMatch ? getExtensionFromMime(mimeMatch[1]) : "png";
    }
    if (url.startsWith("blob:")) {
        return undefined;
    }
    let normalized = url;
    if (!normalized.startsWith("https:") && !normalized.startsWith("http:")) {
        normalized = "https:" + normalized;
    }
    try {
        const parsed = new URL(normalized);
        let pathname = parsed.pathname.replace(/\/+$/, "");
        const lastSegment = pathname.split("/").pop() || "";
        if (lastSegment.includes(".")) {
            const ext = lastSegment.split(".").pop()?.toLowerCase();
            if (ext && ext.length > 0 && ext.length <= 10) return ext;
        }
        const formatParam = parsed.searchParams.get("format")?.toLowerCase();
        if (formatParam && supportedExtensions.includes(formatParam)) {
            return formatParam;
        }
        return undefined;
    } catch {
        return undefined;
    }
}

export function isVideoExtension(ext?: string): boolean {
    return Boolean(ext && videoExtensions.includes(ext.toLowerCase()));
}

export function isVideoUrl(url?: string | null): boolean {
    if (!url) return false;
    if (url.startsWith("data:video/")) return true;
    const ext = getUrlExtension(url);
    if (isVideoExtension(ext)) return true;
    try {
        const parsed = new URL(url, window.location.href);
        const pathLower = parsed.pathname.toLowerCase();
        return videoExtensions.some(vExt => pathLower.endsWith(`.${vExt}`) || pathLower.includes(`.${vExt}/`));
    } catch {
        return false;
    }
}

export function isSupported(url: string): boolean {
    if (!url) return false;
    if (url.startsWith("blob:") || url.startsWith("data:image/") || url.startsWith("data:video/")) return true;
    const ext = getUrlExtension(url);
    if (ext && supportedExtensions.includes(ext)) return true;
    try {
        const u = new URL(url, window.location.href);
        if (
            u.hostname === "cdn.discordapp.com" ||
            u.hostname === "media.discordapp.net" ||
            u.hostname.endsWith(".discordapp.net")
        ) {
            return true;
        }
    } catch { }
    return false;
}

export function normalizeDiscordMediaUrl(rawUrl: string): string {
    if (!rawUrl || rawUrl.startsWith("blob:") || rawUrl.startsWith("data:")) return rawUrl;
    try {
        const u = new URL(rawUrl, window.location.href);

        // Convert media.discordapp.net/attachments/... to cdn.discordapp.com/attachments/...
        // This ensures video poster thumbnails (?format=webp&width=...) resolve to the actual video/original file
        if (u.hostname === "media.discordapp.net" && u.pathname.startsWith("/attachments/")) {
            u.hostname = "cdn.discordapp.com";
            u.searchParams.delete("format");
            u.searchParams.delete("width");
            u.searchParams.delete("height");
            u.searchParams.delete("quality");
            u.searchParams.delete("size");
            u.searchParams.delete("animated");
            return u.toString();
        }

        // Handle external proxied URLs on *.discordapp.net/external/...
        if (u.hostname.endsWith(".discordapp.net") && u.pathname.includes("/external/")) {
            const pathExt = getUrlExtension(u.pathname);
            if (isVideoExtension(pathExt)) {
                const extMatch = u.pathname.match(/\/external\/[^/]+\/(https?)\/(.+)$/i);
                if (extMatch) {
                    return `${extMatch[1].toLowerCase()}://${extMatch[2]}`;
                }
            }
            u.searchParams.delete("format");
            u.searchParams.delete("width");
            u.searchParams.delete("height");
            return u.toString();
        }

        return u.toString();
    } catch {
        return rawUrl;
    }
}

export interface ResolvedMediaInfo {
    url: string;
    isVideo: boolean;
    filename?: string;
}

function extractMediaFromFiber(target: any): ResolvedMediaInfo | null {
    if (!target || typeof target !== "object") return null;
    try {
        const fiberKey = Object.keys(target).find(
            k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
        );
        if (!fiberKey) return null;

        let fiber = target[fiberKey];
        for (let i = 0; i < 25 && fiber; i++) {
            const p = fiber.memoizedProps;
            if (p && typeof p === "object") {
                // Direct attachment object
                const att = p.attachment || p.item?.originalItem;
                if (att && (att.url || att.proxy_url)) {
                    const raw = att.url || att.proxy_url;
                    const url = normalizeDiscordMediaUrl(raw);
                    const isVideo = Boolean(
                        att.content_type?.startsWith("video/") ||
                        p.item?.type === "VIDEO" ||
                        isVideoUrl(url) ||
                        isVideoUrl(att.filename)
                    );
                    return { url, isVideo, filename: att.filename };
                }

                // MediaMosaicItem item prop
                if (p.item && (p.item.downloadUrl || p.item.url || p.item.proxyUrl)) {
                    const raw = p.item.downloadUrl || p.item.url || p.item.proxyUrl;
                    const url = normalizeDiscordMediaUrl(raw);
                    const isVideo = Boolean(
                        p.item.type === "VIDEO" ||
                        p.item.contentType?.startsWith("video/") ||
                        isVideoUrl(url)
                    );
                    return { url, isVideo, filename: p.item.filename };
                }

                // Video component props
                if (p.downloadUrl && typeof p.downloadUrl === "string") {
                    const url = normalizeDiscordMediaUrl(p.downloadUrl);
                    const isVideo = Boolean(
                        p.type === "VIDEO" ||
                        p.contentType?.startsWith("video/") ||
                        isVideoUrl(url)
                    );
                    return { url, isVideo, filename: p.filename || p.fileName };
                }

                if (p.video && (p.video.url || p.video.proxyURL || p.video.proxy_url)) {
                    const raw = p.video.url || p.video.proxyURL || p.video.proxy_url;
                    return { url: normalizeDiscordMediaUrl(raw), isVideo: true };
                }
            }
            fiber = fiber.return;
        }
    } catch { }
    return null;
}

export function resolveDiscordMedia(props: {
    src?: string;
    href?: string;
    url?: string;
    itemSrc?: string;
    itemHref?: string;
    target?: any;
    attachment?: any;
    message?: any;
}): ResolvedMediaInfo | null {
    if (!props) return null;

    // 1. Direct attachment prop
    if (props.attachment && (props.attachment.url || props.attachment.proxy_url)) {
        const raw = props.attachment.url || props.attachment.proxy_url;
        const url = normalizeDiscordMediaUrl(raw);
        const isVideo = Boolean(
            props.attachment.content_type?.startsWith("video/") ||
            isVideoUrl(url) ||
            isVideoUrl(props.attachment.filename)
        );
        return { url, isVideo, filename: props.attachment.filename };
    }

    // 2. Inspect React Fiber on target (catches unplayed video thumbnails & MediaMosaic items)
    const fiberMedia = extractMediaFromFiber(props.target);
    if (fiberMedia && isSupported(fiberMedia.url)) {
        return fiberMedia;
    }

    // 3. Check DOM video / image elements around target
    const target = props.target as HTMLElement | undefined;
    if (target?.closest) {
        const mediaWrapper = target.closest(
            "[class*='imageWrapper'], [class*='video'], [class*='mosaicItem'], [class*='mediaAttachmentsContainer'], [class*='embedVideo'], [class*='embedMedia'], [class*='mediaViewer'], [class*='carouselModal'], [role='dialog']"
        ) as HTMLElement | null;

        const videoEl = (target.closest("video") ||
            target.querySelector?.("video") ||
            mediaWrapper?.querySelector?.("video")) as HTMLVideoElement | null;

        if (videoEl) {
            const vSrc = videoEl.currentSrc || videoEl.src || videoEl.querySelector("source")?.src || videoEl.poster;
            if (vSrc) {
                return {
                    url: normalizeDiscordMediaUrl(vSrc),
                    isVideo: true
                };
            }
        }
    }

    // 4. Direct URLs in props
    const rawPropUrl = props.itemHref || props.itemSrc || props.src || props.url || props.href;
    if (rawPropUrl && typeof rawPropUrl === "string") {
        const cleaned = normalizeDiscordMediaUrl(rawPropUrl);
        if (isSupported(cleaned)) {
            return {
                url: cleaned,
                isVideo: isVideoUrl(cleaned) || isVideoUrl(rawPropUrl)
            };
        }
    }

    // 5. Check DOM img around target
    if (target?.closest) {
        const mediaWrapper = target.closest(
            "[class*='imageWrapper'], [class*='video'], [class*='mosaicItem'], [class*='embedMedia'], [class*='mediaViewer'], [class*='carouselModal'], [role='dialog']"
        ) as HTMLElement | null;

        const imgEl = (target.closest("img") ||
            target.querySelector?.("img") ||
            mediaWrapper?.querySelector?.("img:not([class*='avatar']):not([class*='emoji'])") ||
            mediaWrapper?.querySelector?.("img")) as HTMLImageElement | null;

        if (imgEl?.src) {
            const cleaned = normalizeDiscordMediaUrl(imgEl.src);
            if (isSupported(cleaned)) {
                return {
                    url: cleaned,
                    isVideo: isVideoUrl(cleaned) || isVideoUrl(imgEl.src)
                };
            }
        }
    }

    // 6. Check message attachments / embeds if target is inside a media container or message has media
    const msg = props.message;
    if (msg && target?.closest?.("[class*='imageWrapper'], [class*='video'], [class*='mosaicItem'], [class*='mediaAttachments'], [class*='embed']")) {
        if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
            const att = msg.attachments[0];
            const raw = att.url || att.proxy_url;
            if (raw) {
                const cleaned = normalizeDiscordMediaUrl(raw);
                return {
                    url: cleaned,
                    isVideo: Boolean(att.content_type?.startsWith("video/") || isVideoUrl(cleaned) || isVideoUrl(att.filename)),
                    filename: att.filename
                };
            }
        }
        if (Array.isArray(msg.embeds)) {
            for (const embed of msg.embeds) {
                const v = embed?.video;
                if (v?.url || v?.proxyURL || v?.proxy_url) {
                    const raw = v.proxyURL || v.proxy_url || v.url;
                    return { url: normalizeDiscordMediaUrl(raw), isVideo: true };
                }
                const img = embed?.image || embed?.thumbnail;
                if (img?.url || img?.proxyURL || img?.proxy_url) {
                    const raw = img.proxyURL || img.proxy_url || img.url;
                    return { url: normalizeDiscordMediaUrl(raw), isVideo: false };
                }
            }
        }
    }

    return null;
}

export function getMediaUrl(props: { src?: string; href?: string; itemSrc?: string; itemHref?: string; target?: any; attachment?: any; message?: any; }): string | null {
    return resolveDiscordMedia(props)?.url ?? null;
}

async function fetchMediaBuffer(url: string, fallbackUrl?: string): Promise<{ buffer: ArrayBuffer; contentType?: string; finalExt?: string; }> {
    const win = window as any;
    const nativeFetch = win.VencordNative?.pluginHelpers?.FileUpload?.fetchFile;

    const trySingleUrl = async (targetUrl: string): Promise<{ buffer: ArrayBuffer; contentType?: string; } | null> => {
        if (!targetUrl) return null;

        // 1. For http/https URLs, prefer Electron main-process fetch to bypass CORS on cdn.discordapp.com videos
        if ((targetUrl.startsWith("https://") || targetUrl.startsWith("http://")) && typeof nativeFetch === "function") {
            try {
                const res = await nativeFetch(targetUrl);
                if (res?.success && res.data && res.data.byteLength > 0) {
                    return { buffer: res.data, contentType: res.contentType };
                }
            } catch { }
        }

        // 2. Renderer fetch (works for blob:, data:, and CORS-enabled URLs)
        try {
            const res = await fetch(targetUrl);
            if (res.ok) {
                const buffer = await res.arrayBuffer();
                if (buffer.byteLength > 0) {
                    return { buffer, contentType: res.headers.get("content-type") || undefined };
                }
            }
        } catch { }

        return null;
    };

    const cleaned = normalizeDiscordMediaUrl(url);

    // Special handling for Discord avatars/banners/icons (non-attachment CDN assets)
    try {
        const u = new URL(cleaned, window.location.href);
        if (
            (u.hostname === "cdn.discordapp.com" || u.hostname === "media.discordapp.net") &&
            !u.pathname.includes("/attachments/") &&
            !u.pathname.includes("/external/") &&
            !isVideoUrl(cleaned)
        ) {
            const basePath = u.pathname.replace(/\.(webp|webm|mp4|gif|png|jpg|jpeg)$/i, "");
            const isAnimated = u.pathname.includes(".gif") || u.pathname.includes("/a_");
            const tryExts = isAnimated ? [".gif", ".png"] : [".png", ".gif"];
            for (const ext of tryExts) {
                const candidate = new URL(u.toString());
                candidate.pathname = basePath + ext;
                candidate.searchParams.set("size", "4096");
                candidate.searchParams.delete("format");
                const result = await trySingleUrl(candidate.toString());
                if (result) {
                    return { ...result, finalExt: ext.slice(1) };
                }
            }
        }
    } catch { }

    const primary = await trySingleUrl(cleaned);
    if (primary) return primary;

    if (fallbackUrl && fallbackUrl !== cleaned) {
        const secondary = await trySingleUrl(fallbackUrl);
        if (secondary) return secondary;
    }

    throw new Error("Failed to fetch media");
}

export async function saveMediaFile(rawUrl: string, suggestedFilename?: string, forceIsVideo?: boolean): Promise<void> {
    const cleanedUrl = normalizeDiscordMediaUrl(rawUrl);
    const isVideo = forceIsVideo ?? (isVideoUrl(cleanedUrl) || isVideoUrl(rawUrl));

    try {
        const { buffer, contentType, finalExt: detectedAssetExt } = await fetchMediaBuffer(cleanedUrl, rawUrl);

        let ext = detectedAssetExt
            || (contentType ? getExtensionFromMime(contentType) : undefined)
            || await getExtensionFromBytes(new Blob([buffer.slice(0, 4100)]))
            || getUrlExtension(cleanedUrl)
            || getUrlExtension(rawUrl)
            || (isVideo ? "mp4" : "png");

        ext = ext.replace(/^\.+/, "").toLowerCase();

        let rawName = suggestedFilename || "";
        if (!rawName && !cleanedUrl.startsWith("blob:") && !cleanedUrl.startsWith("data:")) {
            try {
                const pathPart = new URL(cleanedUrl, window.location.href).pathname.split("/").pop() || "";
                rawName = decodeURIComponent(pathPart);
            } catch { }
        }

        if (!rawName) {
            rawName = isVideo ? `video_${Date.now()}` : `image_${Date.now()}`;
        }

        // Strip existing extension from rawName so we never produce video.mp4.mp4
        const baseName = rawName
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
            .replace(/\.[a-z0-9]{1,10}$/i, "")
            .trim() || (isVideo ? "video" : "image");

        const filename = `${baseName}.${ext}`;

        const win = window as any;
        if (win.DiscordNative?.fileManager?.saveWithDialog) {
            await win.DiscordNative.fileManager.saveWithDialog(new Uint8Array(buffer), filename);
        } else {
            const blob = new Blob([buffer], { type: getMimeFromExtension(ext) });
            const objUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = objUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
        }

        Toasts.show(Toasts.create(t(isVideo ? "Video saved successfully!" : "Image saved successfully!"), Toasts.Type.SUCCESS));
    } catch (e) {
        console.error("[LoliCord] Failed to save media:", e);
        Toasts.show(Toasts.create(t(isVideo ? "Failed to save video" : "Failed to save image"), Toasts.Type.FAILURE));
    }
}

export async function copyMediaImage(rawUrl: string): Promise<void> {
    try {
        const { buffer } = await fetchMediaBuffer(rawUrl, rawUrl);
        const win = window as any;
        if (win.DiscordNative?.clipboard?.copyImage) {
            win.DiscordNative.clipboard.copyImage(new Uint8Array(buffer), rawUrl);
        } else if (win.VesktopNative?.clipboard?.copyImage) {
            win.VesktopNative.clipboard.copyImage(new Uint8Array(buffer), rawUrl);
        } else {
            const blob = new Blob([buffer], { type: "image/png" });
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        }
        Toasts.show(Toasts.create(t("Image copied to clipboard!"), Toasts.Type.SUCCESS));
    } catch (e) {
        console.error("[LoliCord] Failed to copy image:", e);
        Toasts.show(Toasts.create(t("Failed to copy image"), Toasts.Type.FAILURE));
    }
}


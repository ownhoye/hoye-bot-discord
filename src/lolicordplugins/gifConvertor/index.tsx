/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import definePlugin from "@utils/types";
import { CloudUploadPlatform } from "@vencord/discord-types/enums";
import {
    Button,
    CloudUploader,
    Constants,
    FluxDispatcher,
    MessageActions,
    PendingReplyStore,
    React,
    RestAPI,
    SelectedChannelStore,
    showToast,
    SnowflakeUtils,
    Toasts,
} from "@webpack/common";
import { t } from "../autoTranslateLoliCord";

import { encodeGIF } from "./gifEncoder";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage = "idle" | "converting" | "preview" | "sending" | "error";

interface PopoverPosition {
    bottom: number;
    left: number;
}

// ─── Upload Helper ────────────────────────────────────────────────────────────

async function sendGIF(gifBlob: Blob, filename: string) {
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) throw new Error("No channel selected");

    const reply = PendingReplyStore.getPendingReply(channelId);
    if (reply) FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });

    const file = new File([gifBlob], filename, { type: "image/gif" });

    const uploader = new CloudUploader(
        { file, isThumbnail: false, platform: CloudUploadPlatform.WEB },
        channelId
    );

    return new Promise<void>((resolve, reject) => {
        uploader.on("complete", () => {
            RestAPI.post({
                url: Constants.Endpoints.MESSAGES(channelId),
                body: {
                    flags: 0,
                    channel_id: channelId,
                    content: "",
                    nonce: SnowflakeUtils.fromTimestamp(Date.now()),
                    sticker_ids: [],
                    type: 0,
                    attachments: [{
                        id: "0",
                        filename: uploader.filename,
                        uploaded_filename: uploader.uploadedFilename,
                    }],
                    message_reference: reply
                        ? MessageActions.getSendMessageOptionsForReply(reply)?.messageReference
                        : null,
                },
            }).then(() => resolve()).catch(reject);
        });
        uploader.on("error", reject);
        uploader.upload();
    });
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function GifIcon({ active }: { active?: boolean }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="18" height="16" rx="3"
                stroke="currentColor" strokeWidth="1.8" fill="none"
                opacity={active ? 1 : 0.85} />
            <path d="M3 15l4-4.5 3.5 4L14 9l7 9.5" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" opacity={active ? 0.6 : 0.4} />
            <rect x="12.5" y="12" width="9.5" height="6" rx="2"
                fill={active ? "var(--brand-500, #5865f2)" : "currentColor"}
                opacity={active ? 1 : 0.7} />
            <path d="M13.8 13.8h1.3v.6h-.75v.9h.75v-.25h-.38v-.55h.88v1.3h-1.8v-2.0z" fill="#fff" />
            <path d="M15.55 13.8h.55v2.05h-.55z" fill="#fff" />
            <path d="M16.55 13.8h1.35v.55h-.8v.4h.72v.5h-.72v.6h-.55z" fill="#fff" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}

function UploadIcon() {
    return (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
    );
}

function AlertTriangleIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    );
}

// ─── Popover Component ────────────────────────────────────────────────────────

interface PopoverProps {
    position: PopoverPosition;
    onClose(): void;
}

function GifConvertorPopover({ position, onClose }: PopoverProps) {
    const [stage, setStage] = React.useState<Stage>("idle");
    const [progress, setProgress] = React.useState<number>(0);
    const [gifBlob, setGifBlob] = React.useState<Blob | null>(null);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
    const [errorMsg, setErrorMsg] = React.useState<string>("");
    const [isDragOver, setDragOver] = React.useState(false);
    const [filename, setFilename] = React.useState("converted.gif");
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // Cleanup preview URL
    React.useEffect(() => {
        return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
    }, [previewUrl]);

    // Paste support
    React.useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.kind === "file" && (item.type.startsWith("image/") || item.type.startsWith("video/"))) {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = item.getAsFile();
                    if (file) processFile(file);
                    break;
                }
            }
        };
        document.addEventListener("paste", onPaste, { capture: true });
        return () => document.removeEventListener("paste", onPaste, { capture: true });
    }, []);

    async function processFile(file: File) {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
            setErrorMsg(t("Only image and video files are supported."));
            setStage("error");
            return;
        }
        const baseName = file.name.replace(/\.[^.]+$/, "") || "media";
        setFilename(`${baseName}.gif`);
        setStage("converting");
        setProgress(0);
        setGifBlob(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);

        try {
            const gif = await encodeGIF(file, setProgress);
            const blob = new Blob([gif], { type: "image/gif" });
            const url = URL.createObjectURL(blob);
            setGifBlob(blob);
            setPreviewUrl(url);
            setStage("preview");
        } catch (e: any) {
            console.error("[GifConvertor] Conversion error:", e);
            setErrorMsg(e?.message ?? t("Conversion failed."));
            setStage("error");
        }
    }

    async function handleSend() {
        if (!gifBlob) return;
        setStage("sending");
        try {
            await sendGIF(gifBlob, filename);
            showToast(t("GIF sent!"), Toasts.Type.SUCCESS);
            onClose();
        } catch (e: any) {
            console.error("[GifConvertor] Upload error:", e);
            setErrorMsg(e?.message ?? t("Upload failed."));
            setStage("error");
        }
    }

    const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
    const onDragLeave = () => setDragOver(false);
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault(); setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    };
    const onClickZone = () => fileInputRef.current?.click();
    const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
        e.target.value = "";
    };

    const popoverStyle: React.CSSProperties = {
        bottom: position.bottom,
        left: position.left,
        transform: "translateX(-50%)",
    };

    return (
        <div
            className="nc-gifconv-popover"
            style={popoverStyle}
            onClick={e => e.stopPropagation()}
        >
            {/* Clean Discord Native Header */}
            <div className="nc-gifconv-header">
                <div className="nc-gifconv-header-title-wrap">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand-500, #5865f2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span className="nc-gifconv-title">{t("GIF Converter")}</span>
                </div>
                <button className="nc-gifconv-close" onClick={onClose} aria-label={t("Close")}>
                    <CloseIcon />
                </button>
            </div>

            {/* Hidden File Input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                style={{ display: "none" }}
                onChange={onFileInput}
            />

            {/* Idle / Error State */}
            {(stage === "idle" || stage === "error") && (
                <>
                    <div
                        className={`nc-gifconv-dropzone${isDragOver ? " nc-gifconv-drag-over" : ""}`}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        onClick={onClickZone}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => e.key === "Enter" && onClickZone()}
                        aria-label={t("Drop media to convert to GIF")}
                    >
                        <div className="nc-gifconv-dropzone-icon-wrap">
                            <UploadIcon />
                        </div>
                        <span className="nc-gifconv-dropzone-label">
                            {isDragOver ? t("Release to convert!") : t("Drop media here")}
                        </span>
                        <span className="nc-gifconv-dropzone-sub">
                            {t("or click to browse · Ctrl+V to paste")}
                        </span>
                        <div className="nc-gifconv-formats">
                            <span className="nc-gifconv-format-pill">MP4</span>
                            <span className="nc-gifconv-format-pill">WebM</span>
                            <span className="nc-gifconv-format-pill">PNG</span>
                            <span className="nc-gifconv-format-pill">JPG</span>
                            <span className="nc-gifconv-format-pill">APNG</span>
                        </div>
                    </div>

                    {stage === "error" && (
                        <div className="nc-gifconv-error-banner">
                            <AlertTriangleIcon />
                            <span>{errorMsg}</span>
                        </div>
                    )}
                </>
            )}

            {/* Converting State */}
            {stage === "converting" && (
                <div className="nc-gifconv-loading-card">
                    <div className="nc-gifconv-spinner" />
                    <span className="nc-gifconv-loading-label">
                        {t("Converting to GIF...")} {progress > 0 ? `${Math.round(progress * 100)}%` : ""}
                    </span>
                    {progress > 0 && (
                        <div className="nc-gifconv-progress-bar-bg">
                            <div
                                className="nc-gifconv-progress-bar-fill"
                                style={{ width: `${Math.round(progress * 100)}%` }}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Preview State */}
            {stage === "preview" && previewUrl && (
                <div className="nc-gifconv-preview-wrap">
                    <div className="nc-gifconv-preview-frame">
                        <img src={previewUrl} alt={t("GIF preview")} className="nc-gifconv-preview-img" />
                    </div>
                    <span className="nc-gifconv-preview-filename">{filename}</span>
                    <div className="nc-gifconv-actions">
                        <Button
                            size={Button.Sizes.MEDIUM}
                            color={Button.Colors.PRIMARY}
                            look={Button.Looks.FILLED}
                            onClick={() => {
                                setStage("idle");
                                setGifBlob(null);
                                if (previewUrl) URL.revokeObjectURL(previewUrl);
                                setPreviewUrl(null);
                            }}
                            className="nc-gifconv-action-btn"
                        >
                            {t("Try Again")}
                        </Button>
                        <Button
                            size={Button.Sizes.MEDIUM}
                            color={Button.Colors.BRAND}
                            look={Button.Looks.FILLED}
                            onClick={handleSend}
                            className="nc-gifconv-action-btn"
                        >
                            {t("Send GIF")}
                        </Button>
                    </div>
                </div>
            )}

            {/* Sending State */}
            {stage === "sending" && (
                <div className="nc-gifconv-loading-card">
                    <div className="nc-gifconv-spinner" />
                    <span className="nc-gifconv-loading-label">{t("Uploading and sending GIF...")}</span>
                </div>
            )}
        </div>
    );
}

// ─── ChatBar Button ───────────────────────────────────────────────────────────

const GifConvertorChatBarButton: ChatBarButtonFactory = ({ isMainChat }) => {
    const [open, setOpen] = React.useState(false);
    const [pos, setPos] = React.useState<PopoverPosition | null>(null);
    const btnWrapRef = React.useRef<HTMLSpanElement>(null);

    if (!isMainChat) return null;

    const toggle = () => {
        if (!open && btnWrapRef.current) {
            const rect = btnWrapRef.current.getBoundingClientRect();
            setPos({
                bottom: window.innerHeight - rect.top + 10,
                left: rect.left + rect.width / 2,
            });
        }
        setOpen(v => !v);
    };

    const close = () => setOpen(false);

    // Close on outside click
    React.useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            if (!t.closest(".nc-gifconv-popover") && !t.closest(".nc-gifconv-btn-wrap"))
                close();
        };
        const id = setTimeout(() => document.addEventListener("mousedown", handler), 10);
        return () => { clearTimeout(id); document.removeEventListener("mousedown", handler); };
    }, [open]);

    // Close on Escape
    React.useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [open]);

    return (
        <>
            <span ref={btnWrapRef} className="nc-gifconv-btn-wrap">
                <ChatBarButton tooltip={t("Convert image or video to GIF")} onClick={toggle}>
                    <GifIcon active={open} />
                </ChatBarButton>
            </span>
            {open && pos && <GifConvertorPopover position={pos} onClose={close} />}
        </>
    );
};

// ─── Plugin Definition ────────────────────────────────────────────────────────

export default definePlugin({
    name: "GifConvertor",
    enabledByDefault: true,
    description: "Converts an image or video to GIF and sends it in the current channel.",
    authors: [{ name: "Nightcord", id: 0n }],
    dependencies: ["ChatInputButtonAPI"],

    chatBarButton: {
        icon: GifIcon,
        render: GifConvertorChatBarButton,
    },
});

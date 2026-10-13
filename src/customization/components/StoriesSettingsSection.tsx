/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@api/i18n";
import { Button, React, showToast, TextInput, Toasts, useEffect, useState } from "@webpack/common";
import { getLocalStories, saveLocalStories, syncOwnDataToCloud, uploadImageFile } from "../sync";
import type { PremiumStory } from "../types";

const TrashIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);

const UploadIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
);

export function StoriesSettingsSection() {
    const [stories, setStories] = useState<PremiumStory[]>([]);
    const [uploading, setUploading] = useState(false);
    const [directUrl, setDirectUrl] = useState("");

    const load = async () => {
        const list = await getLocalStories();
        setStories(list);
    };

    useEffect(() => {
        void load();
    }, []);

    const persist = async (nextStories: PremiumStory[]) => {
        setStories(nextStories);
        await saveLocalStories(nextStories);
        void syncOwnDataToCloud();
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setUploading(true);
        const added: PremiumStory[] = [];
        for (const file of files) {
            const url = await uploadImageFile(file);
            if (url) {
                added.push({
                    id: `story-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    url,
                    type: "image",
                    timestamp: Date.now(),
                    isHighlight: false,
                });
            }
        }
        setUploading(false);
        e.target.value = "";

        if (added.length > 0) {
            const updated = [...stories, ...added];
            await persist(updated);
            showToast(t("Story added successfully"), Toasts.Type.SUCCESS);
        } else {
            showToast(t("Failed to upload image"), Toasts.Type.DANGER);
        }
    };

    const handleAddDirectUrl = async () => {
        const trimmed = directUrl.trim();
        if (!trimmed) return;
        const isVideo = trimmed.endsWith(".mp4") || trimmed.endsWith(".webm");
        const newStory: PremiumStory = {
            id: `story-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            url: trimmed,
            type: isVideo ? "video" : "image",
            timestamp: Date.now(),
            isHighlight: false,
        };
        const updated = [...stories, newStory];
        setDirectUrl("");
        await persist(updated);
        showToast(t("Story added successfully"), Toasts.Type.SUCCESS);
    };

    const handleDelete = async (id: string) => {
        const updated = stories.filter(s => s.id !== id);
        await persist(updated);
        showToast(t("Story removed"), Toasts.Type.INFO);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Upload & Add Bar */}
            <div style={{
                background: "var(--background-secondary, #2b2d31)",
                padding: "16px 20px",
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))"
            }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--header-primary, #ffffff)" }}>
                    {t("Add a Story")}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <label style={{
                        background: "var(--brand-500, #5865f2)",
                        color: "#ffffff",
                        padding: "8px 16px",
                        borderRadius: 4,
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: uploading ? "wait" : "pointer",
                        display: "inline-flex",
                        alignItems: "center"
                    }}>
                        <UploadIcon />
                        {uploading ? t("Uploading...") : t("Upload Image")}
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            style={{ display: "none" }}
                            onChange={handleFileUpload}
                            disabled={uploading}
                        />
                    </label>

                    <div style={{ display: "flex", flex: 1, minWidth: 260, gap: 8 }}>
                        <TextInput
                            placeholder={t("Or enter a direct URL (image or .mp4 video)...")}
                            value={directUrl}
                            onChange={(val: string) => setDirectUrl(val)}
                        />
                        <Button
                            color={Button.Colors.PRIMARY}
                            onClick={handleAddDirectUrl}
                            disabled={!directUrl.trim()}
                        >
                            {t("Add")}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Stories Grid */}
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--header-secondary, #b5bac1)" }}>
                {t("Active Stories")} ({stories.length})
            </div>

            {stories.length === 0 ? (
                <div style={{
                    padding: 32,
                    textAlign: "center",
                    color: "var(--text-muted, #949ba4)",
                    background: "var(--background-secondary, #2b2d31)",
                    borderRadius: 8,
                    border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))"
                }}>
                    {t("No stories configured for your profile.")}
                </div>
            ) : (
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: 12
                }}>
                    {stories.map(story => (
                        <div
                            key={story.id}
                            style={{
                                background: "var(--background-secondary, #2b2d31)",
                                borderRadius: 8,
                                overflow: "hidden",
                                display: "flex",
                                flexDirection: "column",
                                border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))"
                            }}
                        >
                            <div style={{ position: "relative", width: "100%", height: 180, background: "#000" }}>
                                {story.type === "video" ? (
                                    <video src={story.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                ) : (
                                    <img src={story.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                                )}
                            </div>

                            <div style={{ padding: 10, display: "flex", justifyContent: "flex-end" }}>
                                <Button
                                    color={Button.Colors.RED}
                                    size={Button.Sizes.SMALL}
                                    onClick={() => handleDelete(story.id)}
                                >
                                    <TrashIcon />
                                    {t("Remove")}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

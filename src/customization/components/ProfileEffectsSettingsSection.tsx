/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@api/i18n";
import { React, Select, TextInput, useEffect, useState, UserStore } from "@webpack/common";
import { triggerEffectsUpdate } from "../profileEffects/effectsManager";
import { getCachedEffectsConfig, getLocalEffectsConfig, saveLocalEffectsConfig, syncOwnDataToCloud } from "../sync";
import type { ProfileEffectsConfig } from "../types";
import { ProfileDrawingSection } from "../profileDrawing/ProfileDrawingSection";

function TypewriterPreview({ text }: { text: string }) {
    const [displayed, setDisplayed] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (!isDeleting) {
            if (displayed.length < text.length) {
                timer = setTimeout(() => {
                    setDisplayed(text.slice(0, displayed.length + 1));
                }, 100);
            } else {
                timer = setTimeout(() => {
                    setIsDeleting(true);
                }, 1800);
            }
        } else {
            if (displayed.length > 0) {
                timer = setTimeout(() => {
                    setDisplayed(text.slice(0, displayed.length - 1));
                }, 60);
            } else {
                timer = setTimeout(() => {
                    setIsDeleting(false);
                }, 500);
            }
        }
        return () => clearTimeout(timer);
    }, [displayed, isDeleting, text]);

    return (
        <span
            className="cpe-type-cursor"
            style={{
                color: "var(--header-primary, #ffffff)",
                WebkitTextFillColor: "var(--header-primary, #ffffff)"
            }}
        >
            {displayed}
        </span>
    );
}

export function ProfileEffectsSettingsSection() {
    const [cfg, setCfg] = useState<ProfileEffectsConfig>(getCachedEffectsConfig);

    useEffect(() => {
        void getLocalEffectsConfig().then(c => setCfg(c));
    }, []);

    const update = async (next: Partial<ProfileEffectsConfig>) => {
        const full = { ...cfg, ...next, showBanner: false };
        setCfg(full);
        await saveLocalEffectsConfig(full);
        triggerEffectsUpdate();
        void syncOwnDataToCloud();
    };

    const effectOptions = [
        { label: t("None"), value: "none" },
        { label: t("Glow (Light halo)"), value: "glow" },
        { label: t("Glitch (Cyberpunk)"), value: "glitch" },
        { label: t("Typewriter"), value: "type" },
        { label: t("Rainbow"), value: "rainbow" },
        { label: t("Gothic (Unifraktur)"), value: "gothic" },
        { label: t("Signature Script (Alex Brush)"), value: "signature" },
        { label: t("Pixel / Minecraft (Press Start 2P)"), value: "pixel" },
        { label: t("Nerd Font (JetBrains Mono)"), value: "nerd" },
        { label: t("Cyberpunk (Orbitron)"), value: "cyberpunk" },
        { label: t("Handwritten (Caveat)"), value: "handwritten" },
    ];

    const fontOptions = [
        { label: t("Default (Discord)"), value: "none" },
        { label: t("Gothic (Unifraktur)"), value: "gothic" },
        { label: t("Signature Script (Alex Brush)"), value: "signature" },
        { label: t("Pixel / Minecraft (Press Start 2P)"), value: "pixel" },
        { label: t("Nerd Font (JetBrains Mono)"), value: "nerd" },
        { label: t("Cyberpunk (Orbitron)"), value: "cyberpunk" },
        { label: t("Handwritten (Caveat)"), value: "handwritten" },
    ];

    const currentUserName = UserStore.getCurrentUser()?.username || "Username";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Username Text Effects Card */}
            <div style={{
                background: "var(--background-secondary, #2b2d31)",
                padding: "16px 20px",
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                gap: 14,
                border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))"
            }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--header-primary, #ffffff)" }}>
                    {t("Username Text Effects")}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted, #949ba4)", marginBottom: 4 }}>
                            {t("Username Effect")}
                        </div>
                        <Select
                            options={effectOptions}
                            closeOnSelect={true}
                            isSelected={(v: string) => v === (cfg.nameEffect ?? "none")}
                            select={(val: string) => update({
                                nameEffect: val as any,
                                chatUsernameEffect: val as any,
                                memberListEffect: val as any
                            })}
                            serialize={String}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted, #949ba4)", marginBottom: 4 }}>
                            {t("Glow Color (Hex)")}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                                type="color"
                                value={cfg.glowColor || "#a78bfa"}
                                onChange={e => update({ glowColor: e.target.value })}
                                style={{ width: 36, height: 36, border: "none", borderRadius: 4, cursor: "pointer", background: "none" }}
                            />
                            <TextInput
                                placeholder="#a78bfa"
                                value={cfg.glowColor || "#a78bfa"}
                                onChange={(val: string) => update({ glowColor: val })}
                            />
                        </div>
                    </div>
                </div>

                {/* Live Preview Card */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "var(--background-tertiary, #1e1f22)",
                    padding: "12px 16px",
                    borderRadius: 8,
                    border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
                    marginTop: 2
                }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--header-primary, #ffffff)" }}>
                            {t("Live Preview")}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-muted, #949ba4)" }}>
                            {t("Preview of your chosen profile effect")}
                        </span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "var(--header-primary, #ffffff)" }}>
                        {cfg.nameEffect === "type" ? (
                            <TypewriterPreview text={currentUserName} />
                        ) : (
                            <span
                                className={
                                    cfg.nameEffect === "glow" ? "cpe-glow" :
                                    cfg.nameEffect === "glitch" ? "cpe-glitch" :
                                    cfg.nameEffect === "rainbow" ? "cpe-rainbow-letter" :
                                    ["gothic", "signature", "pixel", "nerd", "cyberpunk", "handwritten"].includes(cfg.nameEffect)
                                        ? `cpe-font-${cfg.nameEffect}`
                                        : ""
                                }
                                data-cpe-text={currentUserName}
                                data-cpe-font={
                                    ["gothic", "signature", "pixel", "nerd", "cyberpunk", "handwritten"].includes(cfg.nameEffect)
                                        ? cfg.nameEffect
                                        : undefined
                                }
                                style={{
                                    "--cpe-glow-color": cfg.glowColor || "#ffffff",
                                    color: cfg.nameEffect === "glow"
                                        ? (cfg.glowColor || "#ffffff")
                                        : "var(--header-primary, #ffffff)",
                                    WebkitTextFillColor: cfg.nameEffect === "glow"
                                        ? (cfg.glowColor || "#ffffff")
                                        : cfg.nameEffect === "rainbow"
                                        ? "transparent"
                                        : "var(--header-primary, #ffffff)"
                                } as any}
                            >
                                {currentUserName}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Profile Font Card */}
            <div style={{
                background: "var(--background-secondary, #2b2d31)",
                padding: "16px 20px",
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                gap: 14,
                border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))"
            }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--header-primary, #ffffff)" }}>
                        {t("Profile Font")}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted, #949ba4)", lineHeight: 1.4 }}>
                        {t("Applies a custom font to all text throughout your profile modal and popout.")}
                    </div>
                </div>

                <div style={{ maxWidth: 360 }}>
                    <Select
                        options={fontOptions}
                        closeOnSelect={true}
                        isSelected={(v: string) => v === (cfg.profileFont ?? "none")}
                        select={(val: string) => update({ profileFont: val as any })}
                        serialize={String}
                    />
                </div>

                {/* Typography Live Preview */}
                <div style={{
                    background: "var(--background-tertiary, #1e1f22)",
                    padding: "14px 16px",
                    borderRadius: 8,
                    border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6
                }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted, #949ba4)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {t("Typography Preview")}
                    </div>
                    <div
                        data-nc-profile-font={cfg.profileFont || "none"}
                        style={{
                            fontSize: cfg.profileFont === "signature" ? 24 : cfg.profileFont === "handwritten" ? 24 : 16,
                            fontWeight: cfg.profileFont === "signature" ? 400 : 700,
                            color: "var(--header-primary, #ffffff)",
                            lineHeight: 1.4
                        }}
                    >
                        {t("LoliCord Custom Profile — Elegance & Customization")}
                    </div>
                    <div
                        data-nc-profile-font={cfg.profileFont || "none"}
                        style={{
                            fontSize: cfg.profileFont === "signature" ? 18 : cfg.profileFont === "handwritten" ? 18 : 13,
                            fontWeight: cfg.profileFont === "handwritten" ? 600 : undefined,
                            color: "var(--text-muted, #949ba4)",
                            lineHeight: 1.4
                        }}
                    >
                        {t("All texts, bio, notes, tabs, and details will be displayed using this font on your profile.")}
                    </div>
                </div>

                <div style={{ marginTop: 24 }}>
                    <ProfileDrawingSection />
                </div>
            </div>
        </div>
    );
}

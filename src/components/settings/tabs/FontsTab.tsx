/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@api/i18n";
import { FormSwitch } from "@components/FormSwitch";
import { SettingsTab } from "@components/settings/tabs/BaseTab";
import {
    GLOBAL_FONTS,
    getGlobalFontConfig,
    setGlobalFontConfig,
    subscribeGlobalFont,
    type GlobalFontConfig
} from "customization/globalFonts/globalFontManager";
import { Button, React, showToast, TextInput, Toasts, useEffect, useState } from "@webpack/common";

const ResetIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
    </svg>
);

export default function FontsTab() {
    const [config, setConfig] = useState<GlobalFontConfig>(getGlobalFontConfig);
    const [customInput, setCustomInput] = useState(config.customFamily || "");

    useEffect(() => {
        setConfig(getGlobalFontConfig());
        const unsub = subscribeGlobalFont(next => {
            setConfig(next);
        });
        return unsub;
    }, []);

    const update = (patch: Partial<GlobalFontConfig>) => {
        const next = setGlobalFontConfig(patch);
        setConfig(next);
        showToast(t("Client font updated successfully"), Toasts.Type.SUCCESS);
    };

    const handleToggleFont = (fontId: string, currentActive: boolean) => {
        if (currentActive) {
            // Turning OFF this active font turns it back to default (none)
            update({ fontId: "none", enabled: true });
        } else {
            // Turning ON this font deactivates any previously selected font
            update({ fontId, enabled: true });
        }
    };

    const handleCustomSubmit = () => {
        if (!customInput.trim()) return;
        update({ fontId: "custom", customFamily: customInput.trim(), enabled: true });
    };

    const handleReset = () => {
        update({ fontId: "none", customFamily: "", scale: 1.0, enabled: true });
        setCustomInput("");
    };

    const activeDef = GLOBAL_FONTS[config.fontId] || GLOBAL_FONTS.none;
    const isCustomActive = config.fontId !== "none" && config.enabled;

    return (
        <SettingsTab className="nc-fonts-tab">
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Header Description */}
                <div>
                    <h2 style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: "var(--header-primary, #ffffff)",
                        margin: "0 0 6px 0"
                    }}>
                        {t("Client Typography & Fonts")}
                    </h2>
                    <p style={{
                        fontSize: 14,
                        color: "var(--text-muted, #949ba4)",
                        margin: 0,
                        lineHeight: 1.45
                    }}>
                        {t("Customize the typography across your entire Discord client. Change the font for all settings, interface, messages, profiles, and dialogs.")}
                    </p>
                </div>

                {/* Status and Active Info Card */}
                <div style={{
                    background: "var(--background-secondary, #2b2d31)",
                    border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
                    borderRadius: 8,
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16
                }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--header-primary, #ffffff)" }}>
                                {t("Active Client Font")}
                            </span>
                            <span style={{
                                fontSize: 12,
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: 12,
                                background: isCustomActive ? "var(--brand-500, #5865f2)" : "var(--background-tertiary, #1e1f22)",
                                color: "#ffffff"
                            }}>
                                {config.fontId === "custom" && config.customFamily
                                    ? config.customFamily
                                    : t(activeDef.name)}
                            </span>
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text-muted, #949ba4)" }}>
                            {isCustomActive
                                ? t("Custom typography applied to entire client interface and messages.")
                                : t("Default Discord typography is currently active.")}
                        </div>
                    </div>

                    {isCustomActive && (
                        <Button
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.PRIMARY}
                            onClick={handleReset}
                            style={{ display: "flex", alignItems: "center" }}
                        >
                            <ResetIcon />
                            {t("Reset to Default")}
                        </Button>
                    )}
                </div>

                {/* Available Fonts Grid */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--header-primary, #ffffff)",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px"
                    }}>
                        {t("Select Font")}
                    </div>

                    <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                        gap: 12
                    }}>
                        {Object.values(GLOBAL_FONTS).filter(f => f.id !== "custom" && f.id !== "none").map(font => {
                            const isSelected = config.enabled && config.fontId === font.id;
                            return (
                                <div
                                    key={font.id}
                                    onClick={() => handleToggleFont(font.id, isSelected)}
                                    style={{
                                        background: "var(--background-secondary, #2b2d31)",
                                        border: isSelected
                                            ? "1px solid rgba(88, 101, 242, 0.65)"
                                            : "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
                                        borderRadius: 8,
                                        padding: 16,
                                        transition: "border-color 0.15s ease",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 10,
                                        boxShadow: "none",
                                        cursor: "pointer"
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                        <div style={{
                                            fontSize: 15,
                                            fontWeight: 600,
                                            color: "var(--header-primary, #ffffff)"
                                        }}>
                                            {t(font.name)}
                                        </div>
                                        <div onClick={e => e.stopPropagation()}>
                                            <FormSwitch
                                                value={isSelected}
                                                onChange={() => handleToggleFont(font.id, isSelected)}
                                                hideBorder
                                            />
                                        </div>
                                    </div>

                                    <div style={{ fontSize: 12, color: "var(--text-muted, #949ba4)", lineHeight: 1.35 }}>
                                        {t(font.description)}
                                    </div>

                                    {/* Direct font preview sample - strictly preserved in authentic font */}
                                    <div
                                        className={`nc-font-sample nc-font-sample-${font.id}`}
                                        style={{
                                            marginTop: 4,
                                            padding: "8px 10px",
                                            background: "var(--background-tertiary, #1e1f22)",
                                            borderRadius: 6,
                                            fontFamily: font.fontFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                                            fontSize: font.previewFontSize ?? (font.id === "pixel" ? 11 : 14),
                                            fontWeight: font.fontWeight ?? undefined,
                                            color: "var(--header-primary, #ffffff)",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis"
                                        }}
                                    >
                                        LoliCord Discord Client 2026
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Custom Font Family Card */}
                <div style={{
                    background: "var(--background-secondary, #2b2d31)",
                    border: config.fontId === "custom" && config.enabled
                        ? "1px solid rgba(88, 101, 242, 0.65)"
                        : "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
                    borderRadius: 8,
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12
                }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--header-primary, #ffffff)" }}>
                                {t("Custom Font")}
                            </div>
                            <div style={{ fontSize: 13, color: "var(--text-muted, #949ba4)", marginTop: 2 }}>
                                {t("Specify any font installed on your operating system (e.g. Segoe UI, Consolas, Roboto, Impact, Arial).")}
                            </div>
                        </div>
                        {config.fontId === "custom" && config.enabled ? (
                            <FormSwitch
                                value={true}
                                onChange={() => handleToggleFont("custom", true)}
                                hideBorder
                            />
                        ) : (
                            <Button
                                size={Button.Sizes.SMALL}
                                color={Button.Colors.BRAND}
                                onClick={handleCustomSubmit}
                                disabled={!customInput.trim()}
                            >
                                {t("Apply Custom Font")}
                            </Button>
                        )}
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <TextInput
                            placeholder="Segoe UI, Tahoma, sans-serif"
                            value={customInput}
                            onChange={(val: string) => setCustomInput(val)}
                            style={{ flex: 1 }}
                        />
                        {!(config.fontId === "custom" && config.enabled) && (
                            <Button
                                size={Button.Sizes.MEDIUM}
                                color={Button.Colors.BRAND}
                                onClick={handleCustomSubmit}
                                disabled={!customInput.trim()}
                            >
                                {t("Apply Custom Font")}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </SettingsTab>
    );
}

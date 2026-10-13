/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./createTheme.css";

import { ErrorCard } from "@components/ErrorCard";
import { FormSwitch } from "@components/FormSwitch";
import { Paragraph } from "@components/Paragraph";
import { classNameFactory } from "@utils/css";
import { Margins } from "@utils/margins";
import { findByCodeLazy, findStoreLazy } from "@webpack";
import { Button, React, TextInput, ThemeStore, useEffect, useState, useStateFromStores } from "@webpack/common";
import { t } from "../../../../lolicordplugins/autoTranslateLoliCord";

function relativeLuminance(hex: string): number {
    const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const r = toLinear(parseInt(hex.slice(0, 2), 16) / 255);
    const g = toLinear(parseInt(hex.slice(2, 4), 16) / 255);
    const b = toLinear(parseInt(hex.slice(4, 6), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const saveClientTheme = findByCodeLazy('type:"UNSYNCED_USER_SETTINGS_UPDATE', '"system"===');
const NitroThemeStore = findStoreLazy("ClientThemesBackgroundStore");

const cl = classNameFactory("vc-ct-");

const colorPresets = [
    "#1E1514", "#172019", "#13171B", "#1C1C28", "#402D2D",
    "#3A483D", "#344242", "#313D4B", "#2D2F47", "#322B42",
    "#3C2E42", "#422938", "#B6908F", "#BFA088", "#D3C77D",
    "#86AC86", "#88AAB3", "#8693B5", "#8A89BA", "#AD94BB",
    "#5865F2", "#57F287", "#FEE75C", "#EB459E", "#ED4245"
];

// ── Storage key ──────────────────────────────────────────
const STORAGE_KEY = "vc-create-theme-settings";

interface ThemeSettings {
    color: string;
    bgImage: string | null;
    bgBlur: number;
    bgSize: string;
    transparency: number;
    panelBlur: number;
    enabled: boolean;
    windowMaterial: "none" | "acrylic" | "mica" | "tabbed";
}

const defaultSettings: ThemeSettings = {
    color: "313338",
    bgImage: null,
    bgBlur: 0,
    bgSize: "cover",
    transparency: 0,
    panelBlur: 0,
    enabled: false,
    windowMaterial: "none",
};

function loadSettings(): ThemeSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...defaultSettings };
        return { ...defaultSettings, ...JSON.parse(raw) };
    } catch { return { ...defaultSettings }; }
}

function saveSettings(s: ThemeSettings) {
    try {
        const toSave = { ...s, bgImage: null };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch { /* ignore */ }
}

// ── Style injection IDs ──────────────────────────────────
const ID_VARS = "vc-ct-vars";
const ID_OVERRIDES = "vc-ct-overrides";
const ID_BG = "vc-ct-bg";
const ID_GLASS = "vc-ct-glass";

// ── Helpers ──────────────────────────────────────────────
function hexToHSL(hex: string) {
    const cleanHex = hex.replace("#", "").padStart(6, "0");
    const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
    const cMax = Math.max(r, g, b), cMin = Math.min(r, g, b);
    const delta = cMax - cMin;
    let hue = 0, saturation = 0;
    const lightness = (cMax + cMin) / 2;
    if (delta !== 0) {
        saturation = delta / (1 - Math.abs(2 * lightness - 1));
        if (cMax === r) hue = ((g - b) / delta) % 6;
        else if (cMax === g) hue = (b - r) / delta + 2;
        else hue = (r - g) / delta + 4;
        hue *= 60;
        if (hue < 0) hue += 360;
    }
    return { hue, saturation: saturation * 100, lightness: lightness * 100 };
}

function getStyle(id: string): HTMLStyleElement {
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
        el = document.createElement("style");
        el.id = id;
        document.head.appendChild(el);
    }
    return el;
}

function removeStyle(id: string) {
    document.getElementById(id)?.remove();
}

async function getDiscordStyles(): Promise<string> {
    const links = document.querySelectorAll<HTMLLinkElement>("link[rel=\"stylesheet\"]");
    const texts = await Promise.all(Array.from(links, async n => {
        if (!n.href) return null;
        try { return await fetch(n.href).then(r => r.text()); } catch { return null; }
    }));
    return (texts.filter(Boolean) as string[]).join("\n");
}

const NEUTRAL_REGEX = /(--neutral-\d{1,3}?-hsl):.+?([\d.]+?)%;/g;

function buildColorOverrides(discordCSS: string, hue: number, sat: number, lit: number): string {
    const map: Record<string, number> = {};
    for (const [, name, l] of discordCSS.matchAll(NEUTRAL_REGEX))
        map[name] = parseFloat(l);

    const darkBase = map["--neutral-69-hsl"] ?? 18.04;
    const lightBase = map["--neutral-2-hsl"] ?? 97.65;

    const makeVars = (base: number) =>
        Object.entries(map).map(([name, l]) => {
            const off = l - base;
            const pm = off >= 0 ? "+" : "-";
            return `${name}: var(--theme-h) var(--theme-s) calc(var(--theme-l) ${pm} ${Math.abs(off).toFixed(2)}%);`;
        }).join("\n");

    return [
        `.theme-dark  {\n${makeVars(darkBase)}\n}`,
        `.theme-light {\n${makeVars(lightBase)}\n}`,
    ].join("\n\n");
}

let cachedDiscordCSS: string | null = null;

function applyColorVars(hex: string) {
    const { hue, saturation, lightness } = hexToHSL(hex);
    getStyle(ID_VARS).textContent = `:root {
        --theme-h: ${hue};
        --theme-s: ${saturation}%;
        --theme-l: ${lightness}%;
    }`;
}

async function applyColorOverrides(hex: string) {
    if (!cachedDiscordCSS) cachedDiscordCSS = await getDiscordStyles();
    const { hue, saturation, lightness } = hexToHSL(hex);
    getStyle(ID_OVERRIDES).textContent = buildColorOverrides(cachedDiscordCSS, hue, saturation, lightness);
}

function applyBackground(image: string | null, blur: number, size: string) {
    if (!image) { removeStyle(ID_BG); return; }
    const bgCss = blur > 0
        ? `background-image: url("${image}") !important;
  background-size: ${size} !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  background-attachment: fixed !important;
  filter: blur(${blur}px) brightness(0.85) !important;`
        : `background-image: url("${image}") !important;
  background-size: ${size} !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  background-attachment: fixed !important;`;
    getStyle(ID_BG).textContent = `
html {
  ${bgCss}
}
[class*="baseLayer_"],
[class*="app_"],
[class*="bg_"],
[class*="layers_"],
[class*="layer_"] {
  background: transparent !important;
  background-color: transparent !important;
}
`.trim();
}

function applyGlass(transparency: number, blur: number) {
    if (transparency === 0 && blur === 0) { removeStyle(ID_GLASS); return; }
    const a = (1 - transparency / 100).toFixed(2);
    const blurLine = blur > 0
        ? `backdrop-filter: blur(${blur}px) saturate(180%) !important; -webkit-backdrop-filter: blur(${blur}px) saturate(180%) !important;`
        : "";
    getStyle(ID_GLASS).textContent = `
[class*="guilds_"]      { background: rgba(30,31,34,${a}) !important; ${blurLine} }
[class*="sidebar_"]     { background: rgba(43,45,49,${a}) !important; ${blurLine} }
[class*="chat_"]        { background: rgba(49,51,56,${a}) !important; ${blurLine} }
[class*="membersWrap_"] { background: rgba(43,45,49,${a}) !important; ${blurLine} }
[class*="panels_"]      { background: rgba(30,31,34,${a}) !important; ${blurLine} }
`.trim();
}

export function applyFullTheme(s: ThemeSettings) {
    applyColorVars(s.color);
    applyColorOverrides(s.color).catch(console.error);
    applyBackground(s.bgImage, s.bgBlur, s.bgSize);
    applyGlass(s.transparency, s.panelBlur);
}

export function removeAll() {
    [ID_VARS, ID_OVERRIDES, ID_BG, ID_GLASS].forEach(removeStyle);
}

// ── Auto-apply on load if previously enabled ─────────────
(function initOnLoad() {
    [ID_VARS, ID_OVERRIDES, ID_BG, ID_GLASS].forEach(id => document.getElementById(id)?.remove());
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const s: ThemeSettings = { ...defaultSettings, ...JSON.parse(raw) };
        if (s.enabled) {
            applyColorVars(s.color);
            applyColorOverrides(s.color).catch(console.error);
        }
    } catch { /* ignore */ }
})();

// ── Main Tab ─────────────────────────────────────────────
export function CreateThemeTab() {
    const [settings, setSettingsState] = useState<ThemeSettings>(() => loadSettings());
    const [hexInput, setHexInput] = useState(() => `#${settings.color}`);

    // ClientTheme warnings
    const currentTheme = useStateFromStores([ThemeStore], () => ThemeStore.theme);
    const isLightTheme = currentTheme === "light";
    const oppositeTheme = isLightTheme ? "Dark" : "Light";
    const nitroThemeEnabled = useStateFromStores([NitroThemeStore], () => NitroThemeStore.gradientPreset != null);
    const selectedLuminance = relativeLuminance(settings.color);

    let contrastWarning = false, fixableContrast = true;
    if ((isLightTheme && selectedLuminance < 0.26) || (!isLightTheme && selectedLuminance > 0.12))
        contrastWarning = true;
    if (selectedLuminance < 0.26 && selectedLuminance > 0.12)
        fixableContrast = false;
    if (isLightTheme && selectedLuminance > 0.65) { contrastWarning = true; fixableContrast = false; }

    function setDiscordTheme(theme: string) { saveClientTheme({ theme }); }

    function updateColor(hexValue: string) {
        const clean = hexValue.replace("#", "").toUpperCase();
        setHexInput(`#${clean}`);
        setSettingsState(prev => {
            const next = { ...prev, color: clean };
            saveSettings(next);
            if (next.enabled) {
                applyColorVars(next.color);
                applyColorOverrides(next.color).catch(console.error);
                applyGlass(next.transparency, next.panelBlur);
            }
            return next;
        });
    }

    function toggleEnabled(enabled: boolean) {
        setSettingsState(prev => {
            const next = { ...prev, enabled };
            saveSettings(next);
            if (enabled) applyFullTheme(next);
            else removeAll();
            return next;
        });
    }

    useEffect(() => {
        if (settings.enabled) {
            applyColorVars(settings.color);
            applyColorOverrides(settings.color).catch(console.error);
            applyGlass(settings.transparency, settings.panelBlur);
        }
    }, []);

    const formattedColor = `#${settings.color.replace("#", "")}`;

    return (
        <div className={cl("root")}>
            {/* ── Theme Color Card ── */}
            <div className={cl("card")}>
                <div className={cl("header-group")}>
                    <div className={cl("card-title")}>{t("Theme Color")}</div>
                    <div className={cl("card-desc")}>{t("Customize the tint color across all Discord panels, headers, and UI elements.")}</div>
                </div>

                <div className={cl("color-picker-row")}>
                    <div className={cl("color-info")}>
                        <div className={cl("color-title")}>{t("Primary Accent")}</div>
                        <div className={cl("color-sub")}>{t("Tints panels, sidebar, buttons, and accents")}</div>
                    </div>
                    <div className={cl("color-controls")}>
                        <div className={cl("color-swatch-wrapper")} style={{ backgroundColor: formattedColor }}>
                            <input
                                type="color"
                                className={cl("native-color-input")}
                                value={formattedColor}
                                onChange={e => updateColor(e.target.value)}
                            />
                        </div>
                        <div style={{ width: 110 }}>
                            <TextInput
                                size="small"
                                value={hexInput}
                                onChange={(val: string) => {
                                    setHexInput(val);
                                    const clean = val.replace("#", "");
                                    if (/^[0-9A-Fa-f]{6}$/.test(clean)) {
                                        updateColor(clean);
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>

                <div className={cl("presets-section")}>
                    <div className={cl("presets-label")}>{t("Color Presets")}</div>
                    <div className={cl("presets-grid")}>
                        {colorPresets.map(preset => {
                            const cleanPreset = preset.replace("#", "").toUpperCase();
                            const isSelected = settings.color.toUpperCase() === cleanPreset;
                            return (
                                <div
                                    key={preset}
                                    className={`${cl("preset-chip")} ${isSelected ? "active" : ""}`}
                                    style={{ backgroundColor: preset }}
                                    onClick={() => updateColor(cleanPreset)}
                                    title={preset}
                                />
                            );
                        })}
                    </div>
                </div>

                <div className={cl("actions-row")}>
                    <Button
                        size={Button.Sizes.SMALL}
                        color={Button.Colors.PRIMARY}
                        look={Button.Looks.FILLED}
                        onClick={() => updateColor("313338")}
                    >
                        {t("Reset to Default")}
                    </Button>
                </div>

                {(contrastWarning || nitroThemeEnabled) && (
                    <ErrorCard className={Margins.top8}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{t("Contrast Warning")}</div>
                        {contrastWarning && <Paragraph>› {t("Selected color may not contrast well with text")}</Paragraph>}
                        {nitroThemeEnabled && <Paragraph>› {t("Nitro themes are not supported with custom color tinting")}</Paragraph>}
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                            {contrastWarning && fixableContrast &&
                                <Button onClick={() => setDiscordTheme(oppositeTheme)} color={Button.Colors.RED} size={Button.Sizes.SMALL}>
                                    {t("Switch to {theme} Mode").replace("{theme}", oppositeTheme)}
                                </Button>}
                            {nitroThemeEnabled &&
                                <Button onClick={() => setDiscordTheme(currentTheme)} color={Button.Colors.RED} size={Button.Sizes.SMALL}>
                                    {t("Disable Nitro Theme")}
                                </Button>}
                        </div>
                    </ErrorCard>
                )}
            </div>

            {/* ── Enable Theme Toggle Card ── */}
            <div className={cl("card")}>
                <FormSwitch
                    title={t("Enable Theme")}
                    description={t("When enabled, your custom theme stays active even after closing settings or restarting Discord.")}
                    value={settings.enabled}
                    onChange={toggleEnabled}
                    hideBorder
                />
            </div>
        </div>
    );
}

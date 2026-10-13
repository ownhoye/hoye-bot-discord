/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface GlobalFontConfig {
    enabled: boolean;
    fontId: string;
    customFamily: string;
    scale: number;
}

export interface GlobalFontDefinition {
    id: string;
    name: string;
    description: string;
    fontFamily: string;
    previewText?: string;
    letterSpacing?: string;
    fontSizeAdjust?: number;
    fontWeight?: number | string;
    previewFontSize?: number;
}

export const GOOGLE_FONTS_URL = "https://fonts.googleapis.com/css2?family=Alex+Brush&family=Caveat:wght@500;600;700&family=Cinzel:wght@600;800&family=Comfortaa:wght@600;700&family=Creepster&family=Dancing+Script:wght@600;700&family=JetBrains+Mono:wght@500;700&family=Monoton&family=Orbitron:wght@600;800&family=Pacifico&family=Playfair+Display:wght@600;700&family=Poppins:wght@400;600;700&family=Press+Start+2P&family=Righteous&family=Roboto+Mono:wght@400;600&family=UnifrakturMaguntia&display=swap";

export const GLOBAL_FONTS: Record<string, GlobalFontDefinition> = {
    none: {
        id: "none",
        name: "Default (Discord)",
        description: "Discord standard native typography (gg sans)",
        fontFamily: "",
    },
    poppins: {
        id: "poppins",
        name: "Modern Sans (Poppins)",
        description: "Clean modern geometric sans-serif typeface",
        fontFamily: "'Poppins', sans-serif",
    },
    robotoMono: {
        id: "robotoMono",
        name: "Roboto Mono",
        description: "Clean monospaced developer typeface",
        fontFamily: "'Roboto Mono', monospace",
    },
    pacifico: {
        id: "pacifico",
        name: "Pacifico Script",
        description: "Warm and cheerful 1950s surf culture brush script",
        fontFamily: "'Pacifico', cursive",
        previewFontSize: 16,
    },
    cinzel: {
        id: "cinzel",
        name: "Cinzel Decorative",
        description: "Classical Roman inscriptional proportions and elegance",
        fontFamily: "'Cinzel', serif",
        letterSpacing: "0.4px",
    },
    dancingScript: {
        id: "dancingScript",
        name: "Dancing Script",
        description: "Lively casual script with bouncing letters",
        fontFamily: "'Dancing Script', cursive",
        letterSpacing: "0.3px",
        fontWeight: 600,
        previewFontSize: 16,
    },
    playfair: {
        id: "playfair",
        name: "Playfair Display",
        description: "High-contrast editorial serif inspired by John Baskerville",
        fontFamily: "'Playfair Display', serif",
        letterSpacing: "0.2px",
    },
    comfortaa: {
        id: "comfortaa",
        name: "Comfortaa Rounded",
        description: "Smooth rounded geometric sans-serif typeface",
        fontFamily: "'Comfortaa', sans-serif",
        letterSpacing: "0.2px",
    },
    righteous: {
        id: "righteous",
        name: "Righteous Arcade",
        description: "Bold retro 1980s display typography",
        fontFamily: "'Righteous', cursive",
        letterSpacing: "0.5px",
    },
    creepster: {
        id: "creepster",
        name: "Creepster Spooky",
        description: "Spooky horror and gothic comic display typeface",
        fontFamily: "'Creepster', cursive",
        letterSpacing: "0.4px",
    },
    monoton: {
        id: "monoton",
        name: "Monoton Retro",
        description: "Multi-line retro 1970s and neon display typography",
        fontFamily: "'Monoton', cursive",
        letterSpacing: "1px",
    },
    gothic: {
        id: "gothic",
        name: "Gothic (Unifraktur)",
        description: "Medieval gothic calligraphy font",
        fontFamily: "'UnifrakturMaguntia', 'MedievalSharp', cursive, serif",
        letterSpacing: "0.2px",
    },
    signature: {
        id: "signature",
        name: "Signature Script (Alex Brush)",
        description: "Elegant cursive calligraphy handwriting",
        fontFamily: "'Alex Brush', 'Great Vibes', cursive",
        letterSpacing: "0.4px",
        fontWeight: 500,
        previewFontSize: 16,
    },
    pixel: {
        id: "pixel",
        name: "Pixel / Retro (Press Start 2P)",
        description: "8-bit retro arcade and gaming font",
        fontFamily: "'Press Start 2P', 'VT323', monospace",
        letterSpacing: "-0.5px",
        previewFontSize: 11,
    },
    nerd: {
        id: "nerd",
        name: "Nerd Font (JetBrains Mono)",
        description: "Clean monospace coding and terminal font",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    },
    cyberpunk: {
        id: "cyberpunk",
        name: "Cyberpunk (Orbitron)",
        description: "Futuristic geometric cyberpunk font",
        fontFamily: "'Orbitron', sans-serif",
        letterSpacing: "0.3px",
    },
    handwritten: {
        id: "handwritten",
        name: "Handwritten (Caveat)",
        description: "Natural artistic handwriting style",
        fontFamily: "'Caveat', cursive",
        letterSpacing: "0.2px",
        fontSizeAdjust: 0.56,
        fontWeight: 600,
        previewFontSize: 20,
    },
    custom: {
        id: "custom",
        name: "Custom Font",
        description: "Use any custom font installed on your computer",
        fontFamily: "",
    }
};

import * as DataStore from "@api/DataStore";

const LS_KEY = "lolicord_global_font_config";
const DATASTORE_KEY = "lolicord_global_font_config";

export const DEFAULT_GLOBAL_FONT_CONFIG: GlobalFontConfig = {
    enabled: true,
    fontId: "none",
    customFamily: "",
    scale: 1.0,
};

let cachedConfig: GlobalFontConfig | null = null;
const fontListeners = new Set<(cfg: GlobalFontConfig) => void>();

export function getGlobalFontConfig(): GlobalFontConfig {
    if (cachedConfig) return cachedConfig;
    if (typeof localStorage !== "undefined") {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                cachedConfig = {
                    enabled: parsed.enabled ?? true,
                    fontId: parsed.fontId ?? "none",
                    customFamily: parsed.customFamily ?? "",
                    scale: typeof parsed.scale === "number" ? parsed.scale : 1.0,
                };
                return cachedConfig;
            }
        } catch {}
    }
    cachedConfig = { ...DEFAULT_GLOBAL_FONT_CONFIG };
    return cachedConfig;
}

export function subscribeGlobalFont(listener: (cfg: GlobalFontConfig) => void): () => void {
    fontListeners.add(listener);
    return () => fontListeners.delete(listener);
}

export async function loadSavedFontFromDataStore() {
    try {
        const saved = await DataStore.get<GlobalFontConfig>(DATASTORE_KEY);
        if (saved && typeof saved === "object") {
            const current = getGlobalFontConfig();
            if (saved.fontId !== current.fontId || saved.enabled !== current.enabled || saved.customFamily !== current.customFamily) {
                setGlobalFontConfig(saved);
            }
        }
    } catch {}
}

export function ensureGoogleFontsLoaded() {
    if (typeof document === "undefined" || !document.head) return;
    if (document.getElementById("lolicord-google-fonts-sheet")) return;
    const link = document.createElement("link");
    link.id = "lolicord-google-fonts-sheet";
    link.rel = "stylesheet";
    link.href = GOOGLE_FONTS_URL;
    document.head.appendChild(link);
}

export function applyGlobalFont(config: GlobalFontConfig) {
    if (typeof document === "undefined") return;

    cachedConfig = { ...config };
    const scale = typeof config.scale === "number" ? config.scale : 1.0;

    if (!document.documentElement || !document.head) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => applyGlobalFont(config), { once: true });
        }
        return;
    }

    const styleId = "lolicord-global-client-font";
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!config.enabled || config.fontId === "none") {
        if (styleEl) {
            styleEl.remove();
        }
        document.documentElement?.style?.removeProperty?.("--nc-global-font-scale");
        return;
    }

    ensureGoogleFontsLoaded();

    let family = "";
    let letterSpacing = "";

    if (config.fontId === "custom") {
        family = config.customFamily.trim() || "";
    } else {
        const def = GLOBAL_FONTS[config.fontId];
        if (def) {
            family = def.fontFamily;
            letterSpacing = def.letterSpacing || "";
        }
    }

    if (!family) {
        if (styleEl) styleEl.remove();
        return;
    }

    if (!styleEl) {
        styleEl = document.createElement("style");
        styleId && (styleEl.id = styleId);
        document.head.appendChild(styleEl);
    }

    const fontDef = config.fontId !== "custom" && config.fontId !== "none" ? GLOBAL_FONTS[config.fontId] : null;
    const fontDefWeight = fontDef?.fontWeight;
    const fontCodeFamily = (config.fontId === "nerd" || config.fontId === "pixel" || config.fontId === "robotoMono")
        ? family
        : `'JetBrains Mono', 'Fira Code', ${family}, monospace`;

    const cssRules = `
:root {
    --font-primary: ${family} !important;
    --font-display: ${family} !important;
    --font-headline: ${family} !important;
    --font-code: ${fontCodeFamily} !important;
    --font-korean: ${family} !important;
    --font-japanese: ${family} !important;
    --font-chinese-simplified: ${family} !important;
    --font-chinese-traditional: ${family} !important;
}

html,
body,
#app-mount,
#app-mount *:not(svg):not(path):not(use):not(foreignObject):not(img):not(i):not([class*='icon']):not([class*='Icon']):not(.nc-font-sample):not(.nc-font-sample *) {
    font-family: ${family} !important;
    ${letterSpacing ? `letter-spacing: ${letterSpacing} !important;` : ""}
    ${fontDefWeight ? `font-weight: ${fontDefWeight} !important;` : ""}
}

#app-mount code,
#app-mount pre,
#app-mount code *,
#app-mount pre * {
    font-family: Consolas, "Courier New", Courier, monospace !important;
    font-size-adjust: none !important;
}

/* Allow scalable client font sizing when customized */
${scale !== 1.0 ? `
:root {
    --nc-global-font-scale: ${scale};
}
` : ""}
`;

    styleEl.textContent = cssRules;
}

export function setGlobalFontConfig(next: Partial<GlobalFontConfig>): GlobalFontConfig {
    const current = getGlobalFontConfig();
    const updated: GlobalFontConfig = { ...current, ...next };
    cachedConfig = updated;
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(updated));
    } catch {}
    void DataStore.set(DATASTORE_KEY, updated).catch(() => {});
    applyGlobalFont(updated);
    for (const listener of fontListeners) {
        try { listener(updated); } catch {}
    }
    return updated;
}

export function initGlobalFont() {
    const config = getGlobalFontConfig();
    applyGlobalFont(config);
    void loadSavedFontFromDataStore();
}

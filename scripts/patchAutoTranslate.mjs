import { readFileSync, writeFileSync } from "fs";

const p = "src/lolicordplugins/autoTranslateLoliCord/index.ts";
let c = readFileSync(p, "utf8");

const target = `function normalizeLang(lang: string): SupportedLang {
    if (!lang) return "en";
    const l = lang.toLowerCase();
    if (l.startsWith("fr")) return "fr";
    if (l.startsWith("ar")) return "ar";
    if (l.startsWith("es")) return "es";
    if (l.startsWith("ru")) return "ru";
    if (l.startsWith("zh")) return "zh";
    return "en";
}

export function t(key: string): string {
    const rawLang = (Settings.language as string) ?? "en";
    const lang = normalizeLang(rawLang);
    if (lang === "en") return key;
    return translations[key]?.[lang] ?? translations[key]?.en ?? key;
}

export function useTranslation() {
    const rawLang = (Settings.language as string) ?? "en";
    const lang = normalizeLang(rawLang);
    return {
        t: (key: string) => {
            if (lang === "en") return key;
            return translations[key]?.[lang] ?? translations[key]?.en ?? key;
        },
        lang,
    };
}`;

const replacement = `export function normalizeLang(lang: string): SupportedLang {
    if (!lang) return "en";
    const l = lang.toLowerCase();
    if (l.startsWith("fr")) return "fr";
    if (l.startsWith("ar")) return "ar";
    if (l.startsWith("es")) return "es";
    if (l.startsWith("ru")) return "ru";
    if (l.startsWith("zh")) return "zh";
    return "en";
}

export function getActiveLanguage(): SupportedLang {
    // 1. If plugin is explicitly disabled, revert to English
    const pluginEnabled = Settings.plugins?.AutoTranslateLoliCord?.enabled ?? true;
    if (!pluginEnabled) return "en";

    // 2. Check plugin-specific option if selected
    const pluginOpt = (Settings.plugins?.AutoTranslateLoliCord as any)?.autoTranslate;
    if (pluginOpt && pluginOpt !== "auto") return normalizeLang(pluginOpt);

    // 3. Check global LoliCord setting
    const globalLang = Settings.language;
    if (globalLang && globalLang !== "en") return normalizeLang(globalLang);

    // 4. Auto-detect from Discord client DOM / browser
    try {
        if (typeof document !== "undefined" && document.documentElement?.lang) {
            const htmlLang = normalizeLang(document.documentElement.lang);
            if (htmlLang !== "en") return htmlLang;
        }
    } catch {}

    try {
        if (typeof navigator !== "undefined" && navigator.language) {
            const navLang = normalizeLang(navigator.language);
            if (navLang !== "en") return navLang;
        }
    } catch {}

    return "fr";
}

export function t(key: string): string {
    const lang = getActiveLanguage();
    if (lang === "en") return key;
    return translations[key]?.[lang] ?? translations[key]?.en ?? key;
}

export function useTranslation() {
    const lang = getActiveLanguage();
    return {
        t: (key: string) => {
            if (lang === "en") return key;
            return translations[key]?.[lang] ?? translations[key]?.en ?? key;
        },
        lang,
    };
}`;

c = c.replace(/\r\n/g, "\n");
const normTarget = target.replace(/\r\n/g, "\n");

if (c.includes(normTarget)) {
    writeFileSync(p, c.replace(normTarget, replacement), "utf8");
    console.log("Successfully updated autoTranslateLoliCord/index.ts");
} else {
    console.error("Target content not found in file");
}

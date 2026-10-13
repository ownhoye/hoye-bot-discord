/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { showApiKeyWarning } from "@utils/apiKeyWarning";
import definePlugin, { OptionType } from "@utils/types";
import { React } from "@webpack/common";
import plugins from "~plugins";

import { t } from "../autoTranslateLoliCord";
import { getGroqKey, groqChat, registerSettingsFallback, setGroqKey } from "../lolicordAI/groqManager";

// ── In-Memory Fast Cache ────────────────────────────────────────────────────────

const correctionCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 120;

function getCachedCorrection(key: string): string | undefined {
    return correctionCache.get(key);
}

function setCachedCorrection(key: string, value: string): void {
    if (correctionCache.size >= MAX_CACHE_ENTRIES) {
        const first = correctionCache.keys().next().value;
        if (first) correctionCache.delete(first);
    }
    correctionCache.set(key, value);
}

// ── Settings ───────────────────────────────────────────────────────────────────

export const settings = definePluginSettings({
    isActive: {
        type: OptionType.BOOLEAN,
        description: "Enable automatic correction",
        default: false,
    },
    language: {
        type: OptionType.SELECT,
        description: "Correction language",
        options: [
            { label: "Auto-detect language", value: "auto", default: true },
            { label: "French", value: "fr" },
            { label: "English", value: "en" },
            { label: "Spanish", value: "es" },
            { label: "German", value: "de" },
            { label: "Italian", value: "it" },
            { label: "Portuguese", value: "pt" },
            { label: "Russian", value: "ru" },
        ],
        default: "auto",
    },
    aggressiveness: {
        type: OptionType.SELECT,
        description: "Correction level",
        options: [
            { label: "Soft — obvious mistakes only", value: "low", default: true },
            { label: "Normal — mistakes & style", value: "medium" },
            { label: "Aggressive — full rewrite & polish", value: "high" },
        ],
        default: "low",
    },
    customApiKey: {
        type: OptionType.STRING,
        description: "Groq API Key (console.groq.com/keys) — shared with LoliCordAI & VoiceDictation",
        placeholder: "gsk_...",
        default: "",
        onChange(val: string) {
            if (typeof val === "string" && val.trim()) {
                setGroqKey(val.trim()).catch(() => { });
            }
        },
    }
});

registerSettingsFallback(() => settings.store.customApiKey ?? "");

// ── Prompt Engineering & LLM Orchestration ────────────────────────────────────

const LANG_PROMPTS: Record<string, string> = {
    auto: "You are an ultra-fast, high-accuracy spelling and grammar corrector. Automatically detect the language of the user text and correct all typos, spelling, conjugation, punctuation, and grammar mistakes in that exact language. DO NOT translate to another language. Strict rules: 1) Preserve Discord mentions (<@id>, <#id>, <@&id>), custom emojis (<:name:id>, <a:name:id>), standard emojis, URLs, formatting, and common chat slang (e.g. mdr, lol, idk, gg, tkt, jsp, wesh, brb). 2) Do not change words unnecessarily. 3) Return ONLY the raw corrected text with zero explanation, zero preamble, and zero quotes.",
    fr: "Tu es un correcteur orthographique et grammatical ultra-rapide. Corrige les fautes d'orthographe, d'accord, de conjugaison et de grammaire en français. Règles strictes : 1) Conserve impérativement les mentions Discord (<@id>, <#id>), les émojis personnalisés (<:nom:id>, <a:nom:id>), les émojis standards, les liens URL, le formatage markdown, et l'argot courant (ex : mdr, ptdr, tkt, jsp, slt, cv, frr, wesh). 2) Ne reformule pas inutilement le texte. 3) Ne retourne AUCUNE explication ni guillemets : retourne uniquement le texte corrigé brut.",
    en: "You are an ultra-fast spell-checker and grammar corrector. Correct spelling, punctuation, capitalization, and grammatical mistakes in English. Strict rules: 1) Preserve Discord mentions (<@id>, <#id>), custom emojis (<:name:id>, <a:name:id>), standard emojis, URLs, code blocks, and casual gaming/internet slang (e.g. lol, idk, tbh, imo, rn, gg, brb). 2) Do not rephrase unnecessarily. 3) Return ONLY the raw corrected text without explanation or quotes.",
    es: "Eres un corrector ortográfico y gramatical ultra rápido. Corrige los errores ortográficos y gramaticales en español. Conserva menciones de Discord, emojis, URLs, código y jerga común. Devuelve ÚNICAMENTE el texto corregido sin explicaciones ni comillas.",
    de: "Du bist ein ultraschneller Rechtschreib- und Grammatikprüfer. Korrigiere Rechtschreib- und Grammatikfehler auf Deutsch. Behalte Discord-Erwähnungen, Emojis, URLs und Chat-Slang bei. Gib NUR den korrigierten Text ohne Erklärungen oder Anführungszeichen zurück.",
    it: "Sei un correttore ortografico e grammaticale ultra rapido. Correggi errori di ortografia e grammatica in italiano. Mantieni menzioni Discord, emoji, URL e gergo comune. Restituisci SOLO il testo corretto senza spiegazioni o virgolette.",
    pt: "Você é um corretor ortográfico e gramatical ultra rápido. Corrija erros ortográficos e gramaticais em português. Mantenha menções do Discord, emojis, URLs e gírias comuns. Retorne APENAS o texto corrigido sem explicações ou aspas.",
    ru: "Ты сверхбыстрый корректор орфографии и грамматики. Исправляй орфографические и грамматические ошибки на русском языке. Сохраняй упоминания Discord, эмодзи, URL-адреса и сленг. Возвращай ТОЛЬКО исправленный текст без пояснений и кавычек.",
};

const AGGR_SUFFIX: Record<string, string> = {
    low: " STRICT CONSTRAINT: ONLY fix obvious typos, misspellings, and major grammar errors. DO NOT change words, style, or sentence structure. Keep the text as identical as possible.",
    medium: " Fix mistakes and slightly improve grammar and clarity while strictly preserving the original voice and intent.",
    high: " Fix all errors and refine phrasing for natural, fluid, and clean expression.",
};

function shouldSkipCorrection(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length < 3) return true;

    // Skip bot commands and command prefixes
    if (/^[!/.?$#%^&*~+->;]/.test(trimmed) && !trimmed.startsWith("...")) {
        return true;
    }

    // Skip messages that are pure URLs or code
    if (/^https?:\/\/\S+$/i.test(trimmed)) return true;
    if (trimmed.startsWith("```") && trimmed.endsWith("```")) return true;

    return false;
}

export async function correctText(text: string): Promise<string> {
    if (shouldSkipCorrection(text)) return text;

    const lang = settings.store.language ?? "auto";
    const aggr = settings.store.aggressiveness ?? "low";
    const cacheKey = `${lang}:${aggr}:${text}`;

    const cached = getCachedCorrection(cacheKey);
    if (cached !== undefined) return cached;

    const basePrompt = LANG_PROMPTS[lang] ?? LANG_PROMPTS.auto;
    const aggrPrompt = AGGR_SUFFIX[aggr] ?? AGGR_SUFFIX.low;
    const systemPrompt = `${basePrompt} ${aggrPrompt}`;

    try {
        const rawResult = await groqChat({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text },
            ],
            temperature: 0.1,
            maxTokens: Math.max(256, Math.min(1024, text.length * 2)),
            forceModel: "qwen/qwen3.8-27b",
            timeoutMs: 4000,
            immediate: true,
        });

        if (!rawResult || typeof rawResult !== "string") {
            setCachedCorrection(cacheKey, text);
            return text;
        }

        let clean = rawResult.trim();

        // Strip markdown code blocks if the LLM wrapped output in them
        if (clean.startsWith("```") && clean.endsWith("```")) {
            clean = clean.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
        }

        // Strip surrounding quotes
        if (
            (clean.startsWith('"') && clean.endsWith('"')) ||
            (clean.startsWith("«") && clean.endsWith("»")) ||
            (clean.startsWith("“") && clean.endsWith("”")) ||
            (clean.startsWith("”") && clean.endsWith("”")) ||
            (clean.startsWith("'") && clean.endsWith("'"))
        ) {
            clean = clean.slice(1, -1).trim();
        }

        // Strip conversational prefixes that some LLMs might output
        const prefixes = [
            /^(?:Here is the corrected text|Corrected text|Correction|Texte corrigé|Voici le texte corrigé)\s*:\s*/i,
            /^(?:Output|Result|Texte)\s*:\s*/i
        ];
        for (const p of prefixes) {
            clean = clean.replace(p, "").trim();
        }

        // Safety check: identical or empty
        if (!clean || clean === text) {
            setCachedCorrection(cacheKey, text);
            return text;
        }

        // Safety check: length explosion or collapse
        if (clean.length > text.length * 2.5 || clean.length < text.length * 0.35) {
            setCachedCorrection(cacheKey, text);
            return text;
        }

        // In soft mode: strict word count check to prevent unwanted expansions
        if (aggr === "low") {
            const srcWords = text.trim().split(/\s+/).filter(w => w.length > 0).length;
            const corrWords = clean.trim().split(/\s+/).filter(w => w.length > 0).length;
            if (Math.abs(corrWords - srcWords) > Math.max(1, Math.floor(srcWords * 0.2))) {
                setCachedCorrection(cacheKey, text);
                return text;
            }
        }

        setCachedCorrection(cacheKey, clean);
        return clean;
    } catch (e: any) {
        console.warn("[AutoCorrect] Fast correction fallback:", e?.message || e);
        return text;
    }
}

// ── Chat Bar Button Component ──────────────────────────────────────────────────

function AutoCorrectIcon({ enabled }: { enabled: boolean; }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                fill="currentColor"
                d="M8.87 2.31A.5.5 0 0 1 9.34 2h10.92c.36 0 .6.36.47.69l-.6 1.5a.5.5 0 0 1-.47.31h-4.28l-4.17 15h4.05c.36 0 .6.36.47.69l-.6 1.5a.5.5 0 0 1-.47.31H3.74a.5.5 0 0 1-.47-.69l.6-1.5a.5.5 0 0 1 .47-.31h4.28l4.17-15H8.74a.5.5 0 0 1-.47-.69l.6-1.5Z"
            />
            {!enabled && (
                <line
                    x1="22"
                    y1="2"
                    x2="2"
                    y2="22"
                    stroke="var(--status-danger, #ed4245)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                />
            )}
        </svg>
    );
}

const AutoCorrectChatBarButton: ChatBarButtonFactory = ({ type }) => {
    const { isActive } = settings.use(["isActive"]);
    const validChat = ["normal", "sidebar"].some(x => type.analyticsName === x);
    if (!validChat) return null;

    const toggle = async () => {
        if (!isActive) {
            const key = await getGroqKey();
            if (!key) {
                showApiKeyWarning("AutoCorrect");
                return;
            }
        }
        settings.store.isActive = !settings.store.isActive;
    };

    const tooltip = isActive
        ? t("AutoCorrect: enabled — click to disable")
        : t("AutoCorrect: disabled — click to enable");

    return (
        <ChatBarButton
            tooltip={tooltip}
            onClick={toggle}
            onContextMenu={e => {
                e.preventDefault();
                openPluginModal(plugins["AutoCorrect"] ?? plugins["autoCorrect"]);
            }}
        >
            <AutoCorrectIcon enabled={isActive} />
        </ChatBarButton>
    );
};

// ── Plugin Definition ──────────────────────────────────────────────────────────

export default definePlugin({
    name: "AutoCorrect",
    enabledByDefault: false,
    description: "Automatically corrects spelling and grammar before sending messages with ultra-low latency.",
    dependencies: ["MessageEventsAPI", "ChatInputButtonAPI"],
    authors: [{ name: "Nightcord", id: 0n }],
    settings,

    start() {
        if (settings.store.customApiKey?.trim()) {
            setGroqKey(settings.store.customApiKey.trim()).catch(() => { });
        } else {
            getGroqKey().then(k => {
                if (k && !settings.store.customApiKey) {
                    settings.store.customApiKey = k;
                }
            }).catch(() => { });
        }
    },

    chatBarButton: {
        icon: () => <AutoCorrectIcon enabled={settings.store.isActive} />,
        render: AutoCorrectChatBarButton,
    },

    async onBeforeMessageSend(_channelId: string, message: { content: string; }, options?: any) {
        if (!settings.store.isActive) return;
        if (!message?.content || message.content.trim().length < 3) return;

        const corrected = await correctText(message.content);
        if (corrected && corrected !== message.content) {
            message.content = corrected;
            if (options && typeof options.content === "string") {
                options.content = corrected;
            }
        }
    },
});

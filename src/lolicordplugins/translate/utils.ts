/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * LoliCord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { classNameFactory } from "@utils/css";
import { onlyOnce } from "@utils/onlyOnce";
import { PluginNative } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

import { DeeplLanguages, deeplLanguageToGoogleLanguage, GoogleLanguages } from "./languages";
import { resetLanguageDefaults, settings } from "./settings";

export const cl = classNameFactory("vc-trans-");

const Native = VencordNative.pluginHelpers.Translate as PluginNative<typeof import("./native")>;

interface GoogleData {
    translation: string;
    sourceLanguage: string;
}

interface DeeplData {
    translations: {
        detected_source_language: string;
        text: string;
    }[];
}

export interface TranslationValue {
    sourceLanguage: string;
    text: string;
}

export const getLanguages = () => IS_WEB || settings.store.service === "google"
    ? GoogleLanguages
    : DeeplLanguages;

export async function translate(kind: "received" | "sent", text: string): Promise<TranslationValue> {
    const translateFn = IS_WEB || settings.store.service === "google"
        ? googleTranslate
        : deeplTranslate;

    const sourceLang = settings.store[`${kind}Input`] || "auto";
    const targetLang = settings.store[`${kind}Output`] || (kind === "sent" ? "en" : "fr");

    try {
        return await translateFn(
            text,
            sourceLang,
            targetLang
        );
    } catch (e) {
        const userMessage = typeof e === "string"
            ? e
            : "Something went wrong. If this issue persists, please check the console or ask for help in the support server.";

        showToast(userMessage, Toasts.Type.FAILURE);

        throw e instanceof Error
            ? e
            : new Error(userMessage);
    }
}

function getUserNativeLocale(): string {
    try {
        const receivedTo = settings.store.receivedOutput;
        if (receivedTo && receivedTo !== "auto") return receivedTo;
        const locale = (window as any).Vencord?.Webpack?.findByProps?.("getLocale")?.getLocale?.() || navigator.language || "fr";
        return locale.toLowerCase().split(/[-_]/)[0] || "fr";
    } catch {
        return "fr";
    }
}

const FRENCH_CHAT_ABBREVIATIONS: Record<string, string> = {
    att: "attends",
    stp: "s'il te plaît",
    svp: "s'il vous plaît",
    slt: "salut",
    slm: "salut",
    bjr: "bonjour",
    bsr: "bonsoir",
    tkt: "t'inquiète",
    dr: "de rien",
    mrc: "merci",
    bcp: "beaucoup",
    dsl: "désolé",
    pk: "pourquoi",
    prk: "pourquoi",
    cv: "ça va",
    jpp: "j'en peux plus",
    mdr: "mort de rire",
    ptdr: "pété de rire",
    trkl: "tranquille",
    vsy: "vas-y",
    chui: "je suis",
    chuis: "je suis",
    jsuis: "je suis",
    jvais: "je vais",
    tfk: "tu fais quoi",
    tfacon: "de toute façon"
};

function normalizeChatText(text: string, sourceLang: string): string {
    const native = getUserNativeLocale();
    if (sourceLang === "fr" || (sourceLang === "auto" && native === "fr")) {
        return text.replace(/\b([a-zA-ZÀ-ÿ]+)\b/g, (match) => {
            const lower = match.toLowerCase();
            if (FRENCH_CHAT_ABBREVIATIONS[lower]) {
                const expanded = FRENCH_CHAT_ABBREVIATIONS[lower];
                if (match === match.toUpperCase()) return expanded.toUpperCase();
                if (match[0] === match[0].toUpperCase()) return expanded[0].toUpperCase() + expanded.slice(1);
                return expanded;
            }
            return match;
        });
    }
    return text;
}

async function googleTranslate(text: string, sourceLang: string, targetLang: string): Promise<TranslationValue> {
    const sl = sourceLang === "auto" || !sourceLang ? "auto" : sourceLang;
    const tl = targetLang || "en";
    const cleanText = normalizeChatText(text, sl);

    // 1. Primary: clients5.google.com (Chrome Extension API - extremely fast, never 429 blocked)
    try {
        const queryClients5 = async (querySl: string) => {
            const url = `https://clients5.google.com/translate_a/t?${new URLSearchParams({
                client: "dict-chrome-ex",
                sl: querySl,
                tl,
                q: cleanText
            })}`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            if (Array.isArray(data)) {
                let transStr = "";
                let srcDetected = querySl;
                if (typeof data[0] === "string") {
                    transStr = data[0];
                    if (data[1]) srcDetected = data[1];
                } else if (Array.isArray(data[0])) {
                    transStr = data[0][0];
                    if (data[0][1]) srcDetected = data[0][1];
                }
                if (transStr) {
                    return { transStr, srcDetected };
                }
            }
            return null;
        };

        let result = await queryClients5(sl);

        // Fallback: If sl was "auto" and result is identical to input text
        // (Google falsely detected the text as target language because of English homographs like "attend", "minutes", "ok"):
        // Retry with the user's native locale (e.g. "fr")!
        const isUnchanged = !result ||
            result.transStr.trim().toLowerCase() === text.trim().toLowerCase() ||
            result.transStr.trim().toLowerCase() === cleanText.trim().toLowerCase();

        if (sl === "auto" && isUnchanged) {
            const fallbackSl = getUserNativeLocale();
            if (fallbackSl !== tl) {
                const retry = await queryClients5(fallbackSl);
                if (retry && retry.transStr.trim().toLowerCase() !== text.trim().toLowerCase() && retry.transStr.trim().toLowerCase() !== cleanText.trim().toLowerCase()) {
                    result = retry;
                }
            }
        }

        if (result && result.transStr) {
            return {
                sourceLanguage: GoogleLanguages[result.srcDetected] ?? result.srcDetected,
                text: result.transStr
            };
        }
    } catch {}

    // 2. Secondary: translate-pa.googleapis.com
    try {
        const queryTranslatePa = async (querySl: string) => {
            const url = "https://translate-pa.googleapis.com/v1/translate?" + new URLSearchParams({
                "params.client": "gtx",
                "dataTypes": "TRANSLATION",
                "key": "AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA",
                "query.sourceLanguage": querySl,
                "query.targetLanguage": tl,
                "query.text": cleanText,
            });
            const res = await fetch(url);
            if (!res.ok) return null;
            const data: GoogleData = await res.json();
            return data.translation ? data : null;
        };

        let data = await queryTranslatePa(sl);
        const isUnchanged = !data ||
            data.translation.trim().toLowerCase() === text.trim().toLowerCase() ||
            data.translation.trim().toLowerCase() === cleanText.trim().toLowerCase();

        if (sl === "auto" && isUnchanged) {
            const fallbackSl = getUserNativeLocale();
            if (fallbackSl !== tl) {
                const retry = await queryTranslatePa(fallbackSl);
                if (retry && retry.translation.trim().toLowerCase() !== text.trim().toLowerCase()) {
                    data = retry;
                }
            }
        }

        if (data && data.translation) {
            return {
                sourceLanguage: GoogleLanguages[data.sourceLanguage] ?? data.sourceLanguage,
                text: data.translation
            };
        }
    } catch {}

    // 3. Tertiary: MyMemory Translation API
    try {
        const langPair = `${sl === "auto" ? "autodetect" : sl}|${tl}`;
        const url = `https://api.mymemory.translated.net/get?${new URLSearchParams({
            q: text,
            langpair: langPair
        })}`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (data?.responseData?.translatedText) {
                return {
                    sourceLanguage: GoogleLanguages[sl] ?? sl,
                    text: data.responseData.translatedText
                };
            }
        }
    } catch {}

    throw new Error(`Failed to translate "${text}" (${sl} -> ${tl})`);
}

function fallbackToGoogle(text: string, sourceLang: string, targetLang: string): Promise<TranslationValue> {
    return googleTranslate(
        text,
        deeplLanguageToGoogleLanguage(sourceLang),
        deeplLanguageToGoogleLanguage(targetLang)
    );
}

const showDeeplApiQuotaToast = onlyOnce(
    () => showToast("Deepl API quota exceeded. Falling back to Google Translate", Toasts.Type.FAILURE)
);

async function deeplTranslate(text: string, sourceLang: string, targetLang: string): Promise<TranslationValue> {
    if (!settings.store.deeplApiKey) {
        showToast("DeepL API key is not set. Resetting to Google", Toasts.Type.FAILURE);

        settings.store.service = "google";
        resetLanguageDefaults();

        return fallbackToGoogle(text, sourceLang, targetLang);
    }

    // CORS jumpscare
    const { status, data } = await Native.makeDeeplTranslateRequest(
        settings.store.service === "deepl-pro",
        settings.store.deeplApiKey,
        JSON.stringify({
            text: [text],
            target_lang: targetLang,
            source_lang: sourceLang.split("-")[0]
        })
    );

    switch (status) {
        case 200:
            break;
        case -1:
            throw "Failed to connect to DeepL API: " + data;
        case 403:
            throw "Invalid DeepL API key or version";
        case 456:
            showDeeplApiQuotaToast();
            return fallbackToGoogle(text, sourceLang, targetLang);
        default:
            throw new Error(`Failed to translate "${text}" (${sourceLang} -> ${targetLang})\n${status} ${data}`);
    }

    const { translations }: DeeplData = JSON.parse(data);
    const src = translations[0].detected_source_language;

    return {
        sourceLanguage: DeeplLanguages[src] ?? src,
        text: translations[0].text
    };
}

/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ComponentDispatch, DraftStore, SelectedChannelStore } from "@webpack/common";
import { settings } from "./settings";

const wordCache = new Map<string, string>();
const pendingTranslations = new Map<string, Promise<string | null>>();
let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
let isHandlingSpace = false;
let currentTranslationAbortId = 0;

// ---------------------------------------------------------------------------
// Helpers & Casing
// ---------------------------------------------------------------------------

function matchCasing(original: string, translated: string): string {
    if (!original || !translated) return translated;

    // Preserve ALL CAPS if typed in ALL CAPS (e.g. SALUT -> HI)
    if (original === original.toUpperCase() && original !== original.toLowerCase()) {
        return translated.toUpperCase();
    }

    const first = original.charAt(0);
    const originalCapitalized = first === first.toUpperCase() && first !== first.toLowerCase();

    // Capitalize only if the user explicitly capitalized the original word or enabled the setting
    if (originalCapitalized || settings.store.capitalizeTranslated) {
        return translated.charAt(0).toUpperCase() + translated.slice(1);
    }

    // Default: strictly lowercase
    return translated.toLowerCase();
}

function getDiscordLocale(): string {
    try {
        return (
            (window as any).Vencord?.Webpack?.findByProps?.("getLocale")?.getLocale?.() ||
            navigator.language ||
            "fr"
        );
    } catch {
        return navigator.language || "fr";
    }
}

function getEffectiveSourceLang(configured?: string, targetLang = "en"): string {
    if (configured && configured !== "auto") return configured;
    const locale = getDiscordLocale();
    const lang = locale.toLowerCase().split(/[-_]/)[0];
    if (lang && lang !== targetLang) return lang;
    return "auto";
}

function extractTranslation(data: unknown): string | null {
    if (!data) return null;
    if (typeof data === "string") return data.trim() || null;
    if (Array.isArray(data)) {
        const first = (data as unknown[])[0];
        if (typeof first === "string") return first.trim() || null;
        if (Array.isArray(first)) {
            const inner = (first as unknown[])[0];
            if (typeof inner === "string") return inner.trim() || null;
        }
    }
    return null;
}

async function queryGoogleTranslate(phrase: string, sl: string, tl: string): Promise<string | null> {
    try {
        const url = `https://clients5.google.com/translate_a/t?${new URLSearchParams({ client: "dict-chrome-ex", sl, tl, q: phrase })}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        return extractTranslation(data);
    } catch {
        return null;
    }
}

export async function fetchWordTranslation(phrase: string, from: string, to: string): Promise<string | null> {
    if (!phrase || phrase.trim().length === 0) return null;
    const cleanPhrase = phrase.trim();
    const cacheKey = `${from}:${to}:${cleanPhrase.toLowerCase()}`;

    if (wordCache.has(cacheKey)) return wordCache.get(cacheKey)!;
    if (pendingTranslations.has(cacheKey)) return pendingTranslations.get(cacheKey)!;

    // Fast-path: Check high-priority colloquial idioms when target is English
    const cleanLower = cleanPhrase.toLowerCase();
    const cleanNoApos = cleanLower.replace(/['’]/g, "");
    if ((to === "en" || to === "auto") && (IDIOM_TRANSLATIONS[cleanLower] || IDIOM_TRANSLATIONS[cleanNoApos])) {
        const idiom = IDIOM_TRANSLATIONS[cleanLower] || IDIOM_TRANSLATIONS[cleanNoApos];
        wordCache.set(cacheKey, idiom);
        return idiom;
    }

    const promise = (async () => {
        const sl = from || "auto";
        const tl = to || "en";
        let translated = await queryGoogleTranslate(cleanPhrase, sl, tl);

        if (!translated || translated.toLowerCase() === cleanPhrase.toLowerCase()) {
            const fallbackSl = getEffectiveSourceLang("auto", tl);
            if (fallbackSl !== "auto" && fallbackSl !== sl) {
                const retry = await queryGoogleTranslate(cleanPhrase, fallbackSl, tl);
                if (retry && retry.toLowerCase() !== cleanPhrase.toLowerCase()) translated = retry;
            }
        }

        if (translated && translated.trim() && translated.toLowerCase() !== cleanPhrase.toLowerCase()) {
            const result = translated.trim();
            wordCache.set(cacheKey, result);
            return result;
        }
        return null;
    })();

    pendingTranslations.set(cacheKey, promise);
    try {
        return await promise;
    } finally {
        pendingTranslations.delete(cacheKey);
    }
}

function isWordEligible(word: string): boolean {
    if (!word || word.length < 1) return false;
    if (/^https?:\/\//i.test(word) || /^www\./i.test(word)) return false;
    if (word.startsWith("@") || word.startsWith("#")) return false;
    if (/^:[a-zA-Z0-9_+-]+:?$/.test(word)) return false;
    if (word.startsWith("/")) return false;
    if (!/[\p{L}\p{M}]/u.test(word)) return false;
    return true;
}

// ---------------------------------------------------------------------------
// Compound, Wait Words & Grammatical Phrase Structures
// ---------------------------------------------------------------------------

const SUBJECT_PRONOUNS = new Set([
    // French subject pronouns & elisions
    "je",
    "j",
    "tu",
    "t",
    "il",
    "elle",
    "on",
    "nous",
    "vous",
    "ils",
    "elles",
    "c",
    "ce",
    // English pronouns
    "i",
    "you",
    "he",
    "she",
    "it",
    "we",
    "they"
]);

const VERBS_WAIT_AFTER_PRONOUN = new Set([
    // French verbs that often take questions/complements and should not be chopped in half
    "fais",
    "fait",
    "font",
    "faisons",
    "faites",
    "vas",
    "va",
    "vais",
    "vont",
    "allons",
    "allez",
    "es",
    "est",
    "suis",
    "sommes",
    "êtes",
    "sont",
    "as",
    "a",
    "ai",
    "avons",
    "avez",
    "ont",
    "dis",
    "dit",
    "disons",
    "dites",
    "disent",
    "veux",
    "veut",
    "veu",
    "voulons",
    "voulez",
    "veulent",
    "peux",
    "peut",
    "peu",
    "pouvons",
    "pouvez",
    "peuvent",
    "sais",
    "sait",
    "sai",
    "savons",
    "savez",
    "savent",
    "pense",
    "penses",
    "pensons",
    "pensez",
    "pensent",
    "vois",
    "voit",
    "voyons",
    "voyez",
    "voient",
    "viens",
    "vient",
    "venons",
    "venez",
    "viennent",
    "pars",
    "part",
    "partons",
    "partez",
    "partent",
    "attends",
    "attend",
    "attendons",
    "attendez",
    "attendent",
    "regarde",
    "regardes",
    "regardons",
    "regardez",
    "regardent",
    "cherche",
    "cherches",
    "cherchons",
    "cherchez",
    "cherchent",
    "mange",
    "manges",
    "bois",
    "boit"
]);

const WAIT_WORDS = new Set([
    // French incomplete words & compound prefixes
    "aujourd",
    "hui",
    "parce",
    "peut",
    "est",
    "en",
    "au",
    "aux",
    "du",
    "des",
    "de",
    "d",
    "le",
    "la",
    "les",
    "l",
    "un",
    "une",
    "ce",
    "cet",
    "cette",
    "ces",
    "c",
    "mon",
    "ton",
    "son",
    "ma",
    "ta",
    "sa",
    "mes",
    "tes",
    "ses",
    "notre",
    "votre",
    "leur",
    "nos",
    "vos",
    "leurs",
    // French pronouns & short linkers (notice "quoi" is intentionally omitted to trigger question translation)
    "tu",
    "je",
    "j",
    "il",
    "elle",
    "on",
    "nous",
    "vous",
    "ils",
    "elles",
    "me",
    "m",
    "te",
    "t",
    "se",
    "s",
    "qui",
    "que",
    "qu",
    "y",
    "si",
    "ne",
    // English pronouns & connectors
    "i",
    "you",
    "he",
    "she",
    "it",
    "we",
    "they",
    "the",
    "a",
    "an",
    "my",
    "your",
    "his",
    "her",
    "our",
    "their",
    "to",
    "of",
    "in",
    "at",
    "for",
    "on",
    "with",
    "as",
    "by"
]);

const COMPLETE_COMPOUNDS = new Set([
    "aujourd hui",
    "peut etre",
    "parce que",
    "c est",
    "d accord",
    "en fait",
    "au revoir",
    "tout monde",
    "bien sur",
    "de rien",
    "pas probleme",
    "pas souci",
    "sil plait",
    "pourquoi pas",
    "est ce"
]);

export const IDIOM_TRANSLATIONS: Record<string, string> = {
    // Interrogatives & questions
    "you do quoi": "what are you doing",
    "you do what": "what are you doing",
    "you make quoi": "what are you doing",
    "tu fais quoi": "what are you doing",
    "tu fait quoi": "what are you doing",
    "tu fais quoi aujourd'hui": "what are you doing today",
    "tu fait quoi aujourd'hui": "what are you doing today",
    "tu fais quoi aujourd hui": "what are you doing today",
    "tu fait quoi aujourd hui": "what are you doing today",
    "tu fais quoi aujourdhui": "what are you doing today",
    "tu fait quoi aujourdhui": "what are you doing today",
    "tu fais quoi ce soir": "what are you doing tonight",
    "tu fait quoi ce soir": "what are you doing tonight",
    "tu fais quoi de beau": "what are you up to",
    "tu fait quoi de beau": "what are you up to",
    "tu vas où": "where are you going",
    "tu va ou": "where are you going",
    "tu vas bien": "are you doing well",
    "tu va bien": "are you doing well",
    "tu dis quoi": "what are you saying",
    "tu dit quoi": "what are you saying",
    "tu penses quoi": "what do you think",
    "tu pense quoi": "what do you think",
    "tu viens quand": "when are you coming",
    "tu pars quand": "when are you leaving",
    "c'est quoi": "what is it",
    "c est quoi": "what is it",
    "c quoi": "what is it",
    "c'est quoi ça": "what is that",
    "c est quoi ca": "what is that",
    "c'est qui": "who is it",
    "c est qui": "who is it",
    "c qui": "who is it",
    "c'est où": "where is it",
    "c est ou": "where is it",
    "c ou": "where is it",
    "c'est quand": "when is it",
    "c est quand": "when is it",
    "c quand": "when is it",
    "c'est comment": "how is it",
    "c est comment": "how is it",
    "c'est bon": "it's good",
    "c est bon": "it's good",
    "c'est pas grave": "it doesn't matter",
    "c est pas grave": "it doesn't matter",
    "t'es où": "where are you",
    "t es où": "where are you",
    "t es ou": "where are you",
    "tu es où": "where are you",
    "tu es ou": "where are you",
    "t'es qui": "who are you",
    "t es qui": "who are you",
    "tu es qui": "who are you",
    "qu'est ce que c'est": "what is that",
    "qu est ce que c est": "what is that",
    "qu'est ce que": "what",
    "qu est ce que": "what",
    "est ce que": "is it that",
    // Greetings & Politeness
    "salut": "hi",
    "bonjour": "hello",
    "bonsoir": "good evening",
    "bonne nuit": "good night",
    "bonne soiree": "have a good evening",
    "bonne soirée": "have a good evening",
    "bonne journee": "have a good day",
    "bonne journée": "have a good day",
    "a plus": "see you later",
    "a plus tard": "see you later",
    "a toute": "see you soon",
    "a bientot": "see you soon",
    "a bientôt": "see you soon",
    "de rien": "you're welcome",
    "merci beaucoup": "thank you very much",
    "merci bien": "thank you",
    "pas de souci": "no problem",
    "pas de soucis": "no problem",
    "pas de probleme": "no problem",
    "pas de problème": "no problem",
    "pas de pb": "no problem",
    "s'il te plaît": "please",
    "sil te plait": "please",
    "s'il vous plaît": "please",
    "sil vous plait": "please",
    "stp": "please",
    "svp": "please",
    // Idioms & Conversational
    "ca va": "how are you",
    "ça va": "how are you",
    "ca marche": "sounds good",
    "ça marche": "sounds good",
    "en fait": "actually",
    "d'accord": "okay",
    "d accord": "okay",
    "bien sur": "of course",
    "bien sûr": "of course",
    "peut etre": "maybe",
    "peut-être": "maybe",
    "parce que": "because",
    "tout a fait": "absolutely",
    "tout à fait": "absolutely",
    "il y a": "there is"
};

// ---------------------------------------------------------------------------
// Slate Editor & DOM Bridge (Fixes Backspace deletion)
// ---------------------------------------------------------------------------

function getSlateEditor(target: HTMLElement | null): any {
    if (!target) return null;
    const slateEl = (
        target.closest?.('[data-slate-editor="true"]') ||
        target.closest?.('[role="textbox"]') ||
        target
    ) as HTMLElement | null;
    if (!slateEl) return null;

    let current: HTMLElement | null = slateEl;
    while (current && current !== document.body) {
        const keys = Object.keys(current);
        const fiberKey = keys.find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
        if (fiberKey) {
            let fiber = (current as any)[fiberKey];
            let depth = 0;
            while (fiber && depth < 40) {
                const editor =
                    fiber.memoizedProps?.editor ||
                    fiber.stateNode?.editor ||
                    fiber.memoizedState?.editor ||
                    fiber.stateNode?.props?.editor;

                if (editor && typeof editor.insertText === "function") {
                    return editor;
                }
                fiber = fiber.return;
                depth++;
            }
        }
        current = current.parentElement;
    }
    return null;
}

function replacePhraseInEditor(target: HTMLElement, phrase: string, replacement: string): boolean {
    // 1. Slate Editor instance directly (preserves Slate selection, cursor, and history)
    const editor = getSlateEditor(target);
    if (editor && typeof editor.deleteBackward === "function" && typeof editor.insertText === "function") {
        try {
            for (let i = 0; i < phrase.length; i++) {
                editor.deleteBackward("character");
            }
            editor.insertText(replacement);
            return true;
        } catch (err) {
            console.warn("[Translate] Slate editor replacement failed:", err);
        }
    }

    // 2. ComponentDispatch (Discord official chat input bus)
    try {
        const channelId = SelectedChannelStore?.getChannelId?.();
        if (channelId && DraftStore && ComponentDispatch) {
            const draft = DraftStore.getDraft(channelId, 0);
            if (typeof draft === "string" && draft.endsWith(phrase)) {
                const newDraft = draft.slice(0, draft.length - phrase.length) + replacement;
                ComponentDispatch.dispatchToLastSubscribed("CLEAR_TEXT");
                ComponentDispatch.dispatchToLastSubscribed("INSERT_TEXT", {
                    rawText: newDraft,
                    plainText: newDraft
                });
                return true;
            }
        }
    } catch (err) {
        console.warn("[Translate] ComponentDispatch replacement failed:", err);
    }

    // 3. Fallback: DOM Range + execCommand + input event
    try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const node = range.endContainer;
            const offset = range.endOffset;
            if (node.nodeType === Node.TEXT_NODE && node.textContent) {
                const start = offset - phrase.length;
                if (start >= 0 && node.textContent.slice(start, offset) === phrase) {
                    const replaceRange = document.createRange();
                    replaceRange.setStart(node, start);
                    replaceRange.setEnd(node, offset);
                    sel.removeAllRanges();
                    sel.addRange(replaceRange);
                    const ok = document.execCommand("insertText", false, replacement);
                    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: replacement }));
                    return ok;
                }
            }
        }
    } catch {}

    return false;
}

function insertNormalSpace(target: HTMLElement): void {
    const editor = getSlateEditor(target);
    if (editor && typeof editor.insertText === "function") {
        try {
            editor.insertText(" ");
            return;
        } catch {}
    }

    try {
        ComponentDispatch?.dispatchToLastSubscribed("INSERT_TEXT", {
            rawText: " ",
            plainText: " "
        });
        return;
    } catch {}

    try {
        document.execCommand("insertText", false, " ");
    } catch {}
}

// ---------------------------------------------------------------------------
// Phrase Detection Before Cursor
// ---------------------------------------------------------------------------

function getTextBeforeCursor(): { textBefore: string; target: HTMLElement } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;

    let node: Node | null = sel.anchorNode;
    let offset = sel.anchorOffset;
    if (!node) return null;

    if (node.nodeType === Node.ELEMENT_NODE) {
        if (offset > 0 && node.childNodes[offset - 1]) {
            node = node.childNodes[offset - 1];
            while (node && node.nodeType === Node.ELEMENT_NODE && node.lastChild) {
                node = node.lastChild;
            }
            offset = node?.textContent?.length ?? 0;
        }
    }

    const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null;
    const editorEl = (
        el?.closest?.('[data-slate-editor="true"]') ||
        el?.closest?.('[role="textbox"]') ||
        el
    ) as HTMLElement | null;
    if (!editorEl) return null;

    let textBefore = "";
    if (node && node.nodeType === Node.TEXT_NODE) {
        textBefore = (node.textContent ?? "").slice(0, offset);
        let prev = node.previousSibling;
        while (prev && prev.nodeType === Node.TEXT_NODE) {
            textBefore = (prev.textContent ?? "") + textBefore;
            prev = prev.previousSibling;
        }
    }

    if (!textBefore) {
        try {
            const channelId = SelectedChannelStore?.getChannelId?.();
            const draft = DraftStore?.getDraft?.(channelId, 0);
            if (typeof draft === "string") {
                textBefore = draft;
            }
        } catch {}
    }

    return { textBefore, target: editorEl };
}

interface PhraseAnalysis {
    shouldWait: boolean;
    phraseToTranslate: string;
    phraseToReplace: string;
    trailingPunct: string;
}

function analyzePhraseToTranslate(textBefore: string): PhraseAnalysis | null {
    if (!textBefore || textBefore.trim().length === 0) return null;

    const cleaned = textBefore.replace(/[\r\n]+/g, " ");
    const match = cleaned.match(/([\p{L}\p{M}'’-]+(?:\s+[\p{L}\p{M}'’-]+)*)([,.;:!?]*)$/u);
    if (!match) return null;

    const fullMatch = match[1];
    const trailingPunct = match[2] || "";
    const words = fullMatch.split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;

    const lastWord = words[words.length - 1];
    if (!isWordEligible(lastWord)) return null;

    const lastLower = lastWord.toLowerCase().replace(/['’]/g, "");

    // 1. Check if the last 4, 3, or 2 words match high-priority idioms directly (e.g. "tu fait quoi")
    for (let count = Math.min(4, words.length); count >= 2; count--) {
        const slice = words.slice(words.length - count);
        const joined = slice.join(" ").toLowerCase();
        const joinedNoApos = joined.replace(/['’]/g, "");
        if (IDIOM_TRANSLATIONS[joined] || IDIOM_TRANSLATIONS[joinedNoApos]) {
            const phraseToTranslate = slice.join(" ");
            return {
                shouldWait: false,
                phraseToTranslate,
                phraseToReplace: phraseToTranslate + trailingPunct,
                trailingPunct
            };
        }
    }

    // 2. Check if previous word + lastWord forms a complete compound (e.g. "aujourd hui")
    if (words.length >= 2) {
        const prevLower = words[words.length - 2].toLowerCase().replace(/['’]/g, "");
        const twoWords = `${prevLower} ${lastLower}`;
        if (COMPLETE_COMPOUNDS.has(twoWords)) {
            const phraseToTranslate = `${words[words.length - 2]} ${lastWord}`;
            return {
                shouldWait: false,
                phraseToTranslate,
                phraseToReplace: phraseToTranslate + trailingPunct,
                trailingPunct
            };
        }
    }

    // 3. If lastWord is a verb preceded by a subject pronoun (e.g. "tu fait", "tu vas"), WAIT!
    // Do NOT translate prematurely into "you do" before question particles (e.g. "quoi", "où") or complements are typed.
    // Exception: If preceded by a subordinate conjunction (e.g. "si tu veux", "quand tu veux"), it is already complete.
    if (words.length >= 2) {
        const prevLower = words[words.length - 2].toLowerCase().replace(/['’]/g, "");
        const prevPrevLower = words.length >= 3 ? words[words.length - 3].toLowerCase().replace(/['’]/g, "") : "";
        const isSubordinate = ["si", "quand", "comme", "lorsque"].includes(prevPrevLower);

        if (!isSubordinate && SUBJECT_PRONOUNS.has(prevLower) && VERBS_WAIT_AFTER_PRONOUN.has(lastLower)) {
            return { shouldWait: true, phraseToTranslate: "", phraseToReplace: "", trailingPunct: "" };
        }
    }

    // 4. If lastWord is in WAIT_WORDS, wait for user to finish expression
    if (WAIT_WORDS.has(lastLower)) {
        return { shouldWait: true, phraseToTranslate: "", phraseToReplace: "", trailingPunct: "" };
    }

    // 5. Build the phrase backwards if preceded by wait words, pronouns, or verbs
    const phraseWords = [lastWord];
    for (let i = words.length - 2; i >= 0 && phraseWords.length < 5; i--) {
        const prevLower = words[i].toLowerCase().replace(/['’]/g, "");
        if (WAIT_WORDS.has(prevLower) || VERBS_WAIT_AFTER_PRONOUN.has(prevLower) || SUBJECT_PRONOUNS.has(prevLower)) {
            phraseWords.unshift(words[i]);
        } else {
            break;
        }
    }

    const phraseToTranslate = phraseWords.join(" ");
    return {
        shouldWait: false,
        phraseToTranslate,
        phraseToReplace: phraseToTranslate + trailingPunct,
        trailingPunct
    };
}

// ---------------------------------------------------------------------------
// Space Key & Input Handlers
// ---------------------------------------------------------------------------

async function onKeyDown(e: KeyboardEvent) {
    // If Backspace, Delete, Escape or Arrow keys are pressed, cancel any in-flight translation immediately
    if (e.key === "Backspace" || e.key === "Delete" || e.key === "Escape" || e.key.startsWith("Arrow")) {
        currentTranslationAbortId++;
        isHandlingSpace = false;
        return;
    }

    if (e.key !== " " && e.code !== "Space") {
        currentTranslationAbortId++;
        return;
    }

    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.repeat) return;
    if (!settings.store.translateOnSpace) return;
    if (isHandlingSpace) return;

    const info = getTextBeforeCursor();
    if (!info) return;
    const { textBefore, target } = info;

    const analysis = analyzePhraseToTranslate(textBefore);
    if (!analysis) return;

    // If the word should wait (e.g. "tu", "aujourd", "c", "je", "tu fait"), do not translate yet!
    if (analysis.shouldWait) {
        e.preventDefault();
        e.stopPropagation();
        insertNormalSpace(target);
        return;
    }

    const { phraseToTranslate, phraseToReplace, trailingPunct } = analysis;
    if (!phraseToTranslate) return;

    const from = getEffectiveSourceLang(settings.store.sentInput, settings.store.sentOutput || "en");
    const to = settings.store.sentOutput || "en";
    if (from !== "auto" && from === to) return;

    // Instant cache check
    const cacheKey = `${from}:${to}:${phraseToTranslate.toLowerCase()}`;
    const cached = wordCache.get(cacheKey);
    if (cached && cached.toLowerCase() !== phraseToTranslate.toLowerCase()) {
        e.preventDefault();
        e.stopPropagation();
        const replacement = matchCasing(phraseToTranslate, cached) + trailingPunct + " ";
        replacePhraseInEditor(target, phraseToReplace, replacement);
        return;
    }

    e.preventDefault();
    e.stopPropagation();
    isHandlingSpace = true;
    const thisAbortId = ++currentTranslationAbortId;

    try {
        const translated = await Promise.race([
            fetchWordTranslation(phraseToTranslate, from, to),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 400)),
        ]);

        // If user typed another key or deleted while waiting, abort!
        if (thisAbortId !== currentTranslationAbortId) return;

        if (translated && translated.toLowerCase() !== phraseToTranslate.toLowerCase()) {
            const replacement = matchCasing(phraseToTranslate, translated) + trailingPunct + " ";
            const ok = replacePhraseInEditor(target, phraseToReplace, replacement);
            if (!ok) {
                insertNormalSpace(target);
            }
        } else {
            insertNormalSpace(target);
        }
    } catch {
        if (thisAbortId === currentTranslationAbortId) {
            insertNormalSpace(target);
        }
    } finally {
        if (thisAbortId === currentTranslationAbortId) {
            isHandlingSpace = false;
        }
    }
}

function onInput() {
    if (!settings.store.translateOnSpace) return;
    if (prefetchTimer !== null) clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(() => {
        prefetchTimer = null;
        const info = getTextBeforeCursor();
        if (info) {
            const analysis = analyzePhraseToTranslate(info.textBefore);
            if (analysis && !analysis.shouldWait && analysis.phraseToTranslate.length >= 2) {
                const from = getEffectiveSourceLang(settings.store.sentInput, settings.store.sentOutput || "en");
                const to = settings.store.sentOutput || "en";
                fetchWordTranslation(analysis.phraseToTranslate, from, to).catch(() => {/* fire and forget */});
            }
        }
    }, 80);
}

// ---------------------------------------------------------------------------
// Init & Teardown
// ---------------------------------------------------------------------------

export function initTranslateOnSpace(): void {
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("input", onInput, true);
}

export function stopTranslateOnSpace(): void {
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("input", onInput, true);
    if (prefetchTimer !== null) {
        clearTimeout(prefetchTimer);
        prefetchTimer = null;
    }
    wordCache.clear();
    pendingTranslations.clear();
    isHandlingSpace = false;
    currentTranslationAbortId++;
}


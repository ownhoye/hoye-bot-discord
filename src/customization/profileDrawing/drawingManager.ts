/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts, UserStore } from "@webpack/common";
import { t } from "../../lolicordplugins/autoTranslateLoliCord";
import {
    getCachedEffectsConfig,
    getLocalEffectsConfig,
    profileCache,
    saveLocalEffectsConfig,
    syncOwnDataToCloud
} from "../sync";
import type { ProfileDrawingAvatarAnchor, ProfileDrawingData, ProfileDrawingStroke } from "../types";

export const PRESET_COLORS = [
    "#FFFFFF",
    "#5865F2",
    "#38BDF8",
    "#57F287",
    "#FEE75C",
    "#F97316",
    "#EB459E",
    "#ED4245",
    "#9B59B6",
    "#2DD4BF",
    "#111214",
];

export function getBrushCursor(color: string): string {
    const safeColor = color || "#FFFFFF";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <path d="M4 28 L8 24 L6 22 L2 26 C1.5 26.5 1.5 27.5 2 28 C2.5 28.5 3.5 28.5 4 28 Z" fill="${safeColor}"/>
        <path d="M8 24 L11 21 L8 18 L5 21 Z" fill="#b0b0b0" stroke="#000" stroke-width="0.8"/>
        <path d="M11 21 L24 8 C25.5 6.5 25.5 4.2 24 2.7 C22.5 1.2 20.2 1.2 18.7 2.7 L5.7 15.7 Z" fill="#5865F2" stroke="#000" stroke-width="1"/>
        <circle cx="2" cy="28" r="2" fill="${safeColor}" stroke="#ffffff" stroke-width="0.5"/>
    </svg>`;
    try {
        const b64 = btoa(svg);
        return `url("data:image/svg+xml;base64,${b64}") 2 28, crosshair`;
    } catch {
        return "crosshair";
    }
}

// ─── Drawing Manager State ───────────────────────────────────────────────────

let currentStrokes: ProfileDrawingStroke[] = [];
let activeBrushColor = "#FFFFFF";
let activeBrushSize = 6;
let isDrawingActive = false;
let activeCanvas: HTMLCanvasElement | null = null;
let currentActiveStroke: ProfileDrawingStroke | null = null;
let activeResizeObserver: ResizeObserver | null = null;
let currentAvatarAnchor: ProfileDrawingAvatarAnchor | null = null;

const stateListeners = new Set<() => void>();

function notifyListeners() {
    for (const listener of stateListeners) {
        try { listener(); } catch {}
    }
}

export function subscribeDrawingState(listener: () => void): () => void {
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
}

export function getDrawingStrokes(): ProfileDrawingStroke[] {
    return [...currentStrokes];
}

export function setDrawingStrokes(strokes: ProfileDrawingStroke[]) {
    currentStrokes = [...strokes];
    notifyListeners();
    redrawActiveCanvases();
}

export function getActiveBrushColor(): string {
    return activeBrushColor;
}

export function setActiveBrushColor(color: string) {
    activeBrushColor = color;
    notifyListeners();
    updateInteractiveCanvasCursor();
}

export function getActiveBrushSize(): number {
    return activeBrushSize;
}

export function setActiveBrushSize(size: number) {
    activeBrushSize = Math.max(1, Math.min(60, size));
    notifyListeners();
}

export function isDrawingModeActive(): boolean {
    return isDrawingActive;
}

export function undoLastStroke() {
    if (currentStrokes.length > 0) {
        currentStrokes.pop();
        notifyListeners();
        redrawActiveCanvases();
    }
}

export function clearAllStrokes() {
    if (currentStrokes.length > 0) {
        currentStrokes = [];
        notifyListeners();
        redrawActiveCanvases();
    }
}

// Initialize own strokes from config
export async function initOwnDrawingStrokes() {
    const config = await getLocalEffectsConfig();
    if (config.profileDrawing && Array.isArray(config.profileDrawing.strokes)) {
        currentStrokes = [...config.profileDrawing.strokes];
        if (config.profileDrawing.avatarAnchor) {
            currentAvatarAnchor = { ...config.profileDrawing.avatarAnchor };
        } else {
            currentAvatarAnchor = {
                cx: 66,
                cy: 95,
                size: 80,
                cardWidth: 340,
                cardHeight: 480,
            };
        }
        notifyListeners();
    }
}

export async function saveDrawing(): Promise<boolean> {
    try {
        const effects = await getLocalEffectsConfig();

        // Refresh avatar anchor from active preview if available
        const previewEl = findProfilePreviewElement();
        if (previewEl) {
            const av = getAvatarMetrics(previewEl);
            const rect = previewEl.getBoundingClientRect();
            if (av && rect.width > 0 && rect.height > 0) {
                currentAvatarAnchor = {
                    cx: av.cx,
                    cy: av.cy,
                    size: av.size,
                    cardWidth: rect.width,
                    cardHeight: rect.height,
                };
            }
        }

        const drawingData: ProfileDrawingData = {
            enabled: true,
            strokes: [...currentStrokes],
            updatedAt: Date.now(),
            avatarAnchor: currentAvatarAnchor || {
                cx: 66,
                cy: 95,
                size: 80,
                cardWidth: 340,
                cardHeight: 480,
            },
        };

        const updatedEffects = {
            ...effects,
            profileDrawing: drawingData,
        };

        await saveLocalEffectsConfig(updatedEffects);
        const curUser = UserStore.getCurrentUser();
        if (curUser?.id) {
            const cached = profileCache.get(curUser.id);
            if (cached?.data) {
                cached.data.effects = updatedEffects;
            }
        }

        void syncOwnDataToCloud();
        showToast(t("Drawing saved and synced successfully!"), Toasts.Type.SUCCESS);
        redrawAllProfiles();
        return true;
    } catch (e) {
        console.error("[ProfileDrawing] Failed to save drawing:", e);
        showToast(t("Failed to save drawing"), Toasts.Type.DANGER);
        return false;
    }
}

// ─── Avatar Metrics Detection ────────────────────────────────────────────────

const PROFILE_INNER_LIST_OR_TAB_SELECTOR =
    "[role='tabpanel'], [class*='tabBarPanel'], [class*='listScroller'], [class*='listRow'], [class*='mutual'], [class*='friend_'], [class*='friendsRow'], [class*='peopleListItem'], [role='listitem'], [class*='activity'], [class*='connectedAccount']";

export function getAvatarMetrics(container: HTMLElement): { cx: number; cy: number; size: number } | null {
    if (!container) return null;

    const selectors = [
        "[class*='avatar__']",
        "[class*='avatarWrapper_']",
        "[class*='avatar_'] [class*='wrapper_']",
        "[class*='avatar_']",
        "img[src*='/avatars/']",
        "img[src*='/embed/avatars/']",
        "[class*='avatarStack_']",
    ];

    const containerRect = container.getBoundingClientRect();
    if (containerRect.width <= 0 || containerRect.height <= 0) return null;

    let bestAvatar: HTMLElement | null = null;
    let maxScore = -1;

    for (const sel of selectors) {
        const matches = container.querySelectorAll<HTMLElement>(sel);
        for (const el of Array.from(matches)) {
            if (el.closest(PROFILE_INNER_LIST_OR_TAB_SELECTOR)) continue;
            const r = el.getBoundingClientRect();
            // Filter: must be reasonably sized (>= 48px) and in upper portion of card
            const topOffset = r.top - containerRect.top;
            if (r.width >= 48 && r.height >= 48 && topOffset >= 0 && topOffset < containerRect.height * 0.6) {
                // Higher score for larger avatars near the top
                const score = r.width * 10 - topOffset;
                if (score > maxScore) {
                    maxScore = score;
                    bestAvatar = el;
                }
            }
        }
        if (bestAvatar && maxScore > 600) break;
    }

    if (!bestAvatar) {
        // Fallback for smaller preview avatar if >= 32px
        const fallbacks = container.querySelectorAll<HTMLElement>("[class*='avatar_'], img[src*='/avatars/'], img[src*='/embed/avatars/'], [class*='avatarStack_']");
        for (const el of Array.from(fallbacks)) {
            if (el.closest(PROFILE_INNER_LIST_OR_TAB_SELECTOR)) continue;
            const r = el.getBoundingClientRect();
            if (r.width >= 32 && r.height >= 32) {
                bestAvatar = el;
                break;
            }
        }
    }

    if (!bestAvatar) return null;

    const avRect = bestAvatar.getBoundingClientRect();
    const cx = (avRect.left + avRect.width / 2) - containerRect.left;
    const cy = (avRect.top + avRect.height / 2) - containerRect.top;
    const size = Math.max(avRect.width, avRect.height);

    return { cx, cy, size };
}

// ─── Canvas Stroke Rendering ─────────────────────────────────────────────────

export function drawStrokes(
    ctx: CanvasRenderingContext2D,
    strokes: ProfileDrawingStroke[],
    width: number,
    height: number,
    anchor?: ProfileDrawingAvatarAnchor | null,
    targetAvatar?: { cx: number; cy: number; size: number } | null
) {
    if (!strokes || strokes.length === 0 || width <= 0 || height <= 0) return;

    // Base reference anchor
    const refAnchor = anchor || {
        cx: 66,
        cy: 95,
        size: 80,
        cardWidth: 340,
        cardHeight: 480,
    };

    const hasAvatar = !!targetAvatar && targetAvatar.size > 0 && refAnchor.size > 0;
    const scaleFactor = hasAvatar
        ? (targetAvatar.size / refAnchor.size)
        : Math.max(0.6, width / (refAnchor.cardWidth || 340));

    const mapPoint = (nx: number, ny: number): [number, number] => {
        const origX = nx * (refAnchor.cardWidth || 340);
        const origY = ny * (refAnchor.cardHeight || 480);

        if (hasAvatar && targetAvatar) {
            const dx = origX - refAnchor.cx;
            const dy = origY - refAnchor.cy;
            const px = targetAvatar.cx + dx * scaleFactor;
            const py = targetAvatar.cy + dy * scaleFactor;
            return [px, py];
        }

        const px = origX * scaleFactor;
        const py = origY * scaleFactor;
        return [px, py];
    };

    for (const stroke of strokes) {
        if (!stroke.points || stroke.points.length === 0) continue;

        const strokeWidth = Math.max(1, stroke.size * scaleFactor);
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
        ctx.lineWidth = strokeWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (stroke.points.length === 1) {
            const [nx, ny] = stroke.points[0];
            const [px, py] = mapPoint(nx, ny);
            ctx.beginPath();
            ctx.arc(px, py, strokeWidth / 2, 0, Math.PI * 2);
            ctx.fill();
            continue;
        }

        ctx.beginPath();
        const [firstNx, firstNy] = stroke.points[0];
        const [firstPx, firstPy] = mapPoint(firstNx, firstNy);
        ctx.moveTo(firstPx, firstPy);

        for (let i = 1; i < stroke.points.length; i++) {
            const [nx, ny] = stroke.points[i];
            const [px, py] = mapPoint(nx, ny);
            ctx.lineTo(px, py);
        }
        ctx.stroke();
    }
}

function syncCanvasDimensions(canvas: HTMLCanvasElement, container: HTMLElement): { width: number; height: number; } {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width || container.clientWidth || 300));
    const height = Math.max(1, Math.round(rect.height || container.clientHeight || 400));

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
    }
    return { width, height };
}

// ─── Drawing Overlay Renderer on Any Profile Container ───────────────────────

export function renderDrawingOverlay(
    container: HTMLElement,
    data?: ProfileDrawingData | null,
    interactive = false
): HTMLCanvasElement | null {
    if (!container) return null;
    if (container.closest(PROFILE_INNER_LIST_OR_TAB_SELECTOR)) {
        container.querySelector(".nc-profile-drawing-overlay")?.remove();
        return null;
    }

    let canvas = container.querySelector<HTMLCanvasElement>(".nc-profile-drawing-overlay");

    if (!data || !data.enabled || (!interactive && (!data.strokes || data.strokes.length === 0))) {
        if (canvas && !canvas.classList.contains("nc-profile-drawing-interactive")) {
            canvas.remove();
        }
        return null;
    }

    if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.className = "nc-profile-drawing-overlay";
        canvas.setAttribute("aria-hidden", "true");
        container.appendChild(canvas);
    }

    // Remove any duplicate canvases inside container
    const allCanvases = container.querySelectorAll<HTMLCanvasElement>(".nc-profile-drawing-overlay");
    for (let i = 1; i < allCanvases.length; i++) {
        allCanvases[i].remove();
    }

    // Ensure container has relative/absolute positioning
    const compPos = window.getComputedStyle(container).position;
    if (compPos === "static") {
        container.style.position = "relative";
    }

    const { width, height } = syncCanvasDimensions(canvas, container);

    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const targetAvatar = getAvatarMetrics(container);
    const anchor = interactive ? currentAvatarAnchor : (data?.avatarAnchor || currentAvatarAnchor);

    const strokesToDraw = interactive ? currentStrokes : (data?.strokes || []);
    drawStrokes(ctx, strokesToDraw, width, height, anchor, targetAvatar);

    if (interactive && currentActiveStroke) {
        drawStrokes(ctx, [currentActiveStroke], width, height, anchor, targetAvatar);
    }
    ctx.restore();

    return canvas;
}

// Redraw all visible profile overlays
export function redrawAllProfiles() {
    const curUser = UserStore.getCurrentUser();
    const ownEffects = getCachedEffectsConfig();

    const rawElements = Array.from(document.querySelectorAll<HTMLElement>(
        "[class*='userProfileOuter'], [class*='userProfileModalOuter'], [class*='userPopout'], [class*='user-profile-popout'], .user-profile-popout, [class*='outer_'][class*='theme-'], [class*='biteSize_'], [class*='fullSize_']"
    ));

    // Filter out form editor panels, inner tab/list items, and inner cards contained inside an outer profile card
    const profileElements = rawElements.filter(el => {
        if (el.closest("[class*='content__523e1'], [class*='scroller__523e1'], #user-profile-editing-panel")) return false;
        if (el.closest(PROFILE_INNER_LIST_OR_TAB_SELECTOR)) return false;
        return !rawElements.some(other => other !== el && other.contains(el) && !other.closest("[class*='content__523e1'], [class*='scroller__523e1']"));
    });

    for (const el of profileElements) {
        const headerSelfAvatar = curUser?.id
            ? Array.from(el.querySelectorAll<HTMLImageElement>(`img[src*='${curUser.id}']`)).some(
                img => !img.closest(PROFILE_INNER_LIST_OR_TAB_SELECTOR)
            )
            : false;

        const isSelf = !!el.closest("[id='account'], [class*='accountProfile'], [class*='preview_']") || headerSelfAvatar;

        if (isSelf && ownEffects.profileDrawing) {
            renderDrawingOverlay(el, ownEffects.profileDrawing);
        }
    }
}

function redrawActiveCanvases() {
    if (activeCanvas && isDrawingActive) {
        const container = activeCanvas.parentElement;
        if (container) {
            renderDrawingOverlay(container, { enabled: true, strokes: currentStrokes, updatedAt: Date.now() }, true);
        }
    }
}

function updateInteractiveCanvasCursor() {
    if (activeCanvas && isDrawingActive) {
        activeCanvas.style.cursor = getBrushCursor(activeBrushColor);
    }
}

// ─── Interactive Drawing Mode Engine ─────────────────────────────────────────

function handleWindowKeyDown(e: KeyboardEvent) {
    if (!isDrawingActive) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        undoLastStroke();
    }
}

export function setDrawingMode(active: boolean) {
    if (isDrawingActive === active) return;
    isDrawingActive = active;
    notifyListeners();

    if (active) {
        window.removeEventListener("keydown", handleWindowKeyDown, true);
        window.addEventListener("keydown", handleWindowKeyDown, true);
        attachInteractiveCanvas();
    } else {
        window.removeEventListener("keydown", handleWindowKeyDown, true);
        detachInteractiveCanvas();
    }
}

function extractProfileCard(root: HTMLElement): HTMLElement | null {
    if (!root) return null;
    if (root.closest("[class*='content__523e1'], [class*='scroller__523e1'], #user-profile-editing-panel")) return null;

    const cardSelectors = [
        "[class*='userProfileOuter']",
        "[class*='userProfileModalOuter']",
        "[class*='userPopout']",
        "[class*='outer_'][class*='theme-']",
        "[class*='outer_']",
        "[class*='biteSize_'][class*='userProfile']",
        "[class*='fullSize_'][class*='userProfile']"
    ];

    for (const sel of cardSelectors) {
        const matches = root.querySelectorAll<HTMLElement>(sel);
        for (const el of Array.from(matches)) {
            if (el.clientWidth >= 180 && el.clientHeight >= 180) {
                const hasInner = el.querySelector<HTMLElement>("[class*='outer_'], [class*='userProfileOuter']");
                if (hasInner && hasInner !== el && hasInner.clientWidth >= 180 && hasInner.clientHeight >= 180) {
                    return hasInner;
                }
                return el;
            }
        }
        if (root.matches(sel) && root.clientWidth >= 180 && root.clientHeight >= 180) {
            return root;
        }
    }

    return null;
}

export function findProfilePreviewElement(): HTMLElement | null {
    // 1. Sibling column search starting from mount / form scroller
    const mountEl =
        document.querySelector("#nc-profile-drawing-mount") ||
        document.querySelector("[class*='content__523e1']") ||
        document.querySelector("[class*='scroller__523e1']");

    if (mountEl) {
        let current: HTMLElement | null = mountEl as HTMLElement;
        while (current && current !== document.body && current !== document.documentElement) {
            const parent = current.parentElement;
            if (!parent) break;

            for (const sibling of Array.from(parent.children) as HTMLElement[]) {
                if (sibling === current || sibling.contains(mountEl)) continue;
                const candidate = extractProfileCard(sibling);
                if (candidate) return candidate;
            }
            current = parent;
        }
    }

    // 2. Open modals, popouts, or dialogs outside form scroller
    const dialogSelectors = [
        "[class*='userProfileModalOuter']",
        "[class*='userPopout']",
        "[role='dialog'] [class*='outer_'][class*='theme-']",
        "[role='dialog'] [class*='outer_']",
        "[class*='layer_'] [class*='outer_'][class*='theme-']",
        "[class*='layer_'] [class*='outer_']",
    ];
    for (const sel of dialogSelectors) {
        const matches = document.querySelectorAll<HTMLElement>(sel);
        for (const el of Array.from(matches)) {
            if (el.closest("[class*='content__523e1'], [class*='scroller__523e1'], #user-profile-editing-panel")) continue;
            const card = extractProfileCard(el);
            if (card) return card;
        }
    }

    // 3. Document-wide scan for innermost profile cards outside form column
    const globalCardSelectors = [
        "[class*='userProfileOuter']",
        "[class*='userProfileModalOuter']",
        "[class*='userPopout']",
        "[class*='outer_'][class*='theme-']",
        "[class*='outer_']",
    ];
    for (const sel of globalCardSelectors) {
        const matches = document.querySelectorAll<HTMLElement>(sel);
        for (const el of Array.from(matches)) {
            if (el.closest("[class*='content__523e1'], [class*='scroller__523e1'], #user-profile-editing-panel")) continue;
            const card = extractProfileCard(el);
            if (card) return card;
        }
    }

    return null;
}

function handlePointerDown(e: PointerEvent) {
    if (!activeCanvas || !isDrawingActive) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = activeCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    try {
        activeCanvas.setPointerCapture(e.pointerId);
    } catch {}

    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: false });
    window.addEventListener("pointercancel", handlePointerCancel, { passive: false });

    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    currentActiveStroke = {
        color: activeBrushColor,
        size: activeBrushSize,
        points: [[nx, ny]],
    };

    redrawActiveCanvases();
}

function handlePointerMove(e: PointerEvent) {
    if (!activeCanvas || !isDrawingActive || !currentActiveStroke) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = activeCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    // Smooth filtering: avoid duplicating identical point
    const lastPoint = currentActiveStroke.points[currentActiveStroke.points.length - 1];
    if (!lastPoint || Math.abs(lastPoint[0] - nx) > 0.001 || Math.abs(lastPoint[1] - ny) > 0.001) {
        currentActiveStroke.points.push([nx, ny]);
        redrawActiveCanvases();
    }
}

function handlePointerUp(e: PointerEvent) {
    if (!isDrawingActive) return;
    e.preventDefault();
    e.stopPropagation();

    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);

    if (activeCanvas) {
        try {
            activeCanvas.releasePointerCapture(e.pointerId);
        } catch {}
    }

    if (currentActiveStroke) {
        if (currentActiveStroke.points.length > 0) {
            currentStrokes.push(currentActiveStroke);
            notifyListeners();
        }
        currentActiveStroke = null;
        redrawActiveCanvases();
    }
}

function handlePointerCancel(e: PointerEvent) {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);

    if (activeCanvas) {
        try {
            activeCanvas.releasePointerCapture(e.pointerId);
        } catch {}
    }

    if (currentActiveStroke) {
        currentActiveStroke = null;
        redrawActiveCanvases();
    }
}

function handleBlockEvent(e: Event) {
    e.preventDefault();
    e.stopPropagation();
}

export function attachInteractiveCanvas(retries = 5) {
    const previewEl = findProfilePreviewElement();
    if (!previewEl) {
        if (retries > 0) {
            setTimeout(() => {
                if (isDrawingActive) attachInteractiveCanvas(retries - 1);
            }, 100);
            return;
        }
        isDrawingActive = false;
        notifyListeners();
        showToast(
            t("Please open your profile preview in Discord Settings > Profiles to draw."),
            Toasts.Type.DANGER
        );
        return;
    }

    const compPos = window.getComputedStyle(previewEl).position;
    if (compPos === "static") {
        previewEl.style.position = "relative";
    }
    previewEl.style.overflow = "hidden";

    // Capture the live avatar anchor from the preview card
    const av = getAvatarMetrics(previewEl);
    const rect = previewEl.getBoundingClientRect();
    if (av && rect.width > 0 && rect.height > 0) {
        currentAvatarAnchor = {
            cx: av.cx,
            cy: av.cy,
            size: av.size,
            cardWidth: rect.width,
            cardHeight: rect.height,
        };
    }

    const canvas = renderDrawingOverlay(previewEl, { enabled: true, strokes: currentStrokes, updatedAt: Date.now() }, true);
    if (!canvas) return;

    activeCanvas = canvas;
    canvas.classList.add("nc-profile-drawing-interactive");
    canvas.style.cursor = getBrushCursor(activeBrushColor);
    canvas.style.pointerEvents = "auto";
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.zIndex = "99999";
    canvas.style.touchAction = "none";
    canvas.style.userSelect = "none";
    (canvas.style as any).webkitUserSelect = "none";

    canvas.removeEventListener("pointerdown", handlePointerDown);
    canvas.removeEventListener("mousedown", handleBlockEvent, true);
    canvas.removeEventListener("mouseup", handleBlockEvent, true);
    canvas.removeEventListener("click", handleBlockEvent, true);
    canvas.removeEventListener("contextmenu", handleBlockEvent, true);
    canvas.removeEventListener("dragstart", handleBlockEvent, true);
    canvas.removeEventListener("selectstart", handleBlockEvent, true);

    canvas.addEventListener("pointerdown", handlePointerDown, { passive: false });

    // Block any native mouse/drag interactions at capture phase so they never leak to profile underneath
    canvas.addEventListener("mousedown", handleBlockEvent, { capture: true, passive: false });
    canvas.addEventListener("mouseup", handleBlockEvent, { capture: true, passive: false });
    canvas.addEventListener("click", handleBlockEvent, { capture: true, passive: false });
    canvas.addEventListener("contextmenu", handleBlockEvent, { capture: true, passive: false });
    canvas.addEventListener("dragstart", handleBlockEvent, { capture: true, passive: false });
    canvas.addEventListener("selectstart", handleBlockEvent, { capture: true, passive: false });

    // Setup ResizeObserver to keep canvas buffer sized accurately
    if (activeResizeObserver) {
        activeResizeObserver.disconnect();
    }
    activeResizeObserver = new ResizeObserver(() => {
        if (activeCanvas && isDrawingActive && previewEl) {
            syncCanvasDimensions(activeCanvas, previewEl);
            redrawActiveCanvases();
        }
    });
    activeResizeObserver.observe(previewEl);
}

export function detachInteractiveCanvas() {
    window.removeEventListener("keydown", handleWindowKeyDown, true);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);

    if (activeResizeObserver) {
        activeResizeObserver.disconnect();
        activeResizeObserver = null;
    }
    if (activeCanvas) {
        activeCanvas.removeEventListener("pointerdown", handlePointerDown);
        activeCanvas.removeEventListener("pointermove", handlePointerMove);
        activeCanvas.removeEventListener("pointerup", handlePointerUp);
        activeCanvas.removeEventListener("pointercancel", handlePointerCancel);
        activeCanvas.removeEventListener("mousedown", handleBlockEvent, true);
        activeCanvas.removeEventListener("mouseup", handleBlockEvent, true);
        activeCanvas.removeEventListener("click", handleBlockEvent, true);
        activeCanvas.removeEventListener("contextmenu", handleBlockEvent, true);
        activeCanvas.removeEventListener("dragstart", handleBlockEvent, true);
        activeCanvas.removeEventListener("selectstart", handleBlockEvent, true);
        activeCanvas.classList.remove("nc-profile-drawing-interactive");
        activeCanvas.style.cursor = "";
        activeCanvas.style.pointerEvents = "none";
        activeCanvas = null;
    }
    redrawAllProfiles();
}

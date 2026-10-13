/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { t } from "@lolicordplugins/autoTranslateLoliCord";
import { Logger } from "@utils/Logger";
import { findComponentByCodeLazy } from "@webpack";
import { Popout, useEffect, useRef, useState } from "@webpack/common";
import type { ComponentType, MouseEventHandler, ReactNode } from "react";

import { addCompactListener, addStealthListener, isCompactModeEnabled, isStealthModeEnabled, removeCompactListener, removeStealthListener } from "./HeaderBar";

const PanelButton = findComponentByCodeLazy("tooltipPositionKey", "positionKeyStemOverride") as ComponentType<UserAreaButtonProps>;

export interface UserAreaButtonProps {
    icon: ReactNode;
    tooltipText?: ReactNode;
    onClick?: MouseEventHandler<HTMLDivElement>;
    onContextMenu?: MouseEventHandler<HTMLDivElement>;
    className?: string;
    role?: string;
    "aria-label"?: string;
    "aria-checked"?: boolean;
    disabled?: boolean;
    plated?: boolean;
    redGlow?: boolean;
    orangeGlow?: boolean;
}

export interface UserAreaRenderProps {
    nameplate?: any;
    iconForeground?: string;
    hideTooltips?: boolean;
}

export type UserAreaButtonFactory = (props: UserAreaRenderProps) => ReactNode;

export interface UserAreaButtonData {
    render: UserAreaButtonFactory;
    icon: ComponentType<{ className?: string; }>;
    priority?: number;
}

interface ButtonEntry {
    render: UserAreaButtonFactory;
    priority: number;
}

export const UserAreaButton = PanelButton;

const logger = new Logger("UserArea");

export const buttons = new Map<string, ButtonEntry>();

export function addUserAreaButton(id: string, render: UserAreaButtonFactory, priority = 0) {
    buttons.set(id, { render, priority });
}

export function removeUserAreaButton(id: string) {
    buttons.delete(id);
}

function VoicePluginsIcon() {
    return (
        <svg className="vc-ic-save-icon nc-no-anim" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24">
            <circle cx="19" cy="19" r="5" fill="var(--icon-feedback-notification)" />
            <path fill="currentColor" d="M9.92 2.08c-.07-.45.18-.93.64-.99a11.1 11.1 0 0 1 2.88 0c.46.06.7.54.64.99-.18 1.16.19 2.2.98 2.53.8.33 1.79-.14 2.49-1.1.27-.36.78-.52 1.14-.24.77.59 1.45 1.27 2.04 2.04.28.36.12.87-.24 1.14-.96.7-1.43 1.7-1.1 2.49.33.8 1.37 1.16 2.53.98.45-.07.93.18.99.64a11.1 11.1 0 0 1 .08 1.82c0 .38-.43.58-.77.4a6.97 6.97 0 0 0-5.63-.35c-.28.1-.59-.14-.59-.43a4 4 0 1 0-4 4c.3 0 .53.31.43.59a6.99 6.99 0 0 0 .35 5.63c.18.34-.02.76-.4.77a11.39 11.39 0 0 1-1.82-.08c-.46-.06-.7-.54-.64-.99.18-1.16-.19-2.2-.98-2.53-.8-.33-1.79.15-2.49 1.1-.27.36-.78.52-1.14.24a11.06 11.06 0 0 1-2.04-2.04c-.28-.36-.12-.87.24-1.14.96-.7 1.43-1.7 1.1-2.49-.33-.8-1.37-1.16-2.53-.98-.45.07-.93-.18-.99-.64a11.1 11.1 0 0 1 0-2.88c.06-.46.54-.7.99-.64 1.16.18 2.2-.19 2.53-.98.33-.8-.14-1.79-1.1-2.49-.36-.27-.52-.78-.24-1.14.59-.77 1.27-1.45 2.04-2.04.36-.28.87-.12 1.14.24.7.95 1.7 1.43 2.49 1.1.8-.33 1.16-1.37.98-2.53Z" />
        </svg>
    );
}

function renderSortedButtons(props: UserAreaRenderProps) {
    return Array.from(buttons)
        .sort(([, a], [, b]) => a.priority - b.priority)
        .map(([id, { render: Button }]) => (
            <ErrorBoundary noop key={id} onError={e => logger.error(`Failed to render ${id}`, e.error)}>
                <Button {...props} />
            </ErrorBoundary>
        ));
}

function CompactUserAreaToggle({ props }: { props: UserAreaRenderProps; }) {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    if (buttons.size === 0) return null;

    return (
        <div ref={ref} className="vc-user-area-toggle-btn" style={{ order: 2, display: "flex", flexShrink: 0 }}>
            <Popout
                targetElementRef={ref}
                renderPopout={() => (
                    <div className="vc-user-area-btns nc-compact-ua-popout">
                        {renderSortedButtons(props)}
                    </div>
                )}
                shouldShow={isOpen}
                onRequestClose={() => setIsOpen(false)}
                position="top"
                align="right"
                spacing={8}
            >
                {() => (
                    <PanelButton
                        icon={<VoicePluginsIcon />}
                        tooltipText={isOpen ? undefined : t("Voice Plugins")}
                        onClick={() => setIsOpen(v => !v)}
                    />
                )}
            </Popout>
        </div>
    );
}

function UserAreaButtons({ props }: { props: UserAreaRenderProps; }) {
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        const listener = () => forceUpdate(n => n + 1);
        addStealthListener(listener);
        addCompactListener(listener);
        window.addEventListener("lolicord-stealth-change", listener);
        window.addEventListener("lolicord-compact-change", listener);
        return () => {
            removeStealthListener(listener);
            removeCompactListener(listener);
            window.removeEventListener("lolicord-stealth-change", listener);
            window.removeEventListener("lolicord-compact-change", listener);
        };
    }, []);

    if (isStealthModeEnabled()) return null;

    if (isCompactModeEnabled()) {
        return (
            <>
                <style>{`
                    .nc-compact-ua-popout {
                        display: flex;
                        flex-wrap: wrap;
                        align-items: center;
                        gap: 8px;
                        max-width: 260px;
                        padding: 12px 14px;
                        border-radius: 12px;
                        background-color: var(--background-floating, #111214) !important;
                        background: var(--background-floating, #111214) !important;
                        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06);
                        backdrop-filter: blur(16px);
                    }
                    .vc-user-area-toggle-btn {
                        order: 2 !important;
                        display: flex !important;
                        flex-shrink: 0 !important;
                    }
                    div[class*="buttons_"]:has(> .vc-user-area-toggle-btn) {
                        display: flex !important;
                        flex-wrap: nowrap !important;
                        flex-direction: row !important;
                        flex-shrink: 0 !important;
                        align-items: center !important;
                    }
                    div[class*="buttons_"]:has(> .vc-user-area-toggle-btn) > [class*="audioButtonParent_"] {
                        order: 1 !important;
                    }
                    div[class*="buttons_"]:has(> .vc-user-area-toggle-btn) > button,
                    div[class*="buttons_"]:has(> .vc-user-area-toggle-btn) > [class*="button_"]:not(.vc-user-area-toggle-btn) {
                        order: 3 !important;
                    }
                `}</style>
                <CompactUserAreaToggle props={props} />
            </>
        );
    }

    return (
        <>
            <style>{`
                /* ── Clean UserArea layout ──
                   Ensure all buttons (AntiMove, FakeVoice, Ghost, Mute, Deafen, Settings)
                   stay cleanly aligned on a single row without wrapping, double-decking, or inflating container height.
                   Nametag truncates gracefully when the sidebar is narrowed. */

                /* 1. Account popout wrapper and nametag shrinking */
                div[class*="accountPopoutButtonWrapper_"],
                div[class*="nameTag_"] {
                    min-width: 0 !important;
                    flex-shrink: 1 !important;
                }

                div[class*="nameTag_"] > * {
                    min-width: 0 !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    white-space: nowrap !important;
                }

                /* 2. User area buttons container stays strictly on one row */
                div[class*="buttons_"]:has(> .vc-user-area-btns) {
                    display: flex !important;
                    flex-wrap: nowrap !important;
                    flex-shrink: 0 !important;
                    align-items: center !important;
                }

                /* 3. Ensure audio button parents and individual buttons never shrink */
                div[class*="buttons_"]:has(> .vc-user-area-btns) [class*="audioButtonParent_"],
                div[class*="buttons_"]:has(> .vc-user-area-btns) > button,
                div[class*="buttons_"]:has(> .vc-user-area-btns) > div,
                .vc-user-area-btns > button,
                .vc-user-area-btns > div {
                    flex-shrink: 0 !important;
                }

                /* ── LoliCord UserArea Bottom-Left Buttons Hover Spring Animation ── */
                .vc-user-area-btns button svg,
                .vc-user-area-btns [role="button"] svg,
                .vc-user-area-btns svg {
                    transform-origin: 50% 50%;
                    will-change: transform;
                    backface-visibility: hidden;
                    -webkit-backface-visibility: hidden;
                }

                .vc-user-area-btns button:hover svg:not(.nc-no-anim),
                .vc-user-area-btns [role="button"]:hover svg:not(.nc-no-anim),
                .vc-user-area-btns > div:hover svg:not(.nc-no-anim),
                .vc-user-area-btns svg:hover:not(.nc-no-anim) {
                    animation: nc-user-btn-spring 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) 1;
                }

                @keyframes nc-user-btn-spring {
                    0% {
                        transform: translate3d(0, 0, 0) scale(1);
                    }
                    35% {
                        transform: translate3d(0, 0, 0) scale(1.18);
                    }
                    70% {
                        transform: translate3d(0, 0, 0) scale(0.96);
                    }
                    100% {
                        transform: translate3d(0, 0, 0) scale(1);
                    }
                }
            `}</style>
            <div className="vc-user-area-btns" style={{ display: "contents" }}>
                {Array.from(buttons)
                    .sort(([, a], [, b]) => a.priority - b.priority)
                    .map(([id, { render: Button }]) => (
                        <ErrorBoundary noop key={id} onError={e => logger.error(`Failed to render ${id}`, e.error)}>
                            <Button {...props} />
                        </ErrorBoundary>
                    ))}
            </div>
        </>
    );
}

export function _renderButtons(props: UserAreaRenderProps) {
    return [<UserAreaButtons key="vc-user-area-buttons" props={props} />];
}

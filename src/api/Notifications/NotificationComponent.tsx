/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { useSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { classes } from "@utils/misc";
import { LOLICORD_IMAGE_ICON } from "@utils/lolicordLogo";
import { Button, React, useEffect, useRef, useState } from "@webpack/common";

import { NotificationData } from "./Notifications";

export function LoliCordLogoIcon(props: any) {
    return (
        <img
            className="nc-notif-custom-icon"
            src={LOLICORD_IMAGE_ICON}
            alt="LoliCord"
            width={props?.width ?? 22}
            height={props?.height ?? 22}
            style={{
                borderRadius: "5px",
                objectFit: "contain",
                flexShrink: 0,
                display: "block",
                ...props?.style
            }}
            {...props}
        />
    );
}

function StatusIcon({ type }: { type?: "success" | "info" | "warning" | "error"; }) {
    switch (type) {
        case "success":
            return (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--status-positive, #23a55a)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="16 10 11 15 8 12" />
                </svg>
            );
        case "warning":
            return (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--status-warning, #f0b232)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
            );
        case "error":
            return (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--status-danger, #ed4245)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
            );
        case "info":
        default:
            return <LoliCordLogoIcon />;
    }
}

export default ErrorBoundary.wrap(function NotificationComponent({
    title,
    body,
    richBody,
    type = "info",
    color,
    icon,
    onClick,
    onClose,
    image,
    permanent,
    actions = [],
    duration,
    className,
    dismissOnClick
}: NotificationData & { className?: string; }) {
    const { timeout: settingsTimeout } = useSettings(["notifications.timeout", "notifications.position"]).notifications;
    const effectiveTimeout = duration ?? (settingsTimeout > 0 ? settingsTimeout : 5000);

    const [isHover, setIsHover] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    const start = useRef(Date.now());
    const pause = useRef<number | null>(null);

    useEffect(() => {
        if (effectiveTimeout === 0 || permanent) return;

        if (isHover) {
            if (pause.current === null) pause.current = Date.now();
            return;
        }

        if (pause.current !== null) {
            const pausedFor = Date.now() - pause.current;
            start.current += pausedFor;
            pause.current = null;
        }

        const intervalId = setInterval(() => {
            const elapsedNow = Date.now() - start.current;
            if (elapsedNow >= effectiveTimeout) {
                onClose?.();
            } else {
                setElapsed(elapsedNow);
            }
        }, 16);

        return () => clearInterval(intervalId);
    }, [effectiveTimeout, isHover, permanent]);

    const timeoutProgress = effectiveTimeout > 0 ? elapsed / effectiveTimeout : 0;

    const progressColor = color || (
        type === "success" ? "var(--status-positive, #23a55a)" :
        type === "warning" ? "var(--status-warning, #f0b232)" :
        type === "error" ? "var(--status-danger, #ed4245)" :
        "var(--brand-500, #5865f2)"
    );

    const renderCustomIcon = () => {
        if (icon === "lolicord" || !icon) return <LoliCordLogoIcon />;
        if (typeof icon === "function") {
            const IconComponent = icon as React.ComponentType<any>;
            return <IconComponent />;
        }
        if (typeof icon === "string") {
            if (icon.startsWith("http") || icon.startsWith("data:")) {
                return <img className="nc-notif-custom-icon" src={icon} alt="icon" />;
            }
            return <span className="nc-notif-emoji-icon">{icon}</span>;
        }
        return <StatusIcon type={type} />;
    };

    return (
        <div
            className={classes("nc-notification-card", `nc-notification-${type}`, className)}
            onClick={() => {
                onClick?.();
                if (dismissOnClick !== false && actions.length === 0)
                    onClose?.();
            }}
            onContextMenu={e => {
                e.preventDefault();
                e.stopPropagation();
                onClose?.();
            }}
            onMouseEnter={() => setIsHover(true)}
            onMouseLeave={() => setIsHover(false)}
        >
            <div className="nc-notification-main">
                {/* Header */}
                <div className="nc-notification-header">
                    <div className="nc-notification-header-left">
                        <div className="nc-notification-icon-wrap">
                            {renderCustomIcon()}
                        </div>
                        {title && <span className="nc-notification-title">{title}</span>}
                    </div>
                    <button
                        className="nc-notification-close-btn"
                        onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            onClose?.();
                        }}
                        aria-label="Close"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="nc-notification-body">
                    {richBody ?? <div className="nc-notification-text">{body}</div>}
                </div>

                {/* Optional Media Image */}
                {image && <img className="nc-notification-image" src={image} alt="" />}

                {/* Optional Actions Buttons */}
                {actions.length > 0 && (
                    <div className="nc-notification-actions">
                        {actions.map((act, i) => (
                            <Button
                                key={i}
                                size={Button.Sizes.TINY}
                                color={act.color ?? (i === 0 ? Button.Colors.BRAND : Button.Colors.PRIMARY)}
                                look={act.look ?? Button.Looks.FILLED}
                                onClick={(e: any) => {
                                    e.stopPropagation();
                                    act.onClick?.(e);
                                    onClose?.();
                                }}
                                className="nc-notification-action-btn"
                            >
                                {act.label}
                            </Button>
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom Progress Bar */}
            {effectiveTimeout > 0 && !permanent && (
                <div className="nc-notification-progress-bg">
                    <div
                        className="nc-notification-progress-fill"
                        style={{
                            width: `${Math.max(0, (1 - timeoutProgress) * 100)}%`,
                            backgroundColor: progressColor
                        }}
                    />
                </div>
            )}
        </div>
    );
}, {
    onError: ({ props }) => props.onClose?.()
});

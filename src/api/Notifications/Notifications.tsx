/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { Queue } from "@utils/Queue";
import { createRoot, WindowStore } from "@webpack/common";
import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import NotificationComponent from "./NotificationComponent";
import { openNotificationLogModal, persistNotification } from "./notificationLog";

const NotificationQueue = new Queue();

let reactRoot: Root;
let notifCounter = 42;
let missedCount = 0;

window.addEventListener("focus", () => {
    const { missed, timeout, useNative } = Settings.notifications;
    if (!missed) return;
    if (missedCount > 0 && timeout > 0 && useNative === "never") {
        showNotification({
            title: "While you were away",
            body: `${missedCount} notifications received`,
            type: "info",
            onClick: () => openNotificationLogModal(),
        });
        missedCount = 0;
    }
});

function getRoot() {
    if (!reactRoot) {
        let container = document.getElementById("vc-notification-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "vc-notification-container";
            document.body.append(container);
        }
        reactRoot = createRoot(container);
    }
    return reactRoot;
}

export interface NotificationData {
    id?: string;
    title: string;
    body: string;
    richBody?: ReactNode;
    type?: "success" | "info" | "warning" | "error";
    icon?: string | React.ComponentType<any>;
    image?: string;
    duration?: number;
    actions?: Array<{
        label: string;
        onClick?(e?: any): void;
        color?: any;
        look?: any;
    }>;
    onClick?(): void;
    onClose?(): void;
    color?: string;
    permanent?: boolean;
    noPersist?: boolean;
    dismissOnClick?: boolean;
}

function _showNotification(notification: NotificationData, id: number) {
    const root = getRoot();
    return new Promise<void>(resolve => {
        root.render(
            <NotificationComponent
                key={id}
                {...notification}
                onClose={() => {
                    notification.onClose?.();
                    root.render(null);
                    resolve();
                }}
            />
        );
    });
}

function shouldBeNative() {
    if (typeof Notification === "undefined") return false;

    const { useNative } = Settings.notifications;
    if (useNative === "always") return true;
    if (useNative === "not-focused") return !document.hasFocus();
    return false;
}

export async function requestPermission() {
    return (
        Notification.permission === "granted" ||
        (Notification.permission !== "denied" && (await Notification.requestPermission()) === "granted")
    );
}

export async function showNotification(data: NotificationData) {
    if (Settings.enableInAppNotifications === false) return;
    persistNotification(data);

    if (shouldBeNative() && await requestPermission()) {
        const { title, body, icon, image, onClick = null, onClose = null } = data;
        const n = new Notification(title, {
            body,
            icon: typeof icon === "string" ? icon : undefined,
            // @ts-expect-error ts is drunk
            image
        });
        n.onclick = onClick;
        n.onclose = onClose;

        if (!WindowStore.isFocused()) missedCount++;
    } else {
        NotificationQueue.push(() =>
            _showNotification({
                ...data,
                onClose: () => {
                    data.onClose?.();
                    if (!WindowStore.isFocused()) missedCount++;
                }
            }, notifCounter++)
        );
    }
}

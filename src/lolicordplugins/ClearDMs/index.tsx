/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Alerts, ChannelStore, Menu, RestAPI, showToast, Toasts } from "@webpack/common";
import { t } from "../autoTranslateLoliCord";

async function closeChannelReliably(channelId: string, maxRetries = 3): Promise<boolean> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            await RestAPI.del({ url: `/channels/${channelId}` });
            return true;
        } catch (e: any) {
            const status = e?.status || e?.statusCode;
            if (status === 429) {
                const retryAfter = e?.body?.retry_after ?? 1.5;
                const delay = retryAfter < 100 ? retryAfter * 1000 : retryAfter;
                await new Promise(r => setTimeout(r, delay + 100));
            } else {
                return false;
            }
        }
    }
    return false;
}

async function clearAllDMs() {
    const channels = Object.values(ChannelStore.getMutablePrivateChannels()).filter((c: any) => c.type === 1);
    if (channels.length === 0) {
        showToast(t("No DMs to close"), Toasts.Type.INFO);
        return;
    }

    Alerts.show({
        title: t("Close all DMs"),
        confirmText: t("Close"),
        cancelText: t("Cancel"),
        body: (
            <div style={{ color: "#dbdee1" }}>
                {t("Are you sure you want to close all your DMs? Your messages will not be deleted, but the conversations will disappear from your list.")}
            </div>
        ),
        onConfirm: async () => {
            showToast(`Closing ${channels.length} DMs...`, Toasts.Type.INFO);
            let closedCount = 0;
            for (const ch of channels) {
                const success = await closeChannelReliably(ch.id);
                if (success) closedCount++;
                await new Promise(r => setTimeout(r, 100));
            }
            showToast(`Closed ${closedCount}/${channels.length} DMs`, Toasts.Type.SUCCESS);
        }
    });
}

const ContextMenuPatch: NavContextMenuPatchCallback = (children, ctx: { channel?: any; message?: any; } = {}) => {
    const { channel, message } = ctx;
    if (!channel || message) return;

    const isPrivateDM = channel.type === 1 || channel.type === 3 || (typeof channel.isPrivate === "function" && channel.isPrivate());
    if (!isPrivateDM) return;

    children.unshift(
        <Menu.MenuGroup key="vc-cleardms-group">
            <Menu.MenuItem
                key="clear-all-dms"
                id="vc-clear-all-dms"
                label={t("Close all DMs")}
                color="danger"
                action={clearAllDMs}
            />
            <Menu.MenuSeparator key="separator-cleardms" />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "ClearDMs",
    description: "Closes all your DMs super fast.",
    authors: [{ name: "Nightcord", id: 0n }],
    dependencies: ["ContextMenuAPI"],

    contextMenus: {
        "channel-context": ContextMenuPatch,
        "gdm-context": ContextMenuPatch,
        "user-context": ContextMenuPatch
    }
});

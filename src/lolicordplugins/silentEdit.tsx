/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { addMessagePopoverButton as addButton, removeMessagePopoverButton as removeButton } from "@api/MessagePopover";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, Constants, Menu, RestAPI, UserStore } from "@webpack/common";
import { t } from "./autoTranslateLoliCord";

const MessageActions = findByPropsLazy("deleteMessage", "startEditMessage");

const settings = definePluginSettings({
    deleteOriginalMessage: {
        type: OptionType.BOOLEAN,
        description: "Delete the original server-side message after silent edit. If disabled, the original message will reappear after client reload.",
        default: true
    },
    deleteDelay: {
        type: OptionType.NUMBER,
        description: "Delay (in milliseconds) before deleting the original message if enabled.",
        default: 500
    },
    suppressNotifications: {
        type: OptionType.BOOLEAN,
        description: "Recommended for use in DMs to prevent pinging users.",
        default: false
    }
});

import { iconsModule } from "@plugins/_core/concatenatedModules";

const SilentEditIcon = (props: any) => (
    <svg aria-hidden="true" role="img" width={18} height={18} viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path d="M14.25 1c.41 0 .75.34.75.75V3h5.25c.41 0 .75.34.75.75v.5c0 .41-.34.75-.75.75H3.75A.75.75 0 0 1 3 4.25v-.5c0-.41.34-.75.75-.75H9V1.75c0-.41.34-.75.75-.75h4.5Z" />
        <path fillRule="evenodd" d="M5.06 7a1 1 0 0 0-1 1.06l.76 12.13a3 3 0 0 0 3 2.81h8.36a3 3 0 0 0 3-2.81l.75-12.13a1 1 0 0 0-1-1.06H5.07ZM11 12a1 1 0 1 0-2 0v6a1 1 0 1 0 2 0v-6Zm3-1a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Z" clipRule="evenodd" />
    </svg>
);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function sendMessage(content: string, nonce: string, channelId: string, suppressNotifications: boolean, messageReference?: any) {
    const body: any = {
        content,
        flags: suppressNotifications ? 4096 : 0,
        mobile_network_type: "unknown",
        nonce,
        tts: false,
    };

    if (messageReference) {
        body.message_reference = {
            channel_id: messageReference.channel_id,
            message_id: messageReference.message_id,
            guild_id: messageReference.guild_id
        };
    }

    return RestAPI.post({
        url: Constants.Endpoints.MESSAGES(channelId),
        body
    });
}

function deleteMessage(channelId: string, messageId: string) {
    return RestAPI.del({
        url: Constants.Endpoints.MESSAGE(channelId, messageId)
    });
}

const triggerSilentEdit = async (msg: any) => {
    MessageActions.startEditMessage(msg.channel_id, msg.id, msg.content);
    const originalEditMessage = MessageActions.editMessage;

    MessageActions.editMessage = async function (channelId: string, messageId: string, content: any) {
        MessageActions.editMessage = originalEditMessage;

        if (messageId !== msg.id) {
            return originalEditMessage.apply(this, arguments as any);
        }

        try {
            await sendMessage(
                content.content,
                msg.id,
                channelId,
                settings.store.suppressNotifications,
                msg.messageReference
            );

            await sleep(settings.store.deleteDelay);

            if (settings.store.deleteOriginalMessage) {
                await deleteMessage(channelId, messageId);
            }
        } catch (error) {
            console.error("[SilentEdit] Error:", error);
        }
    };
};

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, { message }) => {
    if (!message || message.author?.id !== UserStore.getCurrentUser()?.id || message.deleted) return;

    const Icon = iconsModule?.PencilIcon || iconsModule?.EditIcon || SilentEditIcon;
    const group = findGroupChildrenByChildId("edit", children) ?? children;
    group.push(
        <Menu.MenuItem
            id="silent-edit"
            color="danger"
            label={t("Silent Edit")}
            action={() => triggerSilentEdit(message)}
            icon={Icon}
            iconLeft={Icon}
            leadingAccessory={{
                type: "icon",
                icon: Icon
            }}
        />
    );
};

export default definePlugin({
    name: "SilentEdit",
    description: "\"Silently\" edit a message without showing the edit tag and bypass Vencord's message logger.",
    authors: [{ name: "Aurick", id: 1348025017233047634n }],
    dependencies: ["MessagePopoverAPI"],
    settings,
    enabledByDefault: true,

    contextMenus: {
        "message": messageContextMenuPatch
    },

    start() {
        addButton("SilentEdit", msg => {
            if (msg.author?.id !== UserStore.getCurrentUser()?.id || msg.deleted) return null;

            return {
                label: t("Silent Edit"),
                icon: SilentEditIcon,
                message: msg,
                channel: ChannelStore.getChannel(msg.channel_id),
                onClick: () => triggerSilentEdit(msg)
            };
        }, SilentEditIcon);
    },

    stop() {
        removeButton("SilentEdit");
    }
});

/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, sendBotMessage } from "@api/Commands";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { addMessagePopoverButton as addButton, removeMessagePopoverButton as removeButton } from "@api/MessagePopover";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, Constants, Menu, RestAPI, UserStore } from "@webpack/common";
import { t } from "../autoTranslateLoliCord";

const settings = definePluginSettings({
    replacementText: {
        type: OptionType.STRING,
        description: "Text to replace the message with before deletion.",
        default: "** **"
    },
    deleteDelay: {
        type: OptionType.NUMBER,
        description: "Delay in milliseconds before deleting the replacement message (recommended: 100-500).",
        default: 200
    },
    suppressNotifications: {
        type: OptionType.BOOLEAN,
        description: "Suppress notifications when replacing the message (prevents pinging mentioned users).",
        default: true
    },
    deleteOriginal: {
        type: OptionType.BOOLEAN,
        description: "Delete the original message from server. If disabled, the original message will reappear on client restart.",
        default: true
    },
    purgeInterval: {
        type: OptionType.NUMBER,
        description: "Delay in milliseconds between each message deletion during /silentpurge (recommended: 500-1000 to avoid rate limits).",
        default: 500
    }
});

import { iconsModule } from "@plugins/_core/concatenatedModules";

const SilentDeleteIcon = (props: any) => (
    <svg aria-hidden="true" role="img" width={18} height={18} viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path d="M14.25 1c.41 0 .75.34.75.75V3h5.25c.41 0 .75.34.75.75v.5c0 .41-.34.75-.75.75H3.75A.75.75 0 0 1 3 4.25v-.5c0-.41.34-.75.75-.75H9V1.75c0-.41.34-.75.75-.75h4.5Z" />
        <path fillRule="evenodd" d="M5.06 7a1 1 0 0 0-1 1.06l.76 12.13a3 3 0 0 0 3 2.81h8.36a3 3 0 0 0 3-2.81l.75-12.13a1 1 0 0 0-1-1.06H5.07ZM11 12a1 1 0 1 0-2 0v6a1 1 0 1 0 2 0v-6Zm3-1a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Z" clipRule="evenodd" />
    </svg>
);

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

let _silentPurgeActive = false;

async function silentDeleteMessage(channelId: string, messageId: string, deleteOriginal = true): Promise<boolean> {
    try {
        const { replacementText = "** **", deleteDelay = 200, suppressNotifications = true, deleteOriginal: shouldDelete = true } = settings.store;

        const response = await RestAPI.post({
            url: Constants.Endpoints.MESSAGES(channelId),
            body: {
                content: replacementText,
                flags: suppressNotifications ? 4096 : 0,
                mobile_network_type: "unknown",
                nonce: messageId,
                tts: false
            }
        });

        await sleep(deleteDelay);
        await RestAPI.del({ url: Constants.Endpoints.MESSAGE(channelId, response.body.id) });

        if (deleteOriginal && shouldDelete) {
            await sleep(100);
            await RestAPI.del({ url: Constants.Endpoints.MESSAGE(channelId, messageId) });
        }

        return true;
    } catch (error) {
        console.error("[SilentDelete] Error:", error);
        return false;
    }
}

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, { message }) => {
    if (!message || message.author?.id !== UserStore.getCurrentUser()?.id) return;

    const Icon = iconsModule?.TrashIcon || SilentDeleteIcon;
    const group = findGroupChildrenByChildId("edit", children) ?? children;
    group.push(
        <Menu.MenuItem
            id="silent-delete"
            color="danger"
            label={t("Silent Delete")}
            action={() => silentDeleteMessage(message.channel_id, message.id, !message.deleted)}
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
    name: "SilentDelete",
    enabledByDefault: true,
    description: "\"Silently\" deletes a message. Bypass message loggers by replacing the message with a placeholder.",
    authors: [
        { name: "Aurick",
     id: 1348025017233047634n },
        { name: "appleflyer",
     id: 1209096766075703368n }
    ],
    dependencies: ["MessagePopoverAPI", "CommandsAPI"],
    settings,

    contextMenus: {
        "message": messageContextMenuPatch
    },

    commands: [
        {
            name: "silentpurge",
            description: t("Silently delete your recent messages in this channel"),
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [{
                name: "count",
                description: t("Number of your messages to silently delete (1-100)"),
                type: ApplicationCommandOptionType.INTEGER,
                required: true
            }],
            execute: (opts, ctx) => {
                const count = Number(opts.find(o => o.name === "count")?.value);
                if (!count || count < 1 || count > 100) return;

                const channelId = ctx.channel.id;
                const currentUserId = UserStore.getCurrentUser().id;

                (async () => {
                    try {
                        const userMessages: any[] = [];
                        let lastMessageId: string | undefined;

                        while (userMessages.length < count) {
                            if (!_silentPurgeActive) return;
                            const response = await RestAPI.get({
                                url: Constants.Endpoints.MESSAGES(channelId),
                                query: { limit: 100, ...(lastMessageId && { before: lastMessageId }) }
                            });

                            const messages = response.body;
                            if (!messages?.length) break;

                            for (const msg of messages) {
                                if (msg.author?.id === currentUserId) {
                                    userMessages.push(msg);
                                    if (userMessages.length >= count) break;
                                }
                            }

                            lastMessageId = messages[messages.length - 1].id;
                            if (messages.length < 100) break;
                            await sleep(100);
                        }

                        if (!userMessages.length) return;

                        const purgeInterval = settings.store.purgeInterval || 500;
                        let successCount = 0;

                        for (let i = 0; i < userMessages.length; i++) {
                            if (!_silentPurgeActive) return;
                            if (await silentDeleteMessage(channelId, userMessages[i].id)) successCount++;
                            if (i < userMessages.length - 1) await sleep(purgeInterval);
                        }

                        sendBotMessage(channelId, { content: t("Successfully silently deleted {count} message(s).").replace("{count}", successCount.toString()) });
                    } catch (error) {
                        console.error("[SilentDelete] Error during silent purge:", error);
                    }
                })();
            }
        }
    ],

    start() {
        _silentPurgeActive = true;
        addButton("SilentDelete", msg => {
            if (msg.author?.id !== UserStore.getCurrentUser()?.id || msg.deleted) return null;

            return {
                label: t("Silent Delete"),
                icon: SilentDeleteIcon,
                message: msg,
                channel: ChannelStore.getChannel(msg.channel_id),
                onClick: () => silentDeleteMessage(msg.channel_id, msg.id),
                dangerous: true
            };
        }, SilentDeleteIcon);
    },

    stop() {
        _silentPurgeActive = false;
        removeButton("SilentDelete");
    }
});

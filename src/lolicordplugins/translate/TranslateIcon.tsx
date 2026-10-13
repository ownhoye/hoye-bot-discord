/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "../autoTranslateLoliCord";
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

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { Paragraph } from "@components/Paragraph";
import { classes } from "@utils/misc";
import { openModal } from "@utils/modal";
import { IconComponent } from "@utils/types";
import { Alerts, Button } from "@webpack/common";

import { settings } from "./settings";
import { TranslateModal } from "./TranslateModal";
import { cl } from "./utils";

export const TranslateIcon: IconComponent = ({ height = 24, width = 24, className, ...props }: any) => {
    return (
        <svg
            aria-hidden="true"
            role="img"
            viewBox="-2 -2 28 28"
            height={height}
            width={width}
            fill="currentColor"
            className={classes(cl("icon"), className)}
            {...props}
        >
            <path fill="currentColor" d="M11 2a1 1 0 1 0-2 0v1H3a1 1 0 0 0 0 2h9.94a8.04 8.04 0 0 1-2.76 5.11l-.14.12-.2-.16a7.9 7.9 0 0 1-2.38-3.4 1 1 0 1 0-1.88.67 9.9 9.9 0 0 0 2.92 4.21l-3.15 2.69a1 1 0 0 0 1.3 1.52l3.4-2.91 1.31 1.08a1 1 0 1 0 1.28-1.53l-1.04-.87c1.9-1.68 3.1-4.02 3.35-6.53H17a1 1 0 1 0 0-2h-6V2Z" />
            <path fill="currentColor" fillRule="evenodd" d="M22.77 22H20.5l-.99-2.77H14.3L13.3 22h-2.27l4.72-12.42h2.3L22.77 22ZM16.9 11.87l-1.92 5.43h3.85l-1.93-5.43Z" clipRule="evenodd" />
        </svg>
    );
};

export const TranslateChatBarIcon: ChatBarButtonFactory = ({ isMainChat }) => {
    const { autoTranslate } = settings.use(["autoTranslate"]);

    if (!isMainChat) return null;

    const toggle = () => {
        const newState = !settings.store.autoTranslate;
        settings.store.autoTranslate = newState;

        if (newState && settings.store.showAutoTranslateAlert !== false) {
            Alerts.show({
                title: "Auto-Translate Enabled",
                body: (
                    <Paragraph>{t("You just enabled Auto Translate! Your messages will now be")}<b>{t("automatically translated")}</b>{t("before being sent.")}</Paragraph>
                ),
                confirmText: "Got it",
                cancelText: "Don't show again",
                onCancel: () => settings.store.showAutoTranslateAlert = false,
                confirmColor: Button.Colors.BRAND,
            });
        }
    };

    const openSettings = () => {
        openModal(props => (
            <TranslateModal rootProps={props} />
        ));
    };

    return (
        <ChatBarButton
            tooltip={autoTranslate ? "Auto-Translate: ON (Click to disable)" : "Auto-Translate: OFF (Click to enable)"}
            onClick={toggle}
            onContextMenu={openSettings}
            buttonProps={{
                "aria-haspopup": "dialog"
            }}
        >
            <TranslateIcon className={cl({ "auto-translate": autoTranslate, "chat-button": true })} />
        </ChatBarButton>
    );
};

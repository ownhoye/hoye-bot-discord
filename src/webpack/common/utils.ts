/*
 * Vencord, a modification for Discord's desktop app
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

import type * as t from "@vencord/discord-types";
import { _resolveReady, filters, findByCodeLazy, findByPropsLazy, findLazy, mapMangledModuleLazy, waitFor } from "@webpack";
import type * as TSPattern from "ts-pattern";

import { React } from "./react";

export let FluxDispatcher: t.FluxDispatcher;
waitFor(["dispatch", "subscribe"], m => {
    FluxDispatcher = m;
    // Importing this directly causes all webpack commons to be imported, which can easily cause circular dependencies.
    // For this reason, use a non import access here.
    Vencord?.Api?.PluginManager?.subscribeAllPluginsFluxEvents?.(m);

    const cb = () => {
        m.unsubscribe("CONNECTION_OPEN", cb);
        _resolveReady();
    };
    m.subscribe("CONNECTION_OPEN", cb);
});

export let ComponentDispatch: any;
waitFor(["dispatchToLastSubscribed"], m => ComponentDispatch = m);

export const Constants: t.Constants = mapMangledModuleLazy('ME:"/users/@me"', {
    Endpoints: filters.byProps("USER", "ME"),
    UserFlags: filters.byProps("STAFF", "SPAMMER"),
    FriendsSections: m => m.PENDING === "PENDING" && m.ADD_FRIEND
});

export const RestAPI: t.RestAPI = findLazy(m => typeof m === "object" && m.del && m.put);
export const moment: typeof import("moment") = findByPropsLazy("parseTwoDigitYear");

export const { match, P }: { match: typeof TSPattern["match"], P: typeof TSPattern["P"]; } = mapMangledModuleLazy("@ts-pattern/matcher", {
    match: filters.byCode("return new"),
    P: filters.byProps("when")
});

export const lodash: typeof import("lodash") = findByPropsLazy("debounce", "cloneDeep");

export const i18n = mapMangledModuleLazy(['defaultLocale:"en-US"', /initialLocale:\i/], {
    t: m => m?.[Symbol.toStringTag] === "IntlMessagesProxy",
    intl: m => m != null && Object.getPrototypeOf(m)?.withFormatters != null
}, true);

export let SnowflakeUtils: t.SnowflakeUtils;
waitFor(["fromTimestamp", "extractTimestamp"], m => SnowflakeUtils = m);

export let Parser: t.Parser;
waitFor("parseTopic", m => Parser = m);
export let Alerts: t.Alerts;
waitFor(["show", "close"], m => Alerts = m);

const ToastType = {
    MESSAGE: "message",
    SUCCESS: "success",
    FAILURE: "failure",
    CUSTOM: "custom",
    CLIP: "clip",
    LINK: "link",
    FORWARD: "forward",
    BOOKMARK: "bookmark",
    CLOCK: "clock"
};

const ToastPosition = {
    TOP: 0,
    BOTTOM: 1
};

export interface ToastData {
    message: string;
    content?: string;
    text?: string;
    title?: string;
    children?: React.ReactNode;
    id: string;
    /**
     * Toasts.Type
     */
    type: string | number;
    options?: ToastOptions;
}

export interface ToastOptions {
    /**
     * Toasts.Position
     */
    position?: number;
    component?: React.ReactNode;
    duration?: number;
}

interface ToastsExports {
    showToast: (data: ToastData) => void;
    popToast(): void;
}

const ToastsExports = mapMangledModuleLazy(".currentToastMap.has(", {
    showToast: filters.byCode(".currentToastMap.has("),
    popToast: filters.byCode(".delete(")
});

export function createToast(
    message: any,
    type: string | number = ToastType.MESSAGE,
    options?: ToastOptions
): ToastData {
    let text = "";
    let comp = options?.component;

    if (typeof message === "string") {
        text = message;
    } else if (message instanceof Error) {
        text = message.message || String(message);
    } else if (message && typeof message === "object") {
        if (React?.isValidElement?.(message)) {
            comp = message;
        } else if (typeof message.content === "string") {
            text = message.content;
        } else if (typeof message.message === "string") {
            text = message.message;
        } else if (typeof message.text === "string") {
            text = message.text;
        } else if (typeof message.title === "string") {
            text = message.title;
        } else if (typeof message.error === "string") {
            text = message.error;
        } else if (message.component && React?.isValidElement?.(message.component)) {
            comp = message.component;
        } else {
            try {
                const str = String(message);
                text = str === "[object Object]" ? "" : str;
            } catch {
                text = "";
            }
        }

        if ((type === ToastType.MESSAGE || !type) && message.type) {
            type = message.type;
        }
        if (!options && message.options) {
            options = message.options;
        }
    } else if (message != null) {
        text = String(message);
    }

    const toastId = (options as any)?.id || (message as any)?.id || Toasts.genId();

    return {
        id: toastId,
        message: text,
        content: text,
        text,
        title: text,
        children: comp || text,
        type,
        options: {
            ...options,
            ...(comp ? { component: comp } : {})
        }
    };
}

function safeShowToast(toast: any): void {
    if (!toast) return;

    let data: ToastData;
    if (typeof toast === "string" || toast instanceof Error) {
        data = createToast(toast);
    } else if (typeof toast === "object") {
        data = createToast(
            toast.content ?? toast.message ?? toast.text ?? toast.title ?? toast.children ?? toast,
            toast.type,
            toast.options ?? toast
        );
        if (toast.id) data.id = toast.id;
    } else {
        data = createToast(String(toast));
    }

    // Safety guard: if there is no text AND no custom React component, do NOT show an empty black bubble!
    const hasText = Boolean(data.message && data.message.trim());
    const hasComponent = Boolean(data.options?.component || (data.children && React?.isValidElement?.(data.children)));

    if (!hasText && !hasComponent) {
        return;
    }

    try {
        ToastsExports.showToast(data);
    } catch (e) {
        console.warn("[LoliCord:Toasts] Failed to show toast:", e);
    }
}

export const Toasts = {
    Type: ToastType,
    Position: ToastPosition,
    genId: () => (Math.random() || Math.random()).toString(36).slice(2),

    show: safeShowToast,
    pop: ToastsExports.popToast,
    create: createToast,
};

/**
 * Show a simple toast. If you need more options, use Toasts.show manually
 */
export function showToast(message: any, type: string | number = ToastType.MESSAGE, options?: ToastOptions) {
    if (message == null || message === "") return;
    const toast = createToast(message, type, options);
    Toasts.show(toast);
}

export const UserUtils = {
    getUser: findByCodeLazy(".USER(")
};

export const UploadManager = findByPropsLazy("clearAll", "addFile");
export const UploadHandler = {
    promptToUpload: findByCodeLazy("Unexpected mismatch between files and file metadata") as (files: File[], channel: t.Channel, draftType: Number) => void
};

export const ApplicationAssetUtils = mapMangledModuleLazy("getAssetImage: size must === [", {
    fetchAssetIds: filters.byCode('.startsWith("http:")', ".dispatch({"),
    getAssetFromImageURL: filters.byCode("].serialize(", ":null"),
    getAssetImage: filters.byCode("getAssetImage: size must === ["),
    getAssets: filters.byCode(".assets")
});

export const NavigationRouter: t.NavigationRouter = mapMangledModuleLazy("transitionTo - Transitioning to", {
    transitionTo: filters.byCode("transitionTo -"),
    transitionToGuild: filters.byCode("transitionToGuild -"),
    back: filters.byCode("goBack()"),
    forward: filters.byCode("goForward()"),
});
export const ChannelRouter: t.ChannelRouter = mapMangledModuleLazy('"Thread must have a parent ID."', {
    transitionToChannel: filters.byCode(".preload"),
    transitionToThread: filters.byCode('"Thread must have a parent ID."')
});

export let SettingsRouter: any;
waitFor(["openUserSettings", "USER_SETTINGS_MODAL_KEY"], m => SettingsRouter = m);

export const PermissionsBits: t.PermissionsBits = findLazy(m => typeof m.ADMINISTRATOR === "bigint");

export const { zustandCreate } = mapMangledModuleLazy(["useSyncExternalStoreWithSelector:", "Object.assign"], {
    zustandCreate: filters.byCode(/=>(\i)\?\i\(\1/)
});

export const { zustandPersist } = mapMangledModuleLazy(".onRehydrateStorage)?", {
    zustandPersist: filters.byCode(/(\(\i,\i\))=>.+?\i\1/)
});

export const MessageActions = findByPropsLazy("editMessage", "sendMessage");
export const MessageCache = findByPropsLazy("clearCache", "_channelMessages");
export const UserProfileActions = findByPropsLazy("openUserProfileModal", "closeUserProfileModal");
export const InviteActions = findByPropsLazy("resolveInvite");
export const ChannelActionCreators = findByPropsLazy("openPrivateChannel");

export const IconUtils: t.IconUtils = findByPropsLazy("getGuildBannerURL", "getUserAvatarURL");

export const ExpressionPickerStore: t.ExpressionPickerStore = mapMangledModuleLazy("expression-picker-last-active-view", {
    openExpressionPicker: filters.byCode(/setState\({activeView:(?:(?!null)\i),activeViewType:/),
    closeExpressionPicker: filters.byCode("setState({activeView:null"),
    toggleMultiExpressionPicker: filters.byCode(".EMOJI,"),
    toggleExpressionPicker: filters.byCode(/getState\(\)\.activeView===\i\?\i\(\):\i\(/),
    setExpressionPickerView: filters.byCode(/setState\({activeView:\i,lastActiveView:/),
    setSearchQuery: filters.byCode("searchQuery:"),
    useExpressionPickerStore: filters.byCode(/\(\i,\i=\i\)=>/)
});

export const PopoutActions: t.PopoutActions = mapMangledModuleLazy('type:"POPOUT_WINDOW_OPEN"', {
    open: filters.byCode('type:"POPOUT_WINDOW_OPEN"'),
    close: filters.byCode('type:"POPOUT_WINDOW_CLOSE"'),
    setAlwaysOnTop: filters.byCode('type:"POPOUT_WINDOW_SET_ALWAYS_ON_TOP"'),
});

export const UsernameUtils: t.UsernameUtils = findByPropsLazy("useName", "getGlobalName");
export const DisplayProfileUtils: t.DisplayProfileUtils = mapMangledModuleLazy(/=\i\.getUserProfile\(\i\),\i=\i\.getGuildMemberProfile\(/, {
    getDisplayProfile: filters.byCode(".getGuildMemberProfile("),
    useDisplayProfile: filters.byCode(/\[\i\.\i,\i\.\i],\(\)=>/)
});

export const DateUtils: t.DateUtils = mapMangledModuleLazy("millisecondsInUnit:", {
    calendarFormat: filters.byCode('<-1?"sameElse":'),
    dateFormat: filters.byCode('<2?"nextDay":"sameElse";'),
    isSameDay: filters.byCode(/Math\.abs\(\i-\i\)/),
    diffAsUnits: filters.byCode("days:0", "millisecondsInUnit")
});

export const MessageTypeSets: t.MessageTypeSets = findByPropsLazy("REPLYABLE", "FORWARDABLE");

export const CloudUploader = findLazy(m => m.prototype?.trackUploadFinished);
export const ChannelActions = findByPropsLazy("selectChannel", "preload");

// ─── Re-exports for compatibility with Equicord/Vencord plugins ────────────────

// Modal API (from @utils/modal)
export { closeAllModals, closeModal, ModalRoot as Modal, ModalCloseButton,ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal, openModalLazy } from "@utils/modal";

// Actions
export const VoiceActions = findByPropsLazy("toggleSelfMute", "setChannel");
export const GuildActions = findByPropsLazy("requestMembersById", "leaveGuild");
export const PinActions = findByPropsLazy("pinMessage", "unpinMessage");

// Utils
export const ReadStateUtils = findByPropsLazy("ackMessage", "hasUnread");
export const ColorUtils = findByPropsLazy("hex2int", "int2hex");
export const fetchApplicationsRPC = findByCodeLazy("APPLICATION_RPC(");

// React DnD hooks
export const useDrag = findByCodeLazy("useDrag", "DragSourceMonitor");
export const useDrop = findByCodeLazy("useDrop", "DropTargetMonitor");

// Safe ConfirmModal that won't break when Discord changes it
export function ConfirmModal(props: any) {
    const { ModalRoot, ModalHeader, ModalContent, ModalFooter } = require("@utils/modal");
    const { ButtonCompat } = require("@components/Button");
    
    return React.createElement(ModalRoot, { transitionState: props.transitionState, size: "small", className: props.className },
        React.createElement(ModalHeader, { separator: false },
            React.createElement("h2", { style: { color: "var(--header-primary)", fontSize: 20, fontWeight: 600 } }, props.header)
        ),
        React.createElement(ModalContent, null, 
            React.createElement("div", { style: { color: "var(--text-normal, #dbdee1)" } }, props.children)
        ),
        React.createElement(ModalFooter, null,
            React.createElement("div", { style: { display: "flex", gap: "16px", justifyContent: "flex-end", width: "100%" } },
                React.createElement(ButtonCompat, {
                    onClick: () => {
                        props.onCancel?.();
                        props.onClose?.();
                    },
                    look: "LINK",
                    color: "PRIMARY"
                }, props.cancelText),
                React.createElement(ButtonCompat, {
                    onClick: () => {
                        props.onConfirm?.();
                        props.onClose?.();
                    },
                    color: props.confirmButtonColor
                }, props.confirmText)
            )
        )
    );
}



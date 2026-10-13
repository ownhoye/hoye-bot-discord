/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, sendBotMessage } from "@api/Commands";
import { CommandArgument, CommandContext } from "@vencord/discord-types";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { OpenExternalIcon } from "@components/Icons";
import { Devs } from "@utils/constants";
import { insertTextIntoChatInputBox, sendMessage } from "@utils/discord";
import { Margins } from "@utils/margins";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Button, DraftType, Forms, Menu, PermissionsBits, PermissionStore, React, Select, SelectedChannelStore, showToast, TextInput, UploadManager, useEffect, useState } from "@webpack/common";
import { t } from "../autoTranslateLoliCord";

const Native = VencordNative.pluginHelpers.BigFileUpload as PluginNative<typeof import("./native")>;

const UploadStore = findByPropsLazy("getUploads");
const OptionClasses = findByPropsLazy("optionName", "optionIcon", "optionLabel");

function createCloneableStore(initialState: any) {
    const store = { ...initialState };
    const listeners: (() => void)[] = [];
    function get() { return { ...store }; }
    function set(newState: Partial<typeof store>) {
        Object.assign(store, newState);
        listeners.forEach(l => l());
    }
    function subscribe(listener: () => void) {
        listeners.push(listener);
        return () => {
            const index = listeners.indexOf(listener);
            if (index > -1) listeners.splice(index, 1);
        };
    }
    return { get, set, subscribe };
}

function SettingsComponent(props: { setValue(v: any): void; }) {
    const [fileUploader, setFileUploader] = useState(settings.store.fileUploader || "GoFile");
    const [customUploaderStore] = useState(() => createCloneableStore({
        name: settings.store.customUploaderName || "",
        requestURL: settings.store.customUploaderRequestURL || "",
        fileFormName: settings.store.customUploaderFileFormName || "",
        responseType: settings.store.customUploaderResponseType || "",
        url: settings.store.customUploaderURL || "",
        thumbnailURL: settings.store.customUploaderThumbnailURL || "",
        headers: (() => {
            const p = JSON.parse(settings.store.customUploaderHeaders || "{}");
            if (Object.keys(p).length === 0) p[""] = "";
            return p;
        })(),
        args: (() => {
            const p = JSON.parse(settings.store.customUploaderArgs || "{}");
            if (Object.keys(p).length === 0) p[""] = "";
            return p;
        })(),
    }));

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        const unsubscribe = customUploaderStore.subscribe(() => {
            const state = customUploaderStore.get();
            updateSetting("customUploaderName", state.name);
            updateSetting("customUploaderRequestURL", state.requestURL);
            updateSetting("customUploaderFileFormName", state.fileFormName);
            updateSetting("customUploaderResponseType", state.responseType);
            updateSetting("customUploaderURL", state.url);
            updateSetting("customUploaderThumbnailURL", state.thumbnailURL);
            updateSetting("customUploaderHeaders", JSON.stringify(state.headers));
            updateSetting("customUploaderArgs", JSON.stringify(state.args));
        });
        return unsubscribe;
    }, []);

    function updateSetting(key: keyof typeof settings.store, value: any) {
        if (key in settings.store) settings.store[key] = value;
    }

    function handleShareXConfigUpload(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e: ProgressEvent<FileReader>) => {
                try {
                    const config = JSON.parse(e.target?.result as string);
                    customUploaderStore.set({
                        name: config.Name || "",
                        requestURL: config.RequestURL || "",
                        fileFormName: config.FileFormName || "",
                        responseType: config.ResponseType || "Text",
                        url: config.URL || "",
                        thumbnailURL: config.ThumbnailURL || "",
                        headers: config.Headers || { "": "" },
                        args: config.Arguments || { "": "" }
                    });
                    updateSetting("customUploaderName", config.Name || "");
                    updateSetting("customUploaderRequestURL", config.RequestURL || "");
                    updateSetting("customUploaderFileFormName", config.FileFormName || "");
                    updateSetting("customUploaderResponseType", config.ResponseType || "Text");
                    updateSetting("customUploaderURL", config.URL || "");
                    updateSetting("customUploaderThumbnailURL", config.ThumbnailURL || "");
                    updateSetting("customUploaderHeaders", JSON.stringify(config.Headers || { "": "" }));
                    updateSetting("customUploaderArgs", JSON.stringify(config.Arguments || { "": "" }));
                    setFileUploader("Custom");
                    updateSetting("fileUploader", "Custom");
                    showToast("ShareX config imported successfully!");
                } catch (error) {
                    showToast("Error importing ShareX config. Check console for details.");
                }
            };
            reader.readAsText(file);
            event.target.value = "";
        }
    }

    const handleFileUploaderChange = (v: string) => {
        setFileUploader(v);
        updateSetting("fileUploader", v);
    };

    const handleArgChange = (oldKey: string, newKey: string, value: any) => {
        const state = customUploaderStore.get();
        const newArgs = { ...state.args };
        if (oldKey !== newKey) delete newArgs[oldKey];
        if (value === "" && newKey === "") delete newArgs[oldKey];
        else newArgs[newKey] = value;
        customUploaderStore.set({ args: newArgs });
        if (Object.values(newArgs).every(v => v !== "") && Object.keys(newArgs).every(k => k !== "")) {
            newArgs[""] = "";
        }
        customUploaderStore.set({ args: newArgs });
    };

    const handleHeaderChange = (oldKey: string, newKey: string, value: string) => {
        const state = customUploaderStore.get();
        const newHeaders = { ...state.headers };
        if (oldKey !== newKey) delete newHeaders[oldKey];
        if (value === "" && newKey === "") delete newHeaders[oldKey];
        else newHeaders[newKey] = value;
        customUploaderStore.set({ headers: newHeaders });
        if (Object.values(newHeaders).every(v => v !== "") && Object.keys(newHeaders).every(k => k !== "")) {
            newHeaders[""] = "";
        }
        customUploaderStore.set({ headers: newHeaders });
    };

    return (
        <div className="vc-bigfile-container">
            <style>{`
                .vc-bigfile-container input,
                .vc-bigfile-container input[type="text"],
                .vc-bigfile-container [class*="input_"],
                .vc-bigfile-container [class*="inputDefault_"] {
                    background: var(--input-background, #1e1f22) !important;
                    background-color: var(--input-background, #1e1f22) !important;
                    color: var(--text-normal, #dbdee1) !important;
                    border: 1px solid var(--input-border, transparent) !important;
                    box-shadow: none !important;
                }
            `}</style>
            <Flex flexDirection="column">
                <Forms.FormSection title={t("Select the file uploader service")}>
                    <Select
                        options={[
                            { label: "Custom Uploader", value: "Custom" },
                            { label: "Catbox", value: "Catbox" },
                            { label: "Litterbox", value: "Litterbox" },
                            { label: "GoFile", value: "GoFile" },
                        ]}
                        placeholder="Select the file uploader service"
                        className={Margins.bottom16}
                        select={handleFileUploaderChange}
                        isSelected={v => v === fileUploader}
                        serialize={v => v}
                    />
                </Forms.FormSection>

                <FormSwitch
                    title={t("Auto-Send Link In Chat")}
                    description={t("Automatically send the uploaded file link directly to the current chat")}
                    value={settings.store.autoSend === "Yes"}
                    onChange={v => {
                        updateSetting("autoSend", v ? "Yes" : "No");
                    }}
                    hideBorder
                    className={Margins.bottom16}
                />

                {fileUploader === "GoFile" && (
                    <>
                        <Forms.FormDivider />
                        <Forms.FormTitle>GoFile Settings</Forms.FormTitle>
                        <Forms.FormSection title={t("GoFile Token (optional)")}>
                            <TextInput value={settings.store.gofileToken || ""} placeholder="Insert GoFile Token"
                                onChange={newValue => updateSetting("gofileToken", newValue)} className={Margins.bottom16} />
                        </Forms.FormSection>
                    </>
                )}

                {fileUploader === "Catbox" && (
                    <>
                        <Forms.FormDivider />
                        <Forms.FormTitle>Catbox Settings</Forms.FormTitle>
                        <Forms.FormSection title={t("Catbox User hash (optional)")}>
                            <TextInput value={settings.store.catboxUserHash || ""} placeholder="Insert User Hash"
                                onChange={newValue => updateSetting("catboxUserHash", newValue)} className={Margins.bottom16} />
                        </Forms.FormSection>
                    </>
                )}

                {fileUploader === "Litterbox" && (
                    <>
                        <Forms.FormDivider />
                        <Forms.FormTitle>Litterbox Settings</Forms.FormTitle>
                        <Forms.FormSection title={t("Select the file expiration time")}>
                            <Select
                                options={[
                                    { label: "1 hour", value: "1h" },
                                    { label: "12 hours", value: "12h" },
                                    { label: "24 hours", value: "24h" },
                                    { label: "72 hours", value: "72h" },
                                ]}
                                placeholder="Select Duration"
                                className={Margins.bottom16}
                                select={newValue => updateSetting("litterboxTime", newValue)}
                                isSelected={v => v === settings.store.litterboxTime}
                                serialize={v => v}
                            />
                        </Forms.FormSection>
                    </>
                )}

                {fileUploader === "Custom" && (
                    <>
                        <Forms.FormSection title={t("Request URL")}>
                            <TextInput value={customUploaderStore.get().requestURL} placeholder="Request URL"
                                onChange={(v: string) => customUploaderStore.set({ requestURL: v })} className={Margins.bottom16} />
                        </Forms.FormSection>
                        <Forms.FormSection title={t("File form name")}>
                            <TextInput value={customUploaderStore.get().fileFormName} placeholder="File Form Name"
                                onChange={(v: string) => customUploaderStore.set({ fileFormName: v })} className={Margins.bottom16} />
                        </Forms.FormSection>
                        <Forms.FormSection title={t("Response type")}>
                            <Select
                                options={[{ label: "Text", value: "Text" }, { label: "JSON", value: "JSON" }]}
                                placeholder="Select Response Type"
                                className={Margins.bottom16}
                                select={(v: string) => customUploaderStore.set({ responseType: v })}
                                isSelected={(v: string) => v === customUploaderStore.get().responseType}
                                serialize={(v: string) => v}
                            />
                        </Forms.FormSection>
                        <Forms.FormSection title={t("URL (JSON path)")}>
                            <TextInput value={customUploaderStore.get().url} placeholder="URL (JSON path)"
                                onChange={(v: string) => customUploaderStore.set({ url: v })} className={Margins.bottom16} />
                        </Forms.FormSection>

                        <Forms.FormDivider />
                        <Forms.FormTitle>Custom Uploader Arguments</Forms.FormTitle>
                        {Object.entries(customUploaderStore.get().args).map(([key, value], index) => (
                            <div key={index}>
                                <TextInput value={key} placeholder="Argument Key"
                                    onChange={(newKey: string) => handleArgChange(key, newKey, value as string)} className={Margins.bottom16} />
                                <TextInput value={value as string} placeholder="Argument Value"
                                    onChange={(newValue: string) => handleArgChange(key, key, newValue)} className={Margins.bottom16} />
                            </div>
                        ))}

                        <Forms.FormDivider />
                        <Forms.FormTitle>Headers</Forms.FormTitle>
                        {Object.entries(customUploaderStore.get().headers).map(([key, value], index) => (
                            <div key={index}>
                                <TextInput value={key} placeholder="Header Key"
                                    onChange={(newKey: string) => handleHeaderChange(key, newKey, value as string)} className={Margins.bottom16} />
                                <TextInput value={value as string} placeholder="Header Value"
                                    onChange={(newValue: string) => handleHeaderChange(key, key, newValue)} className={Margins.bottom16} />
                            </div>
                        ))}

                        <Forms.FormDivider />
                        <Forms.FormTitle>Import ShareX Config</Forms.FormTitle>
                        <Button onClick={() => fileInputRef.current?.click()}
                            color={Button.Colors.BRAND} size={Button.Sizes.XLARGE} className={Margins.bottom16}>
                            Select File
                        </Button>
                        <input ref={fileInputRef} type="file" accept=".sxcu" style={{ display: "none" }}
                            onChange={handleShareXConfigUpload} />
                    </>
                )}
            </Flex>
        </div>
    );
}

const settings = definePluginSettings({
    fileUploader: {
        type: OptionType.SELECT,
        description: "Select the file uploader service",
        options: [
            { label: "Custom Uploader", value: "Custom" },
            { label: "Catbox", value: "Catbox" },
            { label: "Litterbox", value: "Litterbox" },
            { label: "GoFile", value: "GoFile", default: true },
        ],
    },
    autoSend: {
        type: OptionType.SELECT,
        description: "Automatically send the uploaded file link directly to the current chat",
        options: [
            { label: "Yes", value: "Yes", default: true },
            { label: "No", value: "No" },
        ],
    },
    litterboxTime: {
        type: OptionType.SELECT,
        description: "Select the file expiration time",
        options: [
            { label: "1 hour", value: "1h" },
            { label: "12 hours", value: "12h" },
            { label: "24 hours", value: "24h" },
            { label: "72 hours", value: "72h", default: true },
        ],
    },
    gofileToken: {
        type: OptionType.STRING,
        description: "GoFile Token (optional)",
        default: "",
    },
    catboxUserHash: {
        type: OptionType.STRING,
        description: "Catbox User hash (optional)",
        default: "",
    },
    customUploaderName: {
        type: OptionType.STRING,
        description: "Name of the custom uploader",
        default: "",
    },
    customUploaderRequestURL: {
        type: OptionType.STRING,
        description: "Request URL for the custom uploader",
        default: "",
    },
    customUploaderFileFormName: {
        type: OptionType.STRING,
        description: "File form name for the custom uploader",
        default: "",
    },
    customUploaderResponseType: {
        type: OptionType.SELECT,
        description: "Response type for the custom uploader",
        options: [
            { label: "Text", value: "Text", default: true },
            { label: "JSON", value: "JSON" },
        ],
    },
    customUploaderURL: {
        type: OptionType.STRING,
        description: "JSON path for the URL in the response",
        default: "",
    },
    customUploaderThumbnailURL: {
        type: OptionType.STRING,
        description: "JSON path for the thumbnail URL in the response (optional)",
        default: "",
    },
    customUploaderHeaders: {
        type: OptionType.STRING,
        description: "Headers for the custom uploader (JSON format)",
        default: "{}",
    },
    customUploaderArgs: {
        type: OptionType.STRING,
        description: "Arguments for the custom uploader (JSON format)",
        default: "{}",
    },
    customSettings: { type: OptionType.COMPONENT, component: SettingsComponent, description: "Configure custom uploader settings", hidden: false },
});

function sendTextToChat(text: string, channelId?: string) {
    const targetChannelId = channelId || SelectedChannelStore.getChannelId();
    if (settings.store.autoSend === "Yes" && targetChannelId) {
        sendMessage(targetChannelId, { content: text });
    } else {
        insertTextIntoChatInputBox(text);
    }
}

async function resolveFile(options: CommandArgument[], ctx: CommandContext): Promise<File | null> {
    for (const opt of options) {
        if (opt.name === "file") {
            const upload = UploadStore?.getUpload?.(ctx.channel.id, opt.name, DraftType.SlashCommand);
            if (upload?.item?.file) {
                return upload.item.file;
            }
        }
    }
    return null;
}

async function uploadFileToGofile(file: File, channelId: string) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        let uploadUrl = "https://api.gofile.io/contents/uploadfile";
        try {
            const serverResponse = await fetch("https://api.gofile.io/servers");
            const serverData = await serverResponse.json();
            if (serverData?.data?.servers?.length) {
                const server = serverData.data.servers[Math.floor(Math.random() * serverData.data.servers.length)].name;
                uploadUrl = `https://${server}.gofile.io/uploadFile`;
            }
        } catch { }

        const uploadResult = await Native.uploadFileToGofileNative(uploadUrl, arrayBuffer, file.name, file.type, settings.store.gofileToken);
        if (uploadResult.status === "ok") {
            const link = uploadResult.data.downloadPage || uploadResult.data.directLink || uploadResult.data.link;
            setTimeout(() => sendTextToChat(`${link} `, channelId), 10);
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else {
            sendBotMessage(channelId, { content: "Error uploading file. Check the console for more info." });
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        }
    } catch (error) {
        sendBotMessage(channelId, { content: "Error uploading file. Check the console for more info." });
        UploadManager.clearAll(channelId, DraftType.SlashCommand);
    }
}

async function uploadFileToCatbox(file: File, channelId: string) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const fileSizeMB = file.size / (1024 * 1024);
        const uploadResult = await Native.uploadFileToCatboxNative("https://catbox.moe/user/api.php", arrayBuffer, file.name, file.type, settings.store.catboxUserHash);
        if (uploadResult.startsWith("https://") || uploadResult.startsWith("http://")) {
            let finalUrl = uploadResult;
            const videoExts = [".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv", ".m4v", ".mpg", ".mpeg", ".3gp", ".ogv"];
            if (fileSizeMB >= 150 && videoExts.some(ext => finalUrl.endsWith(ext))) finalUrl = `https://embeds.video/${finalUrl}`;
            setTimeout(() => sendTextToChat(`${finalUrl} `, channelId), 10);
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else {
            sendBotMessage(channelId, { content: "Error uploading file. Check the console for more info." });
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        }
    } catch (error) {
        sendBotMessage(channelId, { content: "Error uploading file. Check the console for more info." });
        UploadManager.clearAll(channelId, DraftType.SlashCommand);
    }
}

async function uploadFileToLitterbox(file: File, channelId: string) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const fileSizeMB = file.size / (1024 * 1024);
        const uploadResult = await Native.uploadFileToLitterboxNative(arrayBuffer, file.name, file.type, settings.store.litterboxTime);
        if (uploadResult.startsWith("https://") || uploadResult.startsWith("http://")) {
            let finalUrl = uploadResult;
            const videoExts = [".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv", ".m4v", ".mpg", ".mpeg", ".3gp", ".ogv"];
            if (fileSizeMB >= 150 && videoExts.some(ext => finalUrl.endsWith(ext))) finalUrl = `https://embeds.video/${finalUrl}`;
            setTimeout(() => sendTextToChat(`${finalUrl}`, channelId), 10);
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else {
            sendBotMessage(channelId, { content: "Error uploading file. Check the console for more info." });
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        }
    } catch (error) {
        sendBotMessage(channelId, { content: "Error uploading file. Check the console for more info." });
        UploadManager.clearAll(channelId, DraftType.SlashCommand);
    }
}

async function uploadFileCustom(file: File, channelId: string) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const fileFormName = settings.store.customUploaderFileFormName || "file[]";
        const customArgs = JSON.parse(settings.store.customUploaderArgs || "{}");
        const customHeaders = JSON.parse(settings.store.customUploaderHeaders || "{}");
        const responseType = settings.store.customUploaderResponseType;
        const urlPath = settings.store.customUploaderURL.split(".");
        const finalUrl = await Native.uploadFileCustomNative(settings.store.customUploaderRequestURL, arrayBuffer, file.name, file.type, fileFormName, customArgs, customHeaders, responseType, urlPath);
        if (finalUrl.startsWith("https://") || finalUrl.startsWith("http://")) {
            let finalUrlModified = finalUrl;
            const videoExts = [".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".wmv", ".m4v", ".mpg", ".mpeg", ".3gp", ".ogv"];
            if (videoExts.some(ext => finalUrlModified.endsWith(ext))) finalUrlModified = `https://embeds.video/${finalUrlModified}`;
            setTimeout(() => sendTextToChat(`${finalUrlModified} `, channelId), 10);
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        } else {
            sendBotMessage(channelId, { content: "Error uploading file. Check the console for more info." });
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
        }
    } catch (error) {
        sendBotMessage(channelId, { content: `Error uploading file: ${error}.` });
        UploadManager.clearAll(channelId, DraftType.SlashCommand);
    }
}

async function uploadFile(file: File, channelId: string) {
    switch (settings.store.fileUploader) {
        case "GoFile": await uploadFileToGofile(file, channelId); break;
        case "Catbox": await uploadFileToCatbox(file, channelId); break;
        case "Litterbox": await uploadFileToLitterbox(file, channelId); break;
        case "Custom": await uploadFileCustom(file, channelId); break;
        default:
            sendBotMessage(channelId, { content: "Error: Unknown uploader selected." });
            UploadManager.clearAll(channelId, DraftType.SlashCommand);
    }
}

function triggerFileUpload() {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.style.display = "none";
    fileInput.onchange = async event => {
        const target = event.target as HTMLInputElement;
        if (target?.files?.length) {
            const channelId = SelectedChannelStore.getChannelId();
            await uploadFile(target.files[0], channelId);
        } else {
            showToast("No file selected");
        }
    };
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

const BigFileIcon = (props: any) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path fill="currentColor" fillRule="evenodd" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" clipRule="evenodd" />
    </svg>
);

const ctxMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    if (props.channel.guild_id && !PermissionStore.can(PermissionsBits.SEND_MESSAGES, props.channel)) return;
    children.splice(1, 0,
        <Menu.MenuItem
            id="upload-big-file"
            key="upload-big-file"
            label={t("Upload a Big File")}
            iconLeft={BigFileIcon}
            icon={BigFileIcon}
            leadingAccessory={{
                type: "icon",
                icon: BigFileIcon
            }}
            action={triggerFileUpload}
        />
    );
};

export default definePlugin({
    name: "BigFileUpload",
    enabledByDefault: true,
    description: "Bypasses Discord's upload limit via GoFile, Catbox, or a custom uploader. Button in the right-click menu or /fileupload command.",
    authors: [Devs.ScattrdBlade],
    settings,
    dependencies: ["CommandsAPI"],
    contextMenus: { "channel-attach": ctxMenuPatch },
    commands: [
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "fileupload",
            description: "Upload a file",
            options: [{
                name: "file",
                description: "The file to upload",
                type: ApplicationCommandOptionType.ATTACHMENT,
                required: true,
            }],
            execute: async (opts, cmdCtx) => {
                const file = await resolveFile(opts, cmdCtx);
                if (file) {
                    await uploadFile(file, cmdCtx.channel.id);
                } else {
                    sendBotMessage(cmdCtx.channel.id, { content: "No file specified!" });
                    UploadManager.clearAll(cmdCtx.channel.id, DraftType.SlashCommand);
                }
            },
        },
    ],
});

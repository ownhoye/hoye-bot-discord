/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotice } from "@api/Notices";
import { isPluginEnabled, pluginRequiresRestart, startDependenciesRecursive, startPlugin, stopPlugin } from "@api/PluginManager";
import { CogWheel, InfoIcon } from "@components/Icons";
import { AddonCard } from "@components/settings/AddonCard";
import { classNameFactory } from "@utils/css";
import { LOLICORD_IMAGE_ICON } from "@utils/lolicordLogo";
import { Logger } from "@utils/Logger";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { OptionType, Plugin } from "@utils/types";
import { HeadingPrimary } from "@components/Heading";
import { Button } from "@components/Button";
import { React, showToast, Text, Toasts, Tooltip, UserStore } from "@webpack/common";
import { flushSettings, Settings } from "@api/Settings";
import { t } from "@api/i18n";
import { tPlugin } from "@api/pluginI18n";
import { detailedPluginDescriptions } from "@api/detailedPluginDescriptions";

import { openPluginModal } from "./PluginModal";
import { getPluginIcon } from "./pluginIcons";
import { PluginMeta } from "~plugins";

export function removeEmojis(text: string): string {
    if (!text) return "";
    return text
        .replace(/[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{2190}-\u{21FF}]|[\u{2B50}]|[\u{2300}-\u{23FF}]|[\u{2B00}-\u{2BFF}]|[\u{E000}-\u{F8FF}]/gu, "")
        .replace(/  +/g, " ")
        .trim();
}

const logger = new Logger("PluginCard");
const cl = classNameFactory("vc-plugins-");

interface PluginCardProps extends React.HTMLProps<HTMLDivElement> {
    plugin: Plugin;
    disabled?: boolean;
    onRestartNeeded(name: string, key: string): void;
    isNew?: boolean;
    hasTutorial?: boolean;
    onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
    onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
}

export function PluginCard({ plugin, disabled, onRestartNeeded, onMouseEnter, onMouseLeave, isNew }: PluginCardProps) {
    const settings = (Settings.plugins[plugin.name] ??= {} as any);
    const isEnabled = () => isPluginEnabled(plugin.name);

    function doToggleEnabled() {
        const wasEnabled = isEnabled();
        const nextState = !wasEnabled;
        const targetSettings = (Settings.plugins[plugin.name] ??= {} as any);
        targetSettings.enabled = nextState;
        flushSettings();

        if (!wasEnabled) {
            const { restartNeeded, failures } = startDependenciesRecursive(plugin);

            if (failures.length) {
                logger.error(`Failed to start dependencies for ${plugin.name}: ${failures.join(", ")}`);
                showNotice("Failed to start dependencies: " + failures.join(", "), "Close", () => null);
                targetSettings.enabled = false;
                flushSettings();
                return;
            }

            if (restartNeeded) {
                targetSettings.enabled = true;
                flushSettings();
                onRestartNeeded(plugin.name, "enabled");
                return;
            }
        }

        if (pluginRequiresRestart(plugin)) {
            targetSettings.enabled = nextState;
            flushSettings();
            onRestartNeeded(plugin.name, "enabled");
            return;
        }

        if (wasEnabled && !plugin.started) {
            targetSettings.enabled = nextState;
            flushSettings();
            return;
        }

        const result = wasEnabled ? stopPlugin(plugin) : startPlugin(plugin);

        if (!result) {
            targetSettings.enabled = false;
            flushSettings();

            const msg = `Error while ${wasEnabled ? "stopping" : "starting"} plugin ${plugin.name}`;
            showToast(msg, Toasts.Type.FAILURE, {
                position: Toasts.Position.BOTTOM,
            });

            return;
        }

        targetSettings.enabled = nextState;
        flushSettings();
    }

    function toggleEnabled() {
        const wasEnabled = isEnabled();
        if (!wasEnabled && plugin.name.toLowerCase() === "autoresponder") {
            openModal(props => (
                <ModalRoot {...props} size={ModalSize.SMALL}>
                    <ModalHeader separator={false}>
                        <Text variant="heading-lg/semibold">{t("Autoresponder Warning")}</Text>
                        <ModalCloseButton onClick={props.onClose} />
                    </ModalHeader>
                    <ModalContent>
                        <Text variant="text-md/normal" style={{ marginBottom: 16 }}>
                            {t("Are you sure you want to enable the Autoresponder plugin? An AI will automatically reply to your DMs when you are unavailable.")}
                        </Text>
                    </ModalContent>
                    <ModalFooter style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <Button
                            variant="link"
                            onClick={props.onClose}
                        >
                            {t("Cancel")}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={() => {
                                props.onClose();
                                doToggleEnabled();
                            }}
                        >
                            {t("Enable")}
                        </Button>
                    </ModalFooter>
                </ModalRoot>
            ));
            return;
        }

        doToggleEnabled();
    }

    const openInfoModal = (e: React.MouseEvent) => {
        e.stopPropagation();
        const rawDesc = plugin.detailedDescription 
            ? tPlugin(plugin.detailedDescription) 
            : (detailedPluginDescriptions[plugin.name] ? tPlugin(detailedPluginDescriptions[plugin.name]) : tPlugin(plugin.description));
        const cleanDesc = removeEmojis(rawDesc);

        openModal(props => (
            <ModalRoot {...props} size={ModalSize.SMALL}>
                <ModalHeader separator={false}>
                    <Text variant="heading-xl/bold" style={{ flex: 1, color: "#fff" }}>
                        {removeEmojis(plugin.name)}
                    </Text>
                    <ModalCloseButton onClick={props.onClose} />
                </ModalHeader>
                <ModalContent>
                    <div style={{ padding: "0 16px 16px" }}>
                        <Text variant="text-md/medium" color="text-normal" style={{ whiteSpace: "pre-wrap" }}>
                            {cleanDesc}
                        </Text>
                    </div>
                </ModalContent>
            </ModalRoot>
        ));
    };

    const infoBadge = (
        <Tooltip text={t("Plugin Info")}>
            {({ onMouseEnter, onMouseLeave }) => (
                <button
                    className="nc-badge-btn"
                    onClick={openInfoModal}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                >
                    <svg className="vc-ic-save-icon" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" fill="transparent" />
                        <path fill="currentColor" fillRule="evenodd" d="M12 23a11 11 0 1 0 0-22 11 11 0 0 0 0 22Zm-.28-16c-.98 0-1.81.47-2.27 1.14A1 1 0 1 1 7.8 7.01 4.73 4.73 0 0 1 11.72 5c2.5 0 4.65 1.88 4.65 4.38 0 2.1-1.54 3.77-3.52 4.24l.14 1a1 1 0 0 1-1.98.27l-.28-2a1 1 0 0 1 .99-1.14c1.54 0 2.65-1.14 2.65-2.38 0-1.23-1.1-2.37-2.65-2.37ZM13 17.88a1.13 1.13 0 1 1-2.25 0 1.13 1.13 0 0 1 2.25 0Z" clipRule="evenodd" />
                    </svg>
                </button>
            )}
        </Tooltip>
    );

    const isLoliCord = !PluginMeta[plugin.name]?.userPlugin && !(plugin as any).isUserPlugin && (PluginMeta[plugin.name]?.folderName?.startsWith("src/lolicordplugins/") ?? false);
    const iconType = isLoliCord ? "lolicord" : "other";

    function openCreditsModal() {
        openModal(props => (
            <ModalRoot {...props} size={ModalSize.SMALL}>
                <ModalHeader>
                    <HeadingPrimary>Credits - {removeEmojis(plugin.name)}</HeadingPrimary>
                    <ModalCloseButton onClick={props.onClose} />
                </ModalHeader>
                <ModalContent style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" } as any}>
                    {isLoliCord ? (
                        <a href="https://github.com/ownhoye/hoye-bot-discord" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: "12px", textDecoration: "none", color: "var(--text-normal)", fontSize: "20px", fontWeight: 600 }}>
                            <img src={LOLICORD_IMAGE_ICON} alt="LoliCord" style={{ width: 64, height: 64, borderRadius: "50%" }} />
                            LoliCord
                        </a>
                    ) : (
                        plugin.authors?.map(a => {
                            const authorId = a?.id ? a.id.toString() : "0";
                            const user = a?.id ? UserStore.getUser(authorId) : null;
                            const avatarUrl = user ? user.getAvatarURL(undefined, 128) : (a?.id ? `https://cdn.discordapp.com/avatars/${authorId}/${authorId}.png` : "");
                            return (
                                <div key={authorId || (a?.name ?? "user")} style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "20px", fontWeight: 600, color: "var(--text-normal)" }}>
                                    {avatarUrl ? <img src={avatarUrl} alt={a?.name ?? "User"} style={{ width: 64, height: 64, borderRadius: "50%" }} /> : null}
                                    <span>{a?.name ?? "User"}</span>
                                </div>
                            );
                        })
                    )}
                </ModalContent>
            </ModalRoot>
        ));
    }

    const hasSettings = !!plugin.settingsAboutComponent || (plugin.settings?.def && Object.values(plugin.settings.def).some(s => s.type !== OptionType.CUSTOM && !s.hidden));
    
    const PluginIcon = getPluginIcon(plugin);

    return (
        <AddonCard
            name={plugin.name}
            iconType={iconType}
            customIcon={PluginIcon}
            sourceBadge={<></>}
            description={tPlugin(plugin.description)}
            isNew={isNew}
            enabled={isEnabled()}
            setEnabled={plugin.required ? () => { } : toggleEnabled}
            disabled={disabled}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            infoButton={
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    {(plugin.name === "DynamicIslande" || plugin.name === "StereoInstaller" || plugin.name === "ClientDiagnostics" || plugin.name === "SecureBookmarks" || plugin.name === "StatusCycler" || plugin.name === "Surveillance" || plugin.name === "MutualScanner") && (
                        <Tooltip text="This plugin comes from our partner (Illegalcord) then was modified by LoliCord.">
                            {({ onMouseEnter, onMouseLeave }) => (
                                <button
                                    role="button"
                                    className={cl("info-button")}
                                    onMouseEnter={onMouseEnter}
                                    onMouseLeave={onMouseLeave}
                                    onClick={() => window.open("https://github.com/ImHisako/Illegalcord", "_blank")}
                                >
                                    <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24">
                                        <path fill="currentColor" d="M14.5 8a3 3 0 1 0-2.7-4.3c-.2.4.06.86.44 1.12a5 5 0 0 1 2.14 3.08c.01.06.06.1.12.1ZM18.44 17.27c.15.43.54.73 1 .73h1.06c.83 0 1.5-.67 1.5-1.5a7.5 7.5 0 0 0-6.5-7.43c-.55-.08-.99.38-1.1.92-.06.3-.15.6-.26.87-.23.58-.05 1.3.47 1.63a9.53 9.53 0 0 1 3.83 4.78ZM12.5 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2 20.5a7.5 7.5 0 0 1 15 0c0 .83-.67 1.5-1.5 1.5a.2.2 0 0 1-.2-.16c-.2-.96-.56-1.87-.88-2.54-.1-.23-.42-.15-.42.1v2.1a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-2.1c0-.25-.31-.33-.42-.1-.32.67-.67 1.58-.88 2.54a.2.2 0 0 1-.2.16A1.5 1.5 0 0 1 2 20.5Z" />
                                    </svg>
                                </button>
                            )}
                        </Tooltip>
                    )}
                    {(plugin.name === "GhostClient" || plugin.name === "EnhancedRandomVoice") && (
                        <Tooltip text={tPlugin("This plugin was edited by official contributor (credule).")}>
                            {({ onMouseEnter, onMouseLeave }) => (
                                <button
                                    role="button"
                                    className={cl("info-button")}
                                    onMouseEnter={onMouseEnter}
                                    onMouseLeave={onMouseLeave}
                                >
                                    <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24">
                                        <path fill="currentColor" d="M14.5 8a3 3 0 1 0-2.7-4.3c-.2.4.06.86.44 1.12a5 5 0 0 1 2.14 3.08c.01.06.06.1.12.1ZM18.44 17.27c.15.43.54.73 1 .73h1.06c.83 0 1.5-.67 1.5-1.5a7.5 7.5 0 0 0-6.5-7.43c-.55-.08-.99.38-1.1.92-.06.3-.15.6-.26.87-.23.58-.05 1.3.47 1.63a9.53 9.53 0 0 1 3.83 4.78ZM12.5 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2 20.5a7.5 7.5 0 0 1 15 0c0 .83-.67 1.5-1.5 1.5a.2.2 0 0 1-.2-.16c-.2-.96-.56-1.87-.88-2.54-.1-.23-.42-.15-.42.1v2.1a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-2.1c0-.25-.31-.33-.42-.1-.32.67-.67 1.58-.88 2.54a.2.2 0 0 1-.2.16A1.5 1.5 0 0 1 2 20.5Z" />
                                    </svg>
                                </button>
                            )}
                        </Tooltip>
                    )}
                    {hasSettings && (
                        <button
                            role="button"
                            onClick={() => openPluginModal(plugin, onRestartNeeded)}
                            className={cl("info-button")}
                        >
                            <CogWheel className={cl("info-icon")} width={20} height={20} />
                        </button>
                    )}
                </div>
            } />
    );
}

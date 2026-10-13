/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { flushSettings, Settings, useSettings } from "@api/Settings";
import { PluginDependencyList } from "@components/settings/tabs/plugins";
import { PluginCard } from "@components/settings/tabs/plugins/PluginCard";
import { Button } from "@components/Button";
import { ChangeList } from "@utils/ChangeList";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import { relaunch } from "@utils/native";
import { useForceUpdater } from "@utils/react";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize } from "@utils/modal";
import { RenderModalProps } from "@vencord/discord-types";
import { closeModal, openModal, Text, Tooltip, useMemo } from "@webpack/common";
import { ReactNode } from "react";

import Plugins from "~plugins";

import { getNewPlugins, getNewSettings, KnownPluginSettingsMap, writeKnownSettings } from "./knownSettings";

const cl = classNameFactory("nc-new-plugins-");

let hasSeen = false;

interface ModalComponentProps {
    modalProps: RenderModalProps;
    newPlugins: Set<string>;
    newSettings: KnownPluginSettingsMap;
}

function NewPluginsModal({ modalProps, newPlugins, newSettings }: ModalComponentProps) {
    const settings = useSettings();
    const changes = useMemo(() => new ChangeList<string>(), []);
    const forceUpdate = useForceUpdater();

    const depMap = useMemo(() => {
        const o = {} as Record<string, string[]>;
        for (const plugin in Plugins) {
            const deps = Plugins[plugin].dependencies;
            if (deps) {
                for (const dep of deps) {
                    o[dep] ??= [];
                    o[dep].push(plugin);
                }
            }
        }
        return o;
    }, []);

    const sortedPlugins = useMemo(() => {
        const mapPlugins = (array: string[]) =>
            array
                .filter(pn => Plugins[pn])
                .map(pn => Plugins[pn])
                .sort((a, b) => a.name.localeCompare(b.name));

        return [
            ...mapPlugins([...newPlugins]),
            ...mapPlugins([...newSettings.keys()].filter(p => !newPlugins.has(p)))
        ];
    }, [newPlugins, newSettings]);

    const onRestartNeeded = (name: string) => {
        changes.handleChange(name);
        flushSettings();
        forceUpdate();
    };

    const pluginCards: ReactNode[] = [];
    const requiredPluginCards: ReactNode[] = [];

    for (const p of sortedPlugins) {
        if (p.hidden) continue;

        const isRequired = p.required || depMap[p.name]?.some(d => settings.plugins[d]?.enabled);

        if (isRequired) {
            const tooltipText = p.required
                ? "This plugin is required for LoliCord to function."
                : <PluginDependencyList deps={depMap[p.name]?.filter(d => settings.plugins[d]?.enabled)} />;

            requiredPluginCards.push(
                <Tooltip text={tooltipText} key={p.name}>
                    {({ onMouseLeave, onMouseEnter }) => (
                        <PluginCard
                            onMouseLeave={onMouseLeave}
                            onMouseEnter={onMouseEnter}
                            onRestartNeeded={onRestartNeeded}
                            disabled={true}
                            plugin={p}
                            isNew={newPlugins.has(p.name)}
                        />
                    )}
                </Tooltip>
            );
        } else {
            pluginCards.push(
                <PluginCard
                    onRestartNeeded={onRestartNeeded}
                    disabled={false}
                    plugin={p}
                    key={p.name}
                    isNew={newPlugins.has(p.name)}
                />
            );
        }
    }

    const totalCount = pluginCards.length + requiredPluginCards.length;

    const modalSize = totalCount <= 1 ? ModalSize.SMALL : totalCount === 2 ? ModalSize.MEDIUM : ModalSize.LARGE;
    const sizeClass = totalCount <= 1 ? "count-1" : totalCount === 2 ? "count-2" : "count-many";

    const handleContinue = async () => {
        await writeKnownSettings();
        flushSettings();
        if (changes.hasChanges) {
            relaunch();
        } else {
            modalProps.onClose();
        }
    };

    return (
        <ModalRoot {...modalProps} size={modalSize} className={classes(cl("root"), cl(sizeClass))}>
            <ModalHeader separator={false} className={cl("header")}>
                <div className={cl("header-text")}>
                    <div className={cl("title-row")}>
                        <Text variant="heading-lg/bold" className={cl("title")}>
                            New Plugins & Enhancements
                        </Text>
                        <span className={cl("badge")}>
                            {totalCount} NEW
                        </span>
                    </div>
                    <Text variant="text-sm/normal" className={cl("description")}>
                        Discover the latest plugins added to LoliCord. Enable and configure any you would like to use.
                    </Text>
                </div>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>

            <ModalContent className={cl("content")}>
                <div className={cl("grid")}>
                    {pluginCards}
                    {requiredPluginCards}
                </div>
            </ModalContent>

            <ModalFooter className={cl("footer")}>
                <Button
                    variant="link"
                    size="small"
                    onClick={() => {
                        Settings.plugins.NewPluginsManager.enabled = false;
                        flushSettings();
                        modalProps.onClose();
                    }}
                >
                    Don't show on startup
                </Button>

                <div className={cl("footer-right")}>
                    <Button
                        variant="secondary"
                        size="small"
                        onClick={async () => {
                            await writeKnownSettings();
                            flushSettings();
                            modalProps.onClose();
                        }}
                    >
                        Dismiss
                    </Button>
                    {changes.hasChanges && (
                        <Button
                            variant="primary"
                            size="small"
                            onClick={handleContinue}
                        >
                            Restart to Apply
                        </Button>
                    )}
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

export async function openNewPluginsModal() {
    const newPlugins = await getNewPlugins();
    const newSettings = await getNewSettings();
    if ((newPlugins.size || newSettings.size) && !hasSeen) {
        hasSeen = true;
        const modalKey = openModal(modalProps => (
            <NewPluginsModal
                modalProps={modalProps}
                newPlugins={newPlugins}
                newSettings={newSettings}
            />
        ));
    }
}

/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs, EquicordDevs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, Plugin, StartAt } from "@utils/types";
import * as Webpack from "@webpack";
import * as WebpackCommon from "@webpack/common";
import { showToast, Toasts } from "@webpack/common";

import * as Commands from "./Commands";
import * as ContextMenu from "./ContextMenu";
import * as DataStore from "./DataStore";
import * as Notifications from "./Notifications";
import { plugins, startPlugin, stopPlugin } from "./PluginManager";
import { definePluginSettings, Settings, SettingsStore } from "./Settings";
import * as Styles from "./Styles";
import { PluginMeta } from "~plugins";

const logger = new Logger("UserPlugins", "#e5c07b");

export interface DynamicCompileResult {
    id: string;
    name: string;
    code: string;
    css?: string;
    filePath: string;
    error?: string | null;
}

const loadedDynamicPlugins = new Map<string, Plugin>();

function createSandboxRequire(callerName: string) {
    return function userPluginRequire(specifier: string): any {
        if (specifier === "@webpack" || specifier === "webpack") {
            return Webpack;
        }

        if (specifier === "@webpack/common" || specifier === "webpack/common") {
            return WebpackCommon;
        }

        if (specifier === "@utils/types" || specifier === "types") {
            return {
                default: definePlugin,
                definePlugin,
                OptionType,
                StartAt,
                Devs,
                EquicordDevs
            };
        }

        if (specifier === "@utils/constants" || specifier === "constants") {
            return {
                Devs,
                EquicordDevs
            };
        }

        if (specifier === "react" || specifier === "React") {
            return WebpackCommon.React;
        }

        if (specifier === "@api" || specifier === "@api/index") {
            return {
                Settings,
                SettingsStore,
                definePluginSettings,
                Notifications,
                ContextMenu,
                Commands,
                Styles,
                DataStore
            };
        }

        if (specifier === "@api/Settings") {
            return { Settings, SettingsStore, definePluginSettings };
        }

        if (specifier === "@api/Notifications") {
            return Notifications;
        }

        if (specifier === "@api/ContextMenu") {
            return ContextMenu;
        }

        if (specifier === "@api/Commands") {
            return Commands;
        }

        if (specifier === "@api/Styles") {
            return Styles;
        }

        if (specifier === "@api/DataStore") {
            return DataStore;
        }

        if (specifier === "@utils/Logger") {
            return { Logger };
        }

        if (specifier.startsWith("@webpack/common/")) {
            const sub = specifier.replace("@webpack/common/", "");
            return (WebpackCommon as any)[sub] || (Webpack as any)[sub] || {};
        }

        logger.warn(`User plugin "${callerName}" requested unmapped module: "${specifier}"`);
        return {};
    };
}

export function loadAndRegisterPlugin(result: DynamicCompileResult): boolean {
    const { name, code, css, error } = result;

    if (error || !code) {
        logger.error(`Cannot load user plugin ${name}: ${error || "Empty code output"}`);
        return false;
    }

    try {
        const mod: { exports: any; } = { exports: {} };
        const req = createSandboxRequire(name);

        const runner = new Function("require", "exports", "module", "React", code);
        runner(req, mod.exports, mod, WebpackCommon.React);

        const pluginDef: Plugin = mod.exports.default || mod.exports;

        if (!pluginDef || typeof pluginDef !== "object" || !pluginDef.name) {
            logger.error(`User plugin in ${name} did not export a valid plugin definition.`);
            return false;
        }

        pluginDef.description ??= "";
        pluginDef.authors ??= [{ name: "User", id: 0n }];

        // Tag as user plugin
        (pluginDef as any).isUserPlugin = true;
        (pluginDef as any).isDynamic = true;

        if (css) {
            pluginDef.managedStyle = css;
        }

        // Clean up previously running instance if hot-reloading
        const existing = plugins[pluginDef.name];
        if (existing && existing.started) {
            try {
                stopPlugin(existing);
            } catch (err) {
                logger.warn(`Error stopping existing plugin ${pluginDef.name} for reload:`, err);
            }
        }

        // Register into global PluginManager
        plugins[pluginDef.name] = pluginDef;
        loadedDynamicPlugins.set(pluginDef.name, pluginDef);

        // Update or register in PluginMeta so settings tab never crashes
        PluginMeta[pluginDef.name] = {
            folderName: `userplugins/${pluginDef.name}`,
            userPlugin: true,
            ...(PluginMeta[pluginDef.name] ?? {})
        };
        PluginMeta[pluginDef.name].userPlugin = true;

        logger.info(`Registered dynamic user plugin: "${pluginDef.name}"`);

        // Check if plugin is enabled in Settings
        const enabled = (Settings as any)?.plugins?.[pluginDef.name]?.enabled ?? pluginDef.enabledByDefault ?? false;
        if (enabled) {
            startPlugin(pluginDef);
        }

        return true;
    } catch (e) {
        logger.error(`Failed to evaluate user plugin "${name}":`, e);
        return false;
    }
}

export async function syncAllUserPlugins(silent = false): Promise<number> {
    if (!VencordNative?.userplugins?.compileAll) return 0;

    try {
        const results: DynamicCompileResult[] = await VencordNative.userplugins.compileAll();
        if (!Array.isArray(results)) return 0;

        let successCount = 0;
        for (const res of results) {
            if (loadAndRegisterPlugin(res)) {
                successCount++;
            }
        }

        if (!silent && successCount > 0) {
            showToast(`${successCount} User Plugins active`, Toasts.Type.SUCCESS);
        }

        return successCount;
    } catch (e) {
        logger.error("Failed to sync user plugins from disk:", e);
        return 0;
    }
}

export async function reloadUserPlugin(name: string): Promise<boolean> {
    if (!VencordNative?.userplugins?.compile) return false;

    try {
        const res: DynamicCompileResult = await VencordNative.userplugins.compile(name);
        if (!res || res.error) {
            showToast(`Error compiling ${name}: ${res?.error || "Unknown error"}`, Toasts.Type.FAILURE);
            return false;
        }

        const success = loadAndRegisterPlugin(res);
        if (success) {
            showToast(`User plugin "${name}" reloaded!`, Toasts.Type.SUCCESS);
        } else {
            showToast(`Failed to start "${name}"`, Toasts.Type.FAILURE);
        }
        return success;
    } catch (e: any) {
        showToast(`Failed to reload ${name}: ${e?.message || e}`, Toasts.Type.FAILURE);
        return false;
    }
}

export function openUserPluginsFolder() {
    if (VencordNative?.userplugins?.openFolder) {
        VencordNative.userplugins.openFolder();
    }
}

export function initUserPluginsEngine() {
    // Initial sync
    setTimeout(() => {
        syncAllUserPlugins(true);
    }, 1500);

    // Watch for file updates
    if (VencordNative?.userplugins?.addChangeListener) {
        VencordNative.userplugins.addChangeListener(() => {
            logger.info("File change detected in userplugins folder — syncing...");
            syncAllUserPlugins(true);
        });
    }
}

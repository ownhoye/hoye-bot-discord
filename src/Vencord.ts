/*!
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
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

// DO NOT REMOVE UNLESS YOU WISH TO FACE THE WRATH OF THE CIRCULAR DEPENDENCY DEMON!!!!!!!
import "~plugins";
import "./fixWeirdAppRegionBug.css";

export * as Api from "./api";
export * as DataStore from "./api/DataStore";
export * as Plugins from "./api/PluginManager";
export * as Components from "./components";
export * as Util from "./utils";
export * as Updater from "./utils/updater";
export * as Webpack from "./webpack";
export * as WebpackPatcher from "./webpack/patchWebpack";
export { PlainSettings, Settings };

import { coreStyleRootNode, initStyles } from "@api/Styles";
import { openSettingsTabModal, UpdaterTab } from "@components/settings";
import { addHeaderBarButton, HeaderBarButton } from "@api/HeaderBar";
import { debounce } from "@shared/debounce";
import { IS_WINDOWS } from "@utils/constants";
import { createAndAppendStyle } from "@utils/css";
import { StartAt } from "@utils/types";
import { SettingsRouter } from "@webpack/common";

import { get as dsGet } from "./api/DataStore";
import { popNotice, showNotice } from "./api/Notices";
import { showNotification } from "./api/Notifications";
import { initPluginManager, PMLogger, startAllPlugins } from "./api/PluginManager";
import { initUserPluginsEngine } from "./api/UserPlugins";
import { PlainSettings, Settings, SettingsStore } from "./api/Settings";
import { getCloudSettings, putCloudSettings, shouldCloudSync } from "./api/SettingsSync/cloudSync";
import { localStorage } from "./utils/localStorage";
import { relaunch } from "./utils/native";
import { checkForUpdates, isOutdated as getIsOutdated, rebuild, update, UpdateLogger } from "./utils/updater";
import { onceReady } from "./webpack";
import { patches } from "./webpack/patchWebpack";

if (IS_REPORTER) {
    require("./debug/runReporter");
}

async function syncSettings() {
    // Check if cloud auth exists for current user before attempting sync
    if (localStorage.Vencord_cloudSyncDirection === undefined) {
        // by default, sync bi-directionally
        localStorage.Vencord_cloudSyncDirection = "both";
    }
    const hasCloudAuth = await dsGet("Vencord_cloudSecret");
    if (!hasCloudAuth) {
        if (Settings.cloud.authenticated) {
            // User switched to an account that isn't connected to cloud
            showNotification({
                title: "Cloud Settings",
                body: "Cloud sync was disabled because this account isn't connected to the cloud App. You can enable it again by connecting this account in Cloud Settings. (note: it will store your preferences separately)",
                color: "var(--yellow-360)",
                onClick: () => SettingsRouter.openUserSettings("equicord_cloud_panel")
            });
            // Disable cloud sync globally
            Settings.cloud.authenticated = false;
        }
        return;
    }

    // pre-check for local shared settings
    if (
        Settings.cloud.authenticated &&
        !hasCloudAuth // this has been enabled due to local settings share or some other bug
    ) {
        // show a notification letting them know and tell them how to fix it
        showNotification({
            title: "Cloud Integrations",
            body: "We've noticed you have cloud integrations enabled in another client! Due to limitations, you will " +
                "need to re-authenticate to continue using them. Click here to go to the settings page to do so!",
            color: "var(--yellow-360)",
            onClick: () => SettingsRouter.openUserSettings("equicord_cloud_panel")
        });
        return;
    }

    if (
        Settings.cloud.settingsSync && // if it's enabled
        Settings.cloud.authenticated && // if cloud integrations are enabled
        localStorage.Vencord_cloudSyncDirection !== "manual" // if we're not in manual mode
    ) {
        if (localStorage.Vencord_settingsDirty && shouldCloudSync("push")) {
            await putCloudSettings();
        } else if (shouldCloudSync("pull") && await getCloudSettings(false)) { // if we synchronized something (false means no sync)
            // we show a notification here instead of allowing getCloudSettings() to show one to declutter the amount of
            // potential notifications that might occur. getCloudSettings() will always send a notification regardless if
            // there was an error to notify the user, but besides that we only want to show one notification instead of all
            // of the possible ones it has (such as when your settings are newer).
            showNotification({
                title: "Cloud Settings",
                body: "Your settings have been updated! Click here to restart to fully apply changes!",
                color: "var(--green-360)",
                onClick: relaunch
            });
        }
    }

    const saveSettingsOnFrequentAction = debounce(async () => {
        if (Settings.cloud.settingsSync && Settings.cloud.authenticated && shouldCloudSync("push")) {
            await putCloudSettings();
        }
    }, 60_000);

    SettingsStore.addGlobalChangeListener(() => {
        localStorage.Vencord_settingsDirty = true;
        saveSettingsOnFrequentAction();
    });
}

const LOLICORD_LOGO_URI = "data:image/png;base64,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";

let stagedThisSession = false;

/**
 * Downloads and stages the update silently in the background.
 * No banner, no user interaction needed.
 * lolicord-index.js will apply the staged files on the next restart.
 */
async function silentlyStageUpdate() {
    if (stagedThisSession) return;
    stagedThisSession = true;

    try {
        UpdateLogger.info("Silently staging update in background...");
        // checkForUpdates() already set pendingDownloadUrl via IpcEvents.GET_UPDATES → getUpdates() → fetchUpdates()
        // So we call rebuild() (= stageUpdate) directly — no redundant API call needed.
        await rebuild(); // downloads zip to %temp%, extracts to staging dir, writes marker — no locked files touched
        UpdateLogger.info("Update staged successfully. Will be applied on next Discord restart.");

        // Notify user in the top-right corner that the update is ready to be applied on restart
        showNotification({
            id: "lolicord-update-downloaded",
            title: "Update Downloaded",
            body: "A new update has been downloaded. Restart your client to apply and discover what's new.",
            icon: "lolicord",
            type: "info",
            duration: 9000,
            actions: [
                {
                    label: "Restart Now",
                    onClick: () => relaunch()
                }
            ]
        });
    } catch (e) {
        UpdateLogger.error("Silent update staging failed", e);
        stagedThisSession = false; // allow retry on next check interval
    }
}

async function runUpdateCheck() {
    if (IS_UPDATER_DISABLED || Settings.disableAutoUpdate) return;

    try {
        const isOutdated = await checkForUpdates();
        if (IS_DISCORD_DESKTOP) VencordNative.tray.setUpdateState(isOutdated);
        if (!isOutdated) return;

        // Stage silently — no banner shown, update applies on next restart
        silentlyStageUpdate();
    } catch (err) {
        UpdateLogger.error("Failed to check for updates", err);
    }
}

function initTrayIpc() {
    if (IS_WEB || IS_UPDATER_DISABLED) return;

    VencordNative.tray.onCheckUpdates(async () => {
        try {
            const isOutdated = await checkForUpdates();
            VencordNative.tray.setUpdateState(isOutdated);

            if (isOutdated) {
                showNotice("A LoliCord update is available!", "View Update", () => openSettingsTabModal(UpdaterTab!));
            } else {
                showNotice("No updates available, you're on the latest version!", "OK", popNotice);
            }
        } catch (err) {
            UpdateLogger.error("Failed to check for updates from tray", err);
            showNotice("Failed to check for updates, check the console for more info", "OK", popNotice);
        }
    });

    VencordNative.tray.onRepair(async () => {
        try {
            await update();
            relaunch();
        } catch (err) {
            UpdateLogger.error("Failed to repair LoliCord", err);
        }
    });

    VencordNative.tray.setUpdateState(getIsOutdated);
}

import { ReactDOM } from "@webpack/common";
import { initCustomization, registerCustomizationPatches } from "customization";
import { initGlobalFont } from "customization/globalFonts/globalFontManager";

async function init() {
    await onceReady;

    void initCustomization();
    initGlobalFont();

    startAllPlugins(StartAt.WebpackReady);
    initUserPluginsEngine();

    syncSettings();
    initTrayIpc();

    if (!IS_WEB && !IS_UPDATER_DISABLED) {
        setTimeout(runUpdateCheck, 8000);
        setInterval(runUpdateCheck, 1000 * 60 * 30); // 30 minutes
    }

    // Only notify when an update has actually been applied / on new version
    try {
        const currentVersion = `v1.27.4`;
        const LS_KEY = "lolicord_installed_version";
        const lastVersion = localStorage.getItem(LS_KEY);

        if (lastVersion !== currentVersion) {
            localStorage.setItem(LS_KEY, currentVersion);
            setTimeout(() => {
                showNotification({
                    id: "lolicord-update-notify",
                    title: "LoliCord Updated",
                    body: `LoliCord updated to ${currentVersion}. Open settings to discover what's new.`,
                    icon: "lolicord",
                    type: "success",
                    duration: 6000,
                    actions: [
                        {
                            label: "Settings",
                            onClick: () => {
                                try { SettingsRouter.open("equicord_general"); } catch {}
                            }
                        }
                    ]
                });
            }, 1200);
        }
    } catch {}

    if (IS_DEV) {
        const pendingPatches = patches.filter(p => !p.all && p.predicate?.() !== false);
        if (pendingPatches.length)
            PMLogger.warn(
                "Webpack has finished initialising, but some patches haven't been applied yet.",
                "This might be expected since some Modules are lazy loaded, but please verify",
                "that all plugins are working as intended.",
                "You are seeing this warning because this is a Development build of LoliCord.",
                "\nThe following patches have not been applied:",
                "\n\n" + pendingPatches.map(p => `${p.plugin}: ${p.find}`).join("\n")
            );
    }
}

if ((window as any).__LOLICORD_INITIALIZED__) {
    console.warn("[LoliCord] Renderer already initialized — skipping duplicate execution.");
} else {
    (window as any).__LOLICORD_INITIALIZED__ = true;

    try {
        const g: any = typeof window !== "undefined" ? window : globalThis;
        g.Equicord = g.Vencord;
        g.LoliCord = g.Vencord;
        g.VencordNative ??= g.EquicordNative ?? g.LoliCordNative;
        g.EquicordNative ??= g.VencordNative;
        g.LoliCordNative ??= g.VencordNative;
    } catch {}

    registerCustomizationPatches();
    initPluginManager();
    initStyles();
    initGlobalFont();
    startAllPlugins(StartAt.Init);
    init();

    document.addEventListener("DOMContentLoaded", () => {
        startAllPlugins(StartAt.DOMContentLoaded);
    }, { once: true });
}


/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Settings } from "@api/Settings";
import { IpcEvents } from "@shared/IpcEvents";
import { SettingsStore } from "@shared/SettingsStore";
import { mergeDefaults } from "@utils/mergeDefaults";
import { app, ipcMain } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

import { DATA_DIR, NATIVE_SETTINGS_FILE, SETTINGS_DIR, SETTINGS_FILE } from "./utils/constants";

mkdirSync(SETTINGS_DIR, { recursive: true });

function readSettings<T = object>(name: string, file: string): Partial<T> {
    try {
        if (!existsSync(file)) {
            // Auto-migrate from legacy paths if primary settings file does not exist
            const legacyCandidates = [
                join(DATA_DIR, "..", "LoliCordData", "settings", "settings.json"),
                join(DATA_DIR, "..", "LoliCordData", "settings.json"),
                join(DATA_DIR, "dev", "settings", "settings.json"),
                join(DATA_DIR, "..", "LoliCord", "dev", "settings", "settings.json"),
                join(DATA_DIR, "..", "Equicord", "settings", "settings.json"),
                join(DATA_DIR, "..", "Vencord", "settings", "settings.json"),
                join(DATA_DIR, "settings.json")
            ];
            for (const cand of legacyCandidates) {
                if (existsSync(cand)) {
                    try {
                        mkdirSync(dirname(file), { recursive: true });
                        copyFileSync(cand, file);
                        const data = JSON.parse(readFileSync(file, "utf-8"));
                        console.log(`[LoliCord] Successfully migrated ${name} settings from ${cand}`);
                        return data;
                    } catch {}
                }
            }
        }
        return JSON.parse(readFileSync(file, "utf-8"));
    } catch (err: any) {
        if (err?.code !== "ENOENT")
            console.error(`Failed to read ${name} settings`, err);

        return {};
    }
}

import { debounce } from "@shared/debounce";

export const RendererSettings = new SettingsStore(readSettings<Settings>("renderer", SETTINGS_FILE));
if ((RendererSettings.plain?.plugins as any)?.EventLogs?.persistentLogs) {
    delete (RendererSettings.plain.plugins as any).EventLogs.persistentLogs;
}

function writeRendererSettingsSync() {
    try {
        if ((RendererSettings.plain?.plugins as any)?.EventLogs?.persistentLogs) {
            delete (RendererSettings.plain.plugins as any).EventLogs.persistentLogs;
        }
        writeFileSync(SETTINGS_FILE, JSON.stringify(RendererSettings.plain, null, 4));
    } catch (e) {
        console.error("Failed to write renderer settings", e);
    }
}

const saveRendererSettings = debounce(() => {
    writeRendererSettingsSync();
}, 300);

RendererSettings.addGlobalChangeListener(saveRendererSettings);

if (typeof app !== "undefined") {
    app.on("before-quit", writeRendererSettingsSync);
    app.on("will-quit", writeRendererSettingsSync);
}
process.on("beforeExit", writeRendererSettingsSync);

ipcMain.handle(IpcEvents.GET_SETTINGS_DIR, () => SETTINGS_DIR);
ipcMain.on(IpcEvents.GET_SETTINGS, e => e.returnValue = RendererSettings.plain);

ipcMain.handle(IpcEvents.SET_SETTINGS, (_, data: Settings, pathToNotify?: string) => {
    if ((data?.plugins as any)?.EventLogs?.persistentLogs) {
        delete (data.plugins as any).EventLogs.persistentLogs;
    }
    RendererSettings.setData(data, pathToNotify);
});

export interface NativeSettings {
    plugins: {
        [plugin: string]: {
            [setting: string]: any;
        };
    };
    customCspRules: Record<string, string[]>;
}

const DefaultNativeSettings: NativeSettings = {
    plugins: {},
    customCspRules: {}
};

const nativeSettings = readSettings<NativeSettings>("native", NATIVE_SETTINGS_FILE);
mergeDefaults(nativeSettings, DefaultNativeSettings);

export const NativeSettings = new SettingsStore(nativeSettings as NativeSettings);

const saveNativeSettings = debounce(() => {
    try {
        writeFileSync(NATIVE_SETTINGS_FILE, JSON.stringify(NativeSettings.plain, null, 4));
    } catch (e) {
        console.error("Failed to write native settings", e);
    }
}, 500);

NativeSettings.addGlobalChangeListener(saveNativeSettings);

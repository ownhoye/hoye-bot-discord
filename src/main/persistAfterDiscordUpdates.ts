/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * fallback for `hostUpdateHook.ts`. scans for a newer squirrel sibling
 * `app-VERSION` directory on quit and re-applies the patch there.
 */

import { app } from "electron";
import EventEmitter from "events";
import { dirname, join } from "path";

import { findStaleSibling, patchResourcesDir } from "./applyHostPatch";

function patchLatest() {
    if (process.env.DISABLE_UPDATER_AUTO_PATCHING) return;

    try {
        const stale = findStaleSibling(dirname(process.execPath));
        if (stale) {
            console.log("[LoliCord] Detected newer Discord host version at:", stale, "— applying patch now");
            patchResourcesDir(stale, join(__dirname, "patcher.js"));
        }
    } catch (err) {
        console.error("[LoliCord] Failed to repatch latest host update:", err);
    }
}

if (process.platform === "win32" || process.platform === "linux") {
    // 1. Immediately patch if newer version exists on startup
    try {
        patchLatest();
    } catch { }

    // 2. Hook EventEmitter for instant Squirrel / Discord host update completion
    try {
        EventEmitter.prototype.emit = new Proxy(EventEmitter.prototype.emit, {
            apply(target, thisArg, argArray) {
                if (argArray[0] === "host-updated") {
                    try { patchLatest(); } catch { }
                }
                return Reflect.apply(target, thisArg, argArray);
            },
        });
    } catch (err) {
        console.error("[LoliCord] Failed to proxy EventEmitter for host updates:", err);
    }

    // 3. Periodic check every 3 minutes for background-downloaded updates
    const timer = setInterval(() => {
        try { patchLatest(); } catch { }
    }, 3 * 60 * 1000);
    if (typeof timer.unref === "function") timer.unref();

    // 4. Hook app quit events
    app.on("before-quit", patchLatest);
    app.on("will-quit", patchLatest);
}

/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from "electron";

contextBridge.exposeInMainWorld("lolarchive", {
    pickFiles: () => ipcRenderer.invoke("pick-files"),
    pickFolders: () => ipcRenderer.invoke("pick-folders"),
    pickArchive: () => ipcRenderer.invoke("pick-archive"),
    describePaths: (paths: string[]) => ipcRenderer.invoke("describe-paths", paths),
    takePendingPath: () => ipcRenderer.invoke("take-pending-path"),
    create: (req: unknown) => ipcRenderer.invoke("create", req),
    open: (path: string, password?: string) => ipcRenderer.invoke("open", path, password),
    closeArchive: () => ipcRenderer.invoke("close-archive"),
    extract: (only?: string[]) => ipcRenderer.invoke("extract", only),
    cancel: () => ipcRenderer.invoke("cancel"),
    reveal: (path: string) => ipcRenderer.invoke("reveal", path),
    pathForFile: (file: File) => webUtils.getPathForFile(file),
    onProgress: (cb: (p: unknown) => void) => {
        ipcRenderer.on("progress", (_e: IpcRendererEvent, p: unknown) => cb(p));
    },
    onOpenPath: (cb: (path: string) => void) => {
        ipcRenderer.on("open-path", (_e: IpcRendererEvent, p: string) => cb(p));
    }
});

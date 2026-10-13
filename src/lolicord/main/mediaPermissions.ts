/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Session,session, systemPreferences } from "electron";

export function registerMediaPermissionsForSession(ses: Session) {
    const originalSetPermissionRequestHandler = ses.setPermissionRequestHandler.bind(ses);
    const originalSetPermissionCheckHandler = ses.setPermissionCheckHandler.bind(ses);

    const checkHandler = (_webContents: any, permission: any, _requestingOrigin: any, details: any) => {
        if (permission === "media") {
            return true;
        }
        return true;
    };

    const requestHandler = async (_webContents: any, permission: any, callback: any, details: any) => {
        if (permission === "media") {
            let granted = true;

            if (process.platform === "darwin" && "mediaTypes" in details) {
                if (details.mediaTypes?.includes("audio")) {
                    granted &&= await systemPreferences.askForMediaAccess("microphone");
                }
                if (details.mediaTypes?.includes("video")) {
                    granted &&= await systemPreferences.askForMediaAccess("camera");
                }
            }

            return callback(granted);
        }

        callback(true);
    };

    originalSetPermissionCheckHandler(checkHandler);
    originalSetPermissionRequestHandler(requestHandler);

    if ('setDevicePermissionHandler' in ses) {
        // @ts-ignore
        ses.setDevicePermissionHandler(() => true);
    }

    // Inject CSS into QxChat iframe to hide buttons since they don't work
    const { app } = require('electron');
    app.on('web-contents-created', (event: any, contents: any) => {
        contents.on('did-frame-navigate', (e: any, url: string, httpResponseCode: number, httpStatusText: string, isMainFrame: boolean, frameProcessId: number, frameRoutingId: number) => {
            if (!isMainFrame && url.includes('qxch.at')) {
                const frame = contents.mainFrame?.framesInSubtree?.find((f: any) => f.url.includes('qxch.at'));
                if (frame) {
                    frame.executeJavaScript(`
                        const inject = () => {
                            if (!document.head) {
                                setTimeout(inject, 50);
                                return;
                            }
                            const style = document.createElement('style');
                            style.textContent = \`
                                button[aria-label="Prendre une photo"],
                                button.composer__mic,
                                button[aria-label="Démarrer l’appel"],
                                button[aria-label="Copier le token du salon"] {
                                    display: none !important;
                                }
                            \`;
                            document.head.appendChild(style);
                        };
                        inject();
                    `).catch(() => {});
                }
            }
        });

        contents.on('will-attach-webview', (e: any, webPreferences: any, params: any) => {
            if (params.src && params.src.includes('qxch.at')) {
                // Allow it by not calling preventDefault
                webPreferences.preloadURL = webPreferences.preload;
            }
        });
    });
}

export function registerMediaPermissionsHandler() {
    registerMediaPermissionsForSession(session.defaultSession);
}

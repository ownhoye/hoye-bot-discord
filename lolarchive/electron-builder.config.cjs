/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** @type {import("electron-builder").Configuration} */
module.exports = {
    appId: "com.lolicord.lolarchive",
    productName: "LolArchive",
    directories: { output: "release" },
    files: ["dist/**/*", "package.json"],
    fileAssociations: [
        { ext: "lol", name: "LolArchive", description: "Archive LolArchive", role: "Editor" },
        { ext: "xxx", name: "LolArchive", description: "Archive LolArchive", role: "Editor" }
    ],
    win: { target: ["nsis", "portable"] },
    nsis: { oneClick: false, allowToChangeInstallationDirectory: true, perMachine: false },
    portable: { artifactName: "LolArchive-${version}-portable.exe" },
    linux: { target: ["AppImage"], category: "Utility" },
    mac: { target: ["dmg"], category: "public.app-category.utilities" }
};

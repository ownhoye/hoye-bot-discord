/**
 * paths.js — Exact port of C# DetectDiscord().
 *
 * C# returns the `resources` path (app-X.X.XXXX\resources), not discord_desktop_core.
 * This is the single source of truth for all other actions.
 */

const fs   = require("fs");
const path = require("path");

export const platforms = {
    stable:      "Discord",
    ptb:         "Discord PTB",
    canary:      "Discord Canary"
};

// Internal channel → folder name (no spaces)
const channelDirs = {
    stable:      "Discord",
    ptb:         "DiscordPTB",
    canary:      "DiscordCanary"
};

export const locations = {stable: "", ptb: "", canary: ""};


/**
 * Mirrors C# DetectDiscord():
 *   foreach dir in Directory.GetDirectories(dPath, "app-*")
 *       var resources = Path.Combine(dir, "resources");
 *       if (Directory.Exists(resources)) → add to list
 */
const getDiscordPath = (channel) => {
    try {
        const channelDir = channelDirs[channel];
        const localAppData = process.env.LOCALAPPDATA || "";
        let basedir = path.join(localAppData, channelDir);

        if (!fs.existsSync(basedir)) {
            // Fallback: ProgramData\%username%\DiscordXxx
            const programData = process.env.PROGRAMDATA || "";
            const username    = process.env.USERNAME || "";
            basedir = path.join(programData, username, channelDir);
        }
        if (!fs.existsSync(basedir)) return "";

        // Find all app-X.X.XXXX directories, take the latest
        const versions = fs.readdirSync(basedir)
            .filter(f => f.startsWith("app-") && fs.lstatSync(path.join(basedir, f)).isDirectory())
            .sort()
            .reverse();
        if (!versions.length) return "";

        const resources = path.join(basedir, versions[0], "resources");
        return fs.existsSync(resources) ? resources : "";
    } catch (_) {
        return "";
    }
};

for (const channel in channelDirs) {
    locations[channel] = getDiscordPath(channel);
}

/**
 * Returns the base browse path for a channel (used by the file picker).
 */
export const getBrowsePath = (channel) => {
    return path.join(process.env.LOCALAPPDATA || "", channelDirs[channel]);
};

/**
 * Validates a manually-entered path and returns the resources path if valid,
 * or "" if invalid.  Mirrors the logic the UI needs.
 */
export const validatePath = (_channel, proposedPath) => {
    // Accept: the resources folder directly
    if (fs.existsSync(path.join(proposedPath, "app.asar"))) return proposedPath;
    // Accept: app-X.X.XXXX folder → resources subfolder
    const res = path.join(proposedPath, "resources");
    if (fs.existsSync(path.join(res, "app.asar"))) return res;
    return "";
};

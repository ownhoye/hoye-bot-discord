import {dialog, shell} from "electron";
import phin from "phin";
const semverGreaterThan = require("semver/functions/gt");
const {version} = require("../../package.json");

const getJSON = phin.defaults({
    method: "GET",
    parse: "json",
    headers: {"User-Agent": `LoliCord Installer/${version}`},
    followRedirects: true
});

/* eslint-disable no-console */
export default async function () {
    const downloadUrl = "https://api.github.com/repos/ownhoye/hoye-bot-discord/releases/latest";
    console.info(`LoliCord Installer ${version}`);

    try {
        const response = await getJSON(downloadUrl);
        const latestRelease = response.body;
        const latestVersion = latestRelease.tag_name;

        if (semverGreaterThan(latestVersion, version)) {
            console.info(`Found new release ${latestVersion}`);

            const result = await dialog.showMessageBox({
                title: "New Installer Version Available",
                message: `A new version of the LoliCord installer is available. Click "Download" to download the newest version.`,
                buttons: ["Download", "Later"],
                defaultId: 0,
                cancelId: 1
            });

            if (result.response === 0) {
                await shell.openExternal(latestRelease.html_url);
                process.exit(0);
            }
            
        }
        else {
            console.info(`The installer is up to date.`);
        }
    }
    catch (err) {
        console.error("Failed to check for updates.", err);
    }
}

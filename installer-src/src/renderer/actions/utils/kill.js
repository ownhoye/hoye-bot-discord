const path = require("path");
const fs   = require("fs");
const {execSync, exec} = require("child_process");

function getProcName(resPath) {
    if (resPath.includes("DiscordPTB"))          return "DiscordPTB";
    if (resPath.includes("DiscordCanary"))        return "DiscordCanary";
    if (resPath.includes("DiscordDevelopment"))   return "DiscordDevelopment";
    return "Discord";
}

function killByName(name) {
    try { execSync(`taskkill /IM "${name}" /F /T`, { stdio: "ignore" }); } catch (_) {}
}

function isRunning(exeName) {
    try {
        const out = execSync(`tasklist /FI "IMAGENAME eq ${exeName}" /NH`, { encoding: "utf8" });
        return out.toLowerCase().includes(exeName.toLowerCase());
    } catch (_) { return false; }
}

async function waitForExit(exeName, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!isRunning(exeName)) return true;
        await new Promise(r => setTimeout(r, 150));
    }
    return !isRunning(exeName);
}

export async function killDiscord(resPath, log) {
    const procName = getProcName(resPath);
    const exeName  = procName + ".exe";

    if (log) log(`Fermeture de ${procName}...`);

    // ── Étape 1 : Fermeture gracieuse via Squirrel (Update.exe --processStop) ─────
    // Donne à Discord le temps de flusher ses données de session (localStorage,
    // cookies, Preferences) avant qu'on touche au dossier resources/.
    // Sans ça, taskkill /F tue le process sans flush → token perdu → déconnexion.
    try {
        const appVersionDir = path.join(resPath, "..");
        const channelDir    = path.join(appVersionDir, "..");
        const updateExe     = path.join(channelDir, "Update.exe");
        if (fs.existsSync(updateExe)) {
            if (log) log(`Arrêt gracieux via Update.exe --processStop ${exeName}...`);
            exec(`"${updateExe}" --processStop ${exeName}`);
            // Attendre jusqu'à 4s que Discord se ferme proprement
            const exitedGracefully = await waitForExit(exeName, 4000);
            if (exitedGracefully) {
                // Attendre 600ms supplémentaires pour s'assurer que le flush
                // de la session Electron (LevelDB / Preferences) est terminé
                await new Promise(r => setTimeout(r, 600));
                if (log) log(`${procName} fermé proprement.`);
                return;
            }
            if (log) log(`Fermeture gracieuse expirée, passage en force kill...`);
        }
    } catch (_) {}

    // ── Étape 2 : Force kill (seulement si la fermeture gracieuse a échoué) ───────
    killByName(exeName);

    const helperVariants = [
        `${procName} Helper.exe`,
        `${procName} Helper (GPU).exe`,
        `${procName} Helper (Plugin).exe`,
        `${procName} Helper (Renderer).exe`,
    ];
    for (const h of helperVariants) killByName(h);

    try {
        const appVersionDir = path.join(resPath, "..");
        const channelDir    = path.join(appVersionDir, "..");
        const updateExe     = path.join(channelDir, "Update.exe");
        if (fs.existsSync(updateExe)) {
            killByName("Update.exe");
        }
    } catch (_) {}

    // Attendre que le process disparaisse (max 4s) + 800ms de flush post-kill
    await waitForExit(exeName, 4000);
    await new Promise(r => setTimeout(r, 800));

    if (log) log(`${procName} fermé.`);
}

export function startDiscord(resPath) {
    const procName = getProcName(resPath);
    const exeName  = procName + ".exe";
    const updateExe = path.join(resPath, "..", "..", "Update.exe");
    if (fs.existsSync(updateExe)) {
        try {
            exec(`"${updateExe}" --processStart ${exeName}`);
        } catch (_) {}
    }
}
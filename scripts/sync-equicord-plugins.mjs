import fs from 'fs';
import path from 'path';

const equiPlugins = 'C:\\Users\\zzafi\\Desktop\\equi\\equicord\\src\\plugins';
const equiEquiPlugins = 'C:\\Users\\zzafi\\Desktop\\equi\\equicord\\src\\equicordplugins';
const targetPlugins = 'c:\\Users\\zzafi\\Documents\\GitHub\\lolicord\\src\\plugins';

const skipDirs = new Set([
    '_core',
    'badges',
    'messagePeek'
]);

if (fs.existsSync('src/lolicordplugins')) {
    fs.readdirSync('src/lolicordplugins').forEach(p => skipDirs.add(p));
}

function copyDirRecursive(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

console.log('[Sync] Updating plugins from Equicord src/plugins...');
let updatedCount = 0;

if (fs.existsSync(equiPlugins)) {
    const entries = fs.readdirSync(equiPlugins, { withFileTypes: true });
    for (const entry of entries) {
        if (skipDirs.has(entry.name)) continue;
        const srcPath = path.join(equiPlugins, entry.name);
        const destPath = path.join(targetPlugins, entry.name);

        if (entry.name === '_api') {
            // Copy individual _api files except badges
            const apiEntries = fs.readdirSync(srcPath, { withFileTypes: true });
            for (const apiEntry of apiEntries) {
                if (apiEntry.name === 'badges') continue;
                const apiSrc = path.join(srcPath, apiEntry.name);
                const apiDest = path.join(destPath, apiEntry.name);
                if (apiEntry.isDirectory()) {
                    copyDirRecursive(apiSrc, apiDest);
                } else {
                    fs.copyFileSync(apiSrc, apiDest);
                }
            }
        } else if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
            updatedCount++;
        }
    }
}

console.log('[Sync] Updating plugins from Equicord src/equicordplugins...');
let equiCount = 0;

if (fs.existsSync(equiEquiPlugins)) {
    const entries = fs.readdirSync(equiEquiPlugins, { withFileTypes: true });
    for (const entry of entries) {
        if (skipDirs.has(entry.name)) continue;
        const srcPath = path.join(equiEquiPlugins, entry.name);
        const destPath = path.join(targetPlugins, entry.name);

        if (entry.name === '_api') {
            // Copy individual _api files
            const apiEntries = fs.readdirSync(srcPath, { withFileTypes: true });
            for (const apiEntry of apiEntries) {
                if (apiEntry.name === 'badges') continue;
                const apiSrc = path.join(srcPath, apiEntry.name);
                const apiDest = path.join(targetPlugins, '_api', apiEntry.name);
                if (apiEntry.isDirectory()) {
                    copyDirRecursive(apiSrc, apiDest);
                } else {
                    fs.copyFileSync(apiSrc, apiDest);
                }
            }
        } else if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
            equiCount++;
        }
    }
}

console.log(`[Sync] Finished! Synced ${updatedCount} Vencord plugins and ${equiCount} Equicord plugins into src/plugins.`);

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..', '..');
const distDir = path.join(rootDir, 'dist', 'desktop');

console.log("[collect] Collecting assets into dist/desktop...");

if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

function copyIfExists(src, dst) {
    if (fs.existsSync(src)) {
        if (fs.statSync(src).isDirectory()) {
            fs.cpSync(src, dst, { recursive: true });
        } else {
            fs.copyFileSync(src, dst);
        }
        return true;
    }
    return false;
}


// ── multi-instance icons ────────────────────────────────────────────────────
const iconsSrc         = path.join(rootDir, "assets", "multi-instance-icons");
const outMIIcons       = path.join(distDir, "multi-instance-icons");
const outLoliCordIcons = path.join(rootDir, "dist", "lolicord", "multi-instance-icons");

fs.mkdirSync(outMIIcons, { recursive: true });
fs.mkdirSync(outLoliCordIcons, { recursive: true });

if (fs.existsSync(iconsSrc)) {
    let copied = 0;
    const files = fs.readdirSync(iconsSrc).filter(f => f.endsWith('.ico'));
    for (const file of files) {
        const src = path.join(iconsSrc, file);
        fs.copyFileSync(src, path.join(outMIIcons, file));
        fs.copyFileSync(src, path.join(outLoliCordIcons, file));
        copied++;
    }
    console.log(`[collect] ✅ ${copied} multi-instance icons copied from assets/multi-instance-icons`);
} else {
    console.warn("[collect] ⚠️ assets/multi-instance-icons NOT FOUND");
}

console.log("\n[collect] Done collecting assets!");

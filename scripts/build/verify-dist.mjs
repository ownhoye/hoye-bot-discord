// verify-dist.mjs - Verifie dist/desktop avant de zipper
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..', '..');
const distDir = path.join(rootDir, 'dist', 'desktop');

const REQUIRED_FILES = ['patcher.js', 'renderer.js', 'preload.js'];
const REQUIRED_DIRS = [];
const REQUIRED_MODULE_FILES = [];

let errors = 0;
console.log('[verify] Checking dist/desktop integrity...');

for (const f of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(distDir, f.replace(/\//g, path.sep)))) {
        console.error('[verify] MISSING FILE: ' + f); errors++;
    }
}

if (errors === 0) {
    console.log('[verify] All checks passed. Safe to zip.');
    process.exit(0);
} else {
    console.error('[verify] ' + errors + ' problem(s) found.');
    process.exit(1);
}

import fs from "fs";
import path from "path";

const filepath = path.join(process.cwd(), "src/api/i18n.ts");
let content = fs.readFileSync(filepath, "utf8");

// Regex to find all translation entries: "Some Key": { fr: "...", ... },
const regex = /^(\s*["'])(.*?)(["']\s*:\s*\{)(.*?)(\},?)$/gm;

let match;
let missing = [];

while ((match = regex.exec(content)) !== null) {
    const key = match[2];
    const trans = match[4];
    if (!trans.includes('ar:')) {
        missing.push({ key, fullMatch: match[0], start: match.index, end: match.index + match[0].length });
    }
}

console.log("Missing translations for AR:", missing.length);

async function translateBatch(keys) {
    const SEP = "\n⟦SEP⟧\n";
    const combined = keys.join(SEP);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(combined)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const data = await res.json();
    let fullTranslated = "";
    if (Array.isArray(data[0])) {
        fullTranslated = data[0].map(pair => pair[0] || "").join("");
    }
    return fullTranslated.split(SEP).map(s => s.trim());
}

async function run() {
    const batchSize = 30;
    for (let i = 0; i < missing.length; i += batchSize) {
        console.log(`Translating ${i} to ${i + batchSize}`);
        const batch = missing.slice(i, i + batchSize);
        const keys = batch.map(b => b.key);
        try {
            const translated = await translateBatch(keys);
            for (let j = 0; j < batch.length; j++) {
                if (translated[j]) {
                    const b = batch[j];
                    const safeTrans = translated[j].replace(/"/g, '\\"');
                    content = content.replace(b.fullMatch, b.fullMatch.replace('}', `, ar: "${safeTrans}" }`));
                }
            }
        } catch (e) {
            console.error(e);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    fs.writeFileSync(filepath, content);
    console.log("Done.");
}

run();

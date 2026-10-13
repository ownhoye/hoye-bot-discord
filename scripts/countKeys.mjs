import { readFileSync } from "fs";

const content = readFileSync("src/lolicordplugins/autoTranslateLoliCord/index.ts", "utf8");
const matches = content.match(/"en":/g) || [];
console.log(`Total valid translated keys in autoTranslateLoliCord: ${matches.length}`);

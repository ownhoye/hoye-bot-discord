import { readFileSync } from "fs";

const c = readFileSync("src/api/i18n.ts", "utf8");
const keys = [];
const regex = /^\s*"([^"]+)":\s*\{/gm;
let m;
while ((m = regex.exec(c)) !== null) keys.push(m[1]);
console.log("Total keys in i18n:", keys.length);
console.log("Sample:", keys.slice(0, 10));

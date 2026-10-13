import fs from "fs";
const buf = fs.readFileSync("C:\\Users\\zzafi\\Documents\\GitHub\\lolicord\\image.png");
const b64 = buf.toString("base64");
fs.writeFileSync("src/lolicordplugins/lolicordOfficialDM/avatarData.ts", `export const LOLICORD_AVATAR_BASE64 = "data:image/png;base64,${b64}";\n`);
console.log("Generated avatarData.ts successfully, length:", b64.length);

import fs from "fs";
let content = fs.readFileSync("src/api/i18n.ts", "utf8");
// Fix any unterminated string literals caused by newlines inside "ar: "..."
content = content.replace(/ar:\s*"([^"]*?)(?:\r?\n)([^"]*?)"/g, (m, p1, p2) => {
    return `ar: "${p1} ${p2}"`;
});
// Loop until all newlines inside ar: "..." are removed
let oldContent;
do {
    oldContent = content;
    content = content.replace(/ar:\s*"([^"]*?)(?:\r?\n)([^"]*?)"/g, (m, p1, p2) => `ar: "${p1} ${p2}"`);
} while (oldContent !== content);

fs.writeFileSync("src/api/i18n.ts", content);

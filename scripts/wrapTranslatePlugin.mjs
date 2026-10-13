import { readFileSync, writeFileSync } from "fs";

const files = [
    "src/lolicordplugins/translate/TranslateIcon.tsx",
    "src/lolicordplugins/translate/TranslateModal.tsx",
    "src/lolicordplugins/translate/TranslationAccessory.tsx"
];

for (const file of files) {
    let content = readFileSync(file, "utf8");
    if (!content.includes('from "../autoTranslateLoliCord"')) {
        content = 'import { t } from "../autoTranslateLoliCord";\n' + content;
    }

    content = content.replace(/>\s*You just enabled Auto Translate! Your messages will now be\s*</g, '>{t("You just enabled Auto Translate! Your messages will now be")}<');
    content = content.replace(/>\s*automatically translated\s*</g, '>{t("automatically translated")}<');
    content = content.replace(/>\s*before being sent.\s*</g, '>{t("before being sent.")}<');
    content = content.replace(/>\s*Dismiss\s*</g, '>{t("Dismiss")}<');

    writeFileSync(file, content, "utf8");
}
console.log("Wrapped raw strings in translate plugin.");

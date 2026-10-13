import { execSync } from "child_process";
import { copyFileSync, existsSync, statSync } from "fs";
import { join } from "path";

const localAppData = process.env.LOCALAPPDATA;
const nupkg = join(localAppData, "Discord", "packages", "Discord-1.0.9253-full.nupkg");
const target1 = join(localAppData, "Discord", "app-1.0.9255", "resources", "_app.asar");
const target2 = join(localAppData, "Discord", "app-1.0.9254", "resources", "_app.asar");

if (existsSync(nupkg)) {
    console.log("Extracting from nupkg:", nupkg);
    execSync(`tar -xf "${nupkg}" -C "${join(localAppData, "Discord", "app-1.0.9255", "resources")}" lib/net45/resources/app.asar`);
    const extracted = join(localAppData, "Discord", "app-1.0.9255", "resources", "lib", "net45", "resources", "app.asar");
    if (existsSync(extracted)) {
        copyFileSync(extracted, target1);
        copyFileSync(extracted, target2);
        console.log("Restored _app.asar! Size:", statSync(target1).size);
    }
}

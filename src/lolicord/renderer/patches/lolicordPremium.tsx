/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { pushPremiumSections, renderPremiumTab } from "../premium";
import { addPatch } from "./shared";

addPatch({
    patches: [
        // User Profile Modal v2 tab bar
        {
            find: "#{intl::USER_PROFILE_ACTIVITY}",
            replacement: {
                match: /(\i)\.id!==\i\?\.id&&\i&&\(.{0,300}\.MUTUAL_GUILDS\}\)\)(?=,(\i))/,
                replace: "$&,$self.pushPremiumSections($2,$1)",
            }
        },
        // User Profile Modal v2 tab content
        {
            find: ".WIDGETS?",
            replacement: {
                match: /(\i)===\i\.\i\.WISHLIST/,
                replace: "$1===\"MY_STORY\"||$1===\"FAV_SONGS\"?$self.renderPremiumTab($1,arguments[0]):$&",
            }
        }
    ],

    pushPremiumSections(sections: any[], user: any) {
        pushPremiumSections(sections, user);
    },

    renderPremiumTab(section: string, props: any) {
        return renderPremiumTab(section, props);
    }
});

/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Heading, Paragraph } from "@LoliCord/types/components";
import { Margins } from "@LoliCord/types/utils";
import { Select } from "@LoliCord/types/webpack/common";

import { SimpleErrorBoundary } from "../SimpleErrorBoundary";
import { SettingsComponent } from "./Settings";

export const WindowsTransparencyControls: SettingsComponent = ({ settings }) => {
    if (!VesktopNative.app.supportsWindowsTransparency()) return null;

    return (
        <div>
            <Heading tag="h5">Transparency Options</Heading>
            <Paragraph className={Margins.bottom8}>
                Requires a full restart. You will need a theme that supports transparency for this to work.
            </Paragraph>

            <SimpleErrorBoundary>
                <Select
                    placeholder="None"
                    options={[
                        {
                            label: "None",
                            value: "none",
                            default: true
                        },
                        {
                            label: "Mica (incorporates system theme + desktop wallpaper to paint the background)",
                            value: "mica"
                        },
                        { label: "Tabbed (variant of Mica with stronger background tinting)", value: "tabbed" },
                        {
                            label: "Acrylic (blurs the window behind LoliCord for a translucent background)",
                            value: "acrylic"
                        }
                    ]}
                    closeOnSelect={true}
                    select={v => (settings.transparencyOption = v)}
                    isSelected={v => v === settings.transparencyOption}
                    serialize={s => s}
                />
            </SimpleErrorBoundary>
        </div>
    );
};

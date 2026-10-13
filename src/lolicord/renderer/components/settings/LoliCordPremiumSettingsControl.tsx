/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, FormSwitch, React, SettingsRouter, useEffect, useState } from "@webpack/common";
import {
    DEFAULT_PREMIUM_SETTINGS,
    getPremiumSettings,
    setPremiumSettings,
    subscribePremiumSettings,
    syncOwnDataToCloud
} from "../../premium/sync";
import type { LoliCordPremiumSettings } from "../../premium/types";

export function LoliCordPremiumSettingsControl() {
    const [st, setSt] = useState<LoliCordPremiumSettings>(DEFAULT_PREMIUM_SETTINGS);

    useEffect(() => {
        void getPremiumSettings().then(s => setSt(s));
        return subscribePremiumSettings(next => setSt(next));
    }, []);

    const update = (patch: Partial<LoliCordPremiumSettings>) => {
        void setPremiumSettings(patch).then(next => {
            setSt(next);
            void syncOwnDataToCloud();
        });
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
            <FormSwitch
                value={st.enabled}
                onChange={(v: boolean) => update({ enabled: v })}
                note="Active l'ensemble du système LoliCord Premium (Stories, Musiques favorites et Effets animés de profil synchronisés via Discord OAuth2)."
                hideBorder
            >
                Activer LoliCord Premium
            </FormSwitch>

            {st.enabled && (
                <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    padding: "12px 16px",
                    background: "var(--background-secondary, #2b2d31)",
                    borderRadius: 8,
                    border: "1px solid rgba(255, 255, 255, 0.06)"
                }}>
                    <FormSwitch
                        value={st.storiesEnabled}
                        onChange={(v: boolean) => update({ storiesEnabled: v })}
                        note="Affiche les cercles d'avatar et l'onglet Stories sur les profils."
                        hideBorder
                    >
                        Stories & Highlights
                    </FormSwitch>

                    <FormSwitch
                        value={st.favSongsEnabled}
                        onChange={(v: boolean) => update({ favSongsEnabled: v })}
                        note="Affiche l'onglet Mes Musiques Favorites sur le profil."
                        hideBorder
                    >
                        Musiques Favorites
                    </FormSwitch>

                    <FormSwitch
                        value={st.profileEffectsEnabled}
                        onChange={(v: boolean) => update({ profileEffectsEnabled: v })}
                        note="Affiche les bannières animées et les effets de pseudo personnalisés."
                        hideBorder
                    >
                        Effets de Profil
                    </FormSwitch>

                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                        <Button
                            color={Button.Colors.BRAND}
                            size={Button.Sizes.SMALL}
                            onClick={() => SettingsRouter?.openUserSettings?.("lolicord_customization_panel")}
                        >
                            Ouvrir le panneau Customization
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

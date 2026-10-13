/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, FormSwitch, React, showToast, Toasts, useEffect, useState, UserStore } from "@webpack/common";
import {
    DEFAULT_PREMIUM_SETTINGS,
    disconnectDiscordOAuth,
    getPremiumSettings,
    isOAuthAuthenticated,
    promptDiscordOAuth,
    setPremiumSettings,
    syncOwnDataToCloud
} from "../sync";
import type { LoliCordPremiumSettings } from "../types";
import { FavSongsSettingsSection } from "./FavSongsSettingsSection";
import { ProfileEffectsSettingsSection } from "./ProfileEffectsSettingsSection";
import { StoriesSettingsSection } from "./StoriesSettingsSection";

const DiscordIcon = () => (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8 }}>
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.075.075 0 0 1 .079.01c.12.098.245.195.372.288a.077.077 0 0 1-.006.127c-.598.35-1.22.652-1.873.894a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
);

const RefreshIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
);

type ActiveTab = "stories" | "songs" | "effects";

export function LoliCordPremiumDashboard() {
    const [settings, setSettings] = useState<LoliCordPremiumSettings>(DEFAULT_PREMIUM_SETTINGS);
    const [isAuthed, setIsAuthed] = useState(false);
    const [activeTab, setActiveTab] = useState<ActiveTab>("stories");
    const [syncing, setSyncing] = useState(false);

    const currentUser = UserStore.getCurrentUser();

    const refreshAuthAndSettings = async () => {
        const [st, authed] = await Promise.all([
            getPremiumSettings(),
            isOAuthAuthenticated(),
        ]);
        setSettings(st);
        setIsAuthed(authed);
    };

    useEffect(() => {
        void refreshAuthAndSettings();
    }, []);

    const updateSt = async (patch: Partial<LoliCordPremiumSettings>) => {
        const next = await setPremiumSettings(patch);
        setSettings(next);
        void syncOwnDataToCloud();
    };

    const handleOAuthLogin = async () => {
        const token = await promptDiscordOAuth();
        if (token) {
            setIsAuthed(true);
            showToast("Identifié avec succès via Discord OAuth2", Toasts.Type.SUCCESS);
            void syncOwnDataToCloud();
        } else {
            showToast("Identification annulée", Toasts.Type.INFO);
        }
    };

    const handleDisconnect = async () => {
        await disconnectDiscordOAuth();
        setIsAuthed(false);
        showToast("Session OAuth2 déconnectée", Toasts.Type.INFO);
    };

    const handleManualSync = async () => {
        setSyncing(true);
        const ok = await syncOwnDataToCloud();
        setSyncing(false);
        if (ok) {
            showToast("Données synchronisées avec succès", Toasts.Type.SUCCESS);
        } else {
            showToast("Échec de la synchronisation (vérifiez votre connexion)", Toasts.Type.WARNING);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "8px 0 32px 0" }}>
            {/* Header */}
            <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--header-primary, #ffffff)", margin: "0 0 6px 0" }}>
                    LoliCord Premium
                </h2>
                <p style={{ fontSize: 14, color: "var(--text-muted, #949ba4)", margin: 0, lineHeight: 1.5 }}>
                    Système de profil avancé comprenant des Stories & Highlights avec musique, un lecteur de morceaux favoris sur votre profil, et des bannières animées avec effets de pseudo en direct.
                </p>
            </div>

            {/* OAuth2 Status Card */}
            <div style={{
                background: "var(--background-secondary, #2b2d31)",
                border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
                borderRadius: 8,
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: isAuthed ? "var(--status-positive, #23a55a)" : "var(--status-warning, #f0b232)",
                        boxShadow: isAuthed ? "0 0 8px rgba(35, 165, 90, 0.5)" : "none"
                    }} />

                    <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--header-primary, #ffffff)" }}>
                            {isAuthed
                                ? `Identifié via Discord OAuth2 (${currentUser?.username ?? "Utilisateur"})`
                                : "Non identifié via Discord OAuth2"}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted, #949ba4)" }}>
                            {isAuthed
                                ? "Vos Stories, Musiques Favorites et Effets sont synchronisés en direct sur le cloud LoliCord."
                                : "Connectez-vous avec Discord pour sauvegarder et partager vos données de profil publiquement."}
                        </div>
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {isAuthed ? (
                        <>
                            <Button
                                color={Button.Colors.PRIMARY}
                                size={Button.Sizes.SMALL}
                                onClick={handleManualSync}
                                disabled={syncing}
                            >
                                <RefreshIcon />
                                {syncing ? "Synchronisation..." : "Synchroniser"}
                            </Button>
                            <Button
                                color={Button.Colors.RED}
                                size={Button.Sizes.SMALL}
                                onClick={handleDisconnect}
                            >
                                Déconnexion
                            </Button>
                        </>
                    ) : (
                        <Button
                            color={Button.Colors.BRAND}
                            onClick={handleOAuthLogin}
                        >
                            <DiscordIcon />
                            S'identifier avec Discord
                        </Button>
                    )}
                </div>
            </div>

            {/* Master and Sub Switches */}
            <div style={{
                background: "var(--background-secondary-alt, #1e1f22)",
                padding: "16px 20px",
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                gap: 12
            }}>
                <FormSwitch
                    value={settings.enabled}
                    onChange={(v: boolean) => updateSt({ enabled: v })}
                    note="Active l'ensemble du système LoliCord Premium (onglet profil, cercles d'avatar et effets)."
                    hideBorder
                >
                    Activer LoliCord Premium
                </FormSwitch>

                {settings.enabled && (
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: 12,
                        paddingTop: 12,
                        borderTop: "1px solid rgba(255, 255, 255, 0.06)"
                    }}>
                        <FormSwitch
                            value={settings.storiesEnabled}
                            onChange={(v: boolean) => updateSt({ storiesEnabled: v })}
                            note="Cercles d'avatar et onglet My Story"
                            hideBorder
                        >
                            Stories & Highlights
                        </FormSwitch>

                        <FormSwitch
                            value={settings.favSongsEnabled}
                            onChange={(v: boolean) => updateSt({ favSongsEnabled: v })}
                            note="Onglet My Fav Song sur le profil"
                            hideBorder
                        >
                            Musiques Favorites
                        </FormSwitch>

                        <FormSwitch
                            value={settings.profileEffectsEnabled}
                            onChange={(v: boolean) => updateSt({ profileEffectsEnabled: v })}
                            note="Bannières animées & effets de pseudo"
                            hideBorder
                        >
                            Effets de Profil
                        </FormSwitch>
                    </div>
                )}
            </div>

            {/* Tab Navigation */}
            {settings.enabled && (
                <>
                    <div style={{
                        display: "flex",
                        gap: 8,
                        borderBottom: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))",
                        paddingBottom: 10
                    }}>
                        <Button
                            color={activeTab === "stories" ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                            size={Button.Sizes.SMALL}
                            onClick={() => setActiveTab("stories")}
                        >
                            Stories & Highlights
                        </Button>
                        <Button
                            color={activeTab === "songs" ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                            size={Button.Sizes.SMALL}
                            onClick={() => setActiveTab("songs")}
                        >
                            Musiques Favorites
                        </Button>
                        <Button
                            color={activeTab === "effects" ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                            size={Button.Sizes.SMALL}
                            onClick={() => setActiveTab("effects")}
                        >
                            Effets de Profil
                        </Button>
                    </div>

                    {/* Active Sub-tab View */}
                    <div>
                        {activeTab === "stories" && <StoriesSettingsSection />}
                        {activeTab === "songs" && <FavSongsSettingsSection />}
                        {activeTab === "effects" && <ProfileEffectsSettingsSection />}
                    </div>
                </>
            )}
        </div>
    );
}

/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@api/i18n";
import { FormSwitch } from "@components/FormSwitch";
import { Button, React, showToast, Toasts, useEffect, useState, UserStore } from "@webpack/common";
import { FavSongsSettingsSection } from "./components/FavSongsSettingsSection";
import { ProfileEffectsSettingsSection } from "./components/ProfileEffectsSettingsSection";
import { StoriesSettingsSection } from "./components/StoriesSettingsSection";
import {
    DEFAULT_PREMIUM_SETTINGS,
    disconnectDiscordOAuth,
    getCachedPremiumSettings,
    getPremiumSettings,
    isOAuthAuthenticated,
    promptDiscordOAuth,
    setPremiumSettings,
    syncOwnDataToCloud
} from "./sync";
import type { LoliCordPremiumSettings } from "./types";

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

const CameraIcon = () => (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
        <circle cx="12" cy="13" r="3" />
    </svg>
);

const MusicIcon = () => (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
    </svg>
);

const SparklesIcon = () => (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
);

type ActiveTab = "stories" | "songs" | "effects";

export function CustomizationTab() {
    const [settings, setSettings] = useState<LoliCordPremiumSettings>(getCachedPremiumSettings);
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
        const next = await setPremiumSettings({ ...patch, enabled: true });
        setSettings(next);
        void syncOwnDataToCloud();
    };

    const handleOAuthLogin = async () => {
        const token = await promptDiscordOAuth();
        if (token) {
            setIsAuthed(true);
            showToast(t("Successfully authenticated via Discord OAuth2"), Toasts.Type.SUCCESS);
            void syncOwnDataToCloud();
        } else {
            showToast(t("Authentication cancelled"), Toasts.Type.INFO);
        }
    };

    const handleDisconnect = async () => {
        await disconnectDiscordOAuth();
        setIsAuthed(false);
        showToast(t("OAuth2 session disconnected"), Toasts.Type.INFO);
    };

    const handleManualSync = async () => {
        setSyncing(true);
        const ok = await syncOwnDataToCloud();
        setSyncing(false);
        if (ok) {
            showToast(t("Data synchronized successfully"), Toasts.Type.SUCCESS);
        } else {
            showToast(t("Synchronization failed (check your connection)"), Toasts.Type.WARNING);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "8px 0 32px 0" }}>
            {/* Header */}
            <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--header-primary, #ffffff)", margin: "0 0 6px 0" }}>
                    {t("Customization")}
                </h2>
                <p style={{ fontSize: 14, color: "var(--text-muted, #949ba4)", margin: 0, lineHeight: 1.5 }}>
                    {t("Customize your profile and presence on LoliCord with exclusive options: Stories, Favorite Music Player, and Animated Visual Effects.")}
                </p>
            </div>

            {/* OAuth2 Status Card */}
            <div style={{
                background: "var(--background-secondary, #2b2d31)",
                border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))",
                borderRadius: 8,
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12
            }}>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--header-primary, #ffffff)" }}>
                        {isAuthed
                            ? `${t("Identified via Discord OAuth2")} (${currentUser?.username ?? t("User")})`
                            : t("Not identified via Discord OAuth2")}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted, #949ba4)", marginTop: 2 }}>
                        {isAuthed
                            ? t("Your customization settings are live synced to the LoliCord cloud.")
                            : t("Log in with Discord OAuth2 to sync and share your customization publicly.")}
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
                                {syncing ? t("Syncing...") : t("Sync")}
                            </Button>
                            <Button
                                color={Button.Colors.RED}
                                size={Button.Sizes.SMALL}
                                onClick={handleDisconnect}
                            >
                                {t("Disconnect")}
                            </Button>
                        </>
                    ) : (
                        <Button
                            color={Button.Colors.BRAND}
                            onClick={handleOAuthLogin}
                        >
                            <DiscordIcon />
                            {t("Log in with Discord")}
                        </Button>
                    )}
                </div>
            </div>

            {/* The 3 Options Overview Cards */}
            <div style={{
                background: "var(--background-secondary, #2b2d31)",
                padding: "16px 20px",
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                gap: 16,
                border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))"
            }}>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--header-secondary, #b5bac1)" }}>
                    {t("Customization Options")}
                </div>

                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: 16
                }}>
                    {/* Option 1: Stories */}
                    <div style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        padding: "14px 16px",
                        borderRadius: 8,
                        border: activeTab === "stories" ? "1px solid var(--brand-500, #5865f2)" : "1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: 12
                    }}>
                        <FormSwitch
                            title={t("Stories")}
                            description={t("Avatar borders and Story tab on Discord profiles.")}
                            value={settings.storiesEnabled}
                            onChange={(v: boolean) => updateSt({ storiesEnabled: v })}
                            hideBorder
                        />
                        <Button
                            color={activeTab === "stories" ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                            size={Button.Sizes.SMALL}
                            onClick={() => setActiveTab("stories")}
                        >
                            <CameraIcon />
                            {t("Manage Stories")}
                        </Button>
                    </div>

                    {/* Option 2: Musiques Favorites */}
                    <div style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        padding: "14px 16px",
                        borderRadius: 8,
                        border: activeTab === "songs" ? "1px solid var(--brand-500, #5865f2)" : "1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: 12
                    }}>
                        <FormSwitch
                            title={t("Favorite Musics")}
                            description={t("Song tab on profile with interactive SoundCord player.")}
                            value={settings.favSongsEnabled}
                            onChange={(v: boolean) => updateSt({ favSongsEnabled: v })}
                            hideBorder
                        />
                        <Button
                            color={activeTab === "songs" ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                            size={Button.Sizes.SMALL}
                            onClick={() => setActiveTab("songs")}
                        >
                            <MusicIcon />
                            {t("Manage Musics")}
                        </Button>
                    </div>

                    {/* Option 3: Effets de Profil */}
                    <div style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        padding: "14px 16px",
                        borderRadius: 8,
                        border: activeTab === "effects" ? "1px solid var(--brand-500, #5865f2)" : "1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: 12
                    }}>
                        <FormSwitch
                            title={t("Profile Effects")}
                            description={t("Custom username text effects (glow, glitch, typewriter, rainbow).")}
                            value={settings.profileEffectsEnabled}
                            onChange={(v: boolean) => updateSt({ profileEffectsEnabled: v })}
                            hideBorder
                        />
                        <Button
                            color={activeTab === "effects" ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                            size={Button.Sizes.SMALL}
                            onClick={() => setActiveTab("effects")}
                        >
                            <SparklesIcon />
                            {t("Manage Effects")}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Active Selected Option View */}
            <div>
                {activeTab === "stories" && <StoriesSettingsSection />}
                {activeTab === "songs" && <FavSongsSettingsSection />}
                {activeTab === "effects" && <ProfileEffectsSettingsSection />}
            </div>
        </div>
    );
}

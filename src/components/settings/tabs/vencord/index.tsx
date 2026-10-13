/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./VencordTab.css";

import { isCompactModeEnabled, isStealthModeEnabled, toggleCompactMode, toggleStealthMode } from "@api/HeaderBar";
import { openNotificationLogModal } from "@api/Notifications/notificationLog";
import { plugins } from "@api/PluginManager";
import { useSettings } from "@api/Settings";
import { t } from "@api/i18n";

import { Button, LinkButton } from "@components/Button";
import { Card } from "@components/Card";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { HeartIcon, GithubIcon, LogIcon, OwnerCrownIcon, PaintbrushIcon, DiscordIcon, RestartIcon, WebsiteIcon } from "@components/Icons";

import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { openPluginModal, SettingsTab, wrapTab } from "@components/settings";
import { QuickAction, QuickActionCard } from "@components/settings/QuickAction";
import { IS_MAC, IS_WINDOWS } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Margins } from "@utils/margins";
import { identity } from "@utils/misc";
import { openModal } from "@utils/modal";
import { relaunch } from "@utils/native";
import { Avatar, OAuth2AuthorizeModal, React, Select, UserStore, showToast, Toasts, TextInput } from "@webpack/common";
import { Settings } from "Vencord";
import { getGroqKey, setGroqKey } from "@lolicordplugins/lolicordAI/groqManager";


import { ContributeModal } from "../../../../lolicord/renderer/components/ContributeModal";
import { copyToClipboard } from "@utils/clipboard";
import { openNotificationSettingsModal } from "./NotificationSettings";
import { updateNativeButtonsVisibility } from "../../../../plugins/_core/hideNativeButtons";

const cl = classNameFactory("vc-vencord-tab-");

const DEV_TEAM_IDS = [
    { 
        id: "1539701501679894678", 
        role: "Creator"
    }
];

function useDiscordUser(userId: string) {
    const [user, setUser] = React.useState<{ name: string; username: string; pfp: string; } | null>(null);
    React.useEffect(() => {
        const cached = UserStore?.getUser(userId);
        if (cached) {
            setUser({
                name: (cached as any).globalName || (cached as any).global_name || cached.username,
                username: cached.username ? `@${cached.username}` : "",
                pfp: cached.avatar
                    ? `https://cdn.discordapp.com/avatars/${userId}/${cached.avatar}.webp?size=128`
                    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(userId) >> 22n) % 6}.png`
            });
            return;
        }
        fetch(`https://discord.com/api/v9/users/${userId}`, {
            headers: { Authorization: (window as any).token ?? "" }
        })
            .then(r => r.json())
            .then(u => setUser({
                name: u.global_name || u.username || "LoliCord",
                username: u.username ? `@${u.username}` : "",
                pfp: u.avatar
                    ? `https://cdn.discordapp.com/avatars/${userId}/${u.avatar}.webp?size=128`
                    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(userId) >> 22n) % 6}.png`
            }))
            .catch(() => setUser({ name: "LoliCord", username: "", pfp: `https://cdn.discordapp.com/embed/avatars/0.png` }));
    }, [userId]);
    return user;
}

function DevCard({ id, role }: { id: string; role: string; }) {
    const user = useDiscordUser(id);

    return (
        <Card variant="primary" outline style={{ padding: "12px" }}>
            <Flex align={Flex.Align.CENTER} gap="12px">
                <Avatar
                    src={user?.pfp ?? `https://cdn.discordapp.com/embed/avatars/0.png`}
                    size="SIZE_48"
                />
                <Flex direction={Flex.Direction.VERTICAL} style={{ flex: 1, gap: "2px" }}>
                    <Flex align={Flex.Align.CENTER} justify={Flex.Justify.BETWEEN} style={{ width: "100%" }}>
                        <Heading tag="h3" style={{ marginBottom: "0px", fontSize: "14px", fontWeight: "bold" }}>{user?.name ?? "..."}</Heading>
                        <Heading tag="h4" style={{ color: "var(--header-primary, #ffffff)", fontWeight: "bold", fontSize: "12px" }}>{role}</Heading>
                    </Flex>

                    <span style={{ fontSize: "12px", color: "var(--text-muted, #949ba4)" }}>
                        {user?.username || (user?.name ? `@${user.name}` : "...")}
                    </span>
                </Flex>
            </Flex>
        </Card>
    );
}

function DevTeamSection() {
    const [showDevs, setShowDevs] = React.useState(false);

    return (
        <>
            <QuickActionCard>
                <QuickAction
                    Icon={GithubIcon}
                    text={t("Source Code")}
                    action={() => (typeof VencordNative !== "undefined" && VencordNative?.native?.openExternal) ? VencordNative.native.openExternal("https://github.com/ownhoye/hoye-bot-discord") : window.open("https://github.com/ownhoye/hoye-bot-discord", "_blank")}
                />
                <QuickAction
                    Icon={WebsiteIcon}
                    text={t("Website")}
                    action={() => (typeof VencordNative !== "undefined" && VencordNative?.native?.openExternal) ? VencordNative.native.openExternal("https://nightcord.st") : window.open("https://nightcord.st", "_blank")}
                />
                {!IS_WEB && (

                    <QuickAction
                        Icon={RestartIcon}
                        text={t("Quick Reload")}
                        action={relaunch}
                    />
                )}
                <QuickAction
                    Icon={HeartIcon}
                    text={t("Contribute")}
                    action={() => openModal(props => <ContributeModal {...props} />)}
                />
                <QuickAction
                    Icon={OwnerCrownIcon}
                    text={t("DEV Team")}
                    action={() => setShowDevs(!showDevs)}
                />
                <QuickAction
                    Icon={DiscordIcon}
                    text={t("Discord Server")}
                    disabled
                />
            </QuickActionCard>

            {showDevs && (
                <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px", animation: "slideIn 0.3s ease-out" }}>
                    <style>{`
                        @keyframes slideIn {
                            from { opacity: 0; transform: translateY(-10px); }
                            to { opacity: 1; transform: translateY(0); }
                        }
                    `}</style>
                    {DEV_TEAM_IDS.map(dev => (
                        <DevCard key={dev.id} id={dev.id} role={dev.role} />
                    ))}
                </div>
            )}
        </>
    );
}

type KeysOfType<Object, Type> = {
    [K in keyof Object]: Object[K] extends Type ? K : never;
}[keyof Object];

function useCompactActive() {
    const [active, setActive] = React.useState(isCompactModeEnabled);
    React.useEffect(() => {
        const handler = () => setActive(isCompactModeEnabled());
        window.addEventListener("lolicord-compact-change", handler);
        return () => window.removeEventListener("lolicord-compact-change", handler);
    }, []);
    return active;
}

function useStealthActive() {
    const [active, setActive] = React.useState(isStealthModeEnabled);
    React.useEffect(() => {
        const handler = () => setActive(isStealthModeEnabled());
        window.addEventListener("lolicord-stealth-change", handler);
        return () => window.removeEventListener("lolicord-stealth-change", handler);
    }, []);
    return active;
}

function StealthModeSection() {
    const enabled = useStealthActive();

    return (
        <>
            <Heading className={Margins.top20}>{t("Stealth Mode")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {enabled
                    ? "Stealth mode is enabled â€” all LoliCord visual elements are hidden. Shortcut: Ctrl+Shift+H"
                    : t("Hides all LoliCord visual elements without disabling plugins. Shortcut: Ctrl+Shift+H")}
            </Paragraph>
            <Button
                onClick={toggleStealthMode}
                variant={enabled ? "secondary" : "primary"}
            >
                {enabled ? t("Disable Stealth Mode") : t("Enable Stealth Mode")}
            </Button>
        </>
    );
}

function StealthModeButton() {
    const enabled = useStealthActive();

    return (
        <Button
            onClick={toggleStealthMode}
            variant={enabled ? "dangerPrimary" : "primary"}
        >
            {enabled ? t("✓ Stealth Mode Enabled — Click to disable") : t("Enable Stealth Mode")}
        </Button>
    );
}

function GroqApiKeySection() {
    const [key, setKey] = React.useState("");

    React.useEffect(() => {
        getGroqKey().then(stored => {
            if (stored) setKey(stored);
        });
    }, []);

    const handleChange = (val: string) => {
        setKey(val);
        setGroqKey(val);
        try {
            if (Settings.plugins.LoliCordAI) {
                Settings.plugins.LoliCordAI.apiKey = val.trim();
            }
            if (Settings.plugins.AutoCorrect) {
                Settings.plugins.AutoCorrect.apiKey = val.trim();
            }
        } catch {}
    };

    return (
        <div style={{ marginTop: 20 }}>
            <Card style={{ padding: "16px 20px", borderRadius: "8px", border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))" }}>
                <Heading tag="h5" style={{ marginBottom: 8, color: "var(--header-primary)" }}>{t("How to get a Groq API key")}</Heading>
                <Paragraph style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.4 }}>
                    {t("Create a free account on console.groq.com, then go to API Keys and click Create API Key. Copy the key and paste it in the Api Key field above.")}
                </Paragraph>
                <Paragraph style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 14, lineHeight: 1.4 }}>
                    {t("The Groq API is free and gives access to fast LLMs (Llama, Mixtral…).")}
                </Paragraph>
                <div style={{ marginTop: 14 }}>
                    <LinkButton
                        size="small"
                        variant="secondary"
                        href="https://console.groq.com/keys"
                        style={{ display: "inline-flex", width: "fit-content", padding: "6px 16px" }}
                    >
                        {t("Create API Key")}
                    </LinkButton>
                </div>
            </Card>

            <div style={{ marginTop: 16 }}>
                <Heading tag="h5" style={{ marginBottom: 4, color: "var(--header-primary)" }}>{t("Api Key")}</Heading>
                <Paragraph className={Margins.bottom8} style={{ color: "var(--text-muted)", fontSize: 14 }}>
                    {t("Groq API Key (console.groq.com/keys) — shared with AutoCorrect and VoiceDictation")}
                </Paragraph>
                <TextInput
                    value={key}
                    placeholder="gsk_••••••••••••••••••••••••••••••••••"
                    type="password"
                    onChange={handleChange}
                />
            </div>
        </div>
    );
}


function EquicordSettings() {
    const settings = useSettings();
    const stealthActive = useStealthActive();
    const compactActive = useCompactActive();

    const needsVibrancySettings = IS_DISCORD_DESKTOP && IS_MAC;

    const user = UserStore?.getCurrentUser();

    const Switches: Array<false | {
        key: KeysOfType<typeof settings, boolean>;
        title: string;
        description?: string;
        restartRequired?: boolean;
        warning: { enabled: boolean; message?: string; };
    }>
        = [

            {
                key: "useQuickCss",
                title: t("Enable Custom CSS"),
                description: t("Load custom CSS from the QuickCSS editor. This allows you to customize Discord's appearance with your own styles."),
                restartRequired: true,
                warning: { enabled: false },
            },
            !IS_WEB && {
                key: "enableReactDevtools",
                title: t("Enable React Developer Tools"),
                description: t("Enable the React Developer Tools extension for debugging Discord's React components. Useful for plugin development."),
                restartRequired: true,
                warning: { enabled: false },
            },
            (!IS_WEB && !IS_DISCORD_DESKTOP || !IS_WINDOWS) && {
                key: "mainWindowFrameless",
                title: t("Disable the Main Window Frame"),
                description: t("Remove the native window frame for a cleaner look. You can still move the window by dragging the title bar area."),
                restartRequired: true,
                warning: { enabled: false },
            },
            !IS_WEB &&
            (!IS_DISCORD_DESKTOP || !IS_WINDOWS
                ? {
                    key: "frameless",
                    title: t("Disable All Window Frames"),
                    description: t("Remove the native window frame for a cleaner look. You can still move the window by dragging the title bar area."),
                    restartRequired: true,
                    warning: { enabled: false },
                }
                : {
                    key: "winNativeTitleBar",
                    title: t("Use Windows' native title bar instead of Discord's custom one"),
                    description: t("Replace Discord's custom title bar with the standard Windows title bar. This may improve compatibility with some window management tools."),
                    restartRequired: true,
                    warning: { enabled: false },
                }
            ),

            !IS_WEB && {
                key: "transparent",
                title: t("Enable Window Transparency"),
                description: t("Make the Discord window transparent. A theme that supports transparency is required or this will do nothing."),
                restartRequired: true,
                warning: {
                    enabled: true,
                    message: IS_WINDOWS
                        ? t("This will stop the window from being resizable and prevents you from snapping the window to screen edges.")
                        : t("This will stop the window from being resizable."),
                },
            },
            IS_DISCORD_DESKTOP && {
                key: "disableMinSize",
                title: t("Disable Minimum Window Size"),
                description: t("Allow the Discord window to be resized smaller than its default minimum size. Useful for tiling window managers or small screens."),
                restartRequired: true,
                warning: { enabled: false },
            },
            !IS_WEB &&
            IS_WINDOWS && {
                key: "winCtrlQ",
                title: t("Register Ctrl+Q as shortcut to close Discord"),
                description: t("Add Ctrl+Q as a keyboard shortcut to close Discord. This provides an alternative to Alt+F4 for quickly closing the application."),
                restartRequired: true,
                warning: { enabled: false },
            },
            !IS_WEB && {
                key: "streamProof",
                title: t("Enable StreamProof"),
                description: t("Hide the entire Discord window from streams, screen recordings, and screenshots. Shortcut: Ctrl+Shift+G. When enabled, capturing software will see a black window."),
                restartRequired: false,
                warning: { enabled: false },
            },
            !IS_WEB && {
                key: "disableAutoUpdate",
                title: t("Disable Automatic Updates"),
                description: t("Prevent LoliCord from automatically checking, downloading, or prompting for updates on startup. You can still update manually in the \"Updater\" settings tab."),
                restartRequired: false,
                warning: { enabled: false },
            },
            {
                key: "enableInAppNotifications",
                title: t("Enable LoliCord In-App Notifications"),
                description: t("Show custom toast notifications in the top-right corner for updates, shortcuts (Stealth Mode, StreamProof), and status changes. Disable to silence all LoliCord notifications."),
                restartRequired: false,
                warning: { enabled: false },
            },
            {
                key: "hideNativeHeaderButtons",
                title: t("Hide Native Header Buttons (Inbox)"),
                description: t("Hides native Discord header buttons like the notification inbox. Turn OFF to show the notification inbox button again."),
                restartRequired: false,
                warning: { enabled: false },
            },
        ];

    return (
        <SettingsTab>

            {!stealthActive && (<>

                <Divider className={Margins.top20} />

                <Heading className={Margins.top16}>{t("Quick Actions")}</Heading>
                <Paragraph className={Margins.bottom16}>
                    {t("Common actions you might want to perform. These shortcuts give you quick access to frequently used features without navigating through menus.")}
                </Paragraph>

                <DevTeamSection />

                <Divider className={Margins.top20} />

                <Heading className={Margins.top20}>{t("Client Settings")}</Heading>
                <Paragraph className={Margins.bottom16}>
                    {t("Configure how LoliCord behaves and integrates with Discord. These settings affect the Discord client's appearance and behavior.")}
                </Paragraph>
                <Notice.Info className={Margins.bottom20} style={{ width: "100%" }}>
                    {t("You can customize where this settings section appears in Discord's settings menu by configuring the")} {" "}
                    <a
                        role="button"
                        onClick={() => openPluginModal(plugins.Settings)}
                        style={{ cursor: "pointer", color: "var(--text-link)" }}
                    >
                        {t("Settings Plugin")}
                    </a>.
                </Notice.Info>



                {Switches.filter((s): s is Exclude<typeof s, false> => !!s).map(
                    s => (
                        <FormSwitch
                            key={s.key}
                            value={settings[s.key]}
                             onChange={v => {
                                 settings[s.key] = v;
                                 if (s.key === "streamProof" && typeof VencordNative !== "undefined") {
                                     VencordNative?.setContentProtection?.(v);
                                 }
                                 if (s.key === "hideNativeHeaderButtons") {
                                     updateNativeButtonsVisibility(v);
                                 }
                             }}
                            title={s.title}
                            description={
                                s.warning.enabled ? (
                                    <>
                                        {s.description}
                                        <Notice.Warning className={Margins.top8} style={{ width: "100%" }}>
                                            {s.warning.message}
                                        </Notice.Warning>
                                    </>
                                ) : (
                                    s.description
                                )
                            }
                            hideBorder
                        />
                    ),
                )}

                <GroqApiKeySection />

                {needsVibrancySettings && (
                    <>
                        <Divider className={Margins.top20} />

                        <Heading className={Margins.top20}>Window Vibrancy</Heading>
                        <Paragraph className={Margins.bottom16}>
                            Customize the macOS window vibrancy effect. This controls the blur and transparency style of the Discord window. Changes require a restart to take effect.
                        </Paragraph>
                        <Select
                            className={Margins.bottom20}
                            placeholder="Window vibrancy style"
                            options={[
                                // Sorted from most opaque to most transparent
                                {
                                    label: "No vibrancy",
                                    value: undefined,
                                },
                                {
                                    label: "Under Page (window tinting)",
                                    value: "under-page",
                                },
                                {
                                    label: "Content",
                                    value: "content",
                                },
                                {
                                    label: "Window",
                                    value: "window",
                                },
                                {
                                    label: "Selection",
                                    value: "selection",
                                },
                                {
                                    label: "Titlebar",
                                    value: "titlebar",
                                },
                                {
                                    label: "Header",
                                    value: "header",
                                },
                                {
                                    label: "Sidebar",
                                    value: "sidebar",
                                },
                                {
                                    label: "Tooltip",
                                    value: "tooltip",
                                },
                                {
                                    label: "Menu",
                                    value: "menu",
                                },
                                {
                                    label: "Popover",
                                    value: "popover",
                                },
                                {
                                    label: "Fullscreen UI (transparent but slightly muted)",
                                    value: "fullscreen-ui",
                                },
                                {
                                    label: "HUD (Most transparent)",
                                    value: "hud",
                                },
                            ]}
                            select={v => (settings.macosVibrancyStyle = v)}
                            isSelected={v => settings.macosVibrancyStyle === v}
                            serialize={identity}
                        />
                    </>
                )}

                <Divider className={Margins.top20} />

                <Heading className={Margins.top20}>{t("Notifications")}</Heading>
                <Paragraph className={Margins.bottom16}>
                    {t("Configure how LoliCord handles notifications. You can customize when and how you receive alerts, or view a history of past notifications.")}
                </Paragraph>

                <Flex gap="16px">
                    <Button onClick={openNotificationSettingsModal}>
                        {t("Notification Settings")}
                    </Button>
                    <Button variant="secondary" onClick={openNotificationLogModal}>
                        {t("View Notification Log")}
                    </Button>
                </Flex>

            </>)}

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Compact Mode")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Replaces all LoliCord buttons with a single compact toggle icon. Click the icon in the header bar, channel toolbar, or chat bar to restore all buttons.")}
            </Paragraph>
            <Button
                onClick={toggleCompactMode}
                variant={compactActive ? "dangerPrimary" : "primary"}
            >
                {compactActive ? t("✓ Compact Mode Enabled — Click to disable") : t("Enable Compact Mode")}
            </Button>
            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Stealth Mode")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Hides all LoliCord visual elements without disabling plugins. Shortcut: Ctrl+Shift+H")}
            </Paragraph>
            <StealthModeButton />

        </SettingsTab>
    );
}


export default wrapTab(EquicordSettings, "LoliCord Settings");




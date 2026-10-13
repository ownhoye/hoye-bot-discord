/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./styles.css";

import * as DataStore from "@api/DataStore";
import { isPluginEnabled, startPlugin, stopPlugin } from "@api/PluginManager";
import { Settings, useSettings } from "@api/Settings";
import { openUserPluginsFolder, syncAllUserPlugins } from "@api/UserPlugins";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Notice } from "@components/Notice";
import { Divider } from "@components/Divider";
import ErrorBoundary from "@components/ErrorBoundary";
import { HeadingTertiary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab } from "@components/settings";
import { debounce } from "@shared/debounce";
import { ChangeList } from "@utils/ChangeList";
import { classNameFactory } from "@utils/css";
import { isTruthy } from "@utils/guards";
import { Logger } from "@utils/Logger";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { relaunch, showItemInFolder } from "@utils/native";
import { useAwaiter } from "@utils/react";
import { Alerts, lodash, Parser, React, Select as DiscordSelect, showToast, TextInput, Toasts, Tooltip, useCallback, useMemo, useState } from "@webpack/common";
import { SafeSearchableSelect } from "@components/SafeSearchableSelect";
import { JSX } from "react";
import { t } from "@api/i18n";

import Plugins, { ExcludedPlugins, PluginMeta } from "~plugins";
import { fetchPluginRatings, PluginRatings } from "@api/PluginLikes";
import { authorizeLikeSystem, LIKE_AUTH_EVENT } from "@api/PluginLikesAuth";
import { getStoredToken } from "@api/OAuth2";

import { PluginCard } from "./PluginCard";
import { openPluginModal, openResetDefaultsModal, openApplyBasicConfigModal, openWarningModal } from "./PluginModal";
import { StockPluginsCard } from "./PluginStatCards";
import { TUTORIAL_PLUGIN_NAMES } from "./tutorialList";
import { UIElementsButton } from "./UIElements";

export const BASIC_CONFIG_PLUGINS: Set<string> = new Set([
    "FakeVoice",
    "SilentDelete",
    "MessageCleaner",
    "ShowHiddenChannels",
    "CallTimer",
    "FollowUser",
    "UserVoiceShow",
    "ViewIcons",
    "VoiceMessages",
    "VolumeBooster",
    "ValidUser",
    "CrashHandler",
    "WhosWatching",
    "DisableCallIdle",
    "ShowHiddenThings",
    "MultiInstance",
    "ImageZoom",
    "MemberCount",
    "UnlimitedAccounts",
    "BigFileUpload",
    "MessageLogger",
    "MessageLoggerEnhanced",
    "SpotifyCrack",
    "IconViewer",
    "EventLogs",
    "Translate",
    "DoubleEmoji",
    "VoiceDownload",
    "PinDMs",
    "PrevNames",
    "CancelFriendRequest",
    "ReverseImageSearch",
    "FastPing",
    "AutoMute",
    "AutoDeco",
    "RealtimeTimestamps",
    "SavedMessages",
    "SaveGroups"
]);



const LOLICORD_TAB_ICON = "data:image/png;base64,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";
const VENCORD_EQUICORD_TAB_ICON = "data:image/png;base64,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";

function LoliCordTabIcon() {
    return <img src={LOLICORD_TAB_ICON} alt="LoliCord" style={{ width: 18, height: 18, borderRadius: 4 }} />;
}

function VencordEquicordTabIcon() {
    return <img src={VENCORD_EQUICORD_TAB_ICON} alt="Vencord & Equicord" style={{ width: 18, height: 18, borderRadius: 4 }} />;
}

function UserPluginsTabIcon() {
    return <img src="https://equicord.org/assets/icons/misc/userplugin.png" alt={t("User Plugins")} style={{ width: 18, height: 18, borderRadius: 4 }} />;
}

function LikedPluginsTabIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="#fff" d="M12.47 21.73a.92.92 0 0 1-.94 0C9.43 20.48 1 15.09 1 8.75A5.75 5.75 0 0 1 6.75 3c2.34 0 3.88.9 5.25 2.26A6.98 6.98 0 0 1 17.25 3 5.75 5.75 0 0 1 23 8.75c0 6.34-8.42 11.73-10.53 12.98Z" />
        </svg>
    );
}

const makeCategoryOptions = (othersCount?: number) => [
    { label: "Vencord & Equicord", value: SearchStatus.OTHERS },
    { label: "LoliCord", value: SearchStatus.LOLICORD },
    { label: t("User Plugins"), value: SearchStatus.USER_PLUGINS },
    { label: t("Liked Plugins"), value: SearchStatus.LIKED_PLUGINS },
    { label: t("Community Plugins"), value: "community", disabled: true }
];
export const cl = classNameFactory("vc-plugins-");
export const logger = new Logger("PluginSettings", "#a6d189");

function showErrorToast(message: string) {
    Toasts.show({
        message,
        type: Toasts.Type.FAILURE,
        id: Toasts.genId(),
        options: {
            position: Toasts.Position.BOTTOM
        }
    });
}

function ReloadRequiredCard({ required, enabledPlugins, openWarningModal, resetCheckAndDo, applyDefaultConfigCheckAndDo }) {
    return (
        <Card className={classes(cl("info-card"), required && "vc-warning-card")}>
            {required ? (
                <>
                    <HeadingTertiary>{t("Quick Reload Required")}</HeadingTertiary>
                    <Paragraph className={cl("dep-text")}>
                        {t("Reload now to apply new plugins and their settings in 1 second")}
                    </Paragraph>
                    <Button variant="primary" className={cl("restart-button")} onClick={() => relaunch()}>
                        {t("Quick Reload")}
                    </Button>
                </>
            ) : (
                <>
                    <HeadingTertiary>{t("Plugin Management")}</HeadingTertiary>
                    <Paragraph>{t("Press the cog wheel or info icon to get more info on a plugin")}</Paragraph>
                    <Paragraph>{t("Plugins with a cog wheel have settings you can modify!")}</Paragraph>
                </>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
                {enabledPlugins.length > 0 && !required && (
                    <Button
                        variant="secondary"
                        size="small"
                        className={"vc-plugins-disable-warning vc-modal-align-reset"}
                        onClick={() => {
                            return openWarningModal(null, undefined, false, enabledPlugins.length, resetCheckAndDo);
                        }}
                    >
                        {t("Disable All Plugins")}
                    </Button>
                )}
                {!required && (
                    <Button
                        variant="secondary"
                        size="small"
                        className={"vc-plugins-disable-warning vc-modal-align-reset"}
                        onClick={() => {
                            return openResetDefaultsModal(applyDefaultConfigCheckAndDo);
                        }}
                    >
                        {t("Apply Default Config")}
                    </Button>
                )}
            </div>
        </Card>
    );
}

export const ExcludedReasons: Record<"web" | "discordDesktop" | "vesktop" | "equibop" | "desktop" | "dev", string> = {
    desktop: "Discord Desktop app or Vesktop/Equibop",
    discordDesktop: "Discord Desktop app",
    vesktop: "Vesktop/Equibop apps",
    equibop: "Vesktop/Equibop apps",
    web: "Vesktop/Equibop apps & Discord web",
    dev: "Developer version of LoliCord"
};

function ExcludedPluginsList({ search }: { search: string; }) {
    const matchingExcludedPlugins = search
        ? Object.entries(ExcludedPlugins)
            .filter(([name]) => name.toLowerCase().includes(search))
        : [];

    return (
        <Paragraph className={Margins.top16}>
            {matchingExcludedPlugins.length
                ? <>
                    <Paragraph>{t("Are you looking for:")}</Paragraph>
                    <ul>
                        {matchingExcludedPlugins.map(([name, reason]) => (
                            <li key={name}>
                                <b>{name}</b>: Only available on the {ExcludedReasons[reason]}
                            </li>
                        ))}
                    </ul>
                </>
                : t("No plugins meet the search criteria.")
            }
        </Paragraph>
    );
}

import { SearchStatus, TUTORIAL_CACHE } from "./components/Common";

// Fallback select natif si le composant Discord n'est pas trouvé
function NativeSelect({ options, select, isSelected }: any) {
    const currentVal = options.find((o: any) => isSelected(o.value))?.value ?? options.find((o: any) => o.default)?.value ?? options[0]?.value;
    return (
        <select
            style={{
                background: "var(--background-secondary)",
                color: "var(--text-normal)",
                border: "1px solid var(--background-modifier-accent)",
                borderRadius: 4,
                padding: "6px 10px",
                fontSize: 14,
                cursor: "pointer",
                outline: "none",
            }}
            value={currentVal}
            onChange={e => select(Number(e.target.value))}
        >
            {options.map((o: any) => (
                <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
    );
}

const Select = DiscordSelect || NativeSelect;
interface PluginSettingsProps {
    premiumOnly?: boolean;
}

export default function PluginSettings({ premiumOnly = false }: PluginSettingsProps) {
    const settings = useSettings();
    const changes = React.useMemo(() => new ChangeList<string>(), []);

    // Expand Discord's content column to fill the full available width
    React.useEffect(() => {
        const col = document.querySelector<HTMLElement>('[class*="contentColumn"]');
        if (!col) return;
        const prevPaddingLeft = col.style.paddingLeft;
        const prevPaddingRight = col.style.paddingRight;
        const prevMaxWidth = col.style.maxWidth;
        col.style.paddingLeft = "16px";
        col.style.paddingRight = "16px";
        col.style.maxWidth = "none";
        return () => {
            col.style.paddingLeft = prevPaddingLeft;
            col.style.paddingRight = prevPaddingRight;
            col.style.maxWidth = prevMaxWidth;
        };
    }, []);

    // Static list — no fetch, no CORS issues.
    // Also populate TUTORIAL_CACHE so the SearchStatus.TUTORIAL filter works.
    const tutorialPlugins = useMemo(() => {
        for (const name of Object.values(Plugins).map(p => p.name).filter(Boolean)) {
            TUTORIAL_CACHE.set(name, TUTORIAL_PLUGIN_NAMES.has(name));
        }
        return TUTORIAL_PLUGIN_NAMES;
    }, []);

    React.useEffect(() => {
        return () => {
            if (!changes.hasChanges) return;

            const allChanges = [...changes.getChanges()];
            const pluginNames = [...new Set(allChanges.map(s => s.split(":")[0]))];
            const maxDisplay = 15;
            const displayed = pluginNames.slice(0, maxDisplay);
            const remainingCount = pluginNames.length - displayed.length;

            Alerts.show({
                title: t("Quick Reload Required"),
                body: (
                    <div>
                        {displayed.map((s, i) => (
                            <span key={i}>
                                {i > 0 && ", "}
                                {Parser.parse("`" + s + "`")}
                            </span>
                        ))}
                        {remainingCount > 0 && <span> and {remainingCount} more</span>}
                    </div>
                ),
                confirmText: t("Quick Reload Now"),
                cancelText: t("Later"),
                onConfirm: () => relaunch()
            });
        };
    }, []);

    const depMap = useMemo(() => {
        const o = {} as Record<string, string[]>;
        for (const plugin in Plugins) {
            const deps = Plugins[plugin].dependencies;
            if (deps) {
                for (const dep of deps) {
                    o[dep] ??= [];
                    o[dep].push(plugin);
                }
            }
        }
        return o;
    }, []);

    const [ratings, setRatings] = React.useState<PluginRatings>({});
    React.useEffect(() => {
        fetchPluginRatings().then(setRatings).catch(() => {});
    }, []);

    const [isLikeLoggedIn, setIsLikeLoggedIn] = React.useState(true);
    const [likeLoginLoading, setLikeLoginLoading] = React.useState(false);
    React.useEffect(() => {
        let cancelled = false;
        const refresh = () => getStoredToken().then(token => { if (!cancelled) setIsLikeLoggedIn(!!token); });
        refresh();
        window.addEventListener(LIKE_AUTH_EVENT, refresh);
        return () => {
            cancelled = true;
            window.removeEventListener(LIKE_AUTH_EVENT, refresh);
        };
    }, []);

    const handleLikeLogin = useCallback(async () => {
        if (likeLoginLoading) return;
        setLikeLoginLoading(true);
        try {
            const token = await authorizeLikeSystem();
            if (token) {
                setIsLikeLoggedIn(true);
                fetchPluginRatings(true).then(setRatings).catch(() => {});
            }
        } finally {
            setLikeLoginLoading(false);
        }
    }, [likeLoginLoading]);

    const sortedPlugins = useMemo(() => Object.values(Plugins)
        .filter(p => typeof p.name === "string")
        .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")), []);

    const hasUserPlugins = useMemo(() => !IS_STANDALONE && Object.values(PluginMeta).some(m => m.userPlugin), []);

    const [searchValue, setSearchValue] = useState({ value: "", status: SearchStatus.LOLICORD });
    const [searchInput, setSearchInput] = useState("");

    const debouncedSetSearch = useMemo(
        () => debounce((query: string) => setSearchValue(prev => ({ ...prev, value: query })), 150),
        []
    );

    const search = searchValue.value.toLowerCase();
    const onSearch = useCallback((query: string) => {
        setSearchInput(query);
        debouncedSetSearch(query);
    }, [debouncedSetSearch]);

    const BATCH_SIZE = 40;
    const [visibleCount, setVisibleCount] = React.useState(BATCH_SIZE);

    const observer = React.useRef<IntersectionObserver>();
    const sentinelRef = React.useCallback((node: HTMLDivElement | null) => {
        if (observer.current) observer.current.disconnect();
        if (node) {
            observer.current = new IntersectionObserver(
                entries => {
                    if (entries[0].isIntersecting) {
                        const total = allDataLengthRef.current;
                        React.startTransition(() => {
                            setVisibleCount(v => Math.min(v + BATCH_SIZE, total));
                        });
                    }
                },
                { rootMargin: "400px" } // trigger loading before it comes into view
            );
            observer.current.observe(node);
        }
    }, []);

    const onStatusChange = useCallback((status: SearchStatus) => {
        setVisibleCount(BATCH_SIZE);
        React.startTransition(() => {
            setSearchValue(prev => ({ ...prev, status }));
        });
    }, []);

    const pluginFilter = useCallback((plugin: typeof Plugins[keyof typeof Plugins], newPluginsSet: Set<string> | null) => {
        // Filter by premium status first
        const isPremiumPlugin = !!plugin.premium;
        if (premiumOnly) {
            if (!isPremiumPlugin) return false;
        } else {
            if (isPremiumPlugin) return false;
        }

        const { status } = searchValue;
        const enabled = isPluginEnabled(plugin.name);

        const pluginMeta = PluginMeta[plugin.name];

        switch (status) {
            case SearchStatus.DISABLED:
                if (enabled) return false;
                break;
            case SearchStatus.ENABLED:
                if (!enabled) return false;
                break;
            case SearchStatus.LOLICORD:
                if (!pluginMeta?.folderName?.startsWith("src/lolicordplugins/")) return false;
                break;
            case SearchStatus.OTHERS:
                if (pluginMeta?.folderName?.startsWith("src/lolicordplugins/") || pluginMeta?.folderName?.startsWith("src/plugins/_")) return false;
                if (!pluginMeta?.folderName?.startsWith("src/plugins/")) return false;
                break;
            case SearchStatus.VENCORD:
                if (!pluginMeta?.folderName?.startsWith("src/plugins/")) return false;
                break;
            case SearchStatus.NEW:
                if (!newPluginsSet?.has(plugin.name)) return false;
                break;
            case SearchStatus.USER_PLUGINS:
                if (!pluginMeta?.userPlugin && !(plugin as any)?.isUserPlugin) return false;
                break;
            case SearchStatus.API_PLUGINS:
                if (!plugin.name.endsWith("API")) return false;
                break;
            case SearchStatus.TUTORIAL:
                if (!TUTORIAL_CACHE.get(plugin.name)) return false;
                break;
            case SearchStatus.LIKED_PLUGINS:
                if (!pluginMeta?.folderName?.startsWith("src/lolicordplugins/")) return false;
                if (!ratings[plugin.name]?.likedByMe) return false;
                break;
        }

        if (!search.length) return true;

        const isIllegalcordPartner = (
            plugin.name === "DynamicIslande" ||
            plugin.name === "StereoInstaller" ||
            plugin.name === "ClientDiagnostics" ||
            plugin.name === "SecureBookmarks" ||
            plugin.name === "StatusCycler" ||
            plugin.name === "MutualScanner"
        );

        if ((search.includes("illegalcord") || search.includes("illegal")) && isIllegalcordPartner) {
            return true;
        }

        return (
            plugin.name.toLowerCase().includes(search.replace(/\s+/g, "")) ||
            (plugin.description ?? "").toLowerCase().includes(search) ||
            plugin.tags?.some(t => t.toLowerCase().includes(search))
        );
    }, [searchValue, search, ratings]);

    const [newPluginsSet] = useAwaiter(() => DataStore.get("Vencord_existingPlugins").then((cachedPlugins: Record<string, number> | undefined) => {
        const now = Date.now() / 1000;
        const existingTimestamps: Record<string, number> = {};
        const sortedPluginNames = Object.values(sortedPlugins).map(plugin => plugin.name);

        const newPlugins: string[] = [];
        for (const { name: p } of sortedPlugins) {
            const time = existingTimestamps[p] = cachedPlugins?.[p] ?? now;
            if ((time + 60 * 60 * 24 * 2) > now) {
                newPlugins.push(p);
            }
        }
        DataStore.set("Vencord_existingPlugins", existingTimestamps);

        return lodash.isEqual(newPlugins, sortedPluginNames) ? null : new Set(newPlugins);
    }));

    const handleRestartNeeded = useCallback((name: string, key: string) => changes.handleChange(`${name}:${key}`), [changes]);

    // Only filter/categorize plugin DATA here — no JSX created yet
        const { lolicordData, othersData, requiredData } = useMemo(() => {
        const lolicordData: typeof sortedPlugins = [];
        const othersData: typeof sortedPlugins = [];
        const requiredData: typeof sortedPlugins = [];

        const showApi = searchValue.status === SearchStatus.API_PLUGINS;
        for (const p of sortedPlugins) {
            if (p.hidden || (!p.settings?.def && p.name.endsWith("API") && !showApi))
                continue;

            if (!pluginFilter(p, newPluginsSet)) continue;

            const isRequired = p.required || p.isDependency || depMap[p.name]?.some(d => isPluginEnabled(d));

            if (isRequired) {
                requiredData.push(p);
            } else {
                const folderName = PluginMeta[p.name]?.folderName ?? "";
                if (folderName.startsWith("src/lolicordplugins/")) {
                    lolicordData.push(p);
                } else {
                    othersData.push(p);
                }
            }
        }
        // Toujours trier par nombre de likes décroissant, mais forcer AutoCallRecorder en premier
        const byLikes = (a: typeof sortedPlugins[number], b: typeof sortedPlugins[number]) => {
            if (a.name === "AutoCallRecorder") return -1;
            if (b.name === "AutoCallRecorder") return 1;
            return (ratings[b.name]?.likes ?? 0) - (ratings[a.name]?.likes ?? 0);
        };
        lolicordData.sort(byLikes);
        othersData.sort(byLikes);

        return { lolicordData, othersData, requiredData };
    }, [sortedPlugins, searchValue, newPluginsSet, depMap, pluginFilter, ratings]);

    const allDataLength = lolicordData.length + othersData.length;
    const hasMore = visibleCount < allDataLength;

    // Store allDataLength in a ref so the observer callback always sees the latest value
    // without needing it as a dependency (which would cause reconnect loops).
    const allDataLengthRef = React.useRef(allDataLength);
    allDataLengthRef.current = allDataLength;

    // Sentinel ref and observer are now defined using a callback ref above.

    function resetCheckAndDo() {
        let restartNeeded = false;

        for (const plugin of enabledPlugins) {
            const pluginSettings = settings.plugins[plugin];

            if (Plugins[plugin].patches?.length) {
                pluginSettings.enabled = false;
                changes.handleChange(plugin);
                restartNeeded = true;
                continue;
            }

            const result = stopPlugin(Plugins[plugin]);

            if (!result) {
                logger.error(`Error while stopping plugin ${plugin}`);
                showErrorToast(`Error while stopping plugin ${plugin}`);
                continue;
            }

            pluginSettings.enabled = false;
        }

        if (restartNeeded) {
            Alerts.show({
                title: t("Quick Reload Required"),
                body: (
                    <>
                        <p style={{ textAlign: "center" }}>{t("Some plugins require a quick reload to fully disable.")}</p>
                        <p style={{ textAlign: "center" }}>{t("Would you like to reload now?")}</p>
                    </>
                ),
                confirmText: t("Quick Reload Now"),
                cancelText: t("Later"),
                onConfirm: () => relaunch()
            });
        }
    }

    function applyDefaultConfigCheckAndDo() {
        try {
            let restartNeeded = false;
            let modifiedCount = 0;

            for (const pluginName in Plugins) {
                const plugin = Plugins[pluginName];

                // Les plugins APIs ne peuvent pas être configurés directement
                if (pluginName.endsWith("API")) continue;

                const shouldBeEnabled = Boolean(plugin.required) || Boolean(plugin.enabledByDefault);
                const currentlyEnabled = isPluginEnabled(pluginName);

                if (currentlyEnabled !== shouldBeEnabled) {
                    const pluginSettings = settings.plugins[pluginName];

                    if (plugin.patches?.length) {
                        pluginSettings.enabled = shouldBeEnabled;
                        changes.handleChange(pluginName);
                        restartNeeded = true;
                        modifiedCount++;
                        continue;
                    }

                    if (shouldBeEnabled) {
                        const result = startPlugin(plugin);
                        if (!result) {
                            logger.error(`Error while starting plugin ${pluginName}`);
                            showErrorToast(`Error while starting plugin ${pluginName}`);
                        } else {
                            pluginSettings.enabled = true;
                            modifiedCount++;
                        }
                    } else {
                        const result = stopPlugin(plugin);
                        if (!result) {
                            logger.error(`Error while stopping plugin ${pluginName}`);
                            showErrorToast(`Error while stopping plugin ${pluginName}`);
                        } else {
                            pluginSettings.enabled = false;
                            modifiedCount++;
                        }
                    }
                }
            }

            if (restartNeeded) {
                Alerts.show({
                    title: t("Quick Reload Required"),
                    body: (
                        <>
                            <p style={{ textAlign: "center" }}>{t("Some plugins require a quick reload to apply their default configuration.")}</p>
                            <p style={{ textAlign: "center" }}>{t("Would you like to reload now?")}</p>
                        </>
                    ),
                    confirmText: t("Quick Reload Now"),
                    cancelText: t("Later"),
                    onConfirm: () => relaunch()
                });
            } else {
                Toasts.show({
                    message: `Default config applied. ${modifiedCount} plugin(s) modified.`,
                    type: Toasts.Type.SUCCESS,
                    id: Toasts.genId(),
                    options: { position: Toasts.Position.BOTTOM }
                });
            }
        } catch (err: any) {
            Toasts.show({
                message: `Failed: ${err?.message ?? err}`,
                type: Toasts.Type.FAILURE,
                id: Toasts.genId(),
                options: { position: Toasts.Position.BOTTOM }
            });
            logger.error("Apply Default Config crashed:", err);
        }
    }

    function applyBasicConfigCheckAndDo() {
        try {
            let restartNeeded = false;
            let modifiedCount = 0;

            for (const pluginName in Plugins) {
                const plugin = Plugins[pluginName];

                // Les plugins APIs ne peuvent pas être configurés directement
                if (pluginName.endsWith("API")) continue;

                const shouldBeEnabled = Boolean(plugin.required) || BASIC_CONFIG_PLUGINS.has(pluginName);
                const currentlyEnabled = isPluginEnabled(pluginName);

                if (currentlyEnabled !== shouldBeEnabled) {
                    const pluginSettings = settings.plugins[pluginName];

                    if (plugin.patches?.length) {
                        pluginSettings.enabled = shouldBeEnabled;
                        changes.handleChange(pluginName);
                        restartNeeded = true;
                        modifiedCount++;
                        continue;
                    }

                    if (shouldBeEnabled) {
                        const result = startPlugin(plugin);
                        if (!result) {
                            logger.error(`Error while starting plugin ${pluginName}`);
                            showErrorToast(`Error while starting plugin ${pluginName}`);
                        } else {
                            pluginSettings.enabled = true;
                            modifiedCount++;
                        }
                    } else {
                        const result = stopPlugin(plugin);
                        if (!result) {
                            logger.error(`Error while stopping plugin ${pluginName}`);
                            showErrorToast(`Error while stopping plugin ${pluginName}`);
                        } else {
                            pluginSettings.enabled = false;
                            modifiedCount++;
                        }
                    }
                }
            }

            if (restartNeeded) {
                Alerts.show({
                    title: t("Quick Reload Required"),
                    body: (
                        <>
                            <p style={{ textAlign: "center" }}>{t("Some plugins require a quick reload to apply the basic configuration.")}</p>
                            <p style={{ textAlign: "center" }}>{t("Would you like to reload now?")}</p>
                        </>
                    ),
                    confirmText: t("Quick Reload Now"),
                    cancelText: t("Later"),
                    onConfirm: () => relaunch()
                });
            } else {
                Toasts.show({
                    message: `Basic config applied. ${modifiedCount} plugin(s) modified.`,
                    type: Toasts.Type.SUCCESS,
                    id: Toasts.genId(),
                    options: { position: Toasts.Position.BOTTOM }
                });
            }
        } catch (err: any) {
            Toasts.show({
                message: `Failed: ${err?.message ?? err}`,
                type: Toasts.Type.FAILURE,
                id: Toasts.genId(),
                options: { position: Toasts.Position.BOTTOM }
            });
            logger.error("Apply Basic Config crashed:", err);
        }
    }


    // Code directly taken from supportHelper.tsx
    const { totalStockPlugins, totalUserPlugins, enabledStockPlugins, enabledUserPlugins, enabledPlugins } = useMemo(() => {
        const isApiPlugin = (plugin: string) => plugin.endsWith("API") || Plugins[plugin]?.required;

        const totalPlugins = Object.keys(Plugins).filter(p => !isApiPlugin(p));
        const enabledPlugins = Object.keys(Plugins).filter(p => isPluginEnabled(p) && !isApiPlugin(p));

        const totalStockPlugins = totalPlugins.filter(p => !PluginMeta[p]?.userPlugin && !(Plugins[p] as any)?.isUserPlugin && !Plugins[p]?.hidden).length;
        const totalUserPlugins = totalPlugins.filter(p => PluginMeta[p]?.userPlugin || (Plugins[p] as any)?.isUserPlugin).length;
        const enabledStockPlugins = enabledPlugins.filter(p => !PluginMeta[p]?.userPlugin && !(Plugins[p] as any)?.isUserPlugin).length;
        const enabledUserPlugins = enabledPlugins.filter(p => PluginMeta[p]?.userPlugin || (Plugins[p] as any)?.isUserPlugin).length;
        return { totalStockPlugins, totalUserPlugins, enabledStockPlugins, enabledUserPlugins, enabledPlugins };
    }, [settings.plugins]);

    // Slice DATA first, then create JSX only for visible items
    const lolicordVisibleData = lolicordData.slice(0, Math.min(visibleCount, lolicordData.length));
    const othersVisibleData = othersData.slice(0, Math.max(0, visibleCount - lolicordData.length));

    const makeCard = (p: typeof sortedPlugins[number]) => (
        <ErrorBoundary fallback={<div style={{ color: "red", padding: 8 }}>Failed to render {p.name}.</div>} key={`${p.name}_${(p as any)?.isUserPlugin ? "user" : "stock"}`}>
            <PluginCard
                onRestartNeeded={handleRestartNeeded}
                disabled={false}
                plugin={p}
                isNew={newPluginsSet?.has(p.name)}
                hasTutorial={tutorialPlugins.has(p.name)}
            />
        </ErrorBoundary>
    );

    const makeRequiredCard = (p: typeof sortedPlugins[number]) => {
        const tooltipText = p.required || !depMap[p.name]
            ? "This plugin is required for LoliCord to function."
            : <PluginDependencyList deps={depMap[p.name]?.filter(d => isPluginEnabled(d))} />;
        return (
            <ErrorBoundary fallback={<div style={{ color: "red", padding: 8 }}>Failed to render {p.name}.</div>} key={`${p.name}_${(p as any)?.isUserPlugin ? "user" : "stock"}`}>
                <Tooltip text={tooltipText}>
                    {({ onMouseLeave, onMouseEnter }) => (
                        <PluginCard
                            onMouseLeave={onMouseLeave}
                            onMouseEnter={onMouseEnter}
                            onRestartNeeded={handleRestartNeeded}
                            disabled={true}
                            plugin={p}
                            hasTutorial={tutorialPlugins.has(p.name)}
                        />
                    )}
                </Tooltip>
            </ErrorBoundary>
        );
    };

    const lolicordPlugins = lolicordVisibleData.map(makeCard);
    const othersVisible = othersVisibleData.map(makeCard);
    const requiredPlugins = requiredData.map(makeRequiredCard);

    const totalLoliCordPlugins = React.useMemo(() => {
        return Object.values(Plugins).filter(p => PluginMeta[p.name]?.folderName?.startsWith("src/lolicordplugins/")).length;
    }, []);

    const totalOtherPlugins = React.useMemo(() => {
        const isLoliCordPlugin = (p: string) => PluginMeta[p]?.folderName?.startsWith("src/lolicordplugins/");
        const isCorePlugin = (p: string) => PluginMeta[p]?.folderName?.startsWith("src/plugins/_");
        return Object.values(Plugins).filter(p => !isLoliCordPlugin(p.name) && !isCorePlugin(p.name)).length;
    }, []);

    // Category-aware stats for the "ENABLED PLUGINS" card: reflects whichever tab
    // (LOLICORD / OTHERS / all) is currently selected, instead of always being global.
    const categoryStats = useMemo(() => {
        const isApiPlugin = (plugin: string) => plugin.endsWith("API") || Plugins[plugin]?.required;
        const isLoliCordPlugin = (p: string) => PluginMeta[p]?.folderName?.startsWith("src/lolicordplugins/") && !PluginMeta[p]?.userPlugin && !(Plugins[p] as any)?.isUserPlugin;
        const isUserPlugin = (p: string) => PluginMeta[p]?.userPlugin === true || (Plugins[p] as any)?.isUserPlugin;

        let plugins = Object.keys(Plugins).filter(p => !isApiPlugin(p) && !Plugins[p]?.hidden);

        if (searchValue.status === SearchStatus.LOLICORD) {
            plugins = plugins.filter(isLoliCordPlugin);
        } else if (searchValue.status === SearchStatus.OTHERS) {
            plugins = plugins.filter(p => !isLoliCordPlugin(p) && !isUserPlugin(p));
        } else if (searchValue.status === SearchStatus.USER_PLUGINS) {
            plugins = plugins.filter(isUserPlugin);
        } else if (searchValue.status === SearchStatus.LIKED_PLUGINS) {
            plugins = plugins.filter(p => isLoliCordPlugin(p) && ratings[p]?.likedByMe);
        }

        const total = plugins.length;
        const enabled = plugins.filter(p => isPluginEnabled(p)).length;
        return { total, enabled };
    }, [settings.plugins, searchValue.status, ratings]);

    const percent = categoryStats.total > 0 ? Math.round((categoryStats.enabled / categoryStats.total) * 100) : 0;
    const strokeDashoffset = 62.83 - (62.83 * percent / 100);

    return (
        <SettingsTab>
            <div className="vc-plugins-full-width-container">
                {!premiumOnly && (
                    <div className={cl("ecosystem-banner")}>
                        <div className={cl("ecosystem-banner-text")}>
                            <HeadingTertiary>{t("Plugin Ecosystem Management")}</HeadingTertiary>
                            <Paragraph>{t("Manage your LoliCord and community plugins here. Enable, disable, and configure them to your liking.")}</Paragraph>
                            <button
                                type="button"
                                className={cl("reset-btn")}
                                onClick={() => openWarningModal(null, undefined, false, enabledPlugins.length, resetCheckAndDo)}
                            >
                                {t("RESET")}
                            </button>
                        </div>

                        <div className={cl("ecosystem-banner-buttons")}>
                            {!isLikeLoggedIn && (
                                <Button
                                    variant="primary"
                                    size="small"
                                    disabled={likeLoginLoading}
                                    onClick={handleLikeLogin}
                                >
                                    {t("Log in to like")}
                                </Button>
                            )}
                            <Button
                                variant="secondary"
                                size="small"
                                onClick={() => openResetDefaultsModal(applyDefaultConfigCheckAndDo)}
                            >
                                {t("APPLY DEFAULT CONFIG")}
                            </Button>
                            <Button
                                variant="secondary"
                                size="small"
                                onClick={() => openApplyBasicConfigModal(applyBasicConfigCheckAndDo)}
                            >
                                {t("APPLY BASIC CONFIG")}
                            </Button>
                        </div>


                    </div>
                )}

                {!premiumOnly && (
                    <div className={cl("stats-banner")}>
                        <div className={cl("stat-item")}>
                            <div className={cl("stat-title")}>{t("TOTAL PLUGINS")}</div>
                            <div className={cl("stat-value")}>{totalStockPlugins + totalUserPlugins}</div>
                        </div>
                        <div className={cl("stat-item")}>
                            <div className={cl("stat-title")}>{t("ENABLED PLUGINS")}</div>
                            <div className={cl("stat-value")}>
                                {categoryStats.enabled} <span className={cl("stat-percent")}>({percent}%)</span>
                                <div className={cl("stat-chart")}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" style={{ transform: "rotate(-90deg)" }}>
                                        <circle cx="12" cy="12" r="10" fill="transparent" stroke="var(--background-modifier-active)" strokeWidth="4" />
                                        <circle cx="12" cy="12" r="10" fill="transparent" stroke="var(--text-link)" strokeWidth="4" strokeDasharray="62.83" strokeDashoffset={strokeDashoffset} style={{ transition: "stroke-dashoffset 0.5s ease" }} />
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div 
                            className={cl("stat-item")} 
                            style={searchValue.status === SearchStatus.USER_PLUGINS ? { cursor: "pointer", transition: "0.2s" } : {}}
                            onClick={() => {
                                if (searchValue.status !== SearchStatus.USER_PLUGINS) return;
                                openUserPluginsFolder();
                            }}
                            title={searchValue.status === SearchStatus.USER_PLUGINS ? t("Click to open folder") : ""}
                        >
                            <div className={cl("stat-title")}>
                                {searchValue.status === SearchStatus.USER_PLUGINS ? t("USER PLUGINS") : 
                                 searchValue.status === SearchStatus.OTHERS ? t("VENCORD & EQUICORD PLUGINS") : 
                                 searchValue.status === SearchStatus.LIKED_PLUGINS ? t("LIKED PLUGINS") :
                                 t("LOLICORD PLUGINS")}
                            </div>
                            <div className={cl("stat-value")}>
                                {searchValue.status === SearchStatus.USER_PLUGINS ? totalUserPlugins : 
                                 searchValue.status === SearchStatus.OTHERS ? totalOtherPlugins : 
                                 searchValue.status === SearchStatus.LIKED_PLUGINS ? categoryStats.total :
                                 totalLoliCordPlugins}
                            </div>
                        </div>
                    </div>
                )}

                <div className={classes(Margins.bottom20, cl("filter-controls"))}>
                    <ErrorBoundary noop>
                        <TextInput autoFocus value={searchInput} placeholder={t("Find a plugin, tag, or author...")} onChange={onSearch} />
                    </ErrorBoundary>
                    <div className={cl("filter-buttons")} style={{ minWidth: 220 }}>
                        <SafeSearchableSelect
                            options={makeCategoryOptions(totalOtherPlugins)}
                            value={makeCategoryOptions(totalOtherPlugins).find(o => o.value === searchValue.status)?.value ?? SearchStatus.LOLICORD}
                            onChange={(v: any) => {
                                if (v === "community") return;
                                onStatusChange(v);
                            }}
                            closeOnSelect={true}
                            renderOptionPrefix={(o: any) => {
                                if (o?.value === SearchStatus.LOLICORD) return <LoliCordTabIcon />;
                                if (o?.value === SearchStatus.OTHERS) return <VencordEquicordTabIcon />;
                                if (o?.value === SearchStatus.USER_PLUGINS) return <UserPluginsTabIcon />;
                                if (o?.value === SearchStatus.LIKED_PLUGINS) return <LikedPluginsTabIcon />;
                                return null;
                            }}
                        />
                    </div>
                </div>

            {premiumOnly ? (
                <>
                    <HeadingTertiary className={Margins.top20}>Premium Plugins</HeadingTertiary>
                    {lolicordData.length || othersData.length
                        ? (
                            <div className={cl("grid")}>
                                {[...lolicordPlugins, ...othersVisible].length
                                    ? [...lolicordPlugins, ...othersVisible]
                                    : <Paragraph>{t("No plugins meet the search criteria.")}</Paragraph>
                                }
                            </div>
                        )
                        : <ExcludedPluginsList search={search} />
                    }
                </>
            ) : (
                <>
                    {lolicordData.length > 0 && searchValue.status === SearchStatus.LOLICORD && (
                        <div className={cl("grid")}>
                            {lolicordPlugins}
                        </div>
                    )}
                    


                    {othersData.length > 0 && searchValue.status === SearchStatus.OTHERS && (
                        <div className={cl("grid")}>
                            {othersVisible}
                        </div>
                    )}

                    {searchValue.status === SearchStatus.USER_PLUGINS && (
                        <>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, padding: "8px 0" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <UserPluginsTabIcon />
                                    <span style={{ color: "var(--header-primary)", fontWeight: 600, fontSize: 15 }}>
                                        {t("User Plugins — Local Folder")}
                                    </span>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <Button
                                        size="small"
                                        variant="secondary"
                                        onClick={() => openUserPluginsFolder()}
                                    >
                                        {t("Open Folder")}
                                    </Button>
                                    <Button
                                        size="small"
                                        variant="primary"
                                        onClick={async () => {
                                            await syncAllUserPlugins();
                                            showToast(t("User plugins reloaded"), Toasts.Type.SUCCESS);
                                        }}
                                    >
                                        {t("Reload Plugins")}
                                    </Button>
                                </div>
                            </div>
                            <div style={{
                                background: "rgba(88, 101, 242, 0.08)",
                                border: "1px solid rgba(88, 101, 242, 0.25)",
                                borderRadius: 8,
                                padding: "12px 16px",
                                marginBottom: 16,
                                fontSize: 13,
                                color: "var(--text-normal)",
                                display: "flex",
                                alignItems: "center",
                                gap: 12
                            }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: "var(--brand-500)" }}>
                                    <path fill="currentColor" fillRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 5a1.25 1.25 0 1 0 0 2.5A1.25 1.25 0 0 0 12 7Zm1 10h-2v-6h2v6Z" clipRule="evenodd" />
                                </svg>
                                <div>
                                    {t("Dynamic UserPlugin Engine: Drop any .tsx, .ts, or .js plugin into your local folder. LoliCord compiles and loads them automatically in real-time without client rebuilds.")}
                                </div>
                            </div>
                            {lolicordPlugins.length > 0 || othersVisible.length > 0 ? (
                                <div className={cl("grid")}>
                                    {[...lolicordPlugins, ...othersVisible]}
                                </div>
                            ) : (
                                <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-muted)" }}>
                                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ color: "var(--interactive-normal)" }}>
                                            <path fill="currentColor" d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                                        </svg>
                                    </div>
                                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, color: "var(--header-primary)" }}>{t("No user plugins found")}</div>
                                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                                        {t("Add .tsx, .ts, or .js files to your")} <code style={{ background: "var(--background-secondary)", padding: "2px 6px", borderRadius: 4, color: "var(--header-secondary)" }}>Documents/LoliCord/userplugins/</code> {t("folder. They will be compiled and loaded automatically.")}
                                    </div>
                                    <Button
                                        size={Button.Sizes.MEDIUM}
                                        color={Button.Colors.BRAND}
                                        onClick={() => openUserPluginsFolder()}
                                    >
                                        {t("Open Folder")}
                                    </Button>
                                </div>
                            )}
                        </>
                    )}

                    {(searchValue.status !== SearchStatus.LOLICORD && searchValue.status !== SearchStatus.OTHERS && searchValue.status !== SearchStatus.USER_PLUGINS) && (
                        <div className={cl("grid")}>
                            {lolicordPlugins}
                            {othersVisible}
                        </div>
                    )}

                    {lolicordData.length === 0 && othersData.length === 0 && searchValue.status === SearchStatus.LIKED_PLUGINS && (
                        <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-muted)" }}>
                            <div style={{ fontSize: 32, marginBottom: 12 }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ margin: "0 auto" }}>
                                    <path fill="currentColor" fillRule="evenodd" d="M12 8.07 10.6 6.7A5 5 0 0 0 6.75 5 3.75 3.75 0 0 0 3 8.75c0 2.32 1.59 4.76 3.87 6.96A31.87 31.87 0 0 0 12 19.67c1.2-.74 3.26-2.14 5.13-3.96 2.28-2.2 3.87-4.64 3.87-6.96A3.75 3.75 0 0 0 17.25 5a5 5 0 0 0-3.85 1.69L12 8.07Zm0-2.8A6.98 6.98 0 0 0 6.75 3 5.75 5.75 0 0 0 1 8.75c0 6.34 8.42 11.73 10.53 12.98.29.17.65.17.94 0C14.57 20.48 23 15.09 23 8.75A5.75 5.75 0 0 0 17.25 3c-2.34 0-3.88.9-5.25 2.26Z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{t("No liked plugins yet")}</div>
                            <div style={{ fontSize: 13 }}>{t("Like a LoliCord plugin from its card to see it here.")}</div>
                        </div>
                    )}

                    {lolicordData.length === 0 && othersData.length === 0 && searchValue.status !== SearchStatus.USER_PLUGINS && searchValue.status !== SearchStatus.LIKED_PLUGINS && (
                        <ExcludedPluginsList search={search} />
                    )}

                    {/* Sentinel: only rendered when there are more items to load */}
                    {hasMore && (
                        <div
                            ref={sentinelRef}
                            style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}
                        >
                            {t("Loading more plugins…")}
                        </div>
                    )}
                </>
            )}

            {!premiumOnly && requiredPlugins.length > 0 && (
                <>
                    <Divider className={Margins.top20} />

                    <HeadingTertiary className={classes(Margins.top20, Margins.bottom8)}>
                        {t("Required Plugins")}
                    </HeadingTertiary>
                    <div className={cl("grid")}>
                        {requiredPlugins.length
                            ? requiredPlugins
                            : <Paragraph>{t("No plugins meet the search criteria.")}</Paragraph>
                        }
                    </div>
                </>
            )}
            </div>
        </SettingsTab>
    );
}

export function PluginDependencyList({ deps }: { deps: string[]; }) {
    return (
        <>
            <Paragraph>{t("This plugin is required by:")}</Paragraph>
            {deps.map((dep: string) => <Paragraph key={dep} className={cl("dep-text")}>{dep}</Paragraph>)}
        </>
    );
}

/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { showNotification } from "@api/Notifications";
import { isPluginEnabled, plugins, startPlugin, stopPlugin } from "@api/PluginManager";
import { definePluginSettings, flushSettings, Settings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { DeleteIcon, WarningIcon, NoEntrySignIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import SettingsPlugin from "@plugins/_core/settings";
import { classes, removeFromArray } from "@utils/misc";
import definePlugin, { OptionType, PluginNative, ReporterTestable } from "@utils/types";
import { Alerts, Button, React, SettingsRouter, showToast, TextInput, Toasts } from "@webpack/common";
import { t } from "../autoTranslateLoliCord";

import type { ActionInfo, InstallInfo, InstallProgress, NativeResult } from "./native";

const Native = ((VencordNative.pluginHelpers as any).GhostInstaller || (VencordNative.pluginHelpers as any).GhostClientInstaller) as PluginNative<typeof import("./native")>;
const SETTINGS_ENTRY_KEY = "lolicord_ghost_client_installer";

let globalProgress: InstallProgress = {
    active: false,
    percent: 0,
    stage: "",
    detail: "",
    error: null,
    done: false,
    info: null
};

const progressListeners = new Set<(p: InstallProgress) => void>();
let globalPollTimer: ReturnType<typeof setInterval> | null = null;

function startGlobalPoller() {
    if (globalPollTimer) return;
    globalPollTimer = setInterval(async () => {
        try {
            const res = await Native.getInstallProgress();
            if (res?.success && res.data) {
                globalProgress = res.data;
                progressListeners.forEach(l => l(globalProgress));
                if (!res.data.active && globalPollTimer) {
                    clearInterval(globalPollTimer);
                    globalPollTimer = null;
                }
            }
        } catch {}
    }, 250);
}

function GhostInstallerSidebarIcon(props: any) {
    return (
        <svg
            role="img"
            viewBox="0 0 24 24"
            width={24}
            height={24}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            {...props}
            className={classes(props?.className, "vc-icon")}
        >
            <path
                d="M12 2C7.58 2 4 5.58 4 10V19C4 20.66 5.34 22 7 22C8.66 22 10 20.66 10 19C10 20.66 11.34 22 13 22C14.66 22 16 20.66 16 19C16 20.66 17.34 22 19 22C20.66 22 22 20.66 22 19V10C22 5.58 18.42 2 14 2H10H12Z"
                fill="currentColor"
            />
            <circle cx="8.5" cy="10" r="1.5" fill="black" fillOpacity="0.6" />
            <circle cx="15.5" cy="10" r="1.5" fill="black" fillOpacity="0.6" />
        </svg>
    );
}

function ProgressBar({ progress }: { progress: InstallProgress }) {
    if (!progress.active && !progress.done && progress.percent === 0 && !progress.error) return null;

    const isError = Boolean(progress.error);
    const isDone = progress.done && !progress.active && !isError;

    return (
        <div className={classes("vc-ghost-installer-progress-card", isError && "vc-ghost-installer-progress-error", isDone && "vc-ghost-installer-progress-done")}>
            <div className="vc-ghost-installer-progress-header">
                <div className="vc-ghost-installer-progress-title-wrapper">
                    <span className="vc-ghost-installer-progress-stage">
                        {progress.stage || (progress.active ? t("Installing...") : (isDone ? t("Installation Complete") : t("Status")))}
                    </span>
                    {progress.detail && (
                        <span className="vc-ghost-installer-progress-detail">
                            {progress.detail}
                        </span>
                    )}
                </div>
                <span className="vc-ghost-installer-progress-percent">
                    {progress.percent}%
                </span>
            </div>
            <div className="vc-ghost-installer-progress-bar-bg">
                <div
                    className="vc-ghost-installer-progress-bar-fill"
                    style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
                />
            </div>
        </div>
    );
}

type LogLevel = "error" | "info" | "success" | "warning";

interface LogEntry {
    id: number;
    line: string;
}

let lastRepatchNotificationKey = "";
let nextLogId = 0;

function appendLogs(existingLogs: LogEntry[], newLogs: string[] | undefined): LogEntry[] {
    return [...existingLogs, ...(newLogs ?? []).map(line => ({ id: nextLogId++, line }))];
}

function notifyRepatchIfNeeded(info: InstallInfo): void {
    if (!info.repatchWarning) return;

    const key = `${info.discordRoot}:${info.clientLabel}:${info.repatchWarning}`;
    if (lastRepatchNotificationKey === key) return;

    lastRepatchNotificationKey = key;
    showNotification({
        title: t("GhostInstaller"),
        body: info.repatchWarning,
        permanent: true,
        onClick: () => SettingsRouter.openUserSettings(`${SETTINGS_ENTRY_KEY}_panel`)
    });
}

function GhostWarning() {
    return (
        <div className="vc-ghost-installer-warning">
            <Heading tag="h3">{t("GhostInstaller Warning")}</Heading>
            <Paragraph>
                {t("This installer downloads and injects GhostClient and its companion ghost-server into LoliCord. It enables multi-account voice join, screen streaming, and custom audio input.")}
            </Paragraph>
            <Paragraph>
                {t("GhostClient remains permanently installed across Discord updates until you click Delete. Clicking Delete cleanly terminates the local server and removes all injected files.")}
            </Paragraph>
        </div>
    );
}

function InfoLine({ label, value }: { label: string; value: string; }) {
    return (
        <div className="vc-ghost-installer-info-line">
            <span>{label}</span>
            <code>{value || "--"}</code>
        </div>
    );
}

function InstallationStatus({ info }: { info: InstallInfo | ActionInfo; }) {
    if (info.installStatus === "installed") {
        return (
            <div className={classes("vc-ghost-installer-install-status", "vc-ghost-installer-install-status-installed")}>
                <GhostInstallerSidebarIcon width={36} height={36} />
                <div>
                    <Heading tag="h3">{t("GhostClient is installed")}</Heading>
                    <Paragraph>{t("GhostClient is active and ghost-server is ready for")} {info.clientLabel}.</Paragraph>
                </div>
            </div>
        );
    }

    if (info.installStatus === "needsReinstall") {
        return (
            <div className={classes("vc-ghost-installer-install-status", "vc-ghost-installer-install-status-needs-reinstall")}>
                <WarningIcon width={36} height={36} />
                <div>
                    <Heading tag="h3">{t("GhostClient must be installed again")}</Heading>
                    <Paragraph>{info.repatchWarning || t("Discord was updated after GhostClient was installed. Click Patch to reinstall.")}</Paragraph>
                </div>
            </div>
        );
    }

    return (
        <div className={classes("vc-ghost-installer-install-status", "vc-ghost-installer-install-status-not-installed")}>
            <NoEntrySignIcon width={36} height={36} />
            <div>
                <Heading tag="h3">{t("GhostClient is not installed")}</Heading>
                <Paragraph>{t("Click Patch to download from GitHub and install GhostClient.")}</Paragraph>
            </div>
        </div>
    );
}

function LogLine({ entry }: { entry: LogEntry; }) {
    const match = /^\[([^\]]+)]\s*(.*)$/.exec(entry.line);
    const timestamp = match?.[1] || "";
    const rawMessage = match?.[2] || entry.line;
    const level: LogLevel = /^(?:FAIL|ERROR):/i.test(rawMessage)
        ? "error"
        : /^WARN:/i.test(rawMessage)
            ? "warning"
            : /^OK:/i.test(rawMessage)
                ? "success"
                : "info";
    const message = rawMessage.replace(/^(?:FAIL|ERROR|WARN|OK):\s*/i, "");

    return (
        <div className={classes("vc-ghost-installer-log-line", `vc-ghost-installer-log-line-${level}`)}>
            <span className="vc-ghost-installer-log-time">{timestamp || "--"}</span>
            <span className="vc-ghost-installer-log-level">{level}</span>
            <span className="vc-ghost-installer-log-message">{message}</span>
        </div>
    );
}

function GhostClientInstallerPanel() {
    const [root, setRoot] = React.useState("");
    const [githubUrl, setGithubUrl] = React.useState("");
    const [info, setInfo] = React.useState<InstallInfo | ActionInfo | null>(null);
    const [status, setStatus] = React.useState("Ready.");
    const [logs, setLogs] = React.useState<LogEntry[]>([]);
    const [busy, setBusy] = React.useState(false);
    const [progress, setProgressState] = React.useState<InstallProgress>(globalProgress);

    const isOperationBusy = busy || progress.active;

    async function runNative<T>(action: () => Promise<NativeResult<T>>): Promise<T | null> {
        setBusy(true);
        const pollLogsTimer = setInterval(async () => {
            try {
                const res = await Native.readLogs();
                if (res?.success && Array.isArray(res.data)) {
                    setLogs(appendLogs([], res.data));
                }
            } catch {}
        }, 500);

        try {
            const result = await action();
            clearInterval(pollLogsTimer);
            setLogs(currentLogs => appendLogs(currentLogs, result.logs));

            if (!result.success) {
                setStatus(result.error);
                showToast(result.error, Toasts.Type.FAILURE);
                return null;
            }

            return result.data;
        } finally {
            clearInterval(pollLogsTimer);
            setBusy(false);
        }
    }

    async function autoDetect(): Promise<void> {
        const detected = await runNative(() => Native.autoDetect());
        if (!detected) return;

        setInfo(detected);
        setRoot(detected.discordRoot);
        if (!githubUrl && detected.defaultGithubUrl) {
            setGithubUrl(detected.defaultGithubUrl);
        }
        setStatus(detected.repatchWarning || t("Discord install detected."));
        notifyRepatchIfNeeded(detected);
    }

    async function loadLogs(): Promise<void> {
        const result = await Native.readLogs();
        if (result.success) setLogs(appendLogs([], result.data));
    }

    async function clearLogs(): Promise<void> {
        const cleared = await runNative(() => Native.clearLogs());
        if (!cleared) return;

        setLogs([]);
        setStatus(t("Logs cleared."));
        showToast(t("Logs cleared."), Toasts.Type.SUCCESS);
    }

    async function browse(): Promise<void> {
        const selected = await runNative(() => Native.chooseDiscordRoot());
        if (!selected) return;

        setInfo(selected);
        setRoot(selected.discordRoot);
        setStatus(selected.repatchWarning || t("Discord install selected."));
        notifyRepatchIfNeeded(selected);
    }

    async function runPatch(): Promise<void> {
        const targetUrl = githubUrl.trim() || info?.defaultGithubUrl;
        if (!targetUrl) {
            setStatus(t("Please provide a valid release URL."));
            showToast(t("Please provide a valid release URL."), Toasts.Type.FAILURE);
            return;
        }

        startGlobalPoller();

        const result = await runNative<ActionInfo>(() => Native.patchGhostClient({
            githubUrl: targetUrl,
            discordRoot: root
        }));

        if (!result) return;
        setInfo(result);
        // Auto-enable the GhostClient plugin so it activates immediately after patching
        try {
            (Settings.plugins["GhostClient"] ??= {} as any).enabled = true;
            (Settings.plugins["ghostClient"] ??= {} as any).enabled = true;
            flushSettings();
            if (plugins["GhostClient"] && !isPluginEnabled("GhostClient")) {
                startPlugin(plugins["GhostClient"]);
            }
        } catch {}
        setStatus(t("GhostClient installed successfully."));
        showToast(t("GhostClient installed successfully."), Toasts.Type.SUCCESS);
    }

    async function runDelete(): Promise<void> {
        startGlobalPoller();

        // 1. Terminate all active ghost sessions first so accounts leave voice immediately
        try {
            await fetch("http://127.0.0.1:47821/leave-all", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
                signal: AbortSignal.timeout(1500)
            }).catch(() => {});
        } catch {}

        // 2. Turn off GhostClient plugin in settings and stop it
        try {
            (Settings.plugins["GhostClient"] ??= {} as any).enabled = false;
            (Settings.plugins["ghostClient"] ??= {} as any).enabled = false;
            flushSettings();
            if (plugins["GhostClient"] && isPluginEnabled("GhostClient")) {
                stopPlugin(plugins["GhostClient"]);
            }
        } catch {}

        const result = await runNative<ActionInfo>(() => Native.revertGhostClient({
            discordRoot: root
        }));

        if (!result) return;
        setInfo(result);
        setStatus(t("GhostClient deleted successfully."));
        showToast(t("GhostClient deleted successfully."), Toasts.Type.SUCCESS);
    }

    function confirmPatch() {
        Alerts.show({
            title: t("Install GhostClient"),
            confirmText: t("Patch and Inject"),
            cancelText: t("Cancel"),
            confirmColor: "brand",
            body: (
                <div style={{ color: "var(--text-normal, #dbdee1)", fontSize: "14px", lineHeight: "1.4" }}>
                    {t("This will download GhostClient and ghost-server from the release source, inject them into LoliCord, and launch the background service. Do you want to proceed?")}
                </div>
            ),
            onConfirm: () => void runPatch()
        });
    }

    function confirmDelete() {
        Alerts.show({
            title: t("Delete GhostClient"),
            confirmText: t("Delete"),
            cancelText: t("Cancel"),
            confirmColor: "brand-danger",
            body: (
                <div style={{ color: "var(--text-normal, #dbdee1)", fontSize: "14px", lineHeight: "1.4" }}>
                    {t("Are you sure you want to completely delete GhostClient? This will shut down the local server, remove all plugin files, and recompile LoliCord cleanly.")}
                </div>
            ),
            onConfirm: () => void runDelete()
        });
    }

    React.useEffect(() => {
        void autoDetect();
        void loadLogs();

        // Check active progress immediately on mount (survives closing and reopening settings)
        void Native.getInstallProgress().then(res => {
            if (res?.success && res.data) {
                globalProgress = res.data;
                setProgressState({ ...res.data });
                if (res.data.active) {
                    startGlobalPoller();
                }
            }
        });

        const onProgressUpdate = (p: InstallProgress) => {
            setProgressState({ ...p });
            if (p.info) {
                setInfo(p.info);
            }
            if (p.error) {
                setStatus(p.error);
            } else if (p.stage) {
                setStatus(p.stage);
            }
        };

        progressListeners.add(onProgressUpdate);
        return () => {
            progressListeners.delete(onProgressUpdate);
        };
    }, []);

    return (
        <div className="vc-ghost-installer-root">
            <div className="vc-ghost-installer-controls">
                <div className="vc-ghost-installer-select-grid">
                    <div className="vc-ghost-installer-select-row">
                        <span>{t("Release URL")}</span>
                        <TextInput
                            value={githubUrl}
                            placeholder="https://source.nightcord.st/nightcord/ghostclient/releases"
                            onChange={(value: string) => setGithubUrl(value)}
                            disabled={isOperationBusy}
                        />
                    </div>
                    <div className="vc-ghost-installer-select-row">
                        <span>{t("Discord Install Folder")}</span>
                        <TextInput
                            value={root}
                            placeholder={t("Discord install folder")}
                            onChange={(value: string) => setRoot(value)}
                            disabled={isOperationBusy}
                        />
                    </div>
                </div>

                <div className="vc-ghost-installer-buttons">
                    <Button
                        color={Button.Colors.PRIMARY}
                        size={Button.Sizes.SMALL}
                        disabled={isOperationBusy}
                        onClick={() => void autoDetect()}
                    >{t("Auto-detect")}</Button>
                    <Button
                        color={Button.Colors.PRIMARY}
                        size={Button.Sizes.SMALL}
                        disabled={isOperationBusy}
                        onClick={() => void browse()}
                    >{t("Browse")}</Button>
                    <Button
                        color={Button.Colors.GREEN}
                        size={Button.Sizes.SMALL}
                        disabled={isOperationBusy}
                        onClick={confirmPatch}
                    >{t("Patch GhostClient")}</Button>
                    <Button
                        color={Button.Colors.RED}
                        size={Button.Sizes.SMALL}
                        disabled={isOperationBusy}
                        onClick={confirmDelete}
                    >{t("Delete GhostClient")}</Button>
                </div>
            </div>

            <ProgressBar progress={progress} />

            {info && <InstallationStatus info={info} />}

            {info && (
                <div className="vc-ghost-installer-info">
                    <InfoLine label={t("Client")} value={info.clientLabel} />
                    <InfoLine label={t("Platform")} value={`${info.platformLabel} ${info.readableOs}`} />
                    <InfoLine label={t("Server Status")} value={info.ghostServerStatus} />
                    <InfoLine label={t("Plugin Path")} value={info.ghostPluginPath} />
                    <InfoLine label={t("Server Path")} value={info.ghostServerPath} />
                    {"logPath" in info && <InfoLine label={t("Log file")} value={info.logPath} />}
                    <InfoLine label={t("Last Patch")} value={info.lastPatchLabel} />
                </div>
            )}

            <Paragraph className="vc-ghost-installer-status">{isOperationBusy ? (progress.stage || t("Working...")) : status}</Paragraph>

            <div className="vc-ghost-installer-log-panel">
                <div className="vc-ghost-installer-log-header">
                    <div>
                        <Heading tag="h3">{t("Installer logs")}</Heading>
                        <Paragraph>{logs.length ? `${logs.length} ${t("log entries.")}` : t("No log entries yet.")}</Paragraph>
                    </div>
                    <Button
                        color={Button.Colors.RED}
                        size={Button.Sizes.SMALL}
                        disabled={isOperationBusy || !logs.length}
                        onClick={() => void clearLogs()}
                    >
                        <DeleteIcon width={16} height={16} />
                        {t("Clear logs")}
                    </Button>
                </div>
                <div className="vc-ghost-installer-log" role="log" aria-live="polite">
                    {logs.length
                        ? logs.slice(-200).map(entry => <LogLine key={entry.id} entry={entry} />)
                        : <div className="vc-ghost-installer-log-empty">{t("GhostInstaller activity will appear here.")}</div>}
                </div>
            </div>
        </div>
    );
}

function GhostInstallerPage() {
    return (
        <>
            <GhostWarning />
            <GhostClientInstallerPanel />
        </>
    );
}

const settings = definePluginSettings({
    installer: {
        type: OptionType.COMPONENT,
        component: ErrorBoundary.wrap(GhostClientInstallerPanel, { noop: true }),
    }
});

export default definePlugin({
    name: "GhostInstaller",
    description: "Downloads, patches, and manages GhostClient and its background companion server from GitHub.",
    tags: ["Utility"],
    authors: [{ name: "Nightcord", id: 0n }],
    enabledByDefault: true,
    reporterTestable: ReporterTestable.None,
    settings,
    settingsAboutComponent: ErrorBoundary.wrap(GhostWarning, { noop: true }),
    toolboxActions: {
        [t("Open GhostInstaller")]: () => SettingsRouter.openUserSettings(`${SETTINGS_ENTRY_KEY}_panel`),
    },

    start() {
        if (!SettingsPlugin.customEntries.some(entry => entry.key === SETTINGS_ENTRY_KEY)) {
            SettingsPlugin.customEntries.push({
                key: SETTINGS_ENTRY_KEY,
                title: t("GhostInstaller"),
                Component: ErrorBoundary.wrap(GhostInstallerPage, { noop: true }),
                Icon: GhostInstallerSidebarIcon,
            });
        }

        void Native.autoDetect().then(result => {
            if (result.success) notifyRepatchIfNeeded(result.data);
        }, () => void 0);
    },

    stop() {
        removeFromArray(SettingsPlugin.customEntries, entry => entry.key === SETTINGS_ENTRY_KEY);
    }
});

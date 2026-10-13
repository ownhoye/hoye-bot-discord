/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Nightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { Button, React } from "@webpack/common";
import { Flex, FlexAlign, FlexDirection, FlexJustify } from "@components/Flex";
import { Card } from "@components/Card";
import { screenFreezeEngine } from "./engine";
import { ScreenFreezeState } from "./types";
import { t } from "../autoTranslateLoliCord";

export interface KeybindConfig {
    code: string;
    key: string;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    label: string;
}

const DEFAULT_KEYBIND: KeybindConfig = {
    code: "KeyF",
    key: "F",
    ctrl: true,
    shift: true,
    alt: false,
    label: "Ctrl + Shift + F"
};

function formatKeyLabel(code: string, key: string, ctrl: boolean, shift: boolean, alt: boolean): string {
    const parts: string[] = [];
    if (ctrl) parts.push("Ctrl");
    if (shift) parts.push("Shift");
    if (alt) parts.push("Alt");

    let cleanKey = key.toUpperCase();
    if (code.startsWith("Key")) cleanKey = code.slice(3);
    else if (code.startsWith("Digit")) cleanKey = code.slice(5);
    else if (code.startsWith("Numpad")) cleanKey = "Num " + code.slice(6);

    parts.push(cleanKey);
    return parts.join(" + ");
}

const settings = definePluginSettings({
    keybindConfig: {
        type: OptionType.COMPONENT,
        description: "Emergency freeze shortcut key combination.",
        default: DEFAULT_KEYBIND,
        component: KeybindRecorderComponent
    }
});

function KeybindRecorderComponent() {
    const [isRecording, setIsRecording] = React.useState(false);
    const [config, setConfig] = React.useState<KeybindConfig>(() => settings.store.keybindConfig || DEFAULT_KEYBIND);

    React.useEffect(() => {
        if (!isRecording) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
                return;
            }

            const newConfig: KeybindConfig = {
                code: e.code,
                key: e.key,
                ctrl: e.ctrlKey,
                shift: e.shiftKey,
                alt: e.altKey,
                label: formatKeyLabel(e.code, e.key, e.ctrlKey, e.shiftKey, e.altKey)
            };

            settings.store.keybindConfig = newConfig;
            setConfig(newConfig);
            setIsRecording(false);
        };

        const handleBlur = () => setIsRecording(false);

        document.addEventListener("keydown", handleKeyDown, true);
        window.addEventListener("blur", handleBlur);

        return () => {
            document.removeEventListener("keydown", handleKeyDown, true);
            window.removeEventListener("blur", handleBlur);
        };
    }, [isRecording]);

    return (
        <div style={{ marginTop: "6px", marginBottom: "8px" }}>
            <Flex alignItems={FlexAlign.CENTER} gap="10px">
                <Button
                    variant={isRecording ? "dangerPrimary" : "primary"}
                    onClick={() => setIsRecording(!isRecording)}
                    style={{
                        minWidth: "180px",
                        fontWeight: 600,
                        border: isRecording ? "1px solid #f04747" : undefined,
                        boxShadow: isRecording ? "0 0 12px rgba(240, 71, 71, 0.4)" : undefined
                    }}
                >
                    {isRecording ? t("Press any key combo...") : config.label || "Ctrl + Shift + F"}
                </Button>

                <Button
                    variant="secondary"
                    onClick={() => {
                        setIsRecording(false);
                        settings.store.keybindConfig = DEFAULT_KEYBIND;
                        setConfig(DEFAULT_KEYBIND);
                    }}
                >
                    {t("Reset to Default")}
                </Button>
            </Flex>
            <span style={{ color: "var(--text-muted, #949ba4)", fontSize: "12px", marginTop: "6px", display: "block" }}>
                {isRecording
                    ? t("Press your shortcut combination now (e.g. Shift + R, Ctrl + Space, F8)...")
                    : t("Click the button above to record a new key combination.")}
            </span>
        </div>
    );
}

function getKeyComboString(): string {
    const cfg = settings.store.keybindConfig || DEFAULT_KEYBIND;
    return cfg.label || formatKeyLabel(cfg.code, cfg.key, cfg.ctrl, cfg.shift, cfg.alt);
}

function handleKeydown(e: KeyboardEvent) {
    const cfg: KeybindConfig = settings.store.keybindConfig || DEFAULT_KEYBIND;

    const matchCtrl = Boolean(cfg.ctrl) === Boolean(e.ctrlKey);
    const matchShift = Boolean(cfg.shift) === Boolean(e.shiftKey);
    const matchAlt = Boolean(cfg.alt) === Boolean(e.altKey);
    const matchCode = e.code === cfg.code || e.key.toUpperCase() === cfg.key.toUpperCase();

    if (matchCode && matchCtrl && matchShift && matchAlt) {
        e.preventDefault();
        e.stopPropagation();

        screenFreezeEngine.toggleFreeze();
    }
}

function ScreenFreezeSettingsComponent() {
    const [state, setState] = React.useState<ScreenFreezeState>(() => screenFreezeEngine.getState());

    React.useEffect(() => {
        const unsub = screenFreezeEngine.subscribe(setState);
        return () => unsub();
    }, []);

    const keyText = getKeyComboString();

    return (
        <div style={{ width: "100%", marginTop: "10px" }}>
            <Card
                variant="primary"
                outline
                style={{
                    padding: "16px",
                    background: state.isFrozen ? "rgba(240, 71, 71, 0.15)" : "var(--background-secondary, #2b2d31)",
                    borderRadius: "8px",
                    border: state.isFrozen ? "1px solid rgba(240, 71, 71, 0.5)" : undefined,
                    marginBottom: "16px"
                }}
            >
                <Flex alignItems={FlexAlign.CENTER} justifyContent={FlexJustify.BETWEEN} style={{ width: "100%" }}>
                    <div>
                        <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "14px", display: "block" }}>
                            {t("Screen Freeze Status")}
                        </span>
                        <span style={{ color: state.isFrozen ? "var(--status-danger, #f04747)" : "var(--text-muted, #949ba4)", fontSize: "12px", fontWeight: state.isFrozen ? 600 : 400 }}>
                            {state.isFrozen
                                ? `● ${t("ACTIVE - Screenshare is frozen on static frame")} (${t("Shortcut:")} ${keyText})`
                                : `○ ${t("Inactive / Screenshare live")} (${t("Shortcut:")} ${keyText})`}
                        </span>
                    </div>
                    <Button
                        variant={state.isFrozen ? "dangerPrimary" : "primary"}
                        onClick={() => screenFreezeEngine.toggleFreeze()}
                    >
                        {state.isFrozen ? t("Unfreeze Stream") : t("Freeze Screen Now")}
                    </Button>
                </Flex>
            </Card>
        </div>
    );
}

export default definePlugin({
    name: "ScreenFreeze",
    description: "Emergency panic shortcut that instantly freezes your Discord screenshare on a static image until pressed again.",
    authors: [
        { name: "LoliCord", id: 0n }
    ],
    enabledByDefault: false,
    settings,
    settingsAboutComponent: ScreenFreezeSettingsComponent,

    start() {
        screenFreezeEngine.startPatch();
        window.addEventListener("keydown", handleKeydown, true);
        document.addEventListener("keydown", handleKeydown, true);
    },

    stop() {
        screenFreezeEngine.stopPatch();
        window.removeEventListener("keydown", handleKeydown, true);
        document.removeEventListener("keydown", handleKeydown, true);
    }
});

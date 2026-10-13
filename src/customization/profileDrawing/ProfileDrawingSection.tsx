/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FormSwitch } from "@components/FormSwitch";
import { Button, React, Slider, useEffect, useState } from "@webpack/common";
import { t } from "../../lolicordplugins/autoTranslateLoliCord";
import {
    clearAllStrokes,
    getActiveBrushColor,
    getActiveBrushSize,
    getDrawingStrokes,
    initOwnDrawingStrokes,
    isDrawingModeActive,
    saveDrawing,
    setActiveBrushColor,
    setActiveBrushSize,
    setDrawingMode,
    subscribeDrawingState,
    undoLastStroke
} from "./drawingManager";

const UndoIcon = ({ width = 14, height = 14 }: { width?: number; height?: number }) => (
    <svg
        width={width}
        height={height}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginRight: 6 }}
        aria-hidden="true"
    >
        <path d="M3 7v6h6" />
        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
);

const ClearIcon = ({ width = 14, height = 14 }: { width?: number; height?: number }) => (
    <svg
        width={width}
        height={height}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginRight: 6 }}
        aria-hidden="true"
    >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);

const SaveIcon = ({ width = 16, height = 16 }: { width?: number; height?: number }) => (
    <svg
        width={width}
        height={height}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginRight: 6 }}
        aria-hidden="true"
    >
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
    </svg>
);

export function ProfileDrawingSection() {
    const [, setTick] = useState(0);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        void initOwnDrawingStrokes();
        const unsub = subscribeDrawingState(() => {
            setTick(t => t + 1);
        });
        return () => unsub();
    }, []);

    const isDrawing = isDrawingModeActive();
    const currentColor = getActiveBrushColor();
    const currentSize = getActiveBrushSize();
    const strokes = getDrawingStrokes();

    const handleToggleDrawing = (val: boolean) => {
        setDrawingMode(val);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveDrawing();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="nc-drawing-section-group">
            {/* Native Discord ON/OFF Switch */}
            <div className="nc-drawing-switch-wrapper">
                <FormSwitch
                    title={t("Drawing Mode")}
                    description={
                        isDrawing
                            ? t("Drawing mode active (Ctrl+Z to undo)")
                            : strokes.length > 0
                            ? `${strokes.length} ${t("stroke(s) drawn")}`
                            : t("Draw freely on your profile preview")
                    }
                    value={isDrawing}
                    onChange={handleToggleDrawing}
                    hideBorder
                />
            </div>

            {/* Controls Panel */}
            <div className="nc-drawing-controls-panel">
                {/* 1. Brush Size Slider */}
                <div className="nc-drawing-control-card">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span className="nc-drawing-control-label">{t("Brush Size")}</span>
                        <span className="nc-drawing-size-badge">{currentSize}px</span>
                    </div>

                    <div className="nc-drawing-slider-wrapper">
                        <Slider
                            minValue={1}
                            maxValue={36}
                            initialValue={currentSize}
                            onValueChange={(val: number) => setActiveBrushSize(Math.max(1, Math.round(val)))}
                            onValueRender={(val: number) => `${Math.round(val)}px`}
                            stickToMarkers={false}
                        />
                    </div>
                </div>

                {/* 2. Color Square */}
                <div className="nc-drawing-control-card">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <span className="nc-drawing-control-label">{t("Color")}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", fontFamily: "monospace" }}>
                            {currentColor.toUpperCase()}
                        </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <label
                            className="nc-drawing-color-square"
                            style={{ backgroundColor: currentColor }}
                            title={t("Choose Color")}
                        >
                            <input
                                type="color"
                                value={currentColor}
                                onChange={e => setActiveBrushColor(e.target.value)}
                                className="nc-drawing-native-color-picker"
                            />
                        </label>
                    </div>
                </div>

                {/* 3. Action Buttons */}
                <div className="nc-drawing-actions-container">
                    <Button
                        size={Button.Sizes.MEDIUM}
                        color={Button.Colors.BRAND}
                        onClick={handleSave}
                        submitting={saving}
                        className="nc-drawing-save-btn"
                    >
                        <SaveIcon />
                        {t("Save Drawing")}
                    </Button>

                    <div className="nc-drawing-subactions-grid">
                        <Button
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.PRIMARY}
                            onClick={undoLastStroke}
                            disabled={strokes.length === 0}
                        >
                            <UndoIcon />
                            {t("Undo")}
                        </Button>

                        <Button
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.RED}
                            onClick={clearAllStrokes}
                            disabled={strokes.length === 0}
                        >
                            <ClearIcon />
                            {t("Clear")}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

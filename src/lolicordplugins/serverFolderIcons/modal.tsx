/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Nightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, FormSwitch, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, React, Slider, Text, TextInput, showToast, Toasts } from "@webpack/common";
import { ModalSize } from "@utils/modal";
import { Flex, FlexAlign, FlexDirection, FlexJustify } from "@components/Flex";
import { Card } from "@components/Card";
import { CustomFolderIconData, BackgroundMode, ServerFolderProps } from "./types";
import { t } from "../autoTranslateLoliCord";

export function int2rgba(rgbVal: number = 0, alpha: number = 1): string {
    const b = rgbVal & 0xFF;
    const g = (rgbVal & 0xFF00) >>> 8;
    const r = (rgbVal & 0xFF0000) >>> 16;
    return `rgba(${[r, g, b].join(",")},${alpha})`;
}

export function FolderIconEditModal({
    folderProps,
    initialData,
    onSave,
    onReset,
    onClose,
    transitionState
}: {
    folderProps: ServerFolderProps;
    initialData?: CustomFolderIconData | null;
    onSave: (data: CustomFolderIconData) => void;
    onReset: () => void;
    onClose: () => void;
    transitionState: any;
}) {
    const [url, setUrl] = React.useState(initialData?.url || "");
    const [size, setSize] = React.useState(initialData?.size ?? 100);
    const [radius, setRadius] = React.useState(initialData?.radius ?? 33);
    const [bgMode, setBgMode] = React.useState<BackgroundMode>(initialData?.bgMode || "folderColor");

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            showToast("File size too large (max 5 MB)", Toasts.Type.DANGER);
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") {
                setUrl(reader.result);
                showToast("Image loaded", Toasts.Type.SUCCESS);
            }
        };
        reader.readAsDataURL(file);
    };

    // Calculate background style for preview
    let previewBackground = "transparent";
    if (bgMode === "folderColor") {
        previewBackground = int2rgba(folderProps.folderColor ?? 0x5865F2, 0.4);
    } else if (bgMode === "solid") {
        previewBackground = int2rgba(folderProps.folderColor ?? 0x5865F2, 1.0);
    }

    return (
        <ModalRoot transitionState={transitionState} size={ModalSize.MEDIUM}>
            <ModalHeader separator={false} style={{ padding: "20px 24px 12px 24px" }}>
                <Flex alignItems={FlexAlign.CENTER} justifyContent={FlexJustify.BETWEEN} style={{ width: "100%" }}>
                    <div>
                        <h2 style={{ color: "#ffffff", fontSize: "18px", fontWeight: 700, margin: 0 }}>
                            {t("Customize Folder Icon")}
                        </h2>
                        <span style={{ color: "var(--text-muted, #949ba4)", fontSize: "13px" }}>
                            {folderProps.folderName || `Folder #${folderProps.folderId}`}
                        </span>
                    </div>
                    <ModalCloseButton onClick={onClose} />
                </Flex>
            </ModalHeader>

            <ModalContent style={{ padding: "12px 24px 24px 24px" }}>
                {/* Live Preview Section */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "20px",
                    padding: "16px 20px",
                    background: "var(--background-secondary, #2b2d31)",
                    borderRadius: "10px",
                    marginBottom: "18px",
                    border: "1px solid var(--background-modifier-accent, rgba(255,255,255,0.06))"
                }}>
                    <div style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: `${radius}%`,
                        backgroundColor: previewBackground,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        flexShrink: 0,
                        border: bgMode === "transparent" ? "1px dashed rgba(255,255,255,0.2)" : "none",
                        transition: "all 0.2s ease"
                    }}>
                        {url ? (
                            <img
                                src={url}
                                alt="Folder Preview"
                                style={{
                                    width: `${size}%`,
                                    height: `${size}%`,
                                    objectFit: "contain",
                                    transition: "all 0.15s ease"
                                }}
                            />
                        ) : (
                            <span style={{ color: "var(--text-muted, #949ba4)", fontSize: "11px", textAlign: "center" }}>
                                {t("No Icon")}
                            </span>
                        )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ color: "#ffffff", fontWeight: 600, fontSize: "14px" }}>
                            {t("Live Preview")}
                        </span>
                        <span style={{ color: "var(--text-muted, #949ba4)", fontSize: "12px", lineHeight: "1.4" }}>
                            {t("This is how your folder will look in the Discord server list.")}
                        </span>
                    </div>
                </div>

                {/* URL Input and File Picker */}
                <div style={{ marginBottom: "16px" }}>
                    <span style={{ color: "#ffffff", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>
                        {t("Image URL or Base64")}
                    </span>
                    <Flex alignItems={FlexAlign.CENTER} gap="8px" style={{ width: "100%" }}>
                        <TextInput
                            value={url}
                            onChange={(val: string) => setUrl(val)}
                            placeholder="https://example.com/logo.png"
                            style={{ flex: 1 }}
                        />
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileUpload}
                            style={{ display: "none" }}
                        />
                        <Button
                            variant="secondary"
                            onClick={() => fileInputRef.current?.click()}
                            style={{ whiteSpace: "nowrap" }}
                        >
                            {t("Choose Local File")}
                        </Button>
                    </Flex>
                </div>

                {/* Sliders: Size & Radius */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                    <div>
                        <Flex alignItems={FlexAlign.CENTER} justifyContent={FlexJustify.BETWEEN} style={{ marginBottom: "6px" }}>
                            <span style={{ color: "#ffffff", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                {t("Icon Size")}
                            </span>
                            <span style={{ color: "var(--text-muted, #949ba4)", fontSize: "12px" }}>{size}%</span>
                        </Flex>
                        <Slider
                            initialValue={size}
                            onValueChange={(v: number) => setSize(Math.round(v))}
                            minValue={30}
                            maxValue={150}
                            keyboardStep={5}
                            stickToMarkers={false}
                        />
                    </div>
                    <div>
                        <Flex alignItems={FlexAlign.CENTER} justifyContent={FlexJustify.BETWEEN} style={{ marginBottom: "6px" }}>
                            <span style={{ color: "#ffffff", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                {t("Corner Radius")}
                            </span>
                            <span style={{ color: "var(--text-muted, #949ba4)", fontSize: "12px" }}>{radius}%</span>
                        </Flex>
                        <Slider
                            initialValue={radius}
                            onValueChange={(v: number) => setRadius(Math.round(v))}
                            minValue={0}
                            maxValue={50}
                            keyboardStep={5}
                            stickToMarkers={false}
                        />
                    </div>
                </div>

                {/* Background Mode Options */}
                <div>
                    <span style={{ color: "#ffffff", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "8px" }}>
                        {t("Background Mode")}
                    </span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                        <Button
                            variant={bgMode === "transparent" ? "primary" : "secondary"}
                            onClick={() => setBgMode("transparent")}
                            style={{ fontSize: "12px", padding: "8px 12px" }}
                        >
                            {t("Transparent Background")}
                        </Button>
                        <Button
                            variant={bgMode === "folderColor" ? "primary" : "secondary"}
                            onClick={() => setBgMode("folderColor")}
                            style={{ fontSize: "12px", padding: "8px 12px" }}
                        >
                            {t("Folder Color (Discord)")}
                        </Button>
                        <Button
                            variant={bgMode === "solid" ? "primary" : "secondary"}
                            onClick={() => setBgMode("solid")}
                            style={{ fontSize: "12px", padding: "8px 12px" }}
                        >
                            {t("Solid Color")}
                        </Button>
                    </div>
                </div>
            </ModalContent>

            <ModalFooter>
                <Flex alignItems={FlexAlign.CENTER} justifyContent={FlexJustify.BETWEEN} style={{ width: "100%" }}>
                    <Button
                        variant="dangerPrimary"
                        onClick={() => {
                            onReset();
                            onClose();
                            showToast("Folder icon reset", Toasts.Type.INFO);
                        }}
                    >
                        {t("Reset to Default")}
                    </Button>
                    <Flex alignItems={FlexAlign.CENTER} gap="10px">
                        <Button
                            variant="secondary"
                            onClick={onClose}
                        >
                            {t("Cancel")}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={() => {
                                if (!url) {
                                    onReset();
                                } else {
                                    onSave({
                                        url: url.trim(),
                                        size,
                                        radius,
                                        bgMode
                                    });
                                }
                                onClose();
                                showToast("Folder icon saved", Toasts.Type.SUCCESS);
                            }}
                        >
                            {t("Save Icon")}
                        </Button>
                    </Flex>
                </Flex>
            </ModalFooter>
        </ModalRoot>
    );
}

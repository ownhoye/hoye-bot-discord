/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Nightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, React } from "@webpack/common";
import { screenFreezeEngine } from "./engine";
import { ScreenFreezeState } from "./types";
import { t } from "../autoTranslateLoliCord";

export function ScreenFreezeFloatingIndicator({ keyComboText }: { keyComboText: string; }) {
    const [state, setState] = React.useState<ScreenFreezeState>(() => screenFreezeEngine.getState());

    React.useEffect(() => {
        const unsub = screenFreezeEngine.subscribe(setState);
        return () => unsub();
    }, []);

    if (!state.isFrozen) return null;

    return (
        <div style={{
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100000,
            backgroundColor: "rgba(240, 71, 71, 0.95)",
            backdropFilter: "blur(8px)",
            padding: "8px 16px",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            gap: "14px",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            animation: "nc-fade-in 0.2s ease-out"
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="9" x2="9" y2="15"></line>
                    <line x1="15" y1="9" x2="15" y2="15"></line>
                </svg>
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "13px", letterSpacing: "0.5px" }}>
                        {t("SCREENSHARE FROZEN")}
                    </span>
                    <span style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: "11px" }}>
                        {t("Viewers only see a static frame")} • {keyComboText}
                    </span>
                </div>
            </div>

            <Button
                variant="secondary"
                size="small"
                onClick={() => screenFreezeEngine.unfreeze()}
                style={{
                    backgroundColor: "#ffffff",
                    color: "#000000",
                    fontWeight: 700,
                    fontSize: "12px",
                    border: "none"
                }}
            >
                {t("Unfreeze")}
            </Button>
        </div>
    );
}

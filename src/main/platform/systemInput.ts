/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "child_process";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Cross-platform keyboard input and keystroke simulation.
 * Works natively on Windows (PowerShell), macOS (AppleScript / osascript), and Linux (xdotool / ydotool / wtype).
 */
export async function simulateTyping(text: string, delayMs: number = 50): Promise<void> {
    const platform = process.platform;
    const safeDelay = Math.max(0, Math.min(10000, delayMs));

    if (platform === "win32") {
        const psLines = [
            "Add-Type -AssemblyName System.WindowsForms;",
            "$text = $args[0];",
            "$delay = [int]$args[1];",
            "foreach ($char in $text.ToCharArray()) {",
            "  [System.Windows.Forms.SendKeys]::SendWait($char);",
            "  if ($delay -gt 0) { Start-Sleep -m $delay; }",
            "}"
        ];
        const psScript = psLines.join("\r\n");
        const tempDir = mkdtempSync(join(tmpdir(), "lolicord-type-"));
        const tempFile = join(tempDir, "sendkeys.ps1");
        try {
            writeFileSync(tempFile, "\uFEFF" + psScript, "utf8");
            const child = spawn("powershell", [
                "-NoProfile", "-ExecutionPolicy", "Bypass",
                "-File", tempFile, text, String(safeDelay)
            ]);
            await new Promise<void>((resolve, reject) => {
                child.on("error", reject);
                child.on("exit", code => {
                    if (code === 0) resolve();
                    else reject(new Error(`PowerShell exit code ${code}`));
                });
            });
        } finally {
            try { unlinkSync(tempFile); } catch {}
            try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
        }
    } else if (platform === "darwin") {
        // macOS AppleScript via osascript
        const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const script = `tell application "System Events" to keystroke "${escaped}"`;
        await new Promise<void>((resolve, reject) => {
            const child = spawn("osascript", ["-e", script]);
            child.on("error", reject);
            child.on("exit", code => (code === 0 ? resolve() : reject(new Error(`osascript exit code ${code}`))));
        });
    } else {
        // Linux: try xdotool, fallback to wtype (Wayland) or ydotool
        await new Promise<void>((resolve, reject) => {
            const child = spawn("xdotool", ["type", "--delay", String(safeDelay), text]);
            child.on("error", () => {
                // Fallback to wtype for Wayland
                const wtype = spawn("wtype", ["-d", String(safeDelay), text]);
                wtype.on("error", () => {
                    // Fallback to ydotool
                    const ydotool = spawn("ydotool", ["type", text]);
                    ydotool.on("error", reject);
                    ydotool.on("exit", code => (code === 0 ? resolve() : reject(new Error(`ydotool exit code ${code}`))));
                });
                wtype.on("exit", code => (code === 0 ? resolve() : reject(new Error(`wtype exit code ${code}`))));
            });
            child.on("exit", code => (code === 0 ? resolve() : reject(new Error(`xdotool exit code ${code}`))));
        });
    }
}

/**
 * Cross-platform single key simulation (e.g. Backspace, Enter).
 */
export async function simulateKey(key: "BACKSPACE" | "ENTER" | "TAB" | "ESCAPE"): Promise<void> {
    const platform = process.platform;

    if (platform === "win32") {
        const keyMap: Record<string, string> = {
            BACKSPACE: "{BACKSPACE}",
            ENTER: "{ENTER}",
            TAB: "{TAB}",
            ESCAPE: "{ESC}"
        };
        const sendKey = keyMap[key] || "{ENTER}";
        const psCommand = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${sendKey}')`;
        await new Promise<void>((resolve, reject) => {
            const child = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand]);
            child.on("error", reject);
            child.on("exit", code => (code === 0 ? resolve() : reject(new Error(`PowerShell exit code ${code}`))));
        });
    } else if (platform === "darwin") {
        const keyCodeMap: Record<string, number> = {
            BACKSPACE: 51,
            ENTER: 36,
            TAB: 48,
            ESCAPE: 53
        };
        const code = keyCodeMap[key] ?? 36;
        const script = `tell application "System Events" to key code ${code}`;
        await new Promise<void>((resolve, reject) => {
            const child = spawn("osascript", ["-e", script]);
            child.on("error", reject);
            child.on("exit", c => (c === 0 ? resolve() : reject(new Error(`osascript exit code ${c}`))));
        });
    } else {
        const linuxKeyMap: Record<string, string> = {
            BACKSPACE: "BackSpace",
            ENTER: "Return",
            TAB: "Tab",
            ESCAPE: "Escape"
        };
        const linuxKey = linuxKeyMap[key] || "Return";
        await new Promise<void>((resolve, reject) => {
            const child = spawn("xdotool", ["key", linuxKey]);
            child.on("error", () => {
                const wtype = spawn("wtype", ["-k", linuxKey]);
                wtype.on("error", () => {
                    const ydotool = spawn("ydotool", ["key", `${linuxKey}:1`, `${linuxKey}:0`]);
                    ydotool.on("error", reject);
                    ydotool.on("exit", c => (c === 0 ? resolve() : reject(new Error(`ydotool exit code ${c}`))));
                });
                wtype.on("exit", c => (c === 0 ? resolve() : reject(new Error(`wtype exit code ${c}`))));
            });
            child.on("exit", c => (c === 0 ? resolve() : reject(new Error(`xdotool exit code ${c}`))));
        });
    }
}

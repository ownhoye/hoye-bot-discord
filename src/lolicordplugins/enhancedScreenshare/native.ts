/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, IpcMainInvokeEvent } from "electron";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface AudioProcessInfo {
    pid: number;
    name: string;
    title: string;
    state: number; // 0 = inactive, 1 = active (playing sound)
    peak: number;
    allPids: number[];
}

const CS_CODE = `using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace AudioSessionQuery {
    class Program {
        [ComImport]
        [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
        internal class MMDeviceEnumeratorComObject { }

        [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        internal interface IMMDeviceEnumerator {
            int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
            [PreserveSig]
            int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
        }

        [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        internal interface IMMDevice {
            [PreserveSig]
            int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
        }

        [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        internal interface IAudioSessionManager2 {
            [PreserveSig]
            int GetAudioSessionControl(ref Guid AudioSessionGuid, uint StreamFlags, out IntPtr SessionControl);
            [PreserveSig]
            int GetSimpleAudioVolume(ref Guid AudioSessionGuid, uint StreamFlags, out IntPtr AudioVolume);
            [PreserveSig]
            int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
        }

        [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        internal interface IAudioSessionEnumerator {
            [PreserveSig]
            int GetCount(out int SessionCount);
            [PreserveSig]
            int GetSession(int SessionIndex, out IAudioSessionControl Session);
        }

        [Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        internal interface IAudioSessionControl {
            [PreserveSig]
            int GetState(out int pRetVal);
            [PreserveSig]
            int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
            [PreserveSig]
            int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
            [PreserveSig]
            int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
            [PreserveSig]
            int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
            [PreserveSig]
            int GetGroupingParam(out Guid pRetVal);
            [PreserveSig]
            int SetGroupingParam(ref Guid Override, ref Guid EventContext);
            [PreserveSig]
            int RegisterAudioSessionNotification(IntPtr NewNotifications);
            [PreserveSig]
            int UnregisterAudioSessionNotification(IntPtr NewNotifications);
        }

        [Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        internal interface IAudioSessionControl2 {
            [PreserveSig]
            int GetState(out int pRetVal);
            [PreserveSig]
            int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
            [PreserveSig]
            int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
            [PreserveSig]
            int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
            [PreserveSig]
            int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
            [PreserveSig]
            int GetGroupingParam(out Guid pRetVal);
            [PreserveSig]
            int SetGroupingParam(ref Guid Override, ref Guid EventContext);
            [PreserveSig]
            int RegisterAudioSessionNotification(IntPtr NewNotifications);
            [PreserveSig]
            int UnregisterAudioSessionNotification(IntPtr NewNotifications);
            [PreserveSig]
            int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
            [PreserveSig]
            int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
            [PreserveSig]
            int GetProcessId(out uint pRetVal);
            [PreserveSig]
            int IsSystemSoundsSession();
            [PreserveSig]
            int SetDuckingPreference(bool optOut);
        }

        [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        internal interface IAudioMeterInformation {
            [PreserveSig]
            int GetPeakValue(out float pfPeak);
        }

        static void Main(string[] args) {
            var list = new List<string>();
            try {
                var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDevice dev;
                int hr = enumerator.GetDefaultAudioEndpoint(0, 0, out dev);
                if (hr != 0 || dev == null) {
                    Console.WriteLine("[]");
                    return;
                }

                Guid IID_IAudioSessionManager2 = typeof(IAudioSessionManager2).GUID;
                object oMgr;
                hr = dev.Activate(ref IID_IAudioSessionManager2, 23, IntPtr.Zero, out oMgr);
                if (hr != 0 || oMgr == null) {
                    Console.WriteLine("[]");
                    return;
                }

                var mgr = (IAudioSessionManager2)oMgr;
                IAudioSessionEnumerator sessionEnum;
                hr = mgr.GetSessionEnumerator(out sessionEnum);
                if (hr != 0 || sessionEnum == null) {
                    Console.WriteLine("[]");
                    return;
                }

                int count;
                sessionEnum.GetCount(out count);

                var pidsSeen = new HashSet<uint>();

                for (int i = 0; i < count; i++) {
                    IAudioSessionControl ctl;
                    if (sessionEnum.GetSession(i, out ctl) == 0 && ctl != null) {
                        var ctl2 = ctl as IAudioSessionControl2;
                        if (ctl2 != null) {
                            uint pid;
                            ctl2.GetProcessId(out pid);
                            if (pid > 0 && !pidsSeen.Contains(pid)) {
                                pidsSeen.Add(pid);
                                int state;
                                ctl2.GetState(out state);

                                float peak = 0;
                                var meter = ctl as IAudioMeterInformation;
                                if (meter != null) {
                                    meter.GetPeakValue(out peak);
                                }

                                string procName = "";
                                string title = "";
                                var allPids = new List<uint>();
                                allPids.Add(pid);

                                try {
                                    var proc = Process.GetProcessById((int)pid);
                                    procName = proc.ProcessName;
                                    title = proc.MainWindowTitle;

                                    if (!string.IsNullOrEmpty(procName)) {
                                        var siblings = Process.GetProcessesByName(procName);
                                        foreach (var s in siblings) {
                                            if (s.Id > 0 && !allPids.Contains((uint)s.Id)) {
                                                allPids.Add((uint)s.Id);
                                            }
                                            if (string.IsNullOrEmpty(title) && !string.IsNullOrEmpty(s.MainWindowTitle)) {
                                                title = s.MainWindowTitle;
                                            }
                                        }
                                    }
                                } catch {}

                                string pidsJson = "[" + string.Join(",", allPids) + "]";
                                list.Add("{\"pid\":" + pid + ",\"state\":" + state + ",\"peak\":" + peak.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",\"name\":\"" + procName.Replace("\\\\", "\\\\\\\\").Replace("\"", "\\\\\"") + "\",\"title\":\"" + title.Replace("\\\\", "\\\\\\\\").Replace("\"", "\\\\\"") + "\",\"allPids\":" + pidsJson + "}");
                            }
                        }
                    }
                }
            } catch {
                Console.WriteLine("[]");
                return;
            }
            Console.WriteLine("[" + string.Join(",", list) + "]");
        }
    }
}`;

let helperExePath: string | null = null;
let compilePromise: Promise<string | null> | null = null;

async function ensureHelperBinary(): Promise<string | null> {
    if (process.platform !== "win32") return null;
    if (helperExePath && fs.existsSync(helperExePath)) return helperExePath;
    if (compilePromise) return compilePromise;

    compilePromise = (async () => {
        try {
            const targetDir = path.join(app.getPath("userData"), "lolicord-helpers");
            await fs.promises.mkdir(targetDir, { recursive: true });
            const exeFile = path.join(targetDir, "audio_sessions_query.exe");
            const csFile = path.join(targetDir, "audio_sessions_query.cs");

            // Check if existing binary is valid
            if (fs.existsSync(exeFile)) {
                helperExePath = exeFile;
                return exeFile;
            }

            // Write C# source
            await fs.promises.writeFile(csFile, CS_CODE, "utf8");

            // Look for csc.exe compiler
            const cscPaths = [
                "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe",
                "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe"
            ];
            const csc = cscPaths.find(p => fs.existsSync(p));
            if (!csc) {
                console.warn("[EnhancedScreenshare] csc.exe not found on system");
                return null;
            }

            await new Promise<void>((resolve, reject) => {
                childProcess.execFile(
                    csc,
                    ["/target:exe", `/out:${exeFile}`, "/nologo", csFile],
                    { timeout: 10000 },
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            if (fs.existsSync(exeFile)) {
                helperExePath = exeFile;
                return exeFile;
            }
            return null;
        } catch (err) {
            console.error("[EnhancedScreenshare] Failed to compile audio sessions helper:", err);
            return null;
        } finally {
            compilePromise = null;
        }
    })();

    return compilePromise;
}

const SYSTEM_PROCESS_BLACKLIST = new Set([
    "svchost",
    "audiodg",
    "system",
    "idle",
    "registry",
    "services",
    "lsass",
    "csrss",
    "smss",
    "wininit",
    "fontdrvhost",
    "dwm",
    "antigravity",
    "explorer",
    "searchhost",
    "startmenuexperiencehost",
    "shellexperiencehost"
]);

export async function getAudioProcesses(_event: IpcMainInvokeEvent): Promise<AudioProcessInfo[]> {
    if (process.platform !== "win32") return [];

    try {
        const exe = await ensureHelperBinary();
        if (!exe) return [];

        const output = await new Promise<string>((resolve, reject) => {
            childProcess.execFile(exe, [], { timeout: 3000 }, (err, stdout) => {
                if (err) reject(err);
                else resolve(stdout ? stdout.trim() : "[]");
            });
        });

        if (!output || !output.startsWith("[")) return [];

        const parsed: AudioProcessInfo[] = JSON.parse(output);
        const discordPid = process.pid;

        // Filter out system processes and current Discord instance
        return parsed.filter(p => {
            if (!p.name || !p.pid) return false;
            const lower = p.name.toLowerCase();
            if (SYSTEM_PROCESS_BLACKLIST.has(lower)) return false;
            if (lower === "discord" || lower === "lolicord") {
                if (p.allPids?.includes(discordPid) || p.pid === discordPid) return false;
            }
            return true;
        });
    } catch (err) {
        console.error("[EnhancedScreenshare] getAudioProcesses failed:", err);
        return [];
    }
}

/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Toasts } from "@webpack/common";
import { t } from "../autoTranslateLoliCord";
import fixWebmDuration from "fix-webm-duration";
import { patchWebmSeekable } from "./webmFixer";

export interface RecordingOptions {
    mode: "voice" | "video";
    videoQuality?: string;
    videoFormat?: string;
    audioFormat?: string;
    maxStorageGB: number;
    shadowplayMinutes: number;
    autoSave: boolean;
    savePath: string;
    showSaveToast?: boolean;
    channelName?: string;
}

let activeOpts: RecordingOptions | null = null;

let isRecording = false;
let isStopping = false;  // guard against concurrent stopRecording calls
let mediaRecorder: MediaRecorder | null = null;
let recordCtx: AudioContext | null = null;
let recordDest: MediaStreamAudioDestinationNode | null = null;
let micStream: MediaStream | null = null;
let systemStream: MediaStream | null = null;

let currentFilename: string = "";
let isStreamMode = false;
let recordedChunks: Blob[] = [];
let pendingChunkPromises: Promise<any>[] = [];
const CHUNK_TIME_MS = 5000;
let startTimeMs = 0;
let memoryCheckInterval: any;

export function getRecordingDurationMs(): number {
    if (!isRecording) return 0;
    return Date.now() - startTimeMs;
}

export function isCurrentlyRecording(): boolean {
    return isRecording;
}

export async function startRecording(opts: RecordingOptions): Promise<boolean> {
    if (isRecording) return false;
    activeOpts = opts;
    isStopping = false;

    try {
        recordedChunks = [];
        pendingChunkPromises = [];
        startTimeMs = Date.now();

        const ext = opts.mode === "video" ? (opts.videoFormat || "webm") : (opts.audioFormat || "ogg");
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const cleanName = (opts.channelName || "Vocal")
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
            .trim()
            .slice(0, 60) || "Vocal";
        currentFilename = `${dateStr}_${cleanName}.${ext}`;

        const native = (window as any).VencordNative?.pluginHelpers?.AutoCallRecorder;
        if (native?.initStreamRecording && native?.appendRecordingChunk && native?.finalizeStreamRecording) {
            try {
                isStreamMode = await native.initStreamRecording(currentFilename);
            } catch {
                isStreamMode = false;
            }
        } else {
            isStreamMode = false;
        }

        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        recordCtx = new AudioCtxClass();
        recordDest = recordCtx.createMediaStreamDestination();

        let capturedMic = false;
        let capturedSystem = false;

        // 1. Capture microphone
        try {
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
            if (micStream && micStream.getAudioTracks().length > 0) {
                const micSource = recordCtx.createMediaStreamSource(micStream);
                micSource.connect(recordDest);
                capturedMic = true;
            }
        } catch (e) {
            try {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (micStream && micStream.getAudioTracks().length > 0) {
                    const micSource = recordCtx.createMediaStreamSource(micStream);
                    micSource.connect(recordDest);
                    capturedMic = true;
                }
            } catch (err) {
                console.warn("[AutoCallRecorder] Mic capture failed:", err);
            }
        }

        // 2. Capture desktop system audio / video loopback
        try {
            let desktopSourceId: string | null = null;
            const nativeCapture = (window as any).VencordNative?.desktopCapture;
            if (nativeCapture?.getSources) {
                const sources = await nativeCapture.getSources();
                const screenSource = sources.find((s: any) => s.id?.startsWith("screen:"));
                if (screenSource) desktopSourceId = screenSource.id;
            }

            if (desktopSourceId) {
                let videoConstraints: any;
                if (opts.mode === "video") {
                    let minWidth = 1280;
                    let minHeight = 720;
                    let maxFrameRate = 30;

                    if (opts.videoQuality === "1080p60") {
                        minWidth = 1920;
                        minHeight = 1080;
                        maxFrameRate = 60;
                    } else if (opts.videoQuality === "480p25") {
                        minWidth = 854;
                        minHeight = 480;
                        maxFrameRate = 25;
                    }

                    videoConstraints = {
                        mandatory: {
                            chromeMediaSource: "desktop",
                            chromeMediaSourceId: desktopSourceId,
                            minWidth,
                            minHeight,
                            maxFrameRate
                        }
                    };
                } else {
                    videoConstraints = {
                        mandatory: {
                            chromeMediaSource: "desktop",
                            chromeMediaSourceId: desktopSourceId,
                            minWidth: 640,
                            minHeight: 360,
                            maxFrameRate: 5
                        }
                    };
                }

                const constraints: any = {
                    audio: {
                        mandatory: {
                            chromeMediaSource: "desktop",
                            chromeMediaSourceId: desktopSourceId
                        }
                    },
                    video: videoConstraints
                };

                systemStream = await navigator.mediaDevices.getUserMedia(constraints);

                if (systemStream && systemStream.getAudioTracks().length > 0) {
                    const sysAudioStream = new MediaStream(systemStream.getAudioTracks());
                    const systemSource = recordCtx.createMediaStreamSource(sysAudioStream);
                    systemSource.connect(recordDest);
                    capturedSystem = true;

                    // In voice mode, stop video tracks immediately to free 100% GPU/CPU
                    if (opts.mode === "voice") {
                        systemStream.getVideoTracks().forEach(t => t.stop());
                    }
                }
            }
        } catch (e) {
            console.warn("[AutoCallRecorder] Desktop loopback capture failed:", e);
        }

        // Failsafe: if neither mic nor system audio could be captured, attach a silent oscillator so recorder runs reliably
        if (!capturedMic && !capturedSystem) {
            const osc = recordCtx.createOscillator();
            const gain = recordCtx.createGain();
            gain.gain.value = 0;
            osc.connect(gain);
            gain.connect(recordDest);
            osc.start();
        }

        let finalStream = recordDest.stream;
        if (opts.mode === "video" && systemStream && systemStream.getVideoTracks().length > 0) {
            finalStream = new MediaStream([
                ...systemStream.getVideoTracks(),
                ...recordDest.stream.getAudioTracks()
            ]);
        }

        let videoBitsPerSecond: number | undefined;
        let mimeType = "audio/webm";

        if (opts.mode === "video") {
            if (opts.videoQuality === "1080p60") videoBitsPerSecond = 8000000;
            else if (opts.videoQuality === "720p30") videoBitsPerSecond = 3000000;
            else if (opts.videoQuality === "480p25") videoBitsPerSecond = 1500000;

            if (opts.videoFormat === "mkv") {
                mimeType = "video/x-matroska;codecs=avc1,opus";
                if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "video/webm;codecs=vp8,opus";
            } else {
                mimeType = "video/webm;codecs=vp8,opus";
            }
        } else {
            if (opts.audioFormat === "webm") {
                mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
            } else {
                if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) mimeType = "audio/ogg;codecs=opus";
                else if (MediaRecorder.isTypeSupported("audio/ogg")) mimeType = "audio/ogg";
                else mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
            }
        }

        const recorderOptions: any = {
            audioBitsPerSecond: 128000
        };
        if (mimeType && MediaRecorder.isTypeSupported(mimeType)) {
            recorderOptions.mimeType = mimeType;
        }
        if (videoBitsPerSecond) {
            recorderOptions.videoBitsPerSecond = videoBitsPerSecond;
        }

        try {
            mediaRecorder = new MediaRecorder(finalStream, recorderOptions);
        } catch {
            mediaRecorder = new MediaRecorder(finalStream);
        }

        mediaRecorder.ondataavailable = e => {
            if (!e.data || e.data.size === 0) return;

            if (isStreamMode && native?.appendRecordingChunk) {
                const p = (async () => {
                    try {
                        const buf = await e.data.arrayBuffer();
                        await native.appendRecordingChunk(new Uint8Array(buf));
                    } catch (err) {
                        console.error("[AutoCallRecorder] Stream chunk append failed:", err);
                    }
                })();
                pendingChunkPromises.push(p);
            } else {
                recordedChunks.push(e.data);
            }
        };

        mediaRecorder.start(CHUNK_TIME_MS);
        isRecording = true;

        memoryCheckInterval = setInterval(() => {
            if (!isRecording || isStreamMode) return;

            if (opts.maxStorageGB > 0) {
                const maxBytes = opts.maxStorageGB * 1024 * 1024 * 1024;
                let currentBytes = recordedChunks.reduce((acc, chunk) => acc + chunk.size, 0);
                while (currentBytes > maxBytes && recordedChunks.length > 1) {
                    const removed = recordedChunks.shift();
                    currentBytes -= (removed?.size || 0);
                }
            }

            if (opts.shadowplayMinutes > 0) {
                const maxChunks = (opts.shadowplayMinutes * 60 * 1000) / CHUNK_TIME_MS;
                while (recordedChunks.length > maxChunks) {
                    recordedChunks.shift();
                }
            }
        }, CHUNK_TIME_MS);

        return true;
    } catch (e) {
        console.error("[AutoCallRecorder] Failed to start recording:", e);
        cleanup();
        return false;
    }
}

export function stopRecording(): Promise<void> {
    return new Promise(resolve => {
        if (isStopping) { resolve(); return; }

        const opts = activeOpts;
        if (!isRecording || !mediaRecorder || !opts) {
            cleanup();
            resolve();
            return;
        }

        isStopping = true;
        const durationSecs = (Date.now() - startTimeMs) / 1000;
        const shouldSave = durationSecs >= 0.5;
        const mimeType = mediaRecorder.mimeType || "audio/webm";

        mediaRecorder.onstop = async () => {
            if (pendingChunkPromises.length > 0) {
                await Promise.allSettled(pendingChunkPromises);
                pendingChunkPromises = [];
            }

            if (shouldSave) {
                const native = (window as any).VencordNative?.pluginHelpers?.AutoCallRecorder;
                if (isStreamMode && native?.finalizeStreamRecording) {
                    try {
                        const durationMs = Math.max(0, Math.round(Date.now() - startTimeMs));
                        const ok = await native.finalizeStreamRecording(opts.savePath, currentFilename, durationMs);
                        if (ok && opts.showSaveToast !== false) {
                            Toasts.show(Toasts.create(t("Save record"), Toasts.Type.SUCCESS));
                        } else if (!ok && recordedChunks.length > 0) {
                            const blob = new Blob(recordedChunks, { type: mimeType });
                            await saveBlobFallback(blob, opts, currentFilename);
                        }
                    } catch (e) {
                        console.error("[AutoCallRecorder] Finalize stream failed:", e);
                        if (recordedChunks.length > 0) {
                            const blob = new Blob(recordedChunks, { type: mimeType });
                            await saveBlobFallback(blob, opts, currentFilename);
                        }
                    }
                } else if (recordedChunks.length > 0) {
                    const blob = new Blob(recordedChunks, { type: mimeType });
                    await saveBlobFallback(blob, opts, currentFilename);
                }
            }
            cleanup();
            resolve();
        };

        try {
            if (mediaRecorder.state !== "inactive") {
                mediaRecorder.requestData();
                mediaRecorder.stop();
            } else {
                cleanup();
                resolve();
            }
        } catch (e) {
            cleanup();
            resolve();
        }
    });
}

function cleanup() {
    isRecording = false;
    isStopping = false;
    isStreamMode = false;
    clearInterval(memoryCheckInterval);
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    if (systemStream) { systemStream.getTracks().forEach(t => t.stop()); systemStream = null; }
    if (recordCtx) { recordCtx.close(); recordCtx = null; }
    recordDest = null;
    mediaRecorder = null;
    recordedChunks = [];
    pendingChunkPromises = [];
    activeOpts = null;
}

async function saveBlobFallback(blob: Blob, opts: RecordingOptions, filename: string) {
    const notifySuccess = () => {
        if (opts.showSaveToast !== false) {
            Toasts.show(Toasts.create(t("Save record"), Toasts.Type.SUCCESS));
        }
    };

    let finalBlob = blob;
    const durationMs = Math.max(0, Date.now() - startTimeMs);
    try {
        finalBlob = await fixWebmDuration(blob, durationMs);
    } catch { }

    let uint8Array: Uint8Array;
    try {
        const arrayBuffer = await finalBlob.arrayBuffer();
        uint8Array = patchWebmSeekable(new Uint8Array(arrayBuffer), durationMs);
    } catch {
        const arrayBuffer = await finalBlob.arrayBuffer();
        uint8Array = new Uint8Array(arrayBuffer);
    }

    const native = (window as any).VencordNative?.pluginHelpers?.AutoCallRecorder;
    if (native?.saveRecording) {
        try {
            if (!opts.autoSave && native?.promptSaveRecording) {
                const success = await native.promptSaveRecording(uint8Array, filename);
                if (success) notifySuccess();
                return;
            } else {
                const success = await native.saveRecording(uint8Array, opts.savePath, filename);
                if (success) notifySuccess();
                return;
            }
        } catch (e) {
            console.error("Native fallback save failed", e);
        }
    }

    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 1000);

    notifySuccess();
}

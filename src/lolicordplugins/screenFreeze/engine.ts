/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Nightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ScreenFreezeState } from "./types";

type Listener = (state: ScreenFreezeState) => void;

interface ActiveStreamPipeline {
    rawStream: MediaStream;
    rawVideo: HTMLVideoElement;
    canvas: HTMLCanvasElement;
    canvasCtx: CanvasRenderingContext2D;
    proxyStream: MediaStream;
    renderLoopId: number | null;
}

const BLOCKED_EVENT_TYPES = [
    "click",
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
    "mousemove",
    "pointermove",
    "mouseleave",
    "mouseout",
    "pointerleave",
    "pointerout",
    "contextmenu",
    "wheel",
    "touchstart",
    "touchend",
    "touchmove",
    "blur"
];

class ScreenFreezeEngine {
    private isFrozen = false;
    private frozenTimestamp: number | undefined = undefined;
    private frozenBitmap: ImageBitmap | null = null;
    private listeners = new Set<Listener>();

    private originalGetUserMedia: typeof navigator.mediaDevices.getUserMedia | null = null;
    private originalPrototypeGetUserMedia: any = null;
    private isPatched = false;

    private activePipelines = new Set<ActiveStreamPipeline>();
    private pausedVideos: HTMLVideoElement[] = [];

    private isEventBlockerAttached = false;

    public getState(): ScreenFreezeState {
        return {
            isFrozen: this.isFrozen,
            frozenTimestamp: this.frozenTimestamp,
            hasActiveStream: this.activePipelines.size > 0 || document.querySelectorAll("video").length > 0
        };
    }

    public subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify() {
        const state = this.getState();
        this.listeners.forEach(l => l(state));
    }

    private blockEvent = (e: Event) => {
        if (!this.isFrozen) return;

        // Allow keyboard events for shortcut handling
        if (e.type === "keydown" || e.type === "keyup") return;

        e.stopPropagation();
        e.stopImmediatePropagation();
        try {
            e.preventDefault();
        } catch { }
    };

    private attachEventBlockers() {
        if (this.isEventBlockerAttached || typeof window === "undefined") return;

        for (const type of BLOCKED_EVENT_TYPES) {
            window.addEventListener(type, this.blockEvent, { capture: true, passive: false });
            document.addEventListener(type, this.blockEvent, { capture: true, passive: false });
        }
        this.isEventBlockerAttached = true;
    }

    private removeEventBlockers() {
        if (!this.isEventBlockerAttached || typeof window === "undefined") return;

        for (const type of BLOCKED_EVENT_TYPES) {
            window.removeEventListener(type, this.blockEvent, { capture: true });
            document.removeEventListener(type, this.blockEvent, { capture: true });
        }
        this.isEventBlockerAttached = false;
    }

    public startPatch() {
        if (this.isPatched || !navigator.mediaDevices) return;

        this.originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        const MediaDevicesProto = Object.getPrototypeOf(navigator.mediaDevices);
        if (MediaDevicesProto && MediaDevicesProto.getUserMedia) {
            this.originalPrototypeGetUserMedia = MediaDevicesProto.getUserMedia;
        }

        const self = this;

        const patchedGetUserMedia = async function (constraints: MediaStreamConstraints | undefined): Promise<MediaStream> {
            const rawStream = await self.originalGetUserMedia!.call(navigator.mediaDevices, constraints);

            const hasVideo = !!constraints?.video && rawStream.getVideoTracks().length > 0;
            if (!hasVideo) {
                return rawStream;
            }

            try {
                return await self.createProxyStreamPipeline(rawStream);
            } catch (err) {
                console.error("[ScreenFreeze] Failed to create stream pipeline, using raw stream:", err);
                return rawStream;
            }
        };

        navigator.mediaDevices.getUserMedia = patchedGetUserMedia;
        if (MediaDevicesProto) {
            MediaDevicesProto.getUserMedia = patchedGetUserMedia;
        }

        this.isPatched = true;
    }

    public stopPatch() {
        if (this.isFrozen) {
            this.unfreeze();
        }

        if (this.isPatched) {
            if (this.originalGetUserMedia && navigator.mediaDevices) {
                navigator.mediaDevices.getUserMedia = this.originalGetUserMedia;
            }
            const MediaDevicesProto = Object.getPrototypeOf(navigator.mediaDevices);
            if (MediaDevicesProto && this.originalPrototypeGetUserMedia) {
                MediaDevicesProto.getUserMedia = this.originalPrototypeGetUserMedia;
            }
            this.isPatched = false;
        }

        for (const pipe of this.activePipelines) {
            this.cleanupPipeline(pipe);
        }
        this.activePipelines.clear();
        this.removeEventBlockers();
    }

    private async createProxyStreamPipeline(rawStream: MediaStream): Promise<MediaStream> {
        const rawVideoTrack = rawStream.getVideoTracks()[0];
        if (!rawVideoTrack) return rawStream;

        // 1. Offscreen decoding video element
        const rawVideo = document.createElement("video");
        rawVideo.style.position = "fixed";
        rawVideo.style.left = "-9999px";
        rawVideo.style.top = "-9999px";
        rawVideo.style.width = "640px";
        rawVideo.style.height = "360px";
        rawVideo.style.opacity = "0.001";
        rawVideo.style.pointerEvents = "none";
        rawVideo.muted = true;
        rawVideo.playsInline = true;
        rawVideo.autoplay = true;
        rawVideo.srcObject = new MediaStream([rawVideoTrack]);

        const mount = document.body || document.documentElement;
        if (mount) mount.appendChild(rawVideo);

        try {
            await rawVideo.play();
        } catch { }

        // 2. Offscreen rendering canvas
        const canvas = document.createElement("canvas");
        canvas.style.position = "fixed";
        canvas.style.left = "-9999px";
        canvas.style.top = "-9999px";
        canvas.style.opacity = "0.001";
        canvas.style.pointerEvents = "none";
        canvas.width = 1920;
        canvas.height = 1080;
        if (mount) mount.appendChild(canvas);

        const canvasCtx = canvas.getContext("2d", { alpha: false })!;

        // 3. Generate capture stream from canvas (60 FPS)
        const proxyStream = (canvas as any).captureStream ? (canvas as any).captureStream(60) : null;
        if (!proxyStream || proxyStream.getVideoTracks().length === 0) {
            rawVideo.remove();
            canvas.remove();
            return rawStream;
        }

        // Add original audio tracks to proxy stream
        for (const audioTrack of rawStream.getAudioTracks()) {
            proxyStream.addTrack(audioTrack);
        }

        const pipeline: ActiveStreamPipeline = {
            rawStream,
            rawVideo,
            canvas,
            canvasCtx,
            proxyStream,
            renderLoopId: null
        };

        this.activePipelines.add(pipeline);

        // 4. Start frame rendering loop
        this.startPipelineRenderLoop(pipeline);

        // 5. Cleanup when raw stream ends
        rawVideoTrack.addEventListener("ended", () => {
            this.cleanupPipeline(pipeline);
            this.activePipelines.delete(pipeline);
            if (this.activePipelines.size === 0 && this.isFrozen) {
                this.unfreeze();
            }
            this.notify();
        });

        this.notify();
        return proxyStream;
    }

    private startPipelineRenderLoop(pipeline: ActiveStreamPipeline) {
        const render = () => {
            const { rawVideo, canvas, canvasCtx } = pipeline;

            if (this.isFrozen) {
                // Draw frozen static frame repeatedly
                if (this.frozenBitmap) {
                    try {
                        canvasCtx.drawImage(this.frozenBitmap, 0, 0, canvas.width, canvas.height);
                    } catch { }
                }
            } else {
                // Draw live video frame directly from desktop screen
                if (rawVideo.videoWidth > 0 && rawVideo.videoHeight > 0) {
                    if (canvas.width !== rawVideo.videoWidth || canvas.height !== rawVideo.videoHeight) {
                        canvas.width = rawVideo.videoWidth;
                        canvas.height = rawVideo.videoHeight;
                    }
                    try {
                        canvasCtx.drawImage(rawVideo, 0, 0, canvas.width, canvas.height);
                    } catch { }
                }
            }

            pipeline.renderLoopId = requestAnimationFrame(render);
        };

        pipeline.renderLoopId = requestAnimationFrame(render);
    }

    private cleanupPipeline(pipeline: ActiveStreamPipeline) {
        if (pipeline.renderLoopId !== null) {
            cancelAnimationFrame(pipeline.renderLoopId);
            pipeline.renderLoopId = null;
        }
        try {
            pipeline.rawVideo.srcObject = null;
            pipeline.rawVideo.remove();
            pipeline.canvas.remove();
        } catch { }
    }

    public toggleFreeze(): boolean {
        if (this.isFrozen) {
            this.unfreeze();
            return false;
        } else {
            this.freeze();
            return true;
        }
    }

    public async freeze() {
        // 1. Capture the exact current frame into an ImageBitmap from all active pipelines or DOM video
        for (const pipe of this.activePipelines) {
            if (pipe.rawVideo && pipe.rawVideo.videoWidth > 0) {
                try {
                    this.frozenBitmap = await createImageBitmap(pipe.rawVideo);
                    break;
                } catch { }
            }
        }

        // Fallback: Check all video elements in DOM
        if (!this.frozenBitmap) {
            const allVideos = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
            for (const vid of allVideos) {
                if (vid.videoWidth > 0 && !vid.paused) {
                    try {
                        this.frozenBitmap = await createImageBitmap(vid);
                        break;
                    } catch { }
                }
            }
        }

        // 2. Lock & Freeze ALL CSS animations & transitions
        try {
            let freezeStyle = document.getElementById("nc-screen-freeze-style") as HTMLStyleElement | null;
            if (!freezeStyle) {
                freezeStyle = document.createElement("style");
                freezeStyle.id = "nc-screen-freeze-style";
                freezeStyle.textContent = `
                    *, *::before, *::after {
                        animation-play-state: paused !important;
                        transition: none !important;
                    }
                `;
                document.head.appendChild(freezeStyle);
            }

            // Attach high-priority capture-phase event blockers so mouseleave/mouseout never fires on active popups/tooltips
            this.attachEventBlockers();

            // Pause all live videos in Discord
            this.pausedVideos = [];
            const vids = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
            for (const v of vids) {
                if (!v.paused && v.id !== "nc-screen-freeze-capture") {
                    this.pausedVideos.push(v);
                    try { v.pause(); } catch { }
                }
            }
        } catch (e) {
            console.warn("[ScreenFreeze] Lock UI error:", e);
        }

        this.isFrozen = true;
        this.frozenTimestamp = Date.now();
        this.notify();
    }

    public unfreeze() {
        if (this.frozenBitmap) {
            try { this.frozenBitmap.close(); } catch { }
            this.frozenBitmap = null;
        }

        // Remove CSS freeze and event blockers
        try {
            document.getElementById("nc-screen-freeze-style")?.remove();
            this.removeEventBlockers();

            // Resume paused videos
            for (const v of this.pausedVideos) {
                try { v.play().catch(() => { }); } catch { }
            }
            this.pausedVideos = [];
        } catch { }

        this.isFrozen = false;
        this.frozenTimestamp = undefined;
        this.notify();
    }
}

export const screenFreezeEngine = new ScreenFreezeEngine();

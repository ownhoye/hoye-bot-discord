/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, useEffect, useRef, useState } from "@webpack/common";
import type { PremiumStory } from "../types";

const CloseIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const IMAGE_DURATION_MS = 10000;

export function StoryViewer({
    stories,
    onClose,
    user
}: {
    stories: PremiumStory[];
    onClose: () => void;
    user: any;
}) {
    const [index, setIndex] = useState(0);
    const [progress, setProgress] = useState(0);

    const timerRef = useRef<any>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const progressIntervalRef = useRef<any>(null);

    const currentStory = stories[index];
    const avatarUrl = user?.getAvatarURL?.() ?? `https://cdn.discordapp.com/avatars/${user?.id}/avatar.png`;
    const username = user?.username ?? user?.id ?? "";

    const clearTimers = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };

    const goNext = () => {
        clearTimers();
        if (index < stories.length - 1) {
            setIndex(i => i + 1);
        } else {
            onClose();
        }
    };

    const goPrev = () => {
        clearTimers();
        if (index > 0) setIndex(i => i - 1);
    };

    const startImageTimer = () => {
        clearTimers();
        setProgress(0);
        const startTime = Date.now();
        progressIntervalRef.current = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const p = Math.min((elapsed / IMAGE_DURATION_MS) * 100, 100);
            setProgress(p);
            if (p >= 100) {
                clearTimers();
                goNext();
            }
        }, 30);
    };

    const startVideoProgress = (video: HTMLVideoElement) => {
        clearTimers();
        setProgress(0);

        const onTimeUpdate = () => {
            if (video.duration) {
                setProgress((video.currentTime / video.duration) * 100);
            }
        };
        const onEnded = () => {
            setProgress(100);
            goNext();
        };

        video.addEventListener("timeupdate", onTimeUpdate);
        video.addEventListener("ended", onEnded);

        (video as any)._ncpCleanup = () => {
            video.removeEventListener("timeupdate", onTimeUpdate);
            video.removeEventListener("ended", onEnded);
        };
    };

    useEffect(() => {
        if (!currentStory) return;
        setProgress(0);
        clearTimers();

        if (currentStory.type === "image") {
            startImageTimer();
        }

        return () => {
            clearTimers();
        };
    }, [index]);

    useEffect(() => {
        return () => {
            if (videoRef.current && (videoRef.current as any)._ncpCleanup) {
                (videoRef.current as any)._ncpCleanup();
            }
        };
    }, [index]);

    if (!currentStory) return null;

    return (
        <div className="ncp-story-viewer-overlay" onClick={onClose}>
            <div className="ncp-story-viewer-content" onClick={e => e.stopPropagation()}>
                {/* Progress bars */}
                <div className="ncp-story-progress-bars">
                    {stories.map((_, i) => (
                        <div key={i} className="ncp-story-progress-bar">
                            <div
                                className="ncp-story-progress-fill"
                                style={{ width: i < index ? "100%" : (i === index ? `${progress}%` : "0%") }}
                            />
                        </div>
                    ))}
                </div>

                {/* Header */}
                <div className="ncp-story-header">
                    <img
                        src={avatarUrl}
                        className="ncp-story-avatar"
                        alt=""
                        onError={e => (e.currentTarget.style.display = "none")}
                    />
                    <span className="ncp-story-username">{username}</span>
                    <button className="ncp-story-close-btn" onClick={onClose} aria-label="Close">
                        <CloseIcon />
                    </button>
                </div>

                {/* Media */}
                <div className="ncp-story-media">
                    {currentStory.type === "video" ? (
                        <video
                            key={currentStory.id}
                            src={currentStory.url}
                            autoPlay
                            playsInline
                            ref={el => {
                                if (el && el !== videoRef.current) {
                                    videoRef.current = el;
                                    startVideoProgress(el);
                                }
                            }}
                            style={{ width: "100%", height: "100%", objectFit: "contain" }}
                        />
                    ) : (
                        <img src={currentStory.url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    )}
                </div>

                {/* Tap navigation */}
                <div className="ncp-story-controls">
                    <div className="ncp-story-control-prev" onClick={e => { e.stopPropagation(); goPrev(); }} />
                    <div className="ncp-story-control-next" onClick={e => { e.stopPropagation(); goNext(); }} />
                </div>
            </div>
        </div>
    );
}

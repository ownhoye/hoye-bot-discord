/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@api/i18n";
import { classes } from "@utils/misc";
import { Button, React, scrollerClasses, useEffect, useRef, useState, UserStore } from "@webpack/common";
import { isOAuthAuthenticated, promptDiscordOAuth, readUserPremiumData, saveLocalFavSongs, syncOwnDataToCloud } from "../sync";
import type { PremiumFavSong } from "../types";

const MusicIcon = ({ size = 20 }: { size?: number; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
    </svg>
);

const PlayIcon = ({ size = 18, style }: { size?: number; style?: React.CSSProperties; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffffff" style={style}>
        <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" />
    </svg>
);

const PauseIcon = ({ size = 18, style }: { size?: number; style?: React.CSSProperties; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffffff" style={style}>
        <rect x="5.5" y="4" width="4" height="16" rx="2" />
        <rect x="14.5" y="4" width="4" height="16" rx="2" />
    </svg>
);

const PrevTrackIcon = ({ size = 16 }: { size?: number; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffffff">
        <rect x="4" y="4" width="2.5" height="16" rx="1.25" />
        <path d="M19 5.24a1 1 0 0 0-1.55-.83L8 11.17a1 1 0 0 0 0 1.66l9.45 6.76A1 1 0 0 0 19 18.76V5.24Z" />
    </svg>
);

const NextTrackIcon = ({ size = 16 }: { size?: number; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffffff">
        <rect x="17.5" y="4" width="2.5" height="16" rx="1.25" />
        <path d="M5 5.24a1 1 0 0 1 1.55-.83L16 11.17a1 1 0 0 1 0 1.66l-9.45 6.76A1 1 0 0 1 5 18.76V5.24Z" />
    </svg>
);

const VolumeIcon = ({ size = 18 }: { size?: number; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#ffffff" stroke="none" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
);

const VolumeMuteIcon = ({ size = 18 }: { size?: number; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#ffffff" stroke="none" />
        <line x1="22" y1="9" x2="16" y2="15" />
        <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
);

const CloseIcon = ({ size = 16 }: { size?: number; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const DiscordIcon = () => (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8 }}>
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.075.075 0 0 1 .079.01c.12.098.245.195.372.288a.077.077 0 0 1-.006.127c-.598.35-1.22.652-1.873.894a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
);

function fmtTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export function FavSongsProfileTab({ user }: { user: any; }) {
    const [songs, setSongs] = useState<PremiumFavSong[]>([]);
    const [currentSong, setCurrentSong] = useState<PremiumFavSong | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(0.5);
    const [isMuted, setIsMuted] = useState(false);
    const [prevVolume, setPrevVolume] = useState(0.5);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(true);
    const [isDraggingVolume, setIsDraggingVolume] = useState(false);
    const [isDraggingScrub, setIsDraggingScrub] = useState(false);
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const volumeTrackRef = useRef<HTMLDivElement | null>(null);
    const scrubberTrackRef = useRef<HTMLDivElement | null>(null);

    const songListRef = useRef<HTMLDivElement | null>(null);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    const songsRef = useRef<PremiumFavSong[]>([]);
    songsRef.current = songs;

    const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
    const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
    const isDraggingRef = useRef(false);
    const dragIndexRef = useRef<number | null>(null);
    const didDragOccurRef = useRef(false);

    const currentUserId = UserStore.getCurrentUser()?.id;
    const isSelf = user?.id && String(user.id) === String(currentUserId);

    useEffect(() => {
        return () => {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
            }
        };
    }, []);

    const loadData = async () => {
        setLoading(true);
        if (isSelf) {
            const auth = await isOAuthAuthenticated();
            setIsAuthenticated(auth);
        }

        const data = await readUserPremiumData(user.id);
        if (data && data.favSongsEnabled !== false && Array.isArray(data.favSongs)) {
            setSongs(data.favSongs);
        } else {
            setSongs([]);
        }
        setLoading(false);
    };

    useEffect(() => {
        void loadData();
    }, [user?.id]);

    const handlePlaySong = async (song: PremiumFavSong) => {
        if (currentSong?.id === song.id) {
            if (isPlaying) {
                audioRef.current?.pause();
                setIsPlaying(false);
            } else {
                audioRef.current?.play().catch(() => {});
                setIsPlaying(true);
            }
            return;
        }

        setCurrentSong(song);
        setIsPlaying(true);
        if (audioRef.current) {
            let playUrl = song.url;
            if (song.type === "soundcloud" && song.streamUrl) {
                try {
                    const { resolveSoundCordStream } = await import("../soundcordHelper");
                    const resolved = await resolveSoundCordStream(song.streamUrl);
                    if (resolved) playUrl = resolved;
                } catch {}
            }
            audioRef.current.src = playUrl;
            audioRef.current.currentTime = 0;
            audioRef.current.volume = isMuted ? 0 : volume;
            audioRef.current.play().catch(() => {
                setIsPlaying(false);
            });
        }
    };

    const handlePrevSong = () => {
        if (!currentSong) return;
        const idx = songs.findIndex(s => s.id === currentSong.id);
        if (idx > 0) {
            void handlePlaySong(songs[idx - 1]);
        } else if (audioRef.current) {
            audioRef.current.currentTime = 0;
            setCurrentTime(0);
        }
    };

    const handleNextSong = () => {
        if (!currentSong) return;
        const idx = songs.findIndex(s => s.id === currentSong.id);
        if (idx >= 0 && idx < songs.length - 1) {
            void handlePlaySong(songs[idx + 1]);
        } else if (songs.length > 0) {
            void handlePlaySong(songs[0]);
        }
    };

    const toggleMute = () => {
        if (isMuted) {
            setIsMuted(false);
            const restore = prevVolume || 0.5;
            setVolume(restore);
            if (audioRef.current) audioRef.current.volume = restore;
        } else {
            setPrevVolume(volume || 0.5);
            setIsMuted(true);
            setVolume(0);
            if (audioRef.current) audioRef.current.volume = 0;
        }
    };

    // ─── Real-Time Live Volume Dragging ──────────────────────────────────────────

    const updateVolumeFromClientX = (clientX: number) => {
        if (!volumeTrackRef.current) return;
        const rect = volumeTrackRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        setVolume(ratio);
        setIsMuted(ratio === 0);
        if (audioRef.current) {
            audioRef.current.volume = ratio;
        }
    };

    const handleVolumeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingVolume(true);
        updateVolumeFromClientX(e.clientX);

        const onMouseMove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();
            updateVolumeFromClientX(moveEvent.clientX);
        };

        const onMouseUp = (upEvent: MouseEvent) => {
            upEvent.preventDefault();
            setIsDraggingVolume(false);
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    };

    // ─── Real-Time Live Seek / Scrubbing ─────────────────────────────────────────

    const updateScrubFromClientX = (clientX: number) => {
        if (!scrubberTrackRef.current) return;
        const rect = scrubberTrackRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const newTime = ratio * (duration || 0);
        setCurrentTime(newTime);
        if (audioRef.current) {
            audioRef.current.currentTime = newTime;
        }
    };

    const handleScrubMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingScrub(true);
        updateScrubFromClientX(e.clientX);

        const onMouseMove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();
            updateScrubFromClientX(moveEvent.clientX);
        };

        const onMouseUp = (upEvent: MouseEvent) => {
            upEvent.preventDefault();
            setIsDraggingScrub(false);
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    };

    const handleItemMouseDown = (e: React.MouseEvent<HTMLDivElement>, index: number) => {
        if (!isSelf) return;
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest(".ncp-song-item-btn")) {
            return;
        }

        dragStartPosRef.current = { x: e.clientX, y: e.clientY };
        didDragOccurRef.current = false;

        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
        }

        longPressTimerRef.current = setTimeout(() => {
            isDraggingRef.current = true;
            dragIndexRef.current = index;
            setDraggingIndex(index);

            const handleWindowMouseMove = (moveEvt: MouseEvent) => {
                if (!isDraggingRef.current || dragIndexRef.current === null) return;
                moveEvt.preventDefault();
                didDragOccurRef.current = true;

                if (songListRef.current) {
                    const listRect = songListRef.current.getBoundingClientRect();
                    if (moveEvt.clientY < listRect.top + 45) {
                        songListRef.current.scrollTop -= 10;
                    } else if (moveEvt.clientY > listRect.bottom - 45) {
                        songListRef.current.scrollTop += 10;
                    }
                }

                const curY = moveEvt.clientY;
                let targetIndex = dragIndexRef.current;
                for (let idx = 0; idx < itemRefs.current.length; idx++) {
                    const el = itemRefs.current[idx];
                    if (!el) continue;
                    const rect = el.getBoundingClientRect();
                    if (curY >= rect.top && curY <= rect.bottom) {
                        targetIndex = idx;
                        break;
                    } else if (idx === 0 && curY < rect.top) {
                        targetIndex = 0;
                        break;
                    } else if (idx === itemRefs.current.length - 1 && curY > rect.bottom) {
                        targetIndex = itemRefs.current.length - 1;
                        break;
                    }
                }

                if (targetIndex !== dragIndexRef.current && targetIndex >= 0 && targetIndex < songsRef.current.length) {
                    const fromIdx = dragIndexRef.current;
                    const nextSongs = [...songsRef.current];
                    const [moved] = nextSongs.splice(fromIdx, 1);
                    nextSongs.splice(targetIndex, 0, moved);

                    dragIndexRef.current = targetIndex;
                    setDraggingIndex(targetIndex);
                    setSongs(nextSongs);
                    songsRef.current = nextSongs;
                }
            };

            const handleWindowMouseUp = async () => {
                window.removeEventListener("mousemove", handleWindowMouseMove);
                window.removeEventListener("mouseup", handleWindowMouseUp);

                const wasDragging = isDraggingRef.current;
                isDraggingRef.current = false;
                setDraggingIndex(null);
                dragIndexRef.current = null;

                if (wasDragging) {
                    didDragOccurRef.current = true;
                    setTimeout(() => {
                        didDragOccurRef.current = false;
                    }, 120);

                    if (isSelf) {
                        await saveLocalFavSongs(songsRef.current);
                        void syncOwnDataToCloud();
                    }
                }
            };

            window.addEventListener("mousemove", handleWindowMouseMove);
            window.addEventListener("mouseup", handleWindowMouseUp, { once: true });
        }, 280);
    };

    const handleItemMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (longPressTimerRef.current && !isDraggingRef.current && dragStartPosRef.current) {
            const dx = Math.abs(e.clientX - dragStartPosRef.current.x);
            const dy = Math.abs(e.clientY - dragStartPosRef.current.y);
            if (dx > 8 || dy > 8) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
            }
        }
    };

    const handleItemMouseUp = () => {
        if (longPressTimerRef.current && !isDraggingRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
    const volumePercent = Math.round((isMuted ? 0 : volume) * 100);

    if (isSelf && !isAuthenticated && songs.length === 0) {
        return (
            <div className="ncp-fav-songs-container ncp-profile-empty-state">
                <div className="ncp-profile-empty-inner" style={{ gap: 16 }}>
                    <div className="ncp-profile-empty-icon" style={{ color: "#ffffff", opacity: 0.9 }}>
                        <MusicIcon size={36} />
                    </div>
                    <div>
                        <h3 className="ncp-profile-empty-title" style={{ margin: "0 0 6px 0", fontSize: 18 }}>
                            {t("LoliCord Authentication Required")}
                        </h3>
                        <p className="ncp-profile-empty-desc" style={{ margin: "0 auto" }}>
                            {t("Connect your Discord account via OAuth2 to display and sync your favorite songs on your profile.")}
                        </p>
                    </div>
                    <Button
                        color={Button.Colors.PRIMARY}
                        onClick={async () => {
                            const tok = await promptDiscordOAuth();
                            if (tok) void loadData();
                        }}
                    >
                        <DiscordIcon />
                        {t("Authenticate with Discord")}
                    </Button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="ncp-fav-songs-container ncp-profile-empty-state">
                <div className="ncp-profile-empty-inner">
                    <div className="ncp-profile-empty-title" style={{ fontSize: 14, fontWeight: 500, color: "var(--text-muted, #949ba4)" }}>
                        {t("Loading songs...")}
                    </div>
                </div>
            </div>
        );
    }

    if (songs.length === 0) {
        return (
            <div className="ncp-fav-songs-container ncp-profile-empty-state">
                <div className="ncp-profile-empty-inner">
                    <div className="ncp-profile-empty-icon" style={{ color: "#ffffff", opacity: 0.8 }}>
                        <MusicIcon size={36} />
                    </div>
                    <div className="ncp-profile-empty-title">
                        {t("No favorite songs")}
                    </div>
                    <div className="ncp-profile-empty-desc">
                        {isSelf
                            ? t("Add your favorite songs from LoliCord Customization settings.")
                            : t("This user hasn't configured any favorite songs yet.")}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="ncp-fav-songs-container">
            <audio
                ref={audioRef}
                onTimeUpdate={e => {
                    if (!isDraggingScrub) {
                        setCurrentTime(e.currentTarget.currentTime);
                    }
                }}
                onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
                onEnded={() => {
                    const idx = songs.findIndex(s => s.id === currentSong?.id);
                    if (idx >= 0 && idx < songs.length - 1) {
                        void handlePlaySong(songs[idx + 1]);
                    } else {
                        setIsPlaying(false);
                        setCurrentTime(0);
                    }
                }}
            />

            {/* Song List */}
            <div
                ref={songListRef}
                className={classes("ncp-song-list", scrollerClasses?.thin, scrollerClasses?.fade)}
            >
                {songs.map((song, i) => {
                    const active = currentSong?.id === song.id;
                    const isDraggingThis = draggingIndex === i;
                    return (
                        <div
                            key={song.id}
                            ref={el => { itemRefs.current[i] = el; }}
                            className={classes("ncp-song-item", active && "active", isDraggingThis && "dragging", isSelf && "is-self")}
                            onMouseDown={isSelf ? e => handleItemMouseDown(e, i) : undefined}
                            onMouseMove={isSelf ? handleItemMouseMove : undefined}
                            onMouseUp={isSelf ? handleItemMouseUp : undefined}
                            onClick={() => {
                                if (didDragOccurRef.current) return;
                                void handlePlaySong(song);
                            }}
                        >
                            <div className="ncp-song-artwork-container">
                                {song.artworkUrl ? (
                                    <img src={song.artworkUrl} className="ncp-song-artwork" alt="" />
                                ) : (
                                    <MusicIcon size={20} />
                                )}
                            </div>

                            <div className="ncp-song-info">
                                <span className="ncp-song-title">{song.title}</span>
                                <span className="ncp-song-artist">{song.artist}</span>
                            </div>

                            {active && isPlaying && (
                                <div className="ncp-equalizer">
                                    <span />
                                    <span />
                                    <span />
                                </div>
                            )}

                            <button
                                className="ncp-song-item-btn"
                                title={active && isPlaying ? t("Pause") : t("Play")}
                                onClick={e => {
                                    e.stopPropagation();
                                    handlePlaySong(song);
                                }}
                            >
                                {active && isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Frameless Frosted Glass Now Playing Bar */}
            {currentSong && (
                <div className="ncp-player-bar">
                    <div className="ncp-player-top">
                        <div className="ncp-player-track">
                            <div className="ncp-player-artwork">
                                {currentSong.artworkUrl ? (
                                    <img src={currentSong.artworkUrl} alt="" />
                                ) : (
                                    <MusicIcon size={18} />
                                )}
                            </div>
                            <div className="ncp-player-meta">
                                <span className="ncp-player-title" title={currentSong.title}>
                                    {currentSong.title}
                                </span>
                                <span className="ncp-player-artist" title={currentSong.artist}>
                                    {currentSong.artist}
                                </span>
                            </div>
                        </div>

                        <div className="ncp-player-controls">
                            <button
                                className="ncp-control-btn"
                                title={t("Previous")}
                                onClick={handlePrevSong}
                            >
                                <PrevTrackIcon size={15} />
                            </button>
                            <button
                                className="ncp-play-btn"
                                title={isPlaying ? t("Pause") : t("Play")}
                                onClick={() => handlePlaySong(currentSong)}
                            >
                                {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
                            </button>
                            <button
                                className="ncp-control-btn"
                                title={t("Next")}
                                onClick={handleNextSong}
                            >
                                <NextTrackIcon size={15} />
                            </button>
                        </div>

                        <div className="ncp-player-actions">
                            <button
                                className="ncp-action-btn"
                                title={isMuted || volume === 0 ? t("Unmute") : t("Mute")}
                                onClick={toggleMute}
                            >
                                {isMuted || volume === 0 ? <VolumeMuteIcon size={16} /> : <VolumeIcon size={16} />}
                            </button>
                            <div
                                className={`ncp-volume-scrubber${isDraggingVolume ? " dragging" : ""}`}
                                onMouseDown={handleVolumeMouseDown}
                                title={`${volumePercent}%`}
                            >
                                <div className="ncp-volume-track" ref={volumeTrackRef}>
                                    <div
                                        className="ncp-volume-fill"
                                        style={{ width: `${volumePercent}%` }}
                                    />
                                    <div
                                        className="ncp-volume-thumb"
                                        style={{ left: `${volumePercent}%` }}
                                    />
                                </div>
                            </div>
                            <button
                                className="ncp-action-btn ncp-close-btn"
                                title={t("Close Player")}
                                onClick={() => {
                                    audioRef.current?.pause();
                                    setIsPlaying(false);
                                    setCurrentSong(null);
                                }}
                            >
                                <CloseIcon size={14} />
                            </button>
                        </div>
                    </div>

                    <div className="ncp-player-bottom">
                        <span className="ncp-time-text">{fmtTime(currentTime)}</span>
                        <div
                            className={`ncp-scrubber${isDraggingScrub ? " dragging" : ""}`}
                            onMouseDown={handleScrubMouseDown}
                        >
                            <div className="ncp-scrubber-track" ref={scrubberTrackRef}>
                                <div
                                    className="ncp-scrubber-fill"
                                    style={{ width: `${progressPercent}%` }}
                                />
                                <div
                                    className="ncp-scrubber-thumb"
                                    style={{ left: `${progressPercent}%` }}
                                />
                            </div>
                        </div>
                        <span className="ncp-time-text">{fmtTime(duration)}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

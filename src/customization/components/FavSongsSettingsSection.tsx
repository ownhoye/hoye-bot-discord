/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@api/i18n";
import { Button, React, showToast, TextInput, Toasts, useEffect, useState } from "@webpack/common";
import {
    resolveSoundCordStream,
    searchSoundCordTracks,
    SoundCordTrackResult
} from "../soundcordHelper";
import { getLocalFavSongs, saveLocalFavSongs, syncOwnDataToCloud } from "../sync";
import type { PremiumFavSong } from "../types";

const SearchIcon = () => (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const TrashIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);

const MusicIcon = () => (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
    </svg>
);

const CheckIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const PlusIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

const ChevronDownIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

const ChevronUpIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
        <polyline points="18 15 12 9 6 15" />
    </svg>
);

export function FavSongsSettingsSection() {
    const [songs, setSongs] = useState<PremiumFavSong[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SoundCordTrackResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // Manual input accordion
    const [showManualAdd, setShowManualAdd] = useState(false);
    const [manualTitle, setManualTitle] = useState("");
    const [manualArtist, setManualArtist] = useState("");
    const [manualUrl, setManualUrl] = useState("");
    const [manualArtwork, setManualArtwork] = useState("");

    const load = async () => {
        const list = await getLocalFavSongs();
        setSongs(list);
    };

    useEffect(() => {
        void load();
    }, []);

    const persist = async (updated: PremiumFavSong[]) => {
        setSongs(updated);
        await saveLocalFavSongs(updated);
        void syncOwnDataToCloud();
    };

    const handleSearch = async () => {
        const q = searchQuery.trim();
        if (!q) return;

        setIsSearching(true);
        setHasSearched(true);
        try {
            const results = await searchSoundCordTracks(q, 20);
            setSearchResults(results);
            if (results.length === 0) {
                showToast(t("No tracks found on SoundCord"), Toasts.Type.INFO);
            }
        } catch (e: any) {
            console.error("[FavSongsSettingsSection] search error:", e);
            showToast(t("Error searching tracks on SoundCord"), Toasts.Type.DANGER);
        } finally {
            setIsSearching(false);
        }
    };

    const handleAddFromSoundCord = async (track: SoundCordTrackResult) => {
        if (songs.some(s => s.id === `sc-${track.id}`)) {
            showToast(t("Song already added to your profile"), Toasts.Type.INFO);
            return;
        }

        let playableUrl = track.streamUrl;
        try {
            const resolved = await resolveSoundCordStream(track.streamUrl);
            if (resolved) playableUrl = resolved;
        } catch {}

        const newSong: PremiumFavSong = {
            id: `sc-${track.id}`,
            title: track.title,
            artist: track.artist,
            url: playableUrl,
            streamUrl: track.streamUrl,
            artworkUrl: track.artworkUrl,
            type: "soundcloud",
            duration: Math.round(track.durationMs / 1000)
        };

        const updated = [...songs, newSong];
        await persist(updated);
        showToast(t("Song added to your profile"), Toasts.Type.SUCCESS);
    };

    const handleAddManualSong = async () => {
        const cleanTitle = manualTitle.trim();
        const cleanUrl = manualUrl.trim();
        if (!cleanTitle || !cleanUrl) {
            showToast(t("Title and audio URL are required."), Toasts.Type.WARNING);
            return;
        }

        const newSong: PremiumFavSong = {
            id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title: cleanTitle,
            artist: manualArtist.trim() || t("Unknown artist"),
            url: cleanUrl,
            artworkUrl: manualArtwork.trim(),
            type: cleanUrl.includes("soundcloud.com") ? "soundcloud" : "local"
        };

        const updated = [...songs, newSong];
        setManualTitle("");
        setManualArtist("");
        setManualUrl("");
        setManualArtwork("");
        setShowManualAdd(false);
        await persist(updated);
        showToast(t("Song added to your profile"), Toasts.Type.SUCCESS);
    };

    const handleDelete = async (id: string) => {
        const updated = songs.filter(s => s.id !== id);
        await persist(updated);
        showToast(t("Song removed from profile"), Toasts.Type.INFO);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Header info */}
            <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--header-primary, #ffffff)", margin: "0 0 4px 0" }}>
                    {t("Favorite Musics")}
                </h3>
                <p style={{ fontSize: 13, color: "var(--text-muted, #949ba4)", margin: 0, lineHeight: 1.4 }}>
                    {t("Search and select tracks from SoundCord to feature on your Discord profile with an interactive audio player.")}
                </p>
            </div>

            {/* SoundCord Search Engine */}
            <div style={{
                background: "var(--background-secondary, #2b2d31)",
                borderRadius: 8,
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))"
            }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--header-primary, #ffffff)" }}>
                    {t("Search on SoundCord")}
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                        <TextInput
                            placeholder={t("Search for a title or an artist on SoundCord...")}
                            value={searchQuery}
                            onChange={(val: string) => setSearchQuery(val)}
                            onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === "Enter") void handleSearch();
                            }}
                        />
                    </div>
                    <Button
                        color={Button.Colors.BRAND}
                        onClick={handleSearch}
                        disabled={isSearching || !searchQuery.trim()}
                    >
                        <SearchIcon />
                        {isSearching ? t("Searching...") : t("Search")}
                    </Button>
                </div>

                {/* Search Results */}
                {isSearching && (
                    <div style={{
                        padding: "24px 16px",
                        textAlign: "center",
                        color: "var(--text-muted, #949ba4)",
                        fontSize: 13
                    }}>
                        {t("Searching on SoundCord...")}
                    </div>
                )}

                {!isSearching && hasSearched && searchResults.length === 0 && (
                    <div style={{
                        padding: "20px 16px",
                        textAlign: "center",
                        color: "var(--text-muted, #949ba4)",
                        fontSize: 13
                    }}>
                        {t("No tracks found on SoundCord")}
                    </div>
                )}

                {!isSearching && searchResults.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                        <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--header-secondary, #b5bac1)"
                        }}>
                            <span>{t("Search Results")} ({searchResults.length})</span>
                            <span
                                style={{ cursor: "pointer", color: "var(--brand-500, #5865f2)" }}
                                onClick={() => {
                                    setSearchResults([]);
                                    setHasSearched(false);
                                    setSearchQuery("");
                                }}
                            >
                                {t("Clear results")}
                            </span>
                        </div>

                        <div
                            className="ncp-no-scrollbar"
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                                maxHeight: 380,
                                overflowY: "auto",
                                paddingRight: 4,
                                scrollbarWidth: "none"
                            }}
                        >
                            {searchResults.map(track => {
                                const isAdded = songs.some(s => s.id === `sc-${track.id}`);
                                return (
                                    <div
                                        key={track.id}
                                        style={{
                                            background: "rgba(255, 255, 255, 0.03)",
                                            borderRadius: 6,
                                            padding: "8px 12px",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 12,
                                            border: isAdded ? "1px solid var(--border-subtle, rgba(255, 255, 255, 0.16))" : "1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))"
                                        }}
                                    >
                                        <div style={{
                                            width: 44,
                                            height: 44,
                                            borderRadius: 4,
                                            overflow: "hidden",
                                            background: "var(--background-tertiary, #111214)",
                                            flexShrink: 0,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color: "var(--text-muted, #949ba4)"
                                        }}>
                                            {track.artworkUrl ? (
                                                <img src={track.artworkUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                                            ) : (
                                                <MusicIcon />
                                            )}
                                        </div>

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: 14,
                                                fontWeight: 600,
                                                color: "var(--header-primary, #ffffff)",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap"
                                            }}>
                                                {track.title}
                                            </div>
                                            <div style={{
                                                fontSize: 12,
                                                color: "var(--text-muted, #949ba4)",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap"
                                            }}>
                                                {track.artist}
                                            </div>
                                        </div>

                                        <div style={{
                                            fontSize: 12,
                                            color: "var(--text-muted, #949ba4)",
                                            flexShrink: 0,
                                            marginRight: 6
                                        }}>
                                            {track.durationText}
                                        </div>

                                        <Button
                                            color={isAdded ? Button.Colors.PRIMARY : Button.Colors.BRAND}
                                            size={Button.Sizes.SMALL}
                                            disabled={isAdded}
                                            onClick={() => handleAddFromSoundCord(track)}
                                        >
                                            {isAdded ? (
                                                <>
                                                    <CheckIcon />
                                                    {t("Added")}
                                                </>
                                            ) : (
                                                <>
                                                    <PlusIcon />
                                                    {t("Add to Profile")}
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Configured Songs Section */}
            <div style={{
                background: "var(--background-secondary, #2b2d31)",
                borderRadius: 8,
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))"
            }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--header-primary, #ffffff)" }}>
                        {t("Configured Songs")} ({songs.length})
                    </div>
                    <Button
                        color={Button.Colors.LINK}
                        size={Button.Sizes.SMALL}
                        onClick={() => setShowManualAdd(!showManualAdd)}
                    >
                        {t("Add custom audio URL")}
                        {showManualAdd ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    </Button>
                </div>

                {/* Collapsible Manual Add Form */}
                {showManualAdd && (
                    <div style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        borderRadius: 6,
                        padding: "14px 16px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))"
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--header-secondary, #b5bac1)" }}>
                            {t("Manual Track Addition")}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted, #949ba4)", marginBottom: 4 }}>
                                    {t("Title")} *
                                </div>
                                <TextInput
                                    placeholder="Ex: Starboy"
                                    value={manualTitle}
                                    onChange={(val: string) => setManualTitle(val)}
                                />
                            </div>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted, #949ba4)", marginBottom: 4 }}>
                                    {t("Artist")}
                                </div>
                                <TextInput
                                    placeholder="Ex: The Weeknd"
                                    value={manualArtist}
                                    onChange={(val: string) => setManualArtist(val)}
                                />
                            </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted, #949ba4)", marginBottom: 4 }}>
                                    {t("Audio URL (.mp3 direct)")} *
                                </div>
                                <TextInput
                                    placeholder="https://.../audio.mp3"
                                    value={manualUrl}
                                    onChange={(val: string) => setManualUrl(val)}
                                />
                            </div>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted, #949ba4)", marginBottom: 4 }}>
                                    {t("Album Artwork URL")}
                                </div>
                                <TextInput
                                    placeholder="https://.../cover.jpg"
                                    value={manualArtwork}
                                    onChange={(val: string) => setManualArtwork(val)}
                                />
                            </div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                            <Button
                                color={Button.Colors.BRAND}
                                size={Button.Sizes.SMALL}
                                onClick={handleAddManualSong}
                                disabled={!manualTitle.trim() || !manualUrl.trim()}
                            >
                                <PlusIcon />
                                {t("Add to Profile")}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Song List */}
                {songs.length === 0 ? (
                    <div style={{
                        padding: "28px 16px",
                        textAlign: "center",
                        color: "var(--text-muted, #949ba4)",
                        fontSize: 13,
                        background: "rgba(255, 255, 255, 0.03)",
                        borderRadius: 6,
                        border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))"
                    }}>
                        {t("No favorite songs configured yet. Use the search bar above to add your favorite tracks!")}
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {songs.map(song => (
                            <div
                                key={song.id}
                                style={{
                                    background: "rgba(255, 255, 255, 0.03)",
                                    borderRadius: 6,
                                    padding: "8px 14px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 12,
                                    border: "1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))"
                                }}
                            >
                                <div style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 4,
                                    overflow: "hidden",
                                    background: "var(--background-tertiary, #111214)",
                                    flexShrink: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "var(--text-muted, #949ba4)"
                                }}>
                                    {song.artworkUrl ? (
                                        <img src={song.artworkUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
                                    ) : (
                                        <MusicIcon />
                                    )}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: 14,
                                        fontWeight: 600,
                                        color: "var(--header-primary, #ffffff)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap"
                                    }}>
                                        {song.title}
                                    </div>
                                    <div style={{
                                        fontSize: 12,
                                        color: "var(--text-muted, #949ba4)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap"
                                    }}>
                                        {song.artist}
                                    </div>
                                </div>

                                <Button
                                    color={Button.Colors.RED}
                                    size={Button.Sizes.SMALL}
                                    onClick={() => handleDelete(song.id)}
                                >
                                    <TrashIcon />
                                    {t("Remove")}
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

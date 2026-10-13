/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface PremiumStory {
    id: string;
    url: string;
    type: "image" | "video";
    timestamp: number;
    isHighlight: boolean;
    soundcloudUrl?: string;
    startTime?: number;
}

export interface PremiumFavSong {
    id: string;
    title: string;
    artist: string;
    artworkUrl: string;
    url: string;
    streamUrl?: string;
    type: "soundcloud" | "local";
    duration?: number;
}

export type ProfileFontType = "none" | "gothic" | "signature" | "pixel" | "nerd" | "cyberpunk" | "handwritten";

export type UsernameEffectType = "none" | "glow" | "glitch" | "rainbow" | "type" | "gothic" | "signature" | "pixel" | "nerd" | "cyberpunk" | "handwritten";

export interface ProfileDrawingStroke {
    color: string;
    size: number;
    points: Array<[number, number]>;
}

export interface ProfileDrawingAvatarAnchor {
    cx: number;
    cy: number;
    size: number;
    cardWidth: number;
    cardHeight: number;
}

export interface ProfileDrawingData {
    enabled: boolean;
    strokes: ProfileDrawingStroke[];
    updatedAt: number;
    avatarAnchor?: ProfileDrawingAvatarAnchor;
}

export interface ProfileEffectsConfig {
    enabled?: boolean;
    mode: "preset" | "gif";
    presetName: string;
    showBanner: boolean;
    gifUrl: string;
    gifOpacity: number;
    gifFit: "cover" | "contain" | "fill";
    gifBgColor: string;
    gifBlendMode: string;
    nameEffect: UsernameEffectType;
    glowColor: string;
    chatUsernameEffect: UsernameEffectType;
    memberListEffect: UsernameEffectType;
    profileFont?: ProfileFontType;
    profileDrawing?: ProfileDrawingData;
}

export interface LoliCordPremiumPayload {
    storiesEnabled: boolean;
    favSongsEnabled: boolean;
    profileEffectsEnabled: boolean;
    stories: PremiumStory[];
    favSongs: PremiumFavSong[];
    effects?: Partial<ProfileEffectsConfig>;
    updatedAt: number;
}

export interface LoliCordPremiumSettings {
    enabled: boolean;
    storiesEnabled: boolean;
    favSongsEnabled: boolean;
    profileEffectsEnabled: boolean;
}

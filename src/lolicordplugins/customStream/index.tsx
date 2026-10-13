/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import { UserAreaButton as RawUserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin, { OptionType } from "@utils/types";
import { closeModal, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { RenderModalProps } from "@vencord/discord-types";
import { findStoreLazy } from "@webpack";
import { Alerts, Button, Menu, React, showToast, Text, Toasts, useEffect, useRef, useState } from "@webpack/common";

import { t } from "../autoTranslateLoliCord";

const UserStore = findStoreLazy("UserStore");

// Safe UserAreaButton wrapper
const UserAreaButton: any = (props: any) => {
    const Comp = RawUserAreaButton
        ?? (Vencord as any)?.Api?.UserArea?.UserAreaButton
        ?? (window as any)?.Vencord?.Api?.UserArea?.UserAreaButton;
    if (typeof Comp === "function") {
        return <Comp {...props} />;
    }
    return (
        <div
            onClick={props.onClick}
            onContextMenu={props.onContextMenu}
            title={props.tooltipText}
            role="button"
            tabIndex={0}
            style={{
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: 4
            }}
        >
            {props.icon}
        </div>
    );
};

// SVG Icons (Strict Zero-Emoji Policy)
const StreamIcon = ({ className, size = 20, color = "currentColor" }: { className?: string; size?: number; color?: string; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
        <path fill={color} d="M21 3H3C1.9 3 1 3.9 1 5V17C1 18.1 1.9 19 3 19H8V21H16V19H21C22.1 19 23 18.1 23 17V5C23 3.9 22.1 3 21 3ZM21 17H3V5H21V17Z" />
        <path fill={color} d="M12 7C10.34 7 9 8.34 9 10C9 11.66 10.34 13 12 13C13.66 13 15 11.66 15 10C15 8.34 13.66 7 12 7Z" />
        <path fill={color} d="M18 14L15 11L12 14L9 11L6 14V15H18V14Z" />
    </svg>
);

const FolderIcon = ({ size = 16, color = "currentColor" }: { size?: number; color?: string; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path fill={color} d="M10 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z" />
    </svg>
);

const PlusIcon = ({ size = 14, color = "currentColor" }: { size?: number; color?: string; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path fill={color} d="M19 11H13V5C13 4.45 12.55 4 12 4C11.45 4 11 4.45 11 5V11H5C4.45 11 4 11.45 4 12C4 12.55 4.45 13 5 13H11V19C11 19.55 11.45 20 12 20C12.55 20 13 19.55 13 19V13H19C19.55 13 20 12.55 20 12C20 11.45 19.55 11 19 11Z" />
    </svg>
);

const TrashIcon = ({ size = 16, color = "currentColor" }: { size?: number; color?: string; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path fill={color} d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" />
    </svg>
);

const CheckIcon = ({ size = 14, color = "currentColor" }: { size?: number; color?: string; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path fill={color} d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z" />
    </svg>
);

const CrossIcon = ({ size = 14, color = "currentColor" }: { size?: number; color?: string; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path fill={color} d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41Z" />
    </svg>
);

const EditIcon = ({ size = 14, color = "currentColor" }: { size?: number; color?: string; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path fill={color} d="M3 17.25V21H6.75L17.81 9.94L14.06 6.19L3 17.25ZM20.71 7.04C21.1 6.65 21.1 6.02 20.71 5.63L18.37 3.29C17.98 2.9 17.35 2.9 16.96 3.29L15.13 5.12L18.88 8.87L20.71 7.04Z" />
    </svg>
);

const ZoomIcon = ({ size = 14, color = "currentColor" }: { size?: number; color?: string; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path fill={color} d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z" />
    </svg>
);

const DownloadIcon = ({ size = 14, color = "currentColor" }: { size?: number; color?: string; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path fill={color} d="M19 9H15V3H9V9H5L12 16L19 9ZM5 18V20H19V18H5Z" />
    </svg>
);

const DiceIcon = ({ size = 14, color = "currentColor" }: { size?: number; color?: string; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke={color} strokeWidth="2" />
        <circle cx="8" cy="8" r="1.5" fill={color} />
        <circle cx="16" cy="8" r="1.5" fill={color} />
        <circle cx="12" cy="12" r="1.5" fill={color} />
        <circle cx="8" cy="16" r="1.5" fill={color} />
        <circle cx="16" cy="16" r="1.5" fill={color} />
    </svg>
);

const SlideshowIcon = ({ size = 14, color = "currentColor" }: { size?: number; color?: string; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path fill={color} d="M19 4H5C3.89 4 3 4.89 3 6V18C3 19.1 3.89 20 5 20H19C20.1 20 21 19.1 21 18V6C21 4.89 20.1 4 19 4ZM10 16V8L16 12L10 16Z" />
    </svg>
);

const ClockIcon = ({ size = 14, color = "currentColor" }: { size?: number; color?: string; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path fill={color} d="M12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20ZM12.5 7H11V13L16.2 16.2L17 14.9L12.5 12.2V7Z" />
    </svg>
);

const StorageIcon = ({ size = 14, color = "currentColor" }: { size?: number; color?: string; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path fill={color} d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V7L17 3H19ZM12 19C10.34 19 9 17.66 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19ZM15 9H5V5H15V9Z" />
    </svg>
);

const UploadIcon = ({ size = 36, color = "currentColor" }: { size?: number; color?: string; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path fill={color} d="M19.35 10.04C18.67 6.59 15.64 4 12 4C9.11 4 6.6 5.64 5.35 8.04C2.34 8.36 0 10.91 0 14C0 17.31 2.69 20 6 20H19C21.76 20 24 17.76 24 15C24 12.36 21.95 10.22 19.35 10.04ZM14 13V17H10V13H7L12 8L17 13H14Z" />
    </svg>
);

const PictureIcon = ({ size = 40, color = "currentColor" }: { size?: number; color?: string; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path fill={color} d="M21 19V5C21 3.9 20.1 3 19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19ZM8.5 13.5L11 16.51L14.5 12L19 18H5L8.5 13.5Z" />
    </svg>
);

// Constants
const DATASTORE_KEY_PROFILES_V2 = "customStream_ProfilesV2";
const DATASTORE_KEY_INDICES = "customStream_SlideIndices";
const DATASTORE_KEY_ACTIVE_PROFILE = "customStream_ActiveProfile";

// Legacy keys for seamless migration
const LEGACY_KEY_PROFILES_V2 = "CustomStreamTopQ_ProfilesV2";
const LEGACY_KEY_PROFILES = "CustomStreamTopQ_Profiles";
const LEGACY_KEY_INDICES = "CustomStreamTopQ_SlideIndices";
const LEGACY_KEY_ACTIVE_PROFILE = "CustomStreamTopQ_ActiveProfile";
const LEGACY_KEY_SLIDESHOW = "CustomStreamTopQ_Slideshow";
const LEGACY_KEY_INDEX = "CustomStreamTopQ_SlideIndex";

const MAX_IMAGES_PER_PROFILE = 50;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_PROFILES = 5;
const DEFAULT_PROFILE_ID = "default";
const DEFAULT_HOTKEY = "Alt+1";
const IMAGE_PICKER_MODAL_KEY = "lolicord-custom-stream-gallery";

interface Profile {
    id: string;
    name: string;
    images: Blob[];
    dataUris: string[];
    currentIndex: number;
}

interface StoredImageData {
    type: string;
    data: number[];
}

interface StoredProfileV1 {
    id: string;
    name: string;
    images: StoredImageData[];
    currentIndex: number;
}

interface StoredProfilesDataV1 {
    profiles: StoredProfileV1[];
    activeProfileId: string;
}

interface StoredProfileV2 {
    id: string;
    name: string;
    images: Blob[];
}

interface StoredProfilesDataV2 {
    profiles: StoredProfileV2[];
}

// In-memory profiles state
const profiles: Map<string, Profile> = new Map();
let activeProfileId: string = DEFAULT_PROFILE_ID;
let cachedImages: Blob[] = [];
let cachedDataUris: string[] = [];
let currentSlideIndex = 0;
let lastSlideChangeTime = 0;
let isStreamActive = false;
let manualSlideChange = false;
let actualStreamImageUri: string | null = null;
let shuffleBag: number[] = [];

function getActiveProfile(): Profile {
    let profile = profiles.get(activeProfileId);
    if (!profile) {
        profile = {
            id: DEFAULT_PROFILE_ID,
            name: "Default",
            images: [],
            dataUris: [],
            currentIndex: 0
        };
        profiles.set(DEFAULT_PROFILE_ID, profile);
    }
    return profile;
}

function syncCacheWithActiveProfile() {
    const profile = getActiveProfile();
    cachedImages = [...profile.images];
    cachedDataUris = [...profile.dataUris];
    currentSlideIndex = profile.currentIndex;
}

const imageChangeListeners = new Set<() => void>();

function notifyImageChange() {
    imageChangeListeners.forEach(listener => {
        try {
            listener();
        } catch {}
    });
}

const settings = definePluginSettings({
    replaceEnabled: {
        type: OptionType.BOOLEAN,
        description: "Use custom preview instead of screen capture",
        default: true
    },
    slideshowEnabled: {
        type: OptionType.BOOLEAN,
        description: "Slideshow mode (switch images automatically when Discord requests update ~5 min)",
        default: false
    },
    slideshowRandom: {
        type: OptionType.BOOLEAN,
        description: "Random slide order",
        default: false
    },
    showInfoBadges: {
        type: OptionType.BOOLEAN,
        description: "Show info badges in modal (count, selected, timer)",
        default: true
    },
    showPanelButton: {
        type: OptionType.BOOLEAN,
        description: "Show quick access button in user account panel",
        default: true
    },
    hotkey: {
        type: OptionType.STRING,
        description: "Hotkey that opens the gallery (e.g. Alt+1, Ctrl+Shift+S)",
        default: DEFAULT_HOTKEY
    }
});

async function saveProfilesToDataStore(): Promise<void> {
    const storedProfiles: StoredProfileV2[] = [];
    const indices: Record<string, number> = {};

    for (const [, profile] of profiles) {
        storedProfiles.push({
            id: profile.id,
            name: profile.name,
            images: profile.images
        });
        indices[profile.id] = profile.currentIndex;
    }

    await DataStore.set(DATASTORE_KEY_PROFILES_V2, { profiles: storedProfiles });
    await DataStore.set(DATASTORE_KEY_INDICES, indices);
    await DataStore.set(DATASTORE_KEY_ACTIVE_PROFILE, activeProfileId);

    syncCacheWithActiveProfile();
    notifyImageChange();
}

async function migrateFromLegacy(): Promise<boolean> {
    // 1. Check legacy V2
    const legacyV2: StoredProfilesDataV2 | undefined = await DataStore.get(LEGACY_KEY_PROFILES_V2);
    if (legacyV2?.profiles?.length) {
        const indices: Record<string, number> = await DataStore.get(LEGACY_KEY_INDICES) ?? {};
        const legacyActiveId: string | undefined = await DataStore.get(LEGACY_KEY_ACTIVE_PROFILE);

        profiles.clear();
        for (const stored of legacyV2.profiles) {
            const savedIndex = indices[stored.id];
            profiles.set(stored.id, {
                id: stored.id,
                name: stored.name,
                images: stored.images,
                dataUris: [],
                currentIndex: typeof savedIndex === "number" && savedIndex < stored.images.length ? savedIndex : 0
            });
        }
        activeProfileId = legacyActiveId && profiles.has(legacyActiveId) ? legacyActiveId : DEFAULT_PROFILE_ID;
        await ensureDataUris(getActiveProfile());
        await saveProfilesToDataStore();
        return true;
    }

    // 2. Check legacy V1
    const legacyV1: StoredProfilesDataV1 | undefined = await DataStore.get(LEGACY_KEY_PROFILES);
    if (legacyV1?.profiles?.length) {
        profiles.clear();
        for (const stored of legacyV1.profiles) {
            const blobs: Blob[] = [];
            for (const img of stored.images) {
                blobs.push(new Blob([new Uint8Array(img.data)], { type: img.type }));
            }
            profiles.set(stored.id, {
                id: stored.id,
                name: stored.name,
                images: blobs,
                dataUris: [],
                currentIndex: stored.currentIndex
            });
        }
        activeProfileId = legacyV1.activeProfileId && profiles.has(legacyV1.activeProfileId)
            ? legacyV1.activeProfileId
            : DEFAULT_PROFILE_ID;
        await ensureDataUris(getActiveProfile());
        await saveProfilesToDataStore();
        return true;
    }

    // 3. Check legacy raw slideshow
    const oldSlideshow: { images: StoredImageData[]; } | undefined = await DataStore.get(LEGACY_KEY_SLIDESHOW);
    if (oldSlideshow?.images?.length) {
        const blobs: Blob[] = [];
        const dataUris: string[] = [];
        for (const img of oldSlideshow.images) {
            const blob = new Blob([new Uint8Array(img.data)], { type: img.type });
            blobs.push(blob);
            dataUris.push(await blobToDataUrl(blob));
        }
        const oldIndex = (await DataStore.get(LEGACY_KEY_INDEX)) ?? 0;
        profiles.set(DEFAULT_PROFILE_ID, {
            id: DEFAULT_PROFILE_ID,
            name: "Default",
            images: blobs,
            dataUris,
            currentIndex: typeof oldIndex === "number" ? oldIndex : 0
        });
        activeProfileId = DEFAULT_PROFILE_ID;
        await saveProfilesToDataStore();
        return true;
    }

    return false;
}

async function loadProfilesFromDataStore(): Promise<void> {
    try {
        const dataV2: StoredProfilesDataV2 | undefined = await DataStore.get(DATASTORE_KEY_PROFILES_V2);

        if (dataV2?.profiles?.length) {
            const indices: Record<string, number> = await DataStore.get(DATASTORE_KEY_INDICES) ?? {};
            const storedActiveId: string | undefined = await DataStore.get(DATASTORE_KEY_ACTIVE_PROFILE);

            profiles.clear();
            for (const stored of dataV2.profiles) {
                const savedIndex = indices[stored.id];
                profiles.set(stored.id, {
                    id: stored.id,
                    name: stored.name,
                    images: stored.images,
                    dataUris: [],
                    currentIndex: typeof savedIndex === "number" && savedIndex < stored.images.length ? savedIndex : 0
                });
            }
            activeProfileId = storedActiveId && profiles.has(storedActiveId)
                ? storedActiveId
                : DEFAULT_PROFILE_ID;

            await ensureDataUris(getActiveProfile());
        } else if (await migrateFromLegacy()) {
            // Migrated from legacy format
        } else {
            profiles.set(DEFAULT_PROFILE_ID, {
                id: DEFAULT_PROFILE_ID,
                name: "Default",
                images: [],
                dataUris: [],
                currentIndex: 0
            });
            activeProfileId = DEFAULT_PROFILE_ID;
        }

        syncCacheWithActiveProfile();
    } catch (error) {
        console.error("[customStream] Error loading profiles:", error);
        profiles.set(DEFAULT_PROFILE_ID, {
            id: DEFAULT_PROFILE_ID,
            name: "Default",
            images: [],
            dataUris: [],
            currentIndex: 0
        });
        activeProfileId = DEFAULT_PROFILE_ID;
    }
}

function createProfile(name: string): Profile | null {
    if (profiles.size >= MAX_PROFILES) return null;
    const id = `profile_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const profile: Profile = {
        id,
        name,
        images: [],
        dataUris: [],
        currentIndex: 0
    };
    profiles.set(id, profile);
    return profile;
}

function deleteProfile(profileId: string): boolean {
    const profile = profiles.get(profileId);
    if (!profile) return false;
    if (profile.images.length > 0) return false;
    if (profileId === DEFAULT_PROFILE_ID) return false;

    profiles.delete(profileId);
    if (activeProfileId === profileId) {
        void setActiveProfile(DEFAULT_PROFILE_ID);
    }
    return true;
}

function renameProfile(profileId: string, newName: string): boolean {
    const profile = profiles.get(profileId);
    if (!profile) return false;
    profile.name = newName;
    return true;
}

async function setActiveProfile(profileId: string): Promise<boolean> {
    const profile = profiles.get(profileId);
    if (!profile) return false;

    activeProfileId = profileId;
    resetShuffleBag();
    DataStore.set(DATASTORE_KEY_ACTIVE_PROFILE, profileId);

    await ensureDataUris(profile);
    syncCacheWithActiveProfile();
    notifyImageChange();
    return true;
}

function getProfileList(): Profile[] {
    return Array.from(profiles.values());
}

async function saveSlideIndex(index: number): Promise<void> {
    const profile = getActiveProfile();
    profile.currentIndex = index;
    currentSlideIndex = index;

    const indices: Record<string, number> = {};
    for (const [, p] of profiles) {
        indices[p.id] = p.currentIndex;
    }
    await DataStore.set(DATASTORE_KEY_INDICES, indices);
}

function resetShuffleBag(): void {
    shuffleBag = [];
}

async function ensureDataUris(profile: Profile): Promise<void> {
    if (profile.dataUris.length === profile.images.length) return;

    const uris: string[] = [];
    for (const blob of profile.images) {
        uris.push(await blobToDataUrl(blob));
    }
    profile.dataUris = uris;
}

async function deleteAllImages(): Promise<void> {
    const profile = getActiveProfile();
    profile.images = [];
    profile.dataUris = [];
    profile.currentIndex = 0;
    resetShuffleBag();
    syncCacheWithActiveProfile();
    await saveProfilesToDataStore();
}

async function deleteImageAtIndex(index: number): Promise<void> {
    const profile = getActiveProfile();
    if (index < 0 || index >= profile.images.length) return;

    profile.images.splice(index, 1);
    profile.dataUris.splice(index, 1);

    if (profile.currentIndex >= profile.images.length) {
        profile.currentIndex = 0;
    }

    resetShuffleBag();
    syncCacheWithActiveProfile();
    await saveProfilesToDataStore();
}

async function deleteImagesAtIndices(indices: number[]): Promise<void> {
    const profile = getActiveProfile();
    const sorted = indices
        .filter(i => i >= 0 && i < profile.images.length)
        .sort((a, b) => b - a);
    if (sorted.length === 0) return;

    for (const i of sorted) {
        profile.images.splice(i, 1);
        profile.dataUris.splice(i, 1);
    }

    if (profile.currentIndex >= profile.images.length) {
        profile.currentIndex = 0;
    }

    resetShuffleBag();
    syncCacheWithActiveProfile();
    await saveProfilesToDataStore();
}

async function moveImage(fromIndex: number, toIndex: number): Promise<void> {
    const profile = getActiveProfile();
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= profile.images.length) return;
    if (toIndex < 0 || toIndex >= profile.images.length) return;

    [profile.images[fromIndex], profile.images[toIndex]] = [profile.images[toIndex], profile.images[fromIndex]];
    [profile.dataUris[fromIndex], profile.dataUris[toIndex]] = [profile.dataUris[toIndex], profile.dataUris[fromIndex]];

    if (profile.currentIndex === fromIndex) {
        profile.currentIndex = toIndex;
    } else if (profile.currentIndex === toIndex) {
        profile.currentIndex = fromIndex;
    }

    resetShuffleBag();
    syncCacheWithActiveProfile();
    await saveProfilesToDataStore();
}

async function addImages(blobs: Blob[]): Promise<void> {
    if (blobs.length === 0) return;

    const profile = getActiveProfile();
    for (const blob of blobs) {
        profile.images.push(blob);
        profile.dataUris.push(await blobToDataUrl(blob));
    }

    resetShuffleBag();
    syncCacheWithActiveProfile();
    await saveProfilesToDataStore();
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function getImageCount(): number {
    return cachedImages.length;
}

async function processImage(blob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = () => {
            URL.revokeObjectURL(url);

            const targetWidth = 1280;
            const targetHeight = 720;

            const canvas = document.createElement("canvas");
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext("2d")!;

            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, targetWidth, targetHeight);

            const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
            const scaledWidth = img.width * scale;
            const scaledHeight = img.height * scale;
            const x = (targetWidth - scaledWidth) / 2;
            const y = (targetHeight - scaledHeight) / 2;

            ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

            canvas.toBlob(newBlob => {
                if (newBlob) {
                    resolve(newBlob);
                } else {
                    reject(new Error("Failed to convert image"));
                }
            }, "image/jpeg", 0.7);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to load image"));
        };

        img.src = url;
    });
}

function formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (secs === 0) return `${mins}m`;
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SlideElapsed() {
    const [seconds, setSeconds] = useState(() => Math.floor((Date.now() - lastSlideChangeTime) / 1000));

    useEffect(() => {
        const id = setInterval(() => {
            if (lastSlideChangeTime > 0) setSeconds(Math.floor((Date.now() - lastSlideChangeTime) / 1000));
        }, 1000);
        return () => clearInterval(id);
    }, []);

    return <>{formatTime(seconds)}</>;
}

// Modal component using official Discord primitives
function ImagePickerModal({ rootProps }: { rootProps: RenderModalProps; }) {
    const initialSettingsRef = useRef({
        enabled: settings.store.replaceEnabled,
        slideshowEnabled: settings.store.slideshowEnabled,
        slideshowRandom: settings.store.slideshowRandom,
        slideIndex: currentSlideIndex,
        activeProfileId
    });
    const savedRef = useRef(false);

    const [images, setImages] = useState<string[]>([]);
    const [imageSizes, setImageSizes] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [pendingIndex, setPendingIndex] = useState(currentSlideIndex);
    const [pluginEnabled, setPluginEnabled] = useState(settings.store.replaceEnabled);
    const [slideshowOn, setSlideshowOn] = useState(settings.store.slideshowEnabled);
    const [randomOn, setRandomOn] = useState(settings.store.slideshowRandom);
    const [isDragging, setIsDragging] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [streamActive, setStreamActive] = useState(isStreamActive);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const lastClickedIndexRef = useRef(0);
    const liveUrlsRef = useRef<string[]>([]);

    const [profileList, setProfileList] = useState<Profile[]>(getProfileList());
    const [currentProfileId, setCurrentProfileId] = useState(activeProfileId);
    const [isCreatingProfile, setIsCreatingProfile] = useState(false);
    const [newProfileName, setNewProfileName] = useState("");
    const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
    const [editingProfileName, setEditingProfileName] = useState("");

    useEffect(() => () => {
        if (!savedRef.current) {
            const init = initialSettingsRef.current;
            settings.store.replaceEnabled = init.enabled;
            settings.store.slideshowEnabled = init.slideshowEnabled;
            settings.store.slideshowRandom = init.slideshowRandom;
            currentSlideIndex = init.slideIndex;
            void setActiveProfile(init.activeProfileId);
        }
    }, []);

    const loadImages = () => {
        const profile = profiles.get(currentProfileId) || getActiveProfile();
        setImages(profile.images.map(blob => URL.createObjectURL(blob)));
        setImageSizes(profile.images.map(blob => blob.size));
        setPendingIndex(profile.currentIndex);
        setSelectedIndices(new Set());
        setIsLoading(false);
    };

    const dropFromGrid = (keep: (index: number) => boolean) => {
        const profile = profiles.get(currentProfileId) || getActiveProfile();
        setImages(prev => prev.filter((_, i) => keep(i)));
        setImageSizes(prev => prev.filter((_, i) => keep(i)));
        setPendingIndex(profile.currentIndex);
        setSelectedIndices(new Set());
    };

    useEffect(() => {
        loadImages();
    }, [currentProfileId]);

    useEffect(() => {
        const alive = new Set(images);
        for (const url of liveUrlsRef.current) {
            if (!alive.has(url)) URL.revokeObjectURL(url);
        }
        liveUrlsRef.current = images;
    }, [images]);

    useEffect(() => () => {
        for (const url of liveUrlsRef.current) URL.revokeObjectURL(url);
    }, []);

    useEffect(() => {
        if (previewIndex === null) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape" && e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

            e.preventDefault();
            e.stopImmediatePropagation();

            if (e.key === "Escape") {
                setPreviewIndex(null);
                return;
            }

            const step = e.key === "ArrowRight" ? 1 : -1;
            setPreviewIndex(current => {
                if (current === null || images.length === 0) return current;
                return (current + step + images.length) % images.length;
            });
        };

        window.addEventListener("keydown", onKeyDown, { capture: true });
        return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
    }, [previewIndex, images.length]);

    useEffect(() => {
        const timerInterval = setInterval(() => {
            if (isStreamActive && lastSlideChangeTime > 0 && (Date.now() - lastSlideChangeTime) > 420000) {
                isStreamActive = false;
            }
            setStreamActive(isStreamActive);
        }, 1000);
        return () => clearInterval(timerInterval);
    }, []);

    const handleProfileSwitch = async (profileId: string) => {
        await setActiveProfile(profileId);
        setCurrentProfileId(profileId);
        const profile = profiles.get(profileId);
        if (profile) {
            setPendingIndex(profile.currentIndex);
        }
    };

    const handleCreateProfile = async () => {
        const name = newProfileName.trim();
        if (!name) {
            setError(t("Enter profile name"));
            return;
        }
        if (name.length > 40) {
            setError(t("Profile name too long (max 40 characters)"));
            return;
        }
        if (profiles.size >= MAX_PROFILES) {
            setError(t(`Maximum ${MAX_PROFILES} profiles allowed`));
            return;
        }
        const profile = createProfile(name);
        if (!profile) {
            setError(t(`Maximum ${MAX_PROFILES} profiles allowed`));
            return;
        }
        await saveProfilesToDataStore();
        setProfileList(getProfileList());
        setNewProfileName("");
        setIsCreatingProfile(false);
        handleProfileSwitch(profile.id);
        showToast(`${t("Profile created")}: ${profile.name}`, Toasts.Type.SUCCESS);
    };

    const handleDeleteProfile = (profileId: string) => {
        const profile = profiles.get(profileId);
        if (!profile) return;

        if (profile.images.length > 0) {
            setError(t("Delete all images first!"));
            return;
        }

        if (profileId === DEFAULT_PROFILE_ID) {
            setError(t("Cannot delete default profile"));
            return;
        }

        Alerts.show({
            title: `${t("Delete profile")} "${profile.name}"?`,
            body: t("This action cannot be undone."),
            confirmText: t("Delete"),
            cancelText: t("Cancel"),
            confirmColor: "red",
            onConfirm: async () => {
                deleteProfile(profileId);
                await saveProfilesToDataStore();
                setProfileList(getProfileList());
                if (currentProfileId === profileId) {
                    handleProfileSwitch(DEFAULT_PROFILE_ID);
                }
                showToast(t("Profile deleted"), Toasts.Type.SUCCESS);
            }
        });
    };

    const handleRenameProfile = async (profileId: string) => {
        const name = editingProfileName.trim();
        if (!name) {
            setEditingProfileId(null);
            return;
        }
        if (name.length > 40) {
            setError(t("Profile name too long (max 40 characters)"));
            return;
        }
        renameProfile(profileId, name);
        await saveProfilesToDataStore();
        setProfileList(getProfileList());
        setEditingProfileId(null);
        showToast(t("Profile renamed"), Toasts.Type.SUCCESS);
    };

    const importFiles = async (files: FileList | File[]) => {
        const profile = profiles.get(currentProfileId) || getActiveProfile();
        const remaining = MAX_IMAGES_PER_PROFILE - profile.images.length;
        if (remaining <= 0) {
            setError(t(`Limit of ${MAX_IMAGES_PER_PROFILE} images reached!`));
            return;
        }

        setIsLoading(true);
        setError("");

        try {
            const processed: Blob[] = [];
            for (const file of files) {
                if (processed.length >= remaining) {
                    setError(t(`Limit of ${MAX_IMAGES_PER_PROFILE} images reached!`));
                    break;
                }
                if (!file.type.startsWith("image/") || file.type === "image/gif") continue;
                if (file.size > MAX_FILE_SIZE) continue;

                processed.push(await processImage(file));
            }

            await addImages(processed);
            loadImages();

            if (processed.length > 0) {
                showToast(`${t("Added")}: ${processed.length}`, Toasts.Type.SUCCESS);
            }
        } catch {
            setError(t("File processing error"));
        }

        setIsLoading(false);
    };

    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;

            const items = e.clipboardData?.items;
            if (!items) return;

            const files: File[] = [];
            for (const item of items) {
                if (item.kind === "file" && item.type.startsWith("image/") && item.type !== "image/gif") {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                }
            }

            if (files.length > 0) {
                e.preventDefault();
                importFiles(files);
            }
        };

        document.addEventListener("paste", onPaste);
        return () => document.removeEventListener("paste", onPaste);
    }, [currentProfileId]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedIndex === null && e.dataTransfer.types.includes("Files")) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            setIsDragging(false);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            await importFiles(files);
        }
    };

    const handleFileSelect = (multiple: boolean) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/png,image/jpeg,image/webp";
        input.multiple = multiple;
        input.onchange = (e: any) => {
            const files = e.target.files;
            if (files?.length) importFiles(files);
        };
        input.click();
    };

    const handleDelete = async (index: number) => {
        await deleteImageAtIndex(index);
        const profile = profiles.get(currentProfileId) || getActiveProfile();
        if (pendingIndex >= profile.images.length && profile.images.length > 0) {
            setPendingIndex(profile.images.length - 1);
        } else if (profile.images.length === 0) {
            setPendingIndex(0);
        }
        dropFromGrid(i => i !== index);
        setProfileList(getProfileList());
        showToast(t("Deleted"), Toasts.Type.MESSAGE);
    };

    const handleClearAll = () => {
        const profile = profiles.get(currentProfileId);
        if (!profile || profile.images.length === 0) return;

        Alerts.show({
            title: `${t("Delete all images from")} "${profile.name}"?`,
            body: t("Are you sure you want to delete all images? This action cannot be undone."),
            confirmText: t("Delete All"),
            cancelText: t("Cancel"),
            confirmColor: "red",
            onConfirm: async () => {
                await deleteAllImages();
                setImages([]);
                setPendingIndex(0);
                setProfileList(getProfileList());
                showToast(t("All deleted"), Toasts.Type.MESSAGE);
            }
        });
    };

    const handleImageClick = (e: React.MouseEvent, index: number) => {
        if (e.ctrlKey || e.metaKey) {
            setSelectedIndices(prev => {
                const next = new Set(prev);
                if (next.has(index)) next.delete(index);
                else next.add(index);
                return next;
            });
            lastClickedIndexRef.current = index;
            return;
        }
        if (e.shiftKey) {
            const start = Math.min(lastClickedIndexRef.current, index);
            const end = Math.max(lastClickedIndexRef.current, index);
            setSelectedIndices(prev => {
                const next = new Set(prev);
                for (let i = start; i <= end; i++) next.add(i);
                return next;
            });
            return;
        }
        setSelectedIndices(new Set());
        lastClickedIndexRef.current = index;
        setPendingIndex(index);
    };

    const handleDeleteSelected = () => {
        const count = selectedIndices.size;
        if (count === 0) return;

        Alerts.show({
            title: `${t("Delete")} ${count} ${t("selected image(s)")}?`,
            body: t("This action cannot be undone."),
            confirmText: t("Delete"),
            cancelText: t("Cancel"),
            confirmColor: "red",
            onConfirm: async () => {
                await deleteImagesAtIndices(Array.from(selectedIndices));
                const profile = profiles.get(currentProfileId) || getActiveProfile();
                if (pendingIndex >= profile.images.length) {
                    setPendingIndex(Math.max(0, profile.images.length - 1));
                }
                const removed = new Set(selectedIndices);
                dropFromGrid(i => !removed.has(i));
                setProfileList(getProfileList());
                showToast(`${t("Deleted")}: ${count}`, Toasts.Type.MESSAGE);
            }
        });
    };

    const handleSave = async () => {
        settings.store.replaceEnabled = pluginEnabled;
        settings.store.slideshowEnabled = slideshowOn;
        settings.store.slideshowRandom = randomOn;

        if (pendingIndex !== currentSlideIndex) {
            manualSlideChange = true;
        }

        currentSlideIndex = pendingIndex;
        await saveSlideIndex(pendingIndex);
        savedRef.current = true;
        notifyImageChange();
        showToast(t("Settings saved!"), Toasts.Type.SUCCESS);
        rootProps.onClose();
    };

    const handleCancel = () => {
        rootProps.onClose();
    };

    const handleImageDragStart = (e: React.DragEvent, index: number) => {
        e.stopPropagation();
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", index.toString());
    };

    const handleImageDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedIndex !== null && draggedIndex !== index) {
            setDragOverIndex(index);
        }
    };

    const handleImageDragLeave = (e: React.DragEvent, index: number) => {
        e.stopPropagation();
        setDragOverIndex(current => (current === index ? null : current));
    };

    const handleImageDrop = async (e: React.DragEvent, toIndex: number) => {
        e.preventDefault();
        e.stopPropagation();

        if (draggedIndex !== null && draggedIndex !== toIndex) {
            let newPendingIndex = pendingIndex;
            if (pendingIndex === draggedIndex) {
                newPendingIndex = toIndex;
            } else if (pendingIndex === toIndex) {
                newPendingIndex = draggedIndex;
            }

            await moveImage(draggedIndex, toIndex);
            const from = draggedIndex;
            const swap = (prev: any[]) => {
                const next = [...prev];
                [next[from], next[toIndex]] = [next[toIndex], next[from]];
                return next;
            };
            setImages(swap);
            setImageSizes(swap);
            setPendingIndex(newPendingIndex);
            setSelectedIndices(new Set());
            showToast(`${t("Swapped")}: #${from + 1} ⇄ #${toIndex + 1}`, Toasts.Type.SUCCESS);
        }

        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const handleImageDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const nextIndex = images.length > 1 && slideshowOn && !randomOn ? (pendingIndex + 1) % images.length : -1;

    return (
        <ModalRoot {...rootProps} size={ModalSize.LARGE} className="nc-custom-stream-modal theme-dark">
            <ModalHeader separator={false} className="nc-custom-stream-header">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            backgroundColor: "rgba(88, 101, 242, 0.15)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0
                        }}>
                            <StreamIcon size={22} color="#5865f2" />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <h2 className="nc-custom-stream-title">
                                    {t("Stream Preview")}
                                </h2>
                                <span style={{
                                    backgroundColor: "rgba(88, 101, 242, 0.15)",
                                    color: "#5865f2",
                                    border: "1px solid rgba(88, 101, 242, 0.3)",
                                    borderRadius: "4px",
                                    padding: "1px 7px",
                                    fontSize: "11px",
                                    fontWeight: 700
                                }}>
                                    {profiles.get(currentProfileId)?.name || "Default"}
                                </span>
                            </div>
                            <span className="nc-custom-stream-subtitle">
                                {images.length} / {MAX_IMAGES_PER_PROFILE} {t("images")}
                            </span>
                        </div>
                    </div>
                    <ModalCloseButton onClick={rootProps.onClose} />
                </div>
            </ModalHeader>

            <ModalContent className="nc-custom-stream-content">
                {/* Fullscreen lightbox */}
                {previewIndex !== null && images[previewIndex] && (
                    <div
                        onClick={() => setPreviewIndex(null)}
                        style={{
                            position: "fixed",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: "rgba(0, 0, 0, 0.94)",
                            zIndex: 10000,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "zoom-out",
                            padding: "40px"
                        }}
                    >
                        <img
                            src={images[previewIndex]}
                            alt={`Slide ${previewIndex + 1}`}
                            style={{
                                maxWidth: "100%",
                                maxHeight: "100%",
                                objectFit: "contain",
                                borderRadius: "8px",
                                boxShadow: "0 16px 48px rgba(0,0,0,0.8)"
                            }}
                        />
                        <div style={{
                            position: "absolute",
                            top: "20px",
                            right: "20px",
                            color: "#949ba4",
                            fontSize: "13px"
                        }}>
                            {t("Esc or click to close")}
                        </div>
                        <div style={{
                            position: "absolute",
                            top: "20px",
                            left: "20px",
                            color: "#ffffff",
                            fontSize: "14px",
                            fontWeight: "700",
                            backgroundColor: "rgba(0, 0, 0, 0.75)",
                            padding: "6px 14px",
                            borderRadius: "8px"
                        }}>
                            #{previewIndex + 1} / {images.length}
                        </div>
                        <div style={{
                            position: "absolute",
                            bottom: "20px",
                            left: "50%",
                            transform: "translateX(-50%)",
                            color: "#ffffff",
                            fontSize: "13px",
                            backgroundColor: "rgba(0, 0, 0, 0.75)",
                            padding: "8px 16px",
                            borderRadius: "8px"
                        }}>
                            1280×720 (16:9) {images.length > 1 && `• ${t("Left / Right arrows to browse")}`}
                        </div>
                    </div>
                )}

                <div
                    style={{ position: "relative" }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {/* Drag & drop overlay */}
                    {isDragging && draggedIndex === null && (
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: "rgba(18, 19, 22, 0.95)",
                                borderRadius: "10px",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                zIndex: 1000,
                                border: "2px dashed #5865f2",
                                pointerEvents: "auto",
                                backdropFilter: "blur(6px)"
                            }}
                        >
                            <UploadIcon size={48} color="#5865f2" />
                            <div style={{ color: "#ffffff", fontSize: "18px", fontWeight: 700, marginTop: "12px", marginBottom: "4px" }}>
                                {t("Drop to upload")}
                            </div>
                            <div style={{ color: "#949ba4", fontSize: "13px" }}>
                                {t("Supports PNG, JPEG, WebP")}
                            </div>
                        </div>
                    )}

                    {/* Stream Replacement toggle card */}
                    <div
                        className="nc-custom-stream-card"
                        onClick={() => setPluginEnabled(!pluginEnabled)}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            cursor: "pointer",
                            userSelect: "none",
                            backgroundColor: "#2b2d31",
                            border: pluginEnabled ? "1px solid rgba(35, 165, 90, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)"
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                            <div style={{
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                backgroundColor: pluginEnabled ? "rgba(35, 165, 90, 0.15)" : "rgba(255, 255, 255, 0.06)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: pluginEnabled ? "#23a55a" : "#949ba4",
                                flexShrink: 0
                            }}>
                                <StreamIcon size={20} color="currentColor" />
                            </div>
                            <div>
                                <h3 className="nc-custom-stream-card-title">
                                    {t("Stream Preview Replacement")}
                                </h3>
                                <p className="nc-custom-stream-card-desc">
                                    {t("Override Discord screen capture preview with custom image")}
                                </p>
                            </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <span style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                letterSpacing: "0.5px",
                                color: pluginEnabled ? "#23a55a" : "#949ba4"
                            }}>
                                {pluginEnabled ? t("ON") : t("OFF")}
                            </span>
                            <div className={`nc-custom-stream-switch-track ${pluginEnabled ? "active" : ""}`}>
                                <div className="nc-custom-stream-switch-knob" />
                            </div>
                        </div>
                    </div>

                    {/* Profiles container */}
                    <div className="nc-custom-stream-card" style={{ padding: "16px" }}>
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "12px",
                            paddingBottom: "10px",
                            borderBottom: "1px solid rgba(255, 255, 255, 0.08)"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <FolderIcon size={18} color="#5865f2" />
                                <span style={{ color: "#ffffff", fontSize: "13px", fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase" }}>
                                    {t("Profiles")}
                                </span>
                                <span style={{
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    color: "#ffffff",
                                    backgroundColor: "#5865f2",
                                    padding: "2px 8px",
                                    borderRadius: "10px"
                                }}>
                                    {profileList.length} / {MAX_PROFILES}
                                </span>
                            </div>
                            {!isCreatingProfile && profileList.length < MAX_PROFILES && (
                                <Button
                                    size={Button.Sizes.TINY}
                                    color={Button.Colors.BRAND}
                                    onClick={() => setIsCreatingProfile(true)}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                        <PlusIcon size={12} color="#ffffff" />
                                        <span style={{ color: "#ffffff", fontWeight: 600 }}>{t("New Profile")}</span>
                                    </div>
                                </Button>
                            )}
                        </div>

                        {/* New Profile inline form */}
                        {isCreatingProfile && (
                            <div style={{
                                display: "flex",
                                gap: "8px",
                                marginBottom: "12px",
                                padding: "10px 12px",
                                backgroundColor: "#1e1f22",
                                borderRadius: "8px",
                                border: "1px solid #5865f2"
                            }}>
                                <input
                                    type="text"
                                    placeholder={t("Profile name...")}
                                    value={newProfileName}
                                    onChange={e => setNewProfileName(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === "Enter") handleCreateProfile();
                                        if (e.key === "Escape") {
                                            setIsCreatingProfile(false);
                                            setNewProfileName("");
                                        }
                                    }}
                                    autoFocus
                                    style={{
                                        flex: 1,
                                        padding: "6px 12px",
                                        borderRadius: "4px",
                                        border: "1px solid rgba(255, 255, 255, 0.1)",
                                        backgroundColor: "#2b2d31",
                                        color: "#ffffff",
                                        fontSize: "13px",
                                        outline: "none"
                                    }}
                                />
                                <Button
                                    size={Button.Sizes.TINY}
                                    color={Button.Colors.GREEN}
                                    onClick={handleCreateProfile}
                                >
                                    <CheckIcon size={12} color="#ffffff" />
                                </Button>
                                <Button
                                    size={Button.Sizes.TINY}
                                    color={Button.Colors.RED}
                                    onClick={() => {
                                        setIsCreatingProfile(false);
                                        setNewProfileName("");
                                    }}
                                >
                                    <CrossIcon size={12} color="#ffffff" />
                                </Button>
                            </div>
                        )}

                        {/* Profiles tabs */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {profileList.map((profile: Profile) => {
                                const isActive = profile.id === currentProfileId;
                                const isEditing = editingProfileId === profile.id;
                                const canDelete = profile.id !== DEFAULT_PROFILE_ID && profile.images.length === 0;

                                return (
                                    <div
                                        key={profile.id}
                                        className={`nc-custom-stream-profile-tab ${isActive ? "active" : ""}`}
                                        onClick={() => !isEditing && handleProfileSwitch(profile.id)}
                                    >
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={editingProfileName}
                                                onChange={e => setEditingProfileName(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === "Enter") handleRenameProfile(profile.id);
                                                    if (e.key === "Escape") setEditingProfileId(null);
                                                }}
                                                onBlur={() => handleRenameProfile(profile.id)}
                                                autoFocus
                                                onClick={e => e.stopPropagation()}
                                                style={{
                                                    width: "90px",
                                                    padding: "2px 6px",
                                                    borderRadius: "4px",
                                                    border: "1px solid #5865f2",
                                                    backgroundColor: "#1e1f22",
                                                    color: "#ffffff",
                                                    fontSize: "12px",
                                                    outline: "none"
                                                }}
                                            />
                                        ) : (
                                            <>
                                                {isActive ? (
                                                    <CheckIcon size={13} color="#ffffff" />
                                                ) : (
                                                    <FolderIcon size={13} color="#949ba4" />
                                                )}
                                                <span style={{
                                                    fontWeight: 600,
                                                    fontSize: "13px",
                                                    color: isActive ? "#ffffff" : "#dbdee1"
                                                }}>
                                                    {profile.name}
                                                </span>
                                                <span style={{
                                                    fontSize: "10px",
                                                    fontWeight: 700,
                                                    backgroundColor: isActive ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.08)",
                                                    color: isActive ? "#ffffff" : "#949ba4",
                                                    padding: "1px 6px",
                                                    borderRadius: "10px",
                                                    minWidth: "16px",
                                                    textAlign: "center"
                                                }}>
                                                    {profile.images.length}
                                                </span>
                                            </>
                                        )}

                                        {isActive && !isEditing && (
                                            <div style={{
                                                display: "flex",
                                                gap: "4px",
                                                marginLeft: "4px",
                                                paddingLeft: "6px",
                                                borderLeft: "1px solid rgba(255, 255, 255, 0.3)"
                                            }}>
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        setEditingProfileId(profile.id);
                                                        setEditingProfileName(profile.name);
                                                    }}
                                                    title={t("Rename")}
                                                    className="nc-custom-stream-action-btn"
                                                    style={{ width: 22, height: 22, backgroundColor: "rgba(255, 255, 255, 0.2)" }}
                                                >
                                                    <EditIcon size={11} color="#ffffff" />
                                                </div>
                                                {canDelete && (
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            handleDeleteProfile(profile.id);
                                                        }}
                                                        title={t("Delete profile (only if empty)")}
                                                        className="nc-custom-stream-action-btn"
                                                        style={{ width: 22, height: 22, backgroundColor: "rgba(237, 66, 69, 0.8)" }}
                                                    >
                                                        <TrashIcon size={11} color="#ffffff" />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Slideshow toggles */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                        <div
                            className="nc-custom-stream-card"
                            onClick={() => setSlideshowOn(!slideshowOn)}
                            style={{
                                margin: 0,
                                cursor: "pointer",
                                userSelect: "none",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                backgroundColor: slideshowOn ? "rgba(88, 101, 242, 0.12)" : "#2b2d31",
                                border: slideshowOn ? "1px solid #5865f2" : "1px solid rgba(255, 255, 255, 0.08)"
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <div style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 6,
                                    backgroundColor: slideshowOn ? "rgba(88, 101, 242, 0.25)" : "rgba(255, 255, 255, 0.06)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: slideshowOn ? "#5865f2" : "#949ba4",
                                    flexShrink: 0
                                }}>
                                    <SlideshowIcon size={16} color="currentColor" />
                                </div>
                                <div>
                                    <h4 className="nc-custom-stream-card-title" style={{ fontSize: "13px" }}>
                                        {t("Slideshow Rotation")}
                                    </h4>
                                    <p className="nc-custom-stream-card-desc" style={{ fontSize: "11px" }}>
                                        {t("Cycles through profile images every ~5 min")}
                                    </p>
                                </div>
                            </div>
                            <span style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                padding: "3px 8px",
                                borderRadius: "4px",
                                color: slideshowOn ? "#23a55a" : "#949ba4",
                                backgroundColor: slideshowOn ? "rgba(35, 165, 90, 0.15)" : "#1e1f22",
                                border: slideshowOn ? "1px solid rgba(35, 165, 90, 0.3)" : "1px solid rgba(255, 255, 255, 0.06)"
                            }}>
                                {slideshowOn ? t("ON") : t("OFF")}
                            </span>
                        </div>

                        <div
                            className="nc-custom-stream-card"
                            onClick={slideshowOn ? () => setRandomOn(!randomOn) : undefined}
                            style={{
                                margin: 0,
                                cursor: slideshowOn ? "pointer" : "not-allowed",
                                opacity: slideshowOn ? 1 : 0.45,
                                userSelect: "none",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                backgroundColor: slideshowOn && randomOn ? "rgba(88, 101, 242, 0.12)" : "#2b2d31",
                                border: slideshowOn && randomOn ? "1px solid #5865f2" : "1px solid rgba(255, 255, 255, 0.08)"
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <div style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 6,
                                    backgroundColor: slideshowOn && randomOn ? "rgba(88, 101, 242, 0.25)" : "rgba(255, 255, 255, 0.06)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: slideshowOn && randomOn ? "#5865f2" : "#949ba4",
                                    flexShrink: 0
                                }}>
                                    <DiceIcon size={16} color="currentColor" />
                                </div>
                                <div>
                                    <h4 className="nc-custom-stream-card-title" style={{ fontSize: "13px" }}>
                                        {t("Random Order")}
                                    </h4>
                                    <p className="nc-custom-stream-card-desc" style={{ fontSize: "11px" }}>
                                        {t("Picks next image at random without repeating")}
                                    </p>
                                </div>
                            </div>
                            <span style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                padding: "3px 8px",
                                borderRadius: "4px",
                                color: slideshowOn && randomOn ? "#23a55a" : "#949ba4",
                                backgroundColor: slideshowOn && randomOn ? "rgba(35, 165, 90, 0.15)" : "#1e1f22",
                                border: slideshowOn && randomOn ? "1px solid rgba(35, 165, 90, 0.3)" : "1px solid rgba(255, 255, 255, 0.06)"
                            }}>
                                {randomOn ? t("YES") : t("NO")}
                            </span>
                        </div>
                    </div>

                    {/* Info badges */}
                    {settings.store.showInfoBadges && (
                        <div style={{
                            padding: "10px 14px",
                            backgroundColor: "#2b2d31",
                            borderRadius: "8px",
                            marginBottom: "14px",
                            display: "flex",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "10px",
                            border: "1px solid rgba(255, 255, 255, 0.08)"
                        }}>
                            <div className="nc-custom-stream-stat-badge">
                                <FolderIcon size={14} color="#5865f2" />
                                <span className="nc-custom-stream-stat-label">{t("Profile")}:</span>
                                <span className="nc-custom-stream-stat-value">
                                    {profiles.get(currentProfileId)?.name || "Default"}
                                </span>
                            </div>

                            <div className="nc-custom-stream-stat-badge">
                                <PictureIcon size={14} color="#5865f2" />
                                <span className="nc-custom-stream-stat-label">{t("Images")}:</span>
                                <span className="nc-custom-stream-stat-value">
                                    {images.length} / {MAX_IMAGES_PER_PROFILE}
                                </span>
                            </div>

                            {images.length > 0 && (
                                <div className="nc-custom-stream-stat-badge">
                                    <CheckIcon size={14} color="#23a55a" />
                                    <span className="nc-custom-stream-stat-label">{t("Selected")}:</span>
                                    <span className="nc-custom-stream-stat-value" style={{ color: "#23a55a" }}>
                                        #{pendingIndex + 1}
                                    </span>
                                </div>
                            )}

                            {images.length > 0 && pluginEnabled && streamActive && lastSlideChangeTime > 0 && (
                                <div className="nc-custom-stream-stat-badge">
                                    <ClockIcon size={14} color="#5865f2" />
                                    <span className="nc-custom-stream-stat-label">{t("Timer")}:</span>
                                    <span className="nc-custom-stream-stat-value">
                                        <SlideElapsed /> / ~5 min
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action buttons toolbar */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <Button
                                size={Button.Sizes.SMALL}
                                color={Button.Colors.BRAND}
                                onClick={() => handleFileSelect(false)}
                                disabled={isLoading || images.length >= MAX_IMAGES_PER_PROFILE}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <PlusIcon size={14} color="#ffffff" />
                                    <span style={{ color: "#ffffff", fontWeight: 600 }}>{t("Add Image")}</span>
                                </div>
                            </Button>
                            <Button
                                size={Button.Sizes.SMALL}
                                color={Button.Colors.PRIMARY}
                                onClick={() => handleFileSelect(true)}
                                disabled={isLoading || images.length >= MAX_IMAGES_PER_PROFILE}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <UploadIcon size={14} color="#ffffff" />
                                    <span style={{ color: "#ffffff", fontWeight: 600 }}>{t("Multiple")}</span>
                                </div>
                            </Button>
                            <Button
                                size={Button.Sizes.SMALL}
                                color={Button.Colors.RED}
                                onClick={handleClearAll}
                                disabled={images.length === 0}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <TrashIcon size={14} color="#ffffff" />
                                    <span style={{ color: "#ffffff", fontWeight: 600 }}>{t("Delete All")}</span>
                                </div>
                            </Button>
                            {selectedIndices.size > 0 && (
                                <Button
                                    size={Button.Sizes.SMALL}
                                    color={Button.Colors.RED}
                                    onClick={handleDeleteSelected}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        <TrashIcon size={14} color="#ffffff" />
                                        <span style={{ color: "#ffffff", fontWeight: 600 }}>{t("Delete Selected")} ({selectedIndices.size})</span>
                                    </div>
                                </Button>
                            )}
                        </div>
                        <div style={{ color: "#949ba4", fontSize: "12px" }}>
                            {t("Click to select active preview • Drag to reorder")}
                        </div>
                    </div>

                    {error && (
                        <div style={{
                            padding: "10px 14px",
                            backgroundColor: "rgba(237, 66, 69, 0.15)",
                            border: "1px solid rgba(237, 66, 69, 0.4)",
                            borderRadius: "6px",
                            marginBottom: "14px",
                            color: "#ed4245",
                            fontSize: "13px",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px"
                        }}>
                            <CrossIcon size={14} color="#ed4245" />
                            <span style={{ color: "#ffffff", fontWeight: 600 }}>{error}</span>
                        </div>
                    )}

                    {/* Image grid */}
                    {images.length > 0 ? (
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                            gap: "12px",
                            maxHeight: "360px",
                            overflowY: "auto",
                            padding: "10px",
                            backgroundColor: "#1e1f22",
                            borderRadius: "8px",
                            border: "1px solid rgba(255, 255, 255, 0.08)"
                        }}>
                            {images.map((src: string, index: number) => {
                                const isCurrent = index === pendingIndex;
                                const isNext = index === nextIndex;
                                const isBeingDragged = index === draggedIndex;
                                const isDragTarget = index === dragOverIndex;
                                const isSelected = selectedIndices.has(index);

                                return (
                                    <div
                                        key={index}
                                        draggable
                                        onClick={e => handleImageClick(e, index)}
                                        onDragStart={e => handleImageDragStart(e, index)}
                                        onDragOver={e => handleImageDragOver(e, index)}
                                        onDragLeave={e => handleImageDragLeave(e, index)}
                                        onDrop={e => handleImageDrop(e, index)}
                                        onDragEnd={handleImageDragEnd}
                                        className={`nc-custom-stream-grid-item ${isCurrent ? "active" : ""} ${isNext ? "next" : ""} ${isSelected ? "selected" : ""}`}
                                        style={{
                                            borderColor: isDragTarget
                                                ? "#faa61a"
                                                : isSelected
                                                    ? "#ed4245"
                                                    : isCurrent
                                                        ? "#23a55a"
                                                        : isNext
                                                            ? "#5865f2"
                                                            : "rgba(255, 255, 255, 0.08)",
                                            opacity: isBeingDragged ? 0.5 : 1
                                        }}
                                    >
                                        <div style={{
                                            position: "relative",
                                            width: "100%",
                                            paddingTop: "56.25%",
                                            backgroundColor: "#000000"
                                        }}>
                                            <img
                                                src={src}
                                                alt={`Slide ${index + 1}`}
                                                loading="lazy"
                                                decoding="async"
                                                draggable={false}
                                                style={{
                                                    position: "absolute",
                                                    top: 0,
                                                    left: 0,
                                                    width: "100%",
                                                    height: "100%",
                                                    objectFit: "contain",
                                                    display: "block"
                                                }}
                                            />
                                        </div>

                                        {/* Status badge */}
                                        <div style={{
                                            position: "absolute",
                                            top: "6px",
                                            left: "6px",
                                            backgroundColor: isSelected
                                                ? "#ed4245"
                                                : isCurrent
                                                    ? "#23a55a"
                                                    : isNext
                                                        ? "#5865f2"
                                                        : "rgba(0, 0, 0, 0.75)",
                                            color: "#ffffff",
                                            padding: "2px 6px",
                                            borderRadius: "4px",
                                            fontSize: "11px",
                                            fontWeight: 700,
                                            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.4)"
                                        }}>
                                            #{index + 1} {isCurrent && "• ACTIVE"}
                                        </div>

                                        {/* Action buttons on card */}
                                        <div style={{
                                            position: "absolute",
                                            top: "6px",
                                            right: "6px",
                                            display: "flex",
                                            gap: "4px"
                                        }}>
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    setPreviewIndex(index);
                                                }}
                                                title={t("Preview")}
                                                className="nc-custom-stream-action-btn"
                                            >
                                                <ZoomIcon size={12} color="#ffffff" />
                                            </div>
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    const a = document.createElement("a");
                                                    a.href = src;
                                                    a.download = `stream-preview-${index + 1}.jpg`;
                                                    a.click();
                                                }}
                                                title={t("Download")}
                                                className="nc-custom-stream-action-btn"
                                            >
                                                <DownloadIcon size={12} color="#ffffff" />
                                            </div>
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    handleDelete(index);
                                                }}
                                                title={t("Delete")}
                                                className="nc-custom-stream-action-btn"
                                            >
                                                <TrashIcon size={12} color="#ffffff" />
                                            </div>
                                        </div>

                                        {/* Current indicator bar */}
                                        {isCurrent && (
                                            <div style={{
                                                position: "absolute",
                                                bottom: 0,
                                                left: 0,
                                                right: 0,
                                                height: "3px",
                                                backgroundColor: "#23a55a"
                                            }} />
                                        )}

                                        {/* File size */}
                                        {imageSizes[index] && (
                                            <div style={{
                                                position: "absolute",
                                                bottom: "5px",
                                                right: "6px",
                                                backgroundColor: "rgba(0, 0, 0, 0.8)",
                                                color: "#dbdee1",
                                                padding: "2px 6px",
                                                borderRadius: "4px",
                                                fontSize: "10px",
                                                fontWeight: 500,
                                                whiteSpace: "nowrap"
                                            }}>
                                                {formatFileSize(imageSizes[index])}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{
                            padding: "48px 24px",
                            textAlign: "center",
                            backgroundColor: "#2b2d31",
                            borderRadius: "8px",
                            border: "2px dashed rgba(255, 255, 255, 0.12)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center"
                        }}>
                            <PictureIcon size={44} color="#5865f2" />
                            <h3 style={{
                                color: "#ffffff",
                                fontSize: "16px",
                                fontWeight: 700,
                                marginTop: "12px",
                                marginBottom: "4px"
                            }}>
                                {t("No Preview Images")}
                            </h3>
                            <p style={{
                                color: "#949ba4",
                                fontSize: "13px",
                                maxWidth: "420px",
                                lineHeight: "1.4",
                                margin: 0
                            }}>
                                {t("Drag images here, paste with Ctrl+V or click Add Image")}
                            </p>
                            <span style={{
                                color: "#80848e",
                                fontSize: "11px",
                                marginTop: "8px"
                            }}>
                                {t("Supports PNG, JPEG, WebP up to 8 MB")}
                            </span>
                        </div>
                    )}

                    {/* Footer storage info */}
                    <div style={{
                        marginTop: "14px",
                        padding: "10px 14px",
                        backgroundColor: "#2b2d31",
                        borderRadius: "6px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        border: "1px solid rgba(255, 255, 255, 0.08)"
                    }}>
                        <StorageIcon size={16} color="#949ba4" />
                        <span style={{ color: "#949ba4", fontSize: "12px" }}>
                            {t("Images stored locally • Limit: 50 images per profile • Ctrl+Click / Shift+Click for multi-select")}
                        </span>
                    </div>
                </div>
            </ModalContent>

            <ModalFooter className="nc-custom-stream-footer">
                <Button
                    color={Button.Colors.PRIMARY}
                    look={Button.Looks.LINK}
                    onClick={handleCancel}
                    style={{ color: "#dbdee1" }}
                >
                    {t("Cancel")}
                </Button>
                <Button
                    color={Button.Colors.BRAND}
                    onClick={handleSave}
                >
                    {t("Save Changes")}
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

let isPickerOpen = false;

function openImagePicker() {
    if (isPickerOpen) return;
    isPickerOpen = true;
    openModal(
        (props: any) => <ImagePickerModal rootProps={props} />,
        {
            modalKey: IMAGE_PICKER_MODAL_KEY,
            onCloseCallback: () => {
                isPickerOpen = false;
            }
        }
    );
}

function toggleImagePicker() {
    if (!isPickerOpen) {
        openImagePicker();
        return;
    }
    closeModal(IMAGE_PICKER_MODAL_KEY);
    isPickerOpen = false;
}

// Hotkey handling
interface Hotkey {
    key: string;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
}

function parseHotkey(raw: string | undefined): Hotkey | null {
    const parts = (raw ?? "").split("+").map(part => part.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return null;

    const hotkey: Hotkey = { key: "", ctrl: false, shift: false, alt: false, meta: false };

    for (const part of parts) {
        if (part === "ctrl" || part === "control") hotkey.ctrl = true;
        else if (part === "shift") hotkey.shift = true;
        else if (part === "alt" || part === "option") hotkey.alt = true;
        else if (part === "meta" || part === "cmd" || part === "win") hotkey.meta = true;
        else hotkey.key = part;
    }

    return hotkey.key ? hotkey : null;
}

function isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element?.tagName) return false;
    const tag = element.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || element.isContentEditable === true;
}

function matchesHotkey(event: KeyboardEvent, hotkey: Hotkey): boolean {
    if (event.ctrlKey !== hotkey.ctrl) return false;
    if (event.shiftKey !== hotkey.shift) return false;
    if (event.altKey !== hotkey.alt) return false;
    if (event.metaKey !== hotkey.meta) return false;

    const key = event.key?.toLowerCase() ?? "";
    const code = event.code?.toLowerCase() ?? "";

    return key === hotkey.key
        || code === hotkey.key
        || code === `key${hotkey.key}`
        || code === `digit${hotkey.key}`
        || code === `numpad${hotkey.key}`;
}

let hotkeyHandler: ((event: KeyboardEvent) => void) | null = null;

function registerHotkey() {
    unregisterHotkey();

    hotkeyHandler = (event: KeyboardEvent) => {
        if (event.repeat) return;

        const hotkey = parseHotkey(settings.store.hotkey || DEFAULT_HOTKEY);
        if (!hotkey) return;

        const hasModifier = hotkey.ctrl || hotkey.shift || hotkey.alt || hotkey.meta;
        if (!hasModifier && isTypingTarget(event.target)) return;

        if (!matchesHotkey(event, hotkey)) return;

        event.preventDefault();
        event.stopPropagation();
        toggleImagePicker();
    };

    window.addEventListener("keydown", hotkeyHandler, { capture: true });
}

function unregisterHotkey() {
    if (!hotkeyHandler) return;
    window.removeEventListener("keydown", hotkeyHandler, { capture: true });
    hotkeyHandler = null;
}

// Stream Preview icon in user panel
function StreamPreviewPanelIcon({ isEnabled, imageCount, isSlideshowEnabled }: {
    isEnabled: boolean;
    imageCount: number;
    isSlideshowEnabled: boolean;
}) {
    return (
        <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                    fill="currentColor"
                    d="M21 3H3C1.9 3 1 3.9 1 5V17C1 18.1 1.9 19 3 19H8V21H16V19H21C22.1 19 23 18.1 23 17V5C23 3.9 22.1 3 21 3ZM21 17H3V5H21V17Z"
                />
                <path
                    fill={isEnabled ? "var(--status-positive)" : "currentColor"}
                    d="M12 7C10.34 7 9 8.34 9 10C9 11.66 10.34 13 12 13C13.66 13 15 11.66 15 10C15 8.34 13.66 7 12 7Z"
                />
                <path
                    fill={isEnabled ? "var(--status-positive)" : "currentColor"}
                    d="M18 14L15 11L12 14L9 11L6 14V15H18V14Z"
                />
            </svg>
            {imageCount > 1 && isSlideshowEnabled && isEnabled && (
                <div style={{
                    position: "absolute",
                    top: "-3px",
                    right: "-5px",
                    backgroundColor: "var(--status-positive)",
                    color: "white",
                    fontSize: "9px",
                    fontWeight: "bold",
                    borderRadius: "6px",
                    minWidth: "12px",
                    height: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 2px"
                }}>
                    {imageCount}
                </div>
            )}
        </div>
    );
}

// User area button implementation
function StreamPreviewPanelButton(props: UserAreaRenderProps) {
    const { showPanelButton } = settings.use(["showPanelButton"]);
    const [imageCount, setImageCount] = useState(0);
    const [isEnabled, setIsEnabled] = useState(settings.store.replaceEnabled);
    const [isSlideshowEnabled, setIsSlideshowEnabled] = useState(settings.store.slideshowEnabled);
    const [currentIndex, setCurrentIndex] = useState(currentSlideIndex);
    const [secondsAgo, setSecondsAgo] = useState(0);
    const [streamActive, setStreamActive] = useState(isStreamActive);
    const [currentImageUri, setCurrentImageUri] = useState<string | null>(null);

    useEffect(() => {
        const updateState = () => {
            setImageCount(getImageCount());
            setIsEnabled(settings.store.replaceEnabled);
            setIsSlideshowEnabled(settings.store.slideshowEnabled);
            setCurrentIndex(currentSlideIndex);
            setStreamActive(isStreamActive);
            setCurrentImageUri(actualStreamImageUri);
        };

        updateState();
        imageChangeListeners.add(updateState);

        const timerInterval = setInterval(() => {
            if (isStreamActive && lastSlideChangeTime > 0 && (Date.now() - lastSlideChangeTime) > 420000) {
                isStreamActive = false;
            }
            setStreamActive(isStreamActive);
            if (lastSlideChangeTime > 0 && isStreamActive) {
                setSecondsAgo(Math.floor((Date.now() - lastSlideChangeTime) / 1000));
            }
        }, 1000);

        return () => {
            imageChangeListeners.delete(updateState);
            clearInterval(timerInterval);
        };
    }, []);

    const getTooltip = () => {
        if (imageCount === 0) return t("Stream Preview");
        if (!isEnabled) return `${t("Stream preview")} (${t("disabled")}, ${imageCount} ${t("images")})`;

        const intervalSeconds = 5 * 60;
        let timeInfo = lastSlideChangeTime > 0 && streamActive
            ? `\n${formatTime(secondsAgo)} ${t("ago")} (~${formatTime(Math.max(0, intervalSeconds - secondsAgo))} ${t("until update")})`
            : streamActive ? "" : `\n${t("Stream not active")}`;

        if (streamActive && lastSlideChangeTime > 0 && secondsAgo < 60) {
            timeInfo += `\n${t("Viewers' preview updates with a delay")}`;
        }

        if (imageCount === 1) return `${t("Stream preview")} (1 ${t("image")})${timeInfo}`;

        if (isSlideshowEnabled) {
            const slideInfo = `\n${t("Current")}: #${currentIndex + 1}`;
            return `${t("Stream preview")} (${imageCount} ${t("images")}, ${t("slideshow")})${slideInfo}${timeInfo}`;
        }
        return `${t("Stream preview")} (${imageCount} ${t("images")})${timeInfo}`;
    };

    const renderTooltip = () => {
        const tooltipText = getTooltip();

        if (currentImageUri && isEnabled && imageCount > 0 && streamActive) {
            return (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "center" }}>
                    <div style={{
                        width: "150px",
                        height: "84px",
                        borderRadius: "4px",
                        overflow: "hidden",
                        border: "2px solid var(--status-positive)",
                        boxShadow: "0 0 8px rgba(59, 165, 92, 0.4)"
                    }}>
                        <img
                            src={currentImageUri}
                            alt="Preview"
                            style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block"
                            }}
                        />
                    </div>
                    <div style={{
                        whiteSpace: "pre-line",
                        textAlign: "center",
                        fontSize: "11px",
                        lineHeight: "1.3"
                    }}>
                        {tooltipText}
                    </div>
                </div>
            );
        }

        return tooltipText;
    };

    if (!showPanelButton) return null;

    return (
        <UserAreaButton
            tooltipText={renderTooltip()}
            icon={
                <StreamPreviewPanelIcon
                    isEnabled={isEnabled}
                    imageCount={imageCount}
                    isSlideshowEnabled={isSlideshowEnabled}
                />
            }
            onClick={openImagePicker}
            plated={props?.nameplate != null}
        />
    );
}

// Stream context menu patch
interface StreamContextProps {
    stream: {
        ownerId: string;
        guildId: string | null;
        channelId: string;
    };
}

const streamContextMenuPatch: NavContextMenuPatchCallback = (children: any[], { stream }: StreamContextProps) => {
    const currentUser = UserStore.getCurrentUser();
    if (!currentUser || stream?.ownerId !== currentUser.id) return;

    const group = findGroupChildrenByChildId(["fullscreen", "popout"], children);
    const menuItem = (
        <Menu.MenuItem
            id="custom-stream-preview"
            label={t("Custom Preview")}
            icon={() => <StreamIcon size={16} color="currentColor" />}
            action={openImagePicker}
        />
    );

    if (group) {
        group.push(menuItem);
    } else {
        children.push(
            <Menu.MenuSeparator />,
            menuItem
        );
    }
};

// Webpack hook for ApplicationStreamPreviewUploadManager
function getCustomThumbnail(originalThumbnail: string): string {
    isStreamActive = true;

    if (!settings.store.replaceEnabled || cachedDataUris.length === 0) {
        actualStreamImageUri = null;
        notifyImageChange();
        return originalThumbnail;
    }

    if (cachedDataUris.length === 1 || !settings.store.slideshowEnabled) {
        const idx = currentSlideIndex < cachedDataUris.length ? currentSlideIndex : 0;
        lastSlideChangeTime = Date.now();
        actualStreamImageUri = cachedDataUris[idx];
        notifyImageChange();
        return cachedDataUris[idx];
    }

    if (manualSlideChange) {
        manualSlideChange = false;
        lastSlideChangeTime = Date.now();
        actualStreamImageUri = cachedDataUris[currentSlideIndex];
        notifyImageChange();
        return cachedDataUris[currentSlideIndex];
    }

    let nextIdx: number;
    if (settings.store.slideshowRandom) {
        shuffleBag = shuffleBag.filter(i => i < cachedDataUris.length);
        if (shuffleBag.length === 0) {
            shuffleBag = Array.from({ length: cachedDataUris.length }, (_, i) => i);
            for (let i = shuffleBag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffleBag[i], shuffleBag[j]] = [shuffleBag[j], shuffleBag[i]];
            }
            if (shuffleBag[0] === currentSlideIndex && shuffleBag.length > 1) {
                [shuffleBag[0], shuffleBag[shuffleBag.length - 1]] = [shuffleBag[shuffleBag.length - 1], shuffleBag[0]];
            }
        }
        nextIdx = shuffleBag.shift()!;
    } else {
        nextIdx = (currentSlideIndex + 1) % cachedDataUris.length;
    }

    currentSlideIndex = nextIdx;
    lastSlideChangeTime = Date.now();
    actualStreamImageUri = cachedDataUris[currentSlideIndex];
    saveSlideIndex(nextIdx);
    notifyImageChange();
    return cachedDataUris[currentSlideIndex];
}

export default definePlugin({
    name: "CustomStream",
    description: "Custom stream preview images with profiles and slideshow support.",
    authors: [
        {
            name: "LoliCord",
            id: 0n
        },
        {
            name: "TopQ",
            id: 523800559791374356n
        }
    ],
    enabledByDefault: false,
    settings,

    userAreaButton: {
        icon: (props: any) => <StreamIcon {...props} />,
        render: ErrorBoundary.wrap(StreamPreviewPanelButton, { noop: true }),
        priority: 10
    },

    patches: [
        {
            find: "\"ApplicationStreamPreviewUploadManager\"",
            all: true,
            replacement: [
                {
                    match: /body:\{thumbnail:(\i)\}/,
                    replace: "body:{thumbnail:$self.getCustomThumbnail($1)}"
                },
                {
                    match: /\{thumbnail:(\i)\}/,
                    replace: "{thumbnail:$self.getCustomThumbnail($1)}"
                }
            ]
        }
    ],

    toolboxActions: {
        "Select stream preview": openImagePicker
    },

    getCustomThumbnail,

    contextMenus: {
        "stream-context": streamContextMenuPatch
    },

    async start() {
        registerHotkey();
        await loadProfilesFromDataStore();
        syncCacheWithActiveProfile();
        notifyImageChange();
    },

    stop() {
        unregisterHotkey();
        cachedImages = [];
        cachedDataUris = [];
        currentSlideIndex = 0;
        isStreamActive = false;
        lastSlideChangeTime = 0;
        manualSlideChange = false;
        shuffleBag = [];
        profiles.clear();
        activeProfileId = DEFAULT_PROFILE_ID;
    }
});

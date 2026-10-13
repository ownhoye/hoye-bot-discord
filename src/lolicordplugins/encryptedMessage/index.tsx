/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import { findByProps } from "@webpack";
import { FluxDispatcher, Menu, React, Toasts, MessageStore, openModal, SelectedChannelStore, Button, TextInput, Modal, ModalContent, ModalHeader, ModalFooter, ModalCloseButton, showToast, Switch } from "@webpack/common";
import { sendMessage } from "@utils/discord";
import { t } from "../autoTranslateLoliCord";

const SECURITY_CONSTANTS = {
    DEFAULT_MIN_PASSWORD_LENGTH: 12,
    MAX_PASSWORD_LENGTH: 128,
    LEGACY_PBKDF2_ITERATIONS: 200000,
    SALT_LENGTH: 32,
    IV_LENGTH: 12,
    ITERATION_LENGTH: 4,
    VERSION_LEGACY: 1,
    VERSION_CURRENT: 2,
    ENCRYPTION_MARKER_START: "SC:",
    ENCRYPTION_MARKER_END: ":SC",
    MAX_DISCORD_MESSAGE_LENGTH: 2000,
    DEFAULT_MAX_PLAINTEXT_BYTES: 1400,
    MILLISECONDS_PER_MINUTE: 60000,
    GCM_ADDITIONAL_DATA: "Securecord:v2"
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const specialCharacterPattern = /[^A-Za-z0-9]/;

let failedAttempts = 0;
let lockoutEndTime = 0;
let lastDecryptionAttempt = 0;

const MAX_DECRYPTED_CACHE = 500;
const decryptedMessageIds = new Set<string>();
const originalEncryptedMessages = new Map<string, { channelId: string; content: string; }>();

function addDecryptedId(id: string) {
    decryptedMessageIds.add(id);
    if (decryptedMessageIds.size > MAX_DECRYPTED_CACHE) {
        // Delete the oldest entry (first inserted)
        decryptedMessageIds.delete(decryptedMessageIds.values().next().value!);
    }
}

function setOriginalEncryptedMessage(id: string, value: { channelId: string; content: string; }) {
    originalEncryptedMessages.set(id, value);
    if (originalEncryptedMessages.size > MAX_DECRYPTED_CACHE) {
        const oldestKey = originalEncryptedMessages.keys().next().value;
        if (oldestKey) originalEncryptedMessages.delete(oldestKey);
    }
}
const decryptingMessageIds = new Set<string>();

function validatePassword(password: string): string[] {
    const errors: string[] = [];
    if (!password) {
        errors.push("Password is required");
    }
    return errors;
}

function isRateLimited(): boolean {
    return false;
}

function recordFailedAttempt(): void {}

function resetSecurityState(): void {}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function getPbkdf2Iterations(): number {
    const iterations = Number(settings.store.pbkdf2Iterations);
    return Number.isFinite(iterations) && iterations > 0
        ? iterations
        : SECURITY_CONSTANTS.LEGACY_PBKDF2_ITERATIONS;
}

function getMarkerInfo(content: string) {
    const trimmed = content.trim();
    if (trimmed.startsWith("SC:") && trimmed.endsWith(":SC")) {
        return { start: "SC:", end: ":SC", trimmed };
    }
    if (trimmed.startsWith("🔒SECURE:") && trimmed.endsWith(":ENDSECURE")) {
        return { start: "🔒SECURE:", end: ":ENDSECURE", trimmed };
    }
    return null;
}

function isEncryptedMessage(content: string): boolean {
    return getMarkerInfo(content) !== null;
}

function getEncryptedPart(content: string): string {
    const marker = getMarkerInfo(content);
    if (!marker) return "";
    return marker.trimmed.slice(marker.start.length, -marker.end.length);
}

function bytesToBase64(bytes: Uint8Array, urlSafe: boolean): string {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    const base64 = btoa(binary);
    if (!urlSafe) return base64;

    return base64
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

function base64ToBytes(value: string): Uint8Array {
    let base64 = value.trim().replace(/-/g, "+").replace(/_/g, "/");

    while (base64.length % 4 !== 0) {
        base64 += "=";
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

function writeUint32(value: number): Uint8Array {
    const bytes = new Uint8Array(SECURITY_CONSTANTS.ITERATION_LENGTH);
    bytes[0] = value >>> 24;
    bytes[1] = value >>> 16;
    bytes[2] = value >>> 8;
    bytes[3] = value;
    return bytes;
}

function readUint32(bytes: Uint8Array, offset: number): number {
    return (
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]
    ) >>> 0;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

const MAX_CACHE_SIZE = 500;
const derivedKeyCache = new Map<string, Promise<CryptoKey>>();
const decryptedPlaintextCache = new Map<string, string>();

function setDecryptedCache(key: string, val: string) {
    decryptedPlaintextCache.set(key, val);
    if (decryptedPlaintextCache.size > MAX_CACHE_SIZE) {
        decryptedPlaintextCache.delete(decryptedPlaintextCache.keys().next().value!);
    }
}

function setDerivedKeyCache(key: string, val: Promise<CryptoKey>) {
    derivedKeyCache.set(key, val);
    if (derivedKeyCache.size > MAX_CACHE_SIZE) {
        derivedKeyCache.delete(derivedKeyCache.keys().next().value!);
    }
}

async function deriveAESKey(password: string, salt: Uint8Array, iterations: number, usages: KeyUsage[]): Promise<CryptoKey> {
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
    const cacheKey = `${password}:${saltHex}:${iterations}:${usages.join(",")}`;
    const cached = derivedKeyCache.get(cacheKey);
    if (cached) return cached;

    const promise = (async () => {
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            toArrayBuffer(encoder.encode(password)),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );

        return crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: toArrayBuffer(salt),
                iterations,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            usages
        );
    })();

    setDerivedKeyCache(cacheKey, promise);
    return promise;
}

async function encryptAES(text: string, password: string): Promise<string> {
    const data = encoder.encode(text);
    const validationErrors = validatePassword(password);

    if (validationErrors.length) {
        throw new Error(`Password validation failed: ${validationErrors.join(", ")}`);
    }

    if (settings.store.maxPlaintextBytes > 0 && data.length > settings.store.maxPlaintextBytes) {
        throw new Error(`Message is too long to encrypt. Limit is ${settings.store.maxPlaintextBytes} bytes.`);
    }

    const iterations = getPbkdf2Iterations();
    const salt = crypto.getRandomValues(new Uint8Array(SECURITY_CONSTANTS.SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(SECURITY_CONSTANTS.IV_LENGTH));
    const key = await deriveAESKey(password, salt, iterations, ["encrypt"]);

    const encrypted = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: toArrayBuffer(iv),
            additionalData: toArrayBuffer(encoder.encode(SECURITY_CONSTANTS.GCM_ADDITIONAL_DATA))
        },
        key,
        toArrayBuffer(data)
    );

    const version = new Uint8Array([SECURITY_CONSTANTS.VERSION_CURRENT]);
    const iterationBytes = writeUint32(iterations);
    const encryptedBytes = new Uint8Array(encrypted);
    const result = new Uint8Array(
        version.length +
        iterationBytes.length +
        salt.length +
        iv.length +
        encryptedBytes.length
    );

    let offset = 0;
    result.set(version, offset);
    offset += version.length;
    result.set(iterationBytes, offset);
    offset += iterationBytes.length;
    result.set(salt, offset);
    offset += salt.length;
    result.set(iv, offset);
    offset += iv.length;
    result.set(encryptedBytes, offset);

    const encryptedMessage = bytesToBase64(result, settings.store.urlSafeBase64);
    const wrappedMessage = `${SECURITY_CONSTANTS.ENCRYPTION_MARKER_START}${encryptedMessage}${SECURITY_CONSTANTS.ENCRYPTION_MARKER_END}`;

    if (wrappedMessage.length > SECURITY_CONSTANTS.MAX_DISCORD_MESSAGE_LENGTH) {
        throw new Error("Encrypted message is too long for Discord.");
    }

    setDecryptedCache(`${password}:${encryptedMessage}`, text);
    setDecryptedCache(`${password}:${wrappedMessage}`, text);

    return encryptedMessage;
}

async function decryptAES(encrypted: string, password: string): Promise<string> {
    const cacheKey = `${password}:${encrypted}`;
    const cached = decryptedPlaintextCache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const data = base64ToBytes(encrypted);
    const minLegacyLength = 1 + SECURITY_CONSTANTS.SALT_LENGTH + SECURITY_CONSTANTS.IV_LENGTH;

    if (data.length < minLegacyLength) {
        throw new Error("Invalid encrypted data format.");
    }

    let offset = 0;
    const version = data[offset];
    offset += 1;

    let iterations = SECURITY_CONSTANTS.LEGACY_PBKDF2_ITERATIONS;
    let additionalData: ArrayBuffer | undefined;

    if (version === SECURITY_CONSTANTS.VERSION_CURRENT) {
        const minCurrentLength = minLegacyLength + SECURITY_CONSTANTS.ITERATION_LENGTH;
        if (data.length < minCurrentLength) {
            throw new Error("Invalid encrypted data format.");
        }

        iterations = readUint32(data, offset);
        offset += SECURITY_CONSTANTS.ITERATION_LENGTH;
        additionalData = toArrayBuffer(encoder.encode(SECURITY_CONSTANTS.GCM_ADDITIONAL_DATA));
    } else if (version !== SECURITY_CONSTANTS.VERSION_LEGACY || !settings.store.acceptLegacyPayloads) {
        throw new Error("Unsupported encryption version.");
    }

    if (!iterations || iterations < 1) {
        throw new Error("Invalid encryption parameters.");
    }

    const salt = data.slice(offset, offset + SECURITY_CONSTANTS.SALT_LENGTH);
    offset += SECURITY_CONSTANTS.SALT_LENGTH;
    const iv = data.slice(offset, offset + SECURITY_CONSTANTS.IV_LENGTH);
    offset += SECURITY_CONSTANTS.IV_LENGTH;
    const encryptedData = data.slice(offset);
    const key = await deriveAESKey(password, salt, iterations, ["decrypt"]);
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData },
        key,
        toArrayBuffer(encryptedData)
    );

    resetSecurityState();
    const result = decoder.decode(decrypted);
    setDecryptedCache(cacheKey, result);
    return result;
}

const EncryptionEnabledIcon: IconComponent = ({ height = 20, width = 20, className }) => {
    return (
        <svg width={width} height={height} viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z" />
        </svg>
    );
};

const EncryptionDisabledIcon: IconComponent = ({ height = 20, width = 20, className }) => {
    return (
        <svg width={width} height={height} viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" opacity="0.8" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2h-2V6c0-1.71-1.39-3.1-3.1-3.1S8.9 4.29 8.9 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
        </svg>
    );
};

function getChannelPassword(channelId: string): string {
    if (!channelId) return "";
    try {
        const map = JSON.parse(settings.store.channelPasswords || "{}");
        return map[channelId] || settings.store.encryptionPassword || "";
    } catch {
        return settings.store.encryptionPassword || "";
    }
}

function setChannelPassword(channelId: string, password: string) {
    if (!channelId) return;
    try {
        const map = JSON.parse(settings.store.channelPasswords || "{}");
        if (password) {
            map[channelId] = password;
        } else {
            delete map[channelId];
        }
        settings.store.channelPasswords = JSON.stringify(map);
    } catch (e) {
        console.error("[EncryptedMessage] Failed to save channel password:", e);
    }
}

function getChannelGeneratedPassword(channelId: string): string {
    if (!channelId) return "";
    try {
        const map = JSON.parse(settings.store.channelGeneratedPasswords || "{}");
        return map[channelId] || "";
    } catch {
        return "";
    }
}

function setChannelGeneratedPassword(channelId: string, password: string) {
    if (!channelId) return;
    try {
        const map = JSON.parse(settings.store.channelGeneratedPasswords || "{}");
        if (password) {
            map[channelId] = password;
        } else {
            delete map[channelId];
        }
        settings.store.channelGeneratedPasswords = JSON.stringify(map);
    } catch (e) {
        console.error("[EncryptedMessage] Failed to save generated password:", e);
    }
}

let cachedEnabledChannels: Set<string> | null = null;

function getEnabledChannels(): Set<string> {
    if (!cachedEnabledChannels) {
        try {
            const map = JSON.parse(settings.store.channelEncryptionStates || "{}");
            cachedEnabledChannels = new Set(Object.keys(map).filter(k => !!map[k]));
        } catch {
            cachedEnabledChannels = new Set();
        }
    }
    return cachedEnabledChannels;
}

function invalidateEnabledChannelsCache() {
    cachedEnabledChannels = null;
}

function isEncryptionEnabledForChannel(channelId: string): boolean {
    if (!channelId) return false;
    return getEnabledChannels().has(channelId);
}

function setEncryptionEnabledForChannel(channelId: string, enabled: boolean) {
    if (!channelId) return;
    try {
        const map = JSON.parse(settings.store.channelEncryptionStates || "{}");
        if (enabled) {
            map[channelId] = true;
        } else {
            delete map[channelId];
        }
        settings.store.channelEncryptionStates = JSON.stringify(map);
        invalidateEnabledChannelsCache();
    } catch (e) {
        console.error("[EncryptedMessage] Failed to save channel encryption state:", e);
    }
}

function triggerDecryptForChannel(channelId: string) {
    if (!channelId || !isEncryptionEnabledForChannel(channelId) || !getChannelPassword(channelId)) return;
    try {
        const collection = MessageStore.getMessages(channelId);
        const messages = collection?.toArray?.() ?? collection?._array ?? [];
        for (const msg of messages) {
            if (!msg) continue;
            const isEncrypted = isEncryptedMessage(msg.content) || (msg.originalEncryptedContent && isEncryptedMessage(msg.originalEncryptedContent)) || (originalEncryptedMessages.has(msg.id) && isEncryptedMessage(originalEncryptedMessages.get(msg.id)!.content));
            if (isEncrypted) {
                decryptMessage(msg, channelId);
            }
        }
    } catch (e) {
        console.error("[EncryptedMessage] triggerDecryptForChannel error:", e);
    }
}

function revertAllDecrypted(targetChannelId?: string) {
    const origDispatch = (FluxDispatcher as any)._nc_orig_dispatch || FluxDispatcher.dispatch;

    // Reset pending decryption flags so next toggle doesn't get blocked
    decryptingMessageIds.clear();

    const channelIds = new Set<string>();
    if (targetChannelId) {
        channelIds.add(targetChannelId);
    } else {
        const selected = SelectedChannelStore.getChannelId();
        if (selected) channelIds.add(selected);
        for (const data of originalEncryptedMessages.values()) {
            if (data.channelId) channelIds.add(data.channelId);
        }
        try {
            const MessageCache = findByProps("clearCache", "_channelMessages");
            if (MessageCache?._channelMessages) {
                for (const ch in MessageCache._channelMessages) {
                    channelIds.add(ch);
                }
            }
        } catch {}
    }

    for (const chId of channelIds) {
        try {
            const collection = MessageStore.getMessages(chId);
            const messages = collection?.toArray?.() ?? collection?._array ?? [];
            for (const msg of messages) {
                if (!msg) continue;
                const orig = msg.originalEncryptedContent || originalEncryptedMessages.get(msg.id)?.content;
                if (orig) {
                    if (!msg.originalEncryptedContent) {
                        msg.originalEncryptedContent = orig;
                    }
                    if (!originalEncryptedMessages.has(msg.id)) {
                        originalEncryptedMessages.set(msg.id, { channelId: chId, content: orig });
                    }
                    if (msg.content !== orig || decryptedMessageIds.has(msg.id)) {
                        msg.content = orig;
                        try { delete msg._contentParsed; } catch {}
                        try { delete msg._contentParsedNodes; } catch {}
                        try { (msg as any)._contentParsed = undefined; } catch {}
                        try { (msg as any)._contentParsedNodes = undefined; } catch {}
                        decryptedMessageIds.delete(msg.id);
                        origDispatch.call(FluxDispatcher, { type: "MESSAGE_UPDATE", message: msg, _nc_skip_scan: true });
                    }
                }
            }
        } catch (e) {
            console.error("[EncryptedMessage] Revert messages error for channel", chId, e);
        }
    }

    // Also update any messages from originalEncryptedMessages map that might not be in the current view array
    for (const [messageId, data] of originalEncryptedMessages.entries()) {
        if (targetChannelId && data.channelId !== targetChannelId) continue;
        try {
            const stored = MessageStore.getMessage(data.channelId, messageId);
            if (stored && (stored.content !== data.content || decryptedMessageIds.has(messageId))) {
                stored.content = data.content;
                stored.originalEncryptedContent = data.content;
                try { delete stored._contentParsed; } catch {}
                try { delete stored._contentParsedNodes; } catch {}
                try { (stored as any)._contentParsed = undefined; } catch {}
                try { (stored as any)._contentParsedNodes = undefined; } catch {}
                decryptedMessageIds.delete(messageId);
                origDispatch.call(FluxDispatcher, { type: "MESSAGE_UPDATE", message: stored, _nc_skip_scan: true });
            }
        } catch {}
    }
}

function triggerEncryptForChannel(channelId: string) {
    revertAllDecrypted(channelId);
}

const EncryptionSettingsModal = ({ modalProps, close }: { modalProps: any; close: () => void }) => {
    const channelId = SelectedChannelStore.getChannelId();
    const [generatedPassword, setGeneratedPassword] = React.useState("");
    const [friendPassword, setFriendPassword] = React.useState("");
    const [showGeneratedPassword, setShowGeneratedPassword] = React.useState(false);
    const [showFriendPassword, setShowFriendPassword] = React.useState(false);
    const [isEncrypted, setIsEncrypted] = React.useState(false);

    const generateRandomPassword = () => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
        let result = "";
        const bytes = new Uint8Array(34);
        crypto.getRandomValues(bytes);
        for (let i = 0; i < 34; i++) {
            result += chars[bytes[i] % chars.length];
        }
        // Save the new password to this channel's settings
        if (channelId) setChannelGeneratedPassword(channelId, result);
        setGeneratedPassword(result);
    };

    React.useEffect(() => {
        // On open: load the existing generated password for this channel.
        // Only generate a new one if none has been saved yet.
        if (channelId) {
            const existing = getChannelGeneratedPassword(channelId);
            if (existing) {
                setGeneratedPassword(existing);
            } else {
                generateRandomPassword();
            }
        }
    }, []);

    React.useEffect(() => {
        if (channelId) {
            setFriendPassword(getChannelPassword(channelId));
            setIsEncrypted(isEncryptionEnabledForChannel(channelId));
        } else {
            setFriendPassword("");
            setIsEncrypted(false);
        }
    }, [channelId]);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedPassword);
        showToast(t("Password copied to clipboard!"), Toasts.Type.SUCCESS);
    };

    const shareInChat = () => {
        if (channelId) {
            sendMessage(channelId, { content: generatedPassword });
            close();
        }
    };

    const saveFriendPassword = (val: string) => {
        setFriendPassword(val);
        if (channelId) {
            setChannelPassword(channelId, val);
            triggerDecryptForChannel(channelId);
        }
    };

    const toggleEncryption = (val: boolean) => {
        setIsEncrypted(val);
        if (channelId) {
            setEncryptionEnabledForChannel(channelId, val);
            if (val) {
                triggerDecryptForChannel(channelId);
            } else {
                triggerEncryptForChannel(channelId);
            }
        }
    };

    return (
        <Modal {...modalProps} size="small" aria-label={t("Password Manager")}>
            <ModalHeader separator={false}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                    <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "bold", color: "#ffffff" }}>
                        {t("Password Manager")}
                    </h1>
                    <ModalCloseButton onClick={close} />
                </div>
            </ModalHeader>
            <ModalContent style={{ padding: "16px 20px", color: "var(--text-normal, #dbdee1)" }}>
                {/* Section 1: Generate Password */}
                <div style={{ marginBottom: "24px" }}>
                    <h2 style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted, #949ba4)", marginBottom: "8px", fontWeight: 700 }}>
                        {t("Generate Secure Password")}
                    </h2>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                        <div style={{ position: "relative", display: "flex", alignItems: "center", flex: 1 }}>
                            <TextInput
                                type={showGeneratedPassword ? "text" : "password"}
                                value={generatedPassword || ""}
                                readOnly
                                style={{ width: "100%", paddingRight: "36px" }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowGeneratedPassword(!showGeneratedPassword)}
                                style={{
                                    position: "absolute",
                                    right: "8px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    background: "transparent",
                                    border: "none",
                                    cursor: "pointer",
                                    color: "var(--interactive-normal, #b5bac1)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    padding: "4px",
                                    borderRadius: "4px"
                                }}
                                title={showGeneratedPassword ? t("Hide password") : t("Show password")}
                            >
                                {showGeneratedPassword ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                        <line x1="1" y1="1" x2="23" y2="23"></line>
                                    </svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                )}
                            </button>
                        </div>
                        <Button color="secondary" onClick={generateRandomPassword} size="medium">
                            {t("Regenerate")}
                        </Button>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <Button color="primary" onClick={copyToClipboard} style={{ flex: 1 }}>
                            {t("Copy Password")}
                        </Button>
                        <Button color="brand" onClick={shareInChat} style={{ flex: 1 }}>
                            {t("Share in Chat")}
                        </Button>
                    </div>
                </div>

                {/* Section 2: Enter Partner's Password */}
                <div style={{ marginBottom: "24px" }}>
                    <h2 style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted, #949ba4)", marginBottom: "8px", fontWeight: 700 }}>
                        {t("Partner's Encryption Password")}
                    </h2>
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                        <TextInput
                            type={showFriendPassword ? "text" : "password"}
                            value={friendPassword || ""}
                            placeholder={t("Paste your partner's password here...")}
                            onChange={saveFriendPassword}
                            style={{ width: "100%", paddingRight: "36px" }}
                        />
                        <button
                            type="button"
                            onClick={() => setShowFriendPassword(!showFriendPassword)}
                            style={{
                                position: "absolute",
                                right: "8px",
                                top: "50%",
                                transform: "translateY(-50%)",
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                color: "var(--interactive-normal, #b5bac1)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "4px",
                                borderRadius: "4px"
                            }}
                            title={showFriendPassword ? t("Hide password") : t("Show password")}
                        >
                            {showFriendPassword ? (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                    <line x1="1" y1="1" x2="23" y2="23"></line>
                                </svg>
                            ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            )}
                        </button>
                    </div>
                    <p style={{ fontSize: "12px", color: "var(--text-muted, #949ba4)", marginTop: "6px", lineHeight: "1.4" }}>
                        {t("Paste the password received from your partner. Both of you must have the exact same password set to communicate securely.")}
                    </p>
                </div>

                {/* Section 3: Toggle Encryption */}
                <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--background-modifier-accent)" }}>
                    <Switch
                        value={isEncrypted}
                        onChange={toggleEncryption}
                        note={t("Encrypt outgoing messages in this conversation.")}
                    >
                        {t("Enable Encryption")}
                    </Switch>
                </div>
            </ModalContent>
            <ModalFooter>
                <Button onClick={close} color="primary" look="outlined">
                    {t("Close")}
                </Button>
            </ModalFooter>
        </Modal>
    );
};

const EncryptionToggleButton: ChatBarButtonFactory = ({ type }) => {
    settings.use();
    const channelId = SelectedChannelStore.getChannelId();
    const enabled = channelId ? isEncryptionEnabledForChannel(channelId) : false;

    const validChat = ["normal", "sidebar"].some(x => type.analyticsName === x);
    if (!validChat) return null;

    return (
        <ChatBarButton
            tooltip={enabled ? t("Encrypted Messages: Active") : t("Encrypted Messages: Inactive")}
            onClick={() => {
                openModal(props => <EncryptionSettingsModal modalProps={props} close={props.onClose} />);
            }}
        >
            {enabled ? <EncryptionEnabledIcon /> : <EncryptionDisabledIcon />}
        </ChatBarButton>
    );
};

function triggerReRender(message: any) {
    if (!message) return;
    const channelId = message.channel_id || message.channelId;
    const messageId = message.id;

    setTimeout(() => {
        const current = MessageStore.getMessage(channelId, messageId);
        const target = current || message;
        const origDispatch = (FluxDispatcher as any)._nc_orig_dispatch || FluxDispatcher.dispatch;
        origDispatch.call(FluxDispatcher, {
            type: "MESSAGE_UPDATE",
            message: target,
            _nc_skip_scan: true
        });
    }, 0);
}

function decryptMessage(message: any, passedChannelId?: string) {
    if (!message) return;

    const channelId = message.channel_id || message.channelId || passedChannelId;
    if (!channelId) return;

    const password = getChannelPassword(channelId);
    if (!password) return;

    if (!message.originalEncryptedContent) {
        if (isEncryptedMessage(message.content)) {
            message.originalEncryptedContent = message.content;
        } else if (originalEncryptedMessages.has(message.id)) {
            message.originalEncryptedContent = originalEncryptedMessages.get(message.id)!.content;
        }
    }

    if (!message.originalEncryptedContent || !isEncryptedMessage(message.originalEncryptedContent)) return;

    setOriginalEncryptedMessage(message.id, { channelId, content: message.originalEncryptedContent });

    const encryptedPart = getEncryptedPart(message.originalEncryptedContent);
    const cached = decryptedPlaintextCache.get(`${password}:${encryptedPart}`) ?? decryptedPlaintextCache.get(`${password}:${message.originalEncryptedContent}`);

    if (cached !== undefined) {
        message.content = cached;
        try { delete message._contentParsed; } catch {}
        try { delete message._contentParsedNodes; } catch {}
        try { message._contentParsed = undefined; } catch {}
        try { message._contentParsedNodes = undefined; } catch {}
        addDecryptedId(message.id);

        const current = MessageStore.getMessage(channelId, message.id);
        if (current) {
            current.content = cached;
            if (!current.originalEncryptedContent) current.originalEncryptedContent = message.originalEncryptedContent;
            try { delete current._contentParsed; } catch {}
            try { delete current._contentParsedNodes; } catch {}
            try { current._contentParsed = undefined; } catch {}
            try { current._contentParsedNodes = undefined; } catch {}
            addDecryptedId(message.id);
            triggerReRender(current);
        }
        return;
    }
    
    // Prevent parallel decryptions of the same message
    if (decryptingMessageIds.has(message.id)) return;
    decryptingMessageIds.add(message.id);

    decryptAES(encryptedPart, password).then(decrypted => {
        decryptingMessageIds.delete(message.id);
        originalEncryptedMessages.set(message.id, { channelId, content: message.originalEncryptedContent });

        message.content = decrypted;
        try { delete message._contentParsed; } catch {}
        try { delete message._contentParsedNodes; } catch {}
        try { message._contentParsed = undefined; } catch {}
        try { message._contentParsedNodes = undefined; } catch {}
        addDecryptedId(message.id);

        const current = MessageStore.getMessage(channelId, message.id);
        if (current) {
            current.content = decrypted;
            if (!current.originalEncryptedContent) {
                current.originalEncryptedContent = message.originalEncryptedContent;
            }
            try { delete current._contentParsed; } catch {}
            try { delete current._contentParsedNodes; } catch {}
            try { current._contentParsed = undefined; } catch {}
            try { current._contentParsedNodes = undefined; } catch {}
            addDecryptedId(message.id);
            triggerReRender(current);
        }
    }).catch(error => {
        decryptingMessageIds.delete(message.id);
        recordFailedAttempt();
        console.error("[EncryptedMessage] Decryption failed:", error);
    });
}

function scanAndDecrypt(obj: any, parentChannelId?: string, depth = 0, visited = new WeakSet()) {
    if (!obj || typeof obj !== "object" || depth > 10) return;
    if (getEnabledChannels().size === 0) return;
    if (visited.has(obj)) return;
    visited.add(obj);

    const currentChannelId = obj.channel_id || obj.channelId || parentChannelId;

    if (Array.isArray(obj)) {
        for (const item of obj) {
            scanAndDecrypt(item, currentChannelId, depth + 1, visited);
        }
        return;
    }
    if (typeof obj.content === "string" && typeof obj.id === "string") {
        const isEncrypted = isEncryptedMessage(obj.content) || (obj.originalEncryptedContent && isEncryptedMessage(obj.originalEncryptedContent)) || (originalEncryptedMessages.has(obj.id) && isEncryptedMessage(originalEncryptedMessages.get(obj.id)!.content));
        if (isEncrypted) {
            if (currentChannelId && isEncryptionEnabledForChannel(currentChannelId) && getChannelPassword(currentChannelId)) {
                const password = getChannelPassword(currentChannelId);
                const rawEncrypted = obj.originalEncryptedContent || (isEncryptedMessage(obj.content) ? obj.content : originalEncryptedMessages.get(obj.id)?.content);
                const encryptedPart = rawEncrypted ? getEncryptedPart(rawEncrypted) : "";
                const cached = encryptedPart ? (decryptedPlaintextCache.get(`${password}:${encryptedPart}`) ?? decryptedPlaintextCache.get(`${password}:${rawEncrypted}`)) : undefined;
                
                if (cached !== undefined) {
                    if (!obj.originalEncryptedContent && rawEncrypted) {
                        obj.originalEncryptedContent = rawEncrypted;
                    }
                    if (rawEncrypted) {
                        setOriginalEncryptedMessage(obj.id, { channelId: currentChannelId, content: rawEncrypted });
                    }
                    obj.content = cached;
                    try { delete obj._contentParsed; } catch {}
                    try { delete obj._contentParsedNodes; } catch {}
                    try { obj._contentParsed = undefined; } catch {}
                    try { obj._contentParsedNodes = undefined; } catch {}
                    addDecryptedId(obj.id);
                } else {
                    decryptMessage(obj, currentChannelId);
                }
            } else {
                const orig = obj.originalEncryptedContent || originalEncryptedMessages.get(obj.id)?.content;
                if (orig && (obj.content !== orig || decryptedMessageIds.has(obj.id))) {
                    obj.content = orig;
                    try { delete obj._contentParsed; } catch {}
                    try { delete obj._contentParsedNodes; } catch {}
                    try { obj._contentParsed = undefined; } catch {}
                    try { obj._contentParsedNodes = undefined; } catch {}
                    
                    decryptedMessageIds.delete(obj.id);
                    triggerReRender(obj);
                }
            }
        }
    } else {
        for (const k in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, k) && k !== "guild" && k !== "channel" && k !== "author" && k !== "_owner" && k !== "_store") {
                scanAndDecrypt(obj[k], currentChannelId, depth + 1, visited);
            }
        }
    }
}

function onChannelSelect(event: { channelId?: string }) {
    if (event?.channelId) {
        if (isEncryptionEnabledForChannel(event.channelId) && getChannelPassword(event.channelId)) {
            triggerDecryptForChannel(event.channelId);
        } else {
            revertAllDecrypted(event.channelId);
        }
    }
}

function onLoadMessagesSuccess(event: { channelId?: string }) {
    if (event?.channelId) {
        if (isEncryptionEnabledForChannel(event.channelId) && getChannelPassword(event.channelId)) {
            triggerDecryptForChannel(event.channelId);
        }
    }
}

const settings = definePluginSettings({
    encryptionPassword: {
        type: OptionType.STRING,
        description: "AES-256 encryption password shared with trusted users.",
        default: "",
        placeholder: "Enter strong shared password...",
        onChange(val) {
            resetSecurityState();
            if (!val) {
                revertAllDecrypted();
            }
            decryptedMessageIds.clear();
            decryptingMessageIds.clear();
            const currentChannelId = SelectedChannelStore.getChannelId();
            if (currentChannelId && isEncryptionEnabledForChannel(currentChannelId) && getChannelPassword(currentChannelId)) {
                triggerDecryptForChannel(currentChannelId);
            }
        }
    },
    channelPasswords: {
        type: OptionType.STRING,
        description: "Map of channel IDs to specific passwords in JSON.",
        default: "{}",
        onChange() {
            const currentChannelId = SelectedChannelStore.getChannelId();
            if (currentChannelId) {
                if (isEncryptionEnabledForChannel(currentChannelId) && getChannelPassword(currentChannelId)) {
                    triggerDecryptForChannel(currentChannelId);
                } else {
                    revertAllDecrypted(currentChannelId);
                }
            }
        }
    },
    channelGeneratedPasswords: {
        type: OptionType.STRING,
        description: "Map of channel IDs to the generated passwords in JSON.",
        default: "{}"
    },
    channelEncryptionStates: {
        type: OptionType.STRING,
        description: "Map of channel IDs to their encryption active states in JSON.",
        default: "{}",
        onChange() {
            const currentChannelId = SelectedChannelStore.getChannelId();
            if (currentChannelId) {
                if (isEncryptionEnabledForChannel(currentChannelId) && getChannelPassword(currentChannelId)) {
                    triggerDecryptForChannel(currentChannelId);
                } else {
                    revertAllDecrypted(currentChannelId);
                }
            }
        }
    },
    enableEncryption: {
        type: OptionType.BOOLEAN,
        description: "Encrypt outgoing messages.",
        default: false
    },
    strictPasswordPolicy: {
        type: OptionType.BOOLEAN,
        description: "Require uppercase, lowercase, number and special character in the password.",
        default: false
    },
    minPasswordLength: {
        type: OptionType.SLIDER,
        description: "Minimum password length when strict policy is enabled.",
        markers: [8, 12, 16, 20, 24, 32],
        default: SECURITY_CONSTANTS.DEFAULT_MIN_PASSWORD_LENGTH,
        stickToMarkers: true
    },
    pbkdf2Iterations: {
        type: OptionType.SELECT,
        description: "PBKDF2 iterations for new encrypted messages.",
        options: [
            { label: "Balanced 200k", value: 200000, default: true },
            { label: "Stronger 310k", value: 310000 },
            { label: "Very strong 600k", value: 600000 },
            { label: "Compatibility 100k", value: 100000 }
        ]
    },
    maxPlaintextBytes: {
        type: OptionType.NUMBER,
        description: "Maximum plaintext size in bytes before encryption. Use 0 to disable.",
        default: SECURITY_CONSTANTS.DEFAULT_MAX_PLAINTEXT_BYTES
    },
    encryptEmptyMessages: {
        type: OptionType.BOOLEAN,
        description: "Encrypt blank or whitespace only messages.",
        default: false
    },
    urlSafeBase64: {
        type: OptionType.BOOLEAN,
        description: "Use URL-safe base64 for new encrypted payloads.",
        default: true
    },
    acceptLegacyPayloads: {
        type: OptionType.BOOLEAN,
        description: "Allow decrypting legacy version 1 payloads.",
        default: true
    },
    maxFailedAttempts: {
        type: OptionType.SLIDER,
        description: "Failed decrypt attempts before lockout. Use 0 to disable.",
        markers: [0, 3, 5, 8, 10],
        default: 5,
        stickToMarkers: true
    },
    lockoutMinutes: {
        type: OptionType.SLIDER,
        description: "Minutes to pause decrypt attempts after lockout. Use 0 to disable.",
        markers: [0, 1, 5, 10, 30],
        default: 5,
        stickToMarkers: true
    },
    cancelOnEncryptionError: {
        type: OptionType.BOOLEAN,
        description: "Block plaintext sending when encryption fails.",
        default: true
    }
});

export default definePlugin({
    name: "EncryptedMessage",
    enabledByDefault: false,
    description: "AES-256 end-to-end encryption for Discord. Share the same password with other users to communicate securely.",
    authors: [{ name: "Nightcord",
     id: 0n }],
    dependencies: ["ChatInputButtonAPI", "MessageEventsAPI", "MessageAccessoriesAPI"],
    settings,

    chatBarButton: {
        icon: () => {
            const channelId = SelectedChannelStore.getChannelId();
            const enabled = channelId ? isEncryptionEnabledForChannel(channelId) : false;
            return enabled ? <EncryptionEnabledIcon /> : <EncryptionDisabledIcon />;
        },
        render: EncryptionToggleButton
    },

    renderMessageAccessory: (props: any) => {
        if (props?.message && decryptedMessageIds.has(props.message.id)) {
            return (
                <span style={{
                    color: "var(--text-muted)",
                    fontSize: "0.72em",
                    opacity: 0.65,
                    fontStyle: "italic",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                    marginTop: "2px",
                    userSelect: "none"
                }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                    </svg>{t("(decrypt)")}</span>
            );
        }
        return null;
    },

    start() {
        decryptedMessageIds.clear();
        originalEncryptedMessages.clear();
        decryptingMessageIds.clear();

        const MESSAGE_EVENT_TYPES = new Set([
            "MESSAGE_CREATE",
            "MESSAGE_UPDATE",
            "LOAD_MESSAGES_SUCCESS",
            "SEARCH_FINISH",
            "LOCAL_MESSAGE_CREATE",
            "PINNED_MESSAGES_FETCH_SUCCESS",
            "THREAD_MESSAGES_FIRST_PAGE"
        ]);

        const origDispatch = FluxDispatcher.dispatch;
        FluxDispatcher.dispatch = function (event: any) {
            // Only scan events that can contain chat messages if encryption is active somewhere
            if (event && !event._nc_skip_scan && getEnabledChannels().size > 0) {
                const type = event.type as string | undefined;
                if (type && MESSAGE_EVENT_TYPES.has(type)) {
                    try {
                        scanAndDecrypt(event);
                    } catch (e) {
                        console.error("[EncryptedMessage] dispatch scan error:", e);
                    }
                }
            }
            return origDispatch.call(this, event);
        };
        (FluxDispatcher as any)._nc_orig_dispatch = origDispatch;

        FluxDispatcher.subscribe("CHANNEL_SELECT", onChannelSelect);
        FluxDispatcher.subscribe("LOAD_MESSAGES_SUCCESS", onLoadMessagesSuccess);

        const currentChannelId = SelectedChannelStore.getChannelId();
        if (currentChannelId) {
            if (isEncryptionEnabledForChannel(currentChannelId) && getChannelPassword(currentChannelId)) {
                triggerDecryptForChannel(currentChannelId);
            }
        }
    },

    stop() {
        if ((FluxDispatcher as any)._nc_orig_dispatch) {
            FluxDispatcher.dispatch = (FluxDispatcher as any)._nc_orig_dispatch;
            delete (FluxDispatcher as any)._nc_orig_dispatch;
        }
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", onChannelSelect);
        FluxDispatcher.unsubscribe("LOAD_MESSAGES_SUCCESS", onLoadMessagesSuccess);
        revertAllDecrypted();
        decryptedMessageIds.clear();
        originalEncryptedMessages.clear();
        decryptingMessageIds.clear();
        derivedKeyCache.clear();
        decryptedPlaintextCache.clear();
        invalidateEnabledChannelsCache();
    },

    async onBeforeMessageSend(channelId, messageObj) {
        if (!isEncryptionEnabledForChannel(channelId)) return;

        if (!messageObj.content || isEncryptedMessage(messageObj.content)) return;
        if (!settings.store.encryptEmptyMessages && !messageObj.content.trim()) return;

        const password = getChannelPassword(channelId);
        if (!password) {
            Toasts.show({
                message: "No encryption password set for this channel.",
                type: Toasts.Type.FAILURE,
                id: Toasts.genId()
            });
            return { cancel: settings.store.cancelOnEncryptionError };
        }

        try {
            const originalPlaintext = messageObj.content;
            const encryptedMessage = await encryptAES(originalPlaintext, password);
            const wrapped = `${SECURITY_CONSTANTS.ENCRYPTION_MARKER_START}${encryptedMessage}${SECURITY_CONSTANTS.ENCRYPTION_MARKER_END}`;
            setDecryptedCache(`${password}:${encryptedMessage}`, originalPlaintext);
            setDecryptedCache(`${password}:${wrapped}`, originalPlaintext);
            messageObj.content = wrapped;
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            Toasts.show({
                message: `Message encryption failed: ${errorMessage}`,
                type: Toasts.Type.FAILURE,
                id: Toasts.genId()
            });
            return { cancel: settings.store.cancelOnEncryptionError };
        }
    }
});

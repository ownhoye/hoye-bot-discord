/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Nightcord Team
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type TOTPAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";

export interface GenerateOptions {
    digits?: number;
    algorithm?: TOTPAlgorithm;
    period?: number;
    timestamp?: number;
}

export interface TOTPResult {
    otp: string;
    expires: number;
    secondsRemaining: number;
    progress: number; // 0 to 1
}

const BASE32_CHARS: Record<string, number> = {
    A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7,
    I: 8, J: 9, K: 10, L: 11, M: 12, N: 13, O: 14, P: 15,
    Q: 16, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22, X: 23,
    Y: 24, Z: 25, "2": 26, "3": 27, "4": 28, "5": 29, "6": 30, "7": 31
};

export function base32ToBuffer(secret: string): Uint8Array {
    const clean = secret.toUpperCase().replace(/[\s\-_=]/g, "");
    const length = clean.length;
    const bufferSize = Math.floor((length * 5) / 8);
    const buffer = new Uint8Array(bufferSize);

    let value = 0;
    let bits = 0;
    let index = 0;

    for (let i = 0; i < length; i++) {
        const val = BASE32_CHARS[clean.charAt(i)];
        if (val === undefined) {
            throw new Error(`Invalid Base32 character: ${clean.charAt(i)}`);
        }
        value = (value << 5) | val;
        bits += 5;

        if (bits >= 8) {
            buffer[index++] = (value >>> (bits - 8)) & 255;
            bits -= 8;
        }
    }

    return buffer;
}

function dec2hex(dec: number): string {
    return (dec < 15.5 ? "0" : "") + Math.round(dec).toString(16);
}

function hex2buf(hex: string): Uint8Array {
    const buf = new Uint8Array(hex.length / 2);
    for (let i = 0, j = 0; i < hex.length; i += 2, j++) {
        buf[j] = parseInt(hex.slice(i, i + 2), 16);
    }
    return buf;
}

function buf2hex(buf: ArrayBuffer): string {
    return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, "0")).join("");
}

export async function generateTOTP(secret: string, options: GenerateOptions = {}): Promise<TOTPResult> {
    const digits = options.digits || 6;
    const algorithm = options.algorithm || "SHA-1";
    const period = options.period || 30;
    const timestamp = options.timestamp || Date.now();

    const epochSeconds = Math.floor(timestamp / 1000);
    const counter = Math.floor(epochSeconds / period);
    const timeHex = dec2hex(counter).padStart(16, "0");

    const keyBytes = base32ToBuffer(secret);
    const cryptoSubtle = window.crypto?.subtle || (globalThis as any).crypto?.subtle;
    if (!cryptoSubtle) {
        throw new Error("Web Crypto API not available");
    }

    const hmacKey = await cryptoSubtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: { name: algorithm } },
        false,
        ["sign"]
    );

    const signature = await cryptoSubtle.sign("HMAC", hmacKey, hex2buf(timeHex));
    const signatureHex = buf2hex(signature);

    const offset = parseInt(signatureHex.slice(-1), 16) * 2;
    const masked = parseInt(signatureHex.slice(offset, offset + 8), 16) & 0x7fffffff;
    let otp = (masked % Math.pow(10, digits)).toString().padStart(digits, "0");

    const periodMs = period * 1000;
    const expires = Math.ceil((timestamp + 1) / periodMs) * periodMs;
    const secondsRemaining = Math.max(0, Math.ceil((expires - timestamp) / 1000));
    const progress = Math.max(0, Math.min(1, secondsRemaining / period));

    return {
        otp,
        expires,
        secondsRemaining,
        progress
    };
}

export interface ParsedOtpAuth {
    type: "totp" | "hotp";
    label: string;
    issuer?: string;
    account?: string;
    secret: string;
    algorithm?: TOTPAlgorithm;
    digits?: number;
    period?: number;
}

export function parseOtpAuthUri(uri: string): ParsedOtpAuth | null {
    if (!uri || !uri.startsWith("otpauth://")) return null;
    try {
        const url = new URL(uri);
        const type = url.host.toLowerCase() as "totp" | "hotp";
        if (type !== "totp" && type !== "hotp") return null;

        const path = decodeURIComponent(url.pathname.replace(/^\//, ""));
        let issuer: string | undefined;
        let account = path;

        if (path.includes(":")) {
            const parts = path.split(":");
            issuer = parts[0].trim();
            account = parts.slice(1).join(":").trim();
        }

        const params = url.searchParams;
        const secret = params.get("secret");
        if (!secret) return null;

        if (params.has("issuer")) {
            issuer = params.get("issuer") || issuer;
        }

        const algorithmParam = (params.get("algorithm") || "SHA1").toUpperCase();
        const algorithm: TOTPAlgorithm =
            algorithmParam === "SHA256" ? "SHA-256" :
            algorithmParam === "SHA512" ? "SHA-512" : "SHA-1";

        const digits = params.has("digits") ? parseInt(params.get("digits")!, 10) : 6;
        const period = params.has("period") ? parseInt(params.get("period")!, 10) : 30;

        return {
            type,
            label: account || issuer || "Unknown",
            issuer,
            account,
            secret,
            algorithm,
            digits,
            period
        };
    } catch {
        return null;
    }
}

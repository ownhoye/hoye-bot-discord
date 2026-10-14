/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * LolArchive container format, version 1. The file extension (.lol, .xxx,
 * anything) is cosmetic: archives are recognised by their magic bytes.
 *
 * Header (76 bytes, big-endian, authenticated as AAD of every frame):
 *   0  magic "LOLARC"       6
 *   6  version (1)          1
 *   7  flags (bit0 = encrypted)
 *   8  compression (0 = store, 1 = brotli)
 *   9  compression level (informational)
 *  10  kdf (1 = PBKDF2-SHA512 + HKDF-SHA256)
 *  11  reserved (0)
 *  12  kdf iterations       u32
 *  16  chunk size           u32
 *  20  salt                 32
 *  52  AES-GCM base nonce   12
 *  64  ChaCha20 base nonce  12
 *
 * Then a sequence of frames: flags u8 (bit0 = final) | length u32 | payload.
 * Frame 0 is the brotli-compressed JSON index (names, sizes, dates), so file
 * names are hidden when the archive has a password. Frames 1..n carry the
 * (optionally brotli-compressed) concatenation of every file's contents in
 * index order. The last frame has the final bit set; a missing final frame
 * means the archive was truncated.
 *
 * Encrypted payload: AES-256-GCM then ChaCha20-Poly1305 (see crypto.ts),
 * nonces = base nonce XOR frame counter, AAD = header | counter u64 | flags.
 * Plain payload: data | CRC32(AAD, data) u32.
 */

import { crc32 } from "zlib";

import { ArchiveKeys, openFrame, SEAL_OVERHEAD, sealFrame, WrongPasswordError, frameNonce } from "./crypto";

export const MAGIC = Buffer.from("LOLARC", "ascii");
export const FORMAT_VERSION = 1;
export const HEADER_SIZE = 76;
export const FRAME_HEADER_SIZE = 5;
export const DEFAULT_CHUNK_SIZE = 1 << 20;
export const DEFAULT_ITERATIONS = 600_000;
export const MAX_INDEX_FRAME = 64 << 20;

const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 10_000_000;
const MIN_CHUNK = 4 << 10;
const MAX_CHUNK = 16 << 20;

export const FLAG_ENCRYPTED = 1;
export const FRAME_FINAL = 1;

export const enum Compression {
    Store = 0,
    Brotli = 1
}

export interface ArchiveHeader {
    encrypted: boolean;
    compression: Compression;
    level: number;
    iterations: number;
    chunkSize: number;
    salt: Buffer;
    aesNonce: Buffer;
    chachaNonce: Buffer;
    raw: Buffer;
}

export class CorruptArchiveError extends Error {
    constructor(detail: string) {
        super(`Archive invalide ou corrompue : ${detail}`);
        this.name = "CorruptArchiveError";
    }
}

export function encodeHeader(h: Omit<ArchiveHeader, "raw">): Buffer {
    const b = Buffer.alloc(HEADER_SIZE);
    MAGIC.copy(b, 0);
    b[6] = FORMAT_VERSION;
    b[7] = h.encrypted ? FLAG_ENCRYPTED : 0;
    b[8] = h.compression;
    b[9] = h.level;
    b[10] = 1;
    b[11] = 0;
    b.writeUInt32BE(h.iterations, 12);
    b.writeUInt32BE(h.chunkSize, 16);
    h.salt.copy(b, 20);
    h.aesNonce.copy(b, 52);
    h.chachaNonce.copy(b, 64);
    return b;
}

export function decodeHeader(b: Buffer): ArchiveHeader {
    if (b.length < HEADER_SIZE || !b.subarray(0, 6).equals(MAGIC))
        throw new CorruptArchiveError("ce n'est pas une archive LolArchive");
    if (b[6] !== FORMAT_VERSION)
        throw new CorruptArchiveError(`version ${b[6]} non prise en charge`);
    if ((b[7] & ~FLAG_ENCRYPTED) !== 0 || b[8] > Compression.Brotli || b[10] !== 1 || b[11] !== 0)
        throw new CorruptArchiveError("en-tête inconnu");

    const iterations = b.readUInt32BE(12);
    const chunkSize = b.readUInt32BE(16);
    const encrypted = (b[7] & FLAG_ENCRYPTED) !== 0;
    if (encrypted && (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS))
        throw new CorruptArchiveError("paramètres de chiffrement invalides");
    if (chunkSize < MIN_CHUNK || chunkSize > MAX_CHUNK)
        throw new CorruptArchiveError("taille de bloc invalide");

    const raw = Buffer.from(b.subarray(0, HEADER_SIZE));
    return {
        encrypted,
        compression: b[8] as Compression,
        level: b[9],
        iterations,
        chunkSize,
        salt: raw.subarray(20, 52),
        aesNonce: raw.subarray(52, 64),
        chachaNonce: raw.subarray(64, 76),
        raw
    };
}

function frameAad(header: ArchiveHeader, counter: bigint, flags: number): Buffer {
    const aad = Buffer.alloc(HEADER_SIZE + 9);
    header.raw.copy(aad, 0);
    aad.writeBigUInt64BE(counter, HEADER_SIZE);
    aad[HEADER_SIZE + 8] = flags;
    return aad;
}

export function maxFramePayload(header: ArchiveHeader, counter: bigint): number {
    const overhead = header.encrypted ? SEAL_OVERHEAD : 4;
    return (counter === 0n ? MAX_INDEX_FRAME : header.chunkSize) + overhead;
}

/** Builds a complete frame (frame header + sealed payload). */
export function encodeFrame(header: ArchiveHeader, keys: ArchiveKeys | null, counter: bigint, final: boolean, data: Buffer): Buffer {
    const flags = final ? FRAME_FINAL : 0;
    const aad = frameAad(header, counter, flags);
    let payload: Buffer;
    if (header.encrypted) {
        if (!keys) throw new Error("missing keys");
        payload = sealFrame(keys, frameNonce(header.aesNonce, counter), frameNonce(header.chachaNonce, counter), data, aad);
    } else {
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(data, crc32(aad)));
        payload = Buffer.concat([data, crc]);
    }
    const fh = Buffer.alloc(FRAME_HEADER_SIZE);
    fh[0] = flags;
    fh.writeUInt32BE(payload.length, 1);
    return Buffer.concat([fh, payload]);
}

/** Authenticates and decodes a frame payload. */
export function decodeFrame(header: ArchiveHeader, keys: ArchiveKeys | null, counter: bigint, flags: number, payload: Buffer): Buffer {
    const aad = frameAad(header, counter, flags);
    if (header.encrypted) {
        if (!keys) throw new WrongPasswordError();
        return openFrame(keys, frameNonce(header.aesNonce, counter), frameNonce(header.chachaNonce, counter), payload, aad);
    }
    if (payload.length < 4) throw new CorruptArchiveError("bloc tronqué");
    const data = payload.subarray(0, payload.length - 4);
    if (crc32(data, crc32(aad)) !== payload.readUInt32BE(payload.length - 4))
        throw new CorruptArchiveError("somme de contrôle incorrecte");
    return data;
}

export interface ArchiveEntry {
    /** Relative POSIX path inside the archive. */
    path: string;
    type: "file" | "dir";
    size: number;
    mtime: number;
}

export interface ArchiveIndex {
    version: 1;
    createdAt: number;
    entries: ArchiveEntry[];
}

const BAD_SEGMENT = /[\\:\0]/;

export function isSafeEntryPath(p: string): boolean {
    if (typeof p !== "string" || p.length === 0 || p.length > 4096) return false;
    if (p.startsWith("/") || /^[a-zA-Z]:/.test(p)) return false;
    return p.split("/").every(s => s.length > 0 && s !== "." && s !== ".." && !BAD_SEGMENT.test(s));
}

export function parseIndex(json: string): ArchiveIndex {
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        throw new CorruptArchiveError("index illisible");
    }
    if (!raw || typeof raw !== "object") throw new CorruptArchiveError("index illisible");
    const obj = raw as { version?: unknown; createdAt?: unknown; entries?: unknown; };
    if (obj.version !== 1 || !Array.isArray(obj.entries)) throw new CorruptArchiveError("index illisible");

    const seen = new Set<string>();
    const entries: ArchiveEntry[] = obj.entries.map((e: unknown) => {
        const { p, t, s, m } = (e ?? {}) as Record<string, unknown>;
        if (typeof p !== "string" || !isSafeEntryPath(p)) throw new CorruptArchiveError("chemin de fichier dangereux");
        if (t !== "f" && t !== "d") throw new CorruptArchiveError("type d'entrée inconnu");
        if (typeof s !== "number" || !Number.isSafeInteger(s) || s < 0 || (t === "d" && s !== 0))
            throw new CorruptArchiveError("taille invalide");
        if (typeof m !== "number" || !Number.isFinite(m)) throw new CorruptArchiveError("date invalide");
        const key = p.toLowerCase();
        if (seen.has(key)) throw new CorruptArchiveError("entrée en double");
        seen.add(key);
        return { path: p, type: t === "f" ? "file" : "dir", size: s, mtime: m };
    });

    return { version: 1, createdAt: typeof obj.createdAt === "number" ? obj.createdAt : 0, entries };
}

export function serializeIndex(index: ArchiveIndex): string {
    return JSON.stringify({
        version: index.version,
        createdAt: index.createdAt,
        entries: index.entries.map(e => ({ p: e.path, t: e.type === "file" ? "f" : "d", s: e.size, m: e.mtime }))
    });
}

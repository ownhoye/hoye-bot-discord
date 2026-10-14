/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * Dual-layer frame sealing: AES-256-GCM, then ChaCha20-Poly1305 over the
 * AES ciphertext and tag. Keys come from PBKDF2-SHA512 + HKDF-SHA256, so the
 * two layers never share key material.
 */

import { createCipheriv, createDecipheriv, getCiphers, hkdfSync, pbkdf2 } from "crypto";

import { chachaPolyOpen, chachaPolySeal } from "./chacha20poly1305";

export const TAG_LENGTH = 16;
export const SEAL_OVERHEAD = TAG_LENGTH * 2;

const NATIVE_CHACHA = getCiphers().includes("chacha20-poly1305");

export interface ArchiveKeys {
    aesKey: Buffer;
    chachaKey: Buffer;
}

export class WrongPasswordError extends Error {
    constructor() {
        super("Mot de passe incorrect ou archive corrompue.");
        this.name = "WrongPasswordError";
    }
}

export async function deriveKeys(password: string, salt: Buffer, iterations: number): Promise<ArchiveKeys> {
    const pw = Buffer.from(password.normalize("NFC"), "utf8");
    try {
        const master = await new Promise<Buffer>((resolve, reject) =>
            pbkdf2(pw, salt, iterations, 64, "sha512", (err, key) => err ? reject(err) : resolve(key))
        );
        try {
            return {
                aesKey: Buffer.from(hkdfSync("sha256", master, salt, "lolarc/v1/aes-256-gcm", 32)),
                chachaKey: Buffer.from(hkdfSync("sha256", master, salt, "lolarc/v1/chacha20-poly1305", 32))
            };
        } finally {
            master.fill(0);
        }
    } finally {
        pw.fill(0);
    }
}

export function wipeKeys(keys: ArchiveKeys | null | undefined) {
    if (!keys) return;
    keys.aesKey.fill(0);
    keys.chachaKey.fill(0);
}

/** Base nonce with the frame counter XORed into its last 8 bytes. */
export function frameNonce(base: Buffer, counter: bigint): Buffer {
    const nonce = Buffer.from(base);
    const tail = nonce.readBigUInt64BE(4) ^ counter;
    nonce.writeBigUInt64BE(tail, 4);
    return nonce;
}

function chachaSeal(key: Buffer, nonce: Buffer, data: Buffer, aad: Buffer): Buffer {
    if (!NATIVE_CHACHA) return chachaPolySeal(key, nonce, data, aad);
    const c = createCipheriv("chacha20-poly1305", key, nonce, { authTagLength: TAG_LENGTH });
    c.setAAD(aad, { plaintextLength: data.length });
    return Buffer.concat([c.update(data), c.final(), c.getAuthTag()]);
}

function chachaOpen(key: Buffer, nonce: Buffer, sealed: Buffer, aad: Buffer): Buffer {
    if (!NATIVE_CHACHA) return chachaPolyOpen(key, nonce, sealed, aad);
    const ct = sealed.subarray(0, sealed.length - TAG_LENGTH);
    const d = createDecipheriv("chacha20-poly1305", key, nonce, { authTagLength: TAG_LENGTH });
    d.setAAD(aad, { plaintextLength: ct.length });
    d.setAuthTag(sealed.subarray(sealed.length - TAG_LENGTH));
    return Buffer.concat([d.update(ct), d.final()]);
}

export function sealFrame(keys: ArchiveKeys, aesNonce: Buffer, chachaNonce: Buffer, plaintext: Buffer, aad: Buffer): Buffer {
    const aes = createCipheriv("aes-256-gcm", keys.aesKey, aesNonce, { authTagLength: TAG_LENGTH });
    aes.setAAD(aad);
    const inner = Buffer.concat([aes.update(plaintext), aes.final(), aes.getAuthTag()]);
    return chachaSeal(keys.chachaKey, chachaNonce, inner, aad);
}

export function openFrame(keys: ArchiveKeys, aesNonce: Buffer, chachaNonce: Buffer, sealed: Buffer, aad: Buffer): Buffer {
    if (sealed.length < SEAL_OVERHEAD) throw new WrongPasswordError();
    try {
        const inner = chachaOpen(keys.chachaKey, chachaNonce, sealed, aad);
        const ct = inner.subarray(0, inner.length - TAG_LENGTH);
        const aes = createDecipheriv("aes-256-gcm", keys.aesKey, aesNonce, { authTagLength: TAG_LENGTH });
        aes.setAAD(aad);
        aes.setAuthTag(inner.subarray(inner.length - TAG_LENGTH));
        return Buffer.concat([aes.update(ct), aes.final()]);
    } catch {
        throw new WrongPasswordError();
    }
}

/*
 * LoliCord 2FA Authenticator — Military Grade Cascaded Cryptography
 * Dual-Layer: AES-256-GCM + ChaCha20-Poly1305 with PBKDF2-SHA512 Key Stretching
 * Copyright (c) 2026 Nightcord Team
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface EncryptedVaultEnvelope {
    version: 1;
    salt: string; // Base64 32 bytes (PBKDF2 Salt)
    aesIv: string; // Base64 12 bytes (AES-GCM IV)
    chachaNonce: string; // Base64 12 bytes (ChaCha20-Poly1305 Nonce)
    ciphertext: string; // Base64 dual-layer encrypted payload
    iterations: number; // e.g. 600,000
    timestamp: number;
}

// ─── Helpers: Base64 & Bytes ──────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
    const bin = Array.from(bytes, b => String.fromCharCode(b)).join("");
    return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

// ─── Key Derivation: PBKDF2-HMAC-SHA512 (600k Iterations) ─────────────────────

export async function deriveDualKeys(password: string, salt: Uint8Array, iterations = 600000): Promise<{ aesKey: CryptoKey; chachaKey: Uint8Array }> {
    const enc = new TextEncoder();
    const passKey = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
    );

    // Derive 64 bytes (512 bits) = 32 bytes for AES-256 + 32 bytes for ChaCha20
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt,
            iterations,
            hash: "SHA-512"
        },
        passKey,
        512
    );

    const fullBytes = new Uint8Array(derivedBits);
    const aesKeyBytes = fullBytes.slice(0, 32);
    const chachaKeyBytes = fullBytes.slice(32, 64);

    const aesKey = await crypto.subtle.importKey(
        "raw",
        aesKeyBytes,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
    );

    return { aesKey, chachaKey: chachaKeyBytes };
}

// ─── ChaCha20 Stream Cipher & Poly1305 MAC (RFC 8439) ─────────────────────────

function rotl(v: number, n: number): number {
    return ((v << n) | (v >>> (32 - n))) >>> 0;
}

function quarterRound(x: Uint32Array, a: number, b: number, c: number, d: number) {
    x[a] = (x[a] + x[b]) >>> 0; x[d] = rotl(x[d] ^ x[a], 16);
    x[c] = (x[c] + x[d]) >>> 0; x[b] = rotl(x[b] ^ x[c], 12);
    x[a] = (x[a] + x[b]) >>> 0; x[d] = rotl(x[d] ^ x[a], 8);
    x[c] = (x[c] + x[d]) >>> 0; x[b] = rotl(x[b] ^ x[c], 7);
}

function chacha20Block(key: Uint8Array, counter: number, nonce: Uint8Array): Uint8Array {
    const state = new Uint32Array(16);
    // Constants "expand 32-byte k"
    state[0] = 0x61707865;
    state[1] = 0x3320646e;
    state[2] = 0x79622d32;
    state[3] = 0x6b206574;

    const keyView = new DataView(key.buffer, key.byteOffset, key.byteLength);
    for (let i = 0; i < 8; i++) {
        state[4 + i] = keyView.getUint32(i * 4, true);
    }

    state[12] = counter >>> 0;

    const nonceView = new DataView(nonce.buffer, nonce.byteOffset, nonce.byteLength);
    for (let i = 0; i < 3; i++) {
        state[13 + i] = nonceView.getUint32(i * 4, true);
    }

    const working = new Uint32Array(state);
    for (let i = 0; i < 10; i++) {
        // Column round
        quarterRound(working, 0, 4, 8, 12);
        quarterRound(working, 1, 5, 9, 13);
        quarterRound(working, 2, 6, 10, 14);
        quarterRound(working, 3, 7, 11, 15);
        // Diagonal round
        quarterRound(working, 0, 5, 10, 15);
        quarterRound(working, 1, 6, 11, 12);
        quarterRound(working, 2, 7, 8, 13);
        quarterRound(working, 3, 4, 9, 14);
    }

    const out = new Uint8Array(64);
    const outView = new DataView(out.buffer);
    for (let i = 0; i < 16; i++) {
        outView.setUint32(i * 4, (working[i] + state[i]) >>> 0, true);
    }
    return out;
}

function chacha20Xor(key: Uint8Array, counter: number, nonce: Uint8Array, input: Uint8Array): Uint8Array {
    const output = new Uint8Array(input.length);
    let blockCount = Math.ceil(input.length / 64);
    for (let b = 0; b < blockCount; b++) {
        const keyStream = chacha20Block(key, counter + b, nonce);
        const start = b * 64;
        const end = Math.min(input.length, start + 64);
        for (let i = start; i < end; i++) {
            output[i] = input[i] ^ keyStream[i - start];
        }
    }
    return output;
}

// Poly1305 MAC Implementation (RFC 8439)
class Poly1305 {
    private r0 = 0; private r1 = 0; private r2 = 0; private r3 = 0; private r4 = 0;
    private s1 = 0; private s2 = 0; private s3 = 0; private s4 = 0;
    private h0 = 0; private h1 = 0; private h2 = 0; private h3 = 0; private h4 = 0;
    private pad0 = 0; private pad1 = 0; private pad2 = 0; private pad3 = 0;
    private buffer = new Uint8Array(16);
    private bufLen = 0;

    constructor(key: Uint8Array) {
        const view = new DataView(key.buffer, key.byteOffset, 32);
        const t0 = view.getUint32(0, true);
        const t1 = view.getUint32(4, true);
        const t2 = view.getUint32(8, true);
        const t3 = view.getUint32(12, true);

        // Clamp r
        this.r0 = t0 & 0x3ffffff;
        this.r1 = (t0 >>> 26) | ((t1 & 0x3ffff) << 6) & 0x3ffff03;
        this.r2 = (t1 >>> 20) | ((t2 & 0x3ff) << 12) & 0x3ffc0ff;
        this.r3 = (t2 >>> 14) | ((t3 & 0x0f) << 18) & 0x3f03fff;
        this.r4 = (t3 >>> 8) & 0x00fffff;

        this.s1 = this.r1 * 5;
        this.s2 = this.r2 * 5;
        this.s3 = this.r3 * 5;
        this.s4 = this.r4 * 5;

        this.pad0 = view.getUint32(16, true);
        this.pad1 = view.getUint32(20, true);
        this.pad2 = view.getUint32(24, true);
        this.pad3 = view.getUint32(28, true);
    }

    private processBlock(block: Uint8Array, isLast = false) {
        const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
        let t0 = 0, t1 = 0, t2 = 0, t3 = 0;

        if (block.length === 16) {
            t0 = view.getUint32(0, true);
            t1 = view.getUint32(4, true);
            t2 = view.getUint32(8, true);
            t3 = view.getUint32(12, true);
        } else {
            const temp = new Uint8Array(16);
            temp.set(block);
            temp[block.length] = 1;
            const tView = new DataView(temp.buffer);
            t0 = tView.getUint32(0, true);
            t1 = tView.getUint32(4, true);
            t2 = tView.getUint32(8, true);
            t3 = tView.getUint32(12, true);
        }

        let d0 = (this.h0 + (t0 & 0x3ffffff)) >>> 0;
        let d1 = (this.h1 + (((t0 >>> 26) | (t1 << 6)) & 0x3ffffff)) >>> 0;
        let d2 = (this.h2 + (((t1 >>> 20) | (t2 << 12)) & 0x3ffffff)) >>> 0;
        let d3 = (this.h3 + (((t2 >>> 14) | (t3 << 18)) & 0x3ffffff)) >>> 0;
        let d4 = (this.h4 + (t3 >>> 8) + (isLast ? 0 : (1 << 24))) >>> 0;

        let h0 = d0 * this.r0 + d1 * this.s4 + d2 * this.s3 + d3 * this.s2 + d4 * this.s1;
        let h1 = d0 * this.r1 + d1 * this.r0 + d2 * this.s4 + d3 * this.s3 + d4 * this.s2;
        let h2 = d0 * this.r2 + d1 * this.r1 + d2 * this.r0 + d3 * this.s4 + d4 * this.s3;
        let h3 = d0 * this.r3 + d1 * this.r2 + d2 * this.r1 + d3 * this.r0 + d4 * this.s4;
        let h4 = d0 * this.r4 + d1 * this.r3 + d2 * this.r2 + d3 * this.r1 + d4 * this.r0;

        let c = Math.floor(h0 / 0x4000000); this.h0 = h0 % 0x4000000; h1 += c;
        c = Math.floor(h1 / 0x4000000); this.h1 = h1 % 0x4000000; h2 += c;
        c = Math.floor(h2 / 0x4000000); this.h2 = h2 % 0x4000000; h3 += c;
        c = Math.floor(h3 / 0x4000000); this.h3 = h3 % 0x4000000; h4 += c;
        c = Math.floor(h4 / 0x4000000); this.h4 = h4 % 0x4000000; this.h0 += c * 5;
        c = Math.floor(this.h0 / 0x4000000); this.h0 %= 0x4000000; this.h1 += c;
    }

    public update(data: Uint8Array) {
        let offset = 0;
        let len = data.length;
        if (this.bufLen > 0) {
            const need = 16 - this.bufLen;
            const take = Math.min(need, len);
            this.buffer.set(data.subarray(0, take), this.bufLen);
            this.bufLen += take;
            offset += take;
            len -= take;
            if (this.bufLen === 16) {
                this.processBlock(this.buffer);
                this.bufLen = 0;
            }
        }
        while (len >= 16) {
            this.processBlock(data.subarray(offset, offset + 16));
            offset += 16;
            len -= 16;
        }
        if (len > 0) {
            this.buffer.set(data.subarray(offset, offset + len), 0);
            this.bufLen = len;
        }
    }

    public finish(): Uint8Array {
        if (this.bufLen > 0) {
            const last = new Uint8Array(this.bufLen);
            last.set(this.buffer.subarray(0, this.bufLen));
            this.processBlock(last, true);
        }

        let f0 = (this.h0 | (this.h1 << 26)) >>> 0;
        let f1 = ((this.h1 >>> 6) | (this.h2 << 20)) >>> 0;
        let f2 = ((this.h2 >>> 12) | (this.h3 << 14)) >>> 0;
        let f3 = ((this.h3 >>> 18) | (this.h4 << 8)) >>> 0;

        let g0 = (f0 + 5) >>> 0;
        let g1 = (f1 + (g0 < 5 ? 1 : 0)) >>> 0;
        let g2 = (f2 + (g1 < f1 ? 1 : 0)) >>> 0;
        let g3 = (f3 + (g2 < f2 ? 1 : 0)) >>> 0;

        let mask = (g3 >>> 2) & 1 ? 0 : 0xffffffff;
        f0 = (f0 & mask) | (g0 & ~mask);
        f1 = (f1 & mask) | (g1 & ~mask);
        f2 = (f2 & mask) | (g2 & ~mask);
        f3 = (f3 & mask) | (g3 & ~mask);

        let out = new Uint8Array(16);
        let outView = new DataView(out.buffer);
        outView.setUint32(0, (f0 + this.pad0) >>> 0, true);
        outView.setUint32(4, (f1 + this.pad1 + (f0 + this.pad0 > 0xffffffff ? 1 : 0)) >>> 0, true);
        outView.setUint32(8, (f2 + this.pad2 + (f1 + this.pad1 > 0xffffffff ? 1 : 0)) >>> 0, true);
        outView.setUint32(12, (f3 + this.pad3 + (f2 + this.pad2 > 0xffffffff ? 1 : 0)) >>> 0, true);
        return out;
    }
}

function chacha20Poly1305Encrypt(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array): Uint8Array {
    // Generate Poly1305 one-time key with block counter 0
    const otKey = chacha20Block(key, 0, nonce).slice(0, 32);
    const ciphertext = chacha20Xor(key, 1, nonce, plaintext);

    const poly = new Poly1305(otKey);
    poly.update(ciphertext);

    // Pad ciphertext to 16 bytes
    if (ciphertext.length % 16 !== 0) {
        poly.update(new Uint8Array(16 - (ciphertext.length % 16)));
    }

    // Lengths (AAD=0, ciphertext len)
    const lenBuf = new Uint8Array(16);
    const view = new DataView(lenBuf.buffer);
    view.setBigUint64(8, BigInt(ciphertext.length), true);
    poly.update(lenBuf);

    const tag = poly.finish();

    const result = new Uint8Array(ciphertext.length + 16);
    result.set(ciphertext, 0);
    result.set(tag, ciphertext.length);
    return result;
}

function chacha20Poly1305Decrypt(key: Uint8Array, nonce: Uint8Array, payload: Uint8Array): Uint8Array {
    if (payload.length < 16) throw new Error("Invalid ChaCha20-Poly1305 payload length");
    const ciphertext = payload.slice(0, payload.length - 16);
    const receivedTag = payload.slice(payload.length - 16);

    const otKey = chacha20Block(key, 0, nonce).slice(0, 32);
    const poly = new Poly1305(otKey);
    poly.update(ciphertext);

    if (ciphertext.length % 16 !== 0) {
        poly.update(new Uint8Array(16 - (ciphertext.length % 16)));
    }

    const lenBuf = new Uint8Array(16);
    const view = new DataView(lenBuf.buffer);
    view.setBigUint64(8, BigInt(ciphertext.length), true);
    poly.update(lenBuf);

    const computedTag = poly.finish();

    // Constant-time tag check
    let diff = 0;
    for (let i = 0; i < 16; i++) diff |= computedTag[i] ^ receivedTag[i];
    if (diff !== 0) throw new Error("ChaCha20-Poly1305 authentication failed (invalid password or corrupted data)");

    return chacha20Xor(key, 1, nonce, ciphertext);
}

// ─── High-Level Cascaded Encryption (AES-256-GCM + ChaCha20-Poly1305) ─────────

/**
 * Encrypts data using cascaded AES-256-GCM followed by ChaCha20-Poly1305.
 * Key derived via PBKDF2-HMAC-SHA512 (600,000 rounds).
 */
export async function encryptVault(plaintext: string, masterPassword: string): Promise<EncryptedVaultEnvelope> {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const aesIv = crypto.getRandomValues(new Uint8Array(12));
    const chachaNonce = crypto.getRandomValues(new Uint8Array(12));
    const iterations = 600000;

    const { aesKey, chachaKey } = await deriveDualKeys(masterPassword, salt, iterations);

    // Layer 1: AES-256-GCM
    const enc = new TextEncoder();
    const rawPlain = enc.encode(plaintext);
    const layer1CipherBuffer = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: aesIv,
            tagLength: 128
        },
        aesKey,
        rawPlain
    );
    const layer1Bytes = new Uint8Array(layer1CipherBuffer);

    // Layer 2: ChaCha20-Poly1305
    const layer2Bytes = chacha20Poly1305Encrypt(chachaKey, chachaNonce, layer1Bytes);

    return {
        version: 1,
        salt: bytesToBase64(salt),
        aesIv: bytesToBase64(aesIv),
        chachaNonce: bytesToBase64(chachaNonce),
        ciphertext: bytesToBase64(layer2Bytes),
        iterations,
        timestamp: Date.now()
    };
}

/**
 * Decrypts a cascaded encrypted vault. Throws error if password is incorrect or payload corrupted.
 */
export async function decryptVault(envelope: EncryptedVaultEnvelope, masterPassword: string): Promise<string> {
    if (envelope.version !== 1) throw new Error("Unsupported vault format version");

    const salt = base64ToBytes(envelope.salt);
    const aesIv = base64ToBytes(envelope.aesIv);
    const chachaNonce = base64ToBytes(envelope.chachaNonce);
    const layer2Bytes = base64ToBytes(envelope.ciphertext);
    const iterations = envelope.iterations || 600000;

    const { aesKey, chachaKey } = await deriveDualKeys(masterPassword, salt, iterations);

    // Layer 2 Decrypt: ChaCha20-Poly1305
    const layer1Bytes = chacha20Poly1305Decrypt(chachaKey, chachaNonce, layer2Bytes);

    // Layer 1 Decrypt: AES-256-GCM
    let decryptedBuffer: ArrayBuffer;
    try {
        decryptedBuffer = await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: aesIv,
                tagLength: 128
            },
            aesKey,
            layer1Bytes
        );
    } catch {
        throw new Error("AES-256-GCM authentication failed (invalid master password)");
    }

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
}

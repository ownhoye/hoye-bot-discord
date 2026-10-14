/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * Pure TypeScript ChaCha20-Poly1305 (RFC 8439).
 *
 * Electron ships BoringSSL, whose Node crypto layer does not expose
 * "chacha20-poly1305" through createCipheriv. This implementation is used as
 * a fallback there; under plain Node the native cipher is preferred.
 */

import { timingSafeEqual } from "crypto";

const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];

function readU32LE(b: Uint8Array, o: number): number {
    return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

/** XORs `input` with the ChaCha20 keystream starting at block `counter`. */
export function chacha20Xor(key: Uint8Array, nonce: Uint8Array, counter: number, input: Uint8Array): Uint8Array {
    const k0 = readU32LE(key, 0), k1 = readU32LE(key, 4), k2 = readU32LE(key, 8), k3 = readU32LE(key, 12);
    const k4 = readU32LE(key, 16), k5 = readU32LE(key, 20), k6 = readU32LE(key, 24), k7 = readU32LE(key, 28);
    const n0 = readU32LE(nonce, 0), n1 = readU32LE(nonce, 4), n2 = readU32LE(nonce, 8);

    const out = new Uint8Array(input.length);
    const ks = new Uint8Array(64);
    const ksWords = new Uint32Array(ks.buffer);
    let ctr = counter >>> 0;

    for (let pos = 0; pos < input.length; pos += 64) {
        let x0 = SIGMA[0], x1 = SIGMA[1], x2 = SIGMA[2], x3 = SIGMA[3];
        let x4 = k0, x5 = k1, x6 = k2, x7 = k3, x8 = k4, x9 = k5, x10 = k6, x11 = k7;
        let x12 = ctr, x13 = n0, x14 = n1, x15 = n2;

        for (let r = 0; r < 10; r++) {
            x0 = (x0 + x4) | 0; x12 ^= x0; x12 = (x12 << 16) | (x12 >>> 16);
            x8 = (x8 + x12) | 0; x4 ^= x8; x4 = (x4 << 12) | (x4 >>> 20);
            x0 = (x0 + x4) | 0; x12 ^= x0; x12 = (x12 << 8) | (x12 >>> 24);
            x8 = (x8 + x12) | 0; x4 ^= x8; x4 = (x4 << 7) | (x4 >>> 25);

            x1 = (x1 + x5) | 0; x13 ^= x1; x13 = (x13 << 16) | (x13 >>> 16);
            x9 = (x9 + x13) | 0; x5 ^= x9; x5 = (x5 << 12) | (x5 >>> 20);
            x1 = (x1 + x5) | 0; x13 ^= x1; x13 = (x13 << 8) | (x13 >>> 24);
            x9 = (x9 + x13) | 0; x5 ^= x9; x5 = (x5 << 7) | (x5 >>> 25);

            x2 = (x2 + x6) | 0; x14 ^= x2; x14 = (x14 << 16) | (x14 >>> 16);
            x10 = (x10 + x14) | 0; x6 ^= x10; x6 = (x6 << 12) | (x6 >>> 20);
            x2 = (x2 + x6) | 0; x14 ^= x2; x14 = (x14 << 8) | (x14 >>> 24);
            x10 = (x10 + x14) | 0; x6 ^= x10; x6 = (x6 << 7) | (x6 >>> 25);

            x3 = (x3 + x7) | 0; x15 ^= x3; x15 = (x15 << 16) | (x15 >>> 16);
            x11 = (x11 + x15) | 0; x7 ^= x11; x7 = (x7 << 12) | (x7 >>> 20);
            x3 = (x3 + x7) | 0; x15 ^= x3; x15 = (x15 << 8) | (x15 >>> 24);
            x11 = (x11 + x15) | 0; x7 ^= x11; x7 = (x7 << 7) | (x7 >>> 25);

            x0 = (x0 + x5) | 0; x15 ^= x0; x15 = (x15 << 16) | (x15 >>> 16);
            x10 = (x10 + x15) | 0; x5 ^= x10; x5 = (x5 << 12) | (x5 >>> 20);
            x0 = (x0 + x5) | 0; x15 ^= x0; x15 = (x15 << 8) | (x15 >>> 24);
            x10 = (x10 + x15) | 0; x5 ^= x10; x5 = (x5 << 7) | (x5 >>> 25);

            x1 = (x1 + x6) | 0; x12 ^= x1; x12 = (x12 << 16) | (x12 >>> 16);
            x11 = (x11 + x12) | 0; x6 ^= x11; x6 = (x6 << 12) | (x6 >>> 20);
            x1 = (x1 + x6) | 0; x12 ^= x1; x12 = (x12 << 8) | (x12 >>> 24);
            x11 = (x11 + x12) | 0; x6 ^= x11; x6 = (x6 << 7) | (x6 >>> 25);

            x2 = (x2 + x7) | 0; x13 ^= x2; x13 = (x13 << 16) | (x13 >>> 16);
            x8 = (x8 + x13) | 0; x7 ^= x8; x7 = (x7 << 12) | (x7 >>> 20);
            x2 = (x2 + x7) | 0; x13 ^= x2; x13 = (x13 << 8) | (x13 >>> 24);
            x8 = (x8 + x13) | 0; x7 ^= x8; x7 = (x7 << 7) | (x7 >>> 25);

            x3 = (x3 + x4) | 0; x14 ^= x3; x14 = (x14 << 16) | (x14 >>> 16);
            x9 = (x9 + x14) | 0; x4 ^= x9; x4 = (x4 << 12) | (x4 >>> 20);
            x3 = (x3 + x4) | 0; x14 ^= x3; x14 = (x14 << 8) | (x14 >>> 24);
            x9 = (x9 + x14) | 0; x4 ^= x9; x4 = (x4 << 7) | (x4 >>> 25);
        }

        // Typed array stores are little-endian on every platform Electron supports.
        ksWords[0] = x0 + SIGMA[0]; ksWords[1] = x1 + SIGMA[1]; ksWords[2] = x2 + SIGMA[2]; ksWords[3] = x3 + SIGMA[3];
        ksWords[4] = x4 + k0; ksWords[5] = x5 + k1; ksWords[6] = x6 + k2; ksWords[7] = x7 + k3;
        ksWords[8] = x8 + k4; ksWords[9] = x9 + k5; ksWords[10] = x10 + k6; ksWords[11] = x11 + k7;
        ksWords[12] = x12 + ctr; ksWords[13] = x13 + n0; ksWords[14] = x14 + n1; ksWords[15] = x15 + n2;

        const end = Math.min(64, input.length - pos);
        for (let i = 0; i < end; i++) out[pos + i] = input[pos + i] ^ ks[i];

        ctr = (ctr + 1) >>> 0;
        if (ctr === 0 && pos + 64 < input.length) throw new Error("ChaCha20 counter overflow");
    }
    return out;
}

/**
 * Poly1305 with 13-bit limbs. Intermediate sums stay below 2^35, which is
 * exact in IEEE doubles, so plain Number arithmetic is safe.
 */
class Poly1305 {
    private readonly r = new Float64Array(10);
    private readonly h = new Float64Array(10);
    private readonly pad = new Uint16Array(8);
    private readonly buffer = new Uint8Array(16);
    private leftover = 0;

    constructor(key: Uint8Array) {
        const t = (i: number) => key[i] | (key[i + 1] << 8);
        const t0 = t(0), t1 = t(2), t2 = t(4), t3 = t(6), t4 = t(8), t5 = t(10), t6 = t(12), t7 = t(14);
        const r = this.r;
        r[0] = t0 & 0x1fff;
        r[1] = ((t0 >>> 13) | (t1 << 3)) & 0x1fff;
        r[2] = ((t1 >>> 10) | (t2 << 6)) & 0x1f03;
        r[3] = ((t2 >>> 7) | (t3 << 9)) & 0x1fff;
        r[4] = ((t3 >>> 4) | (t4 << 12)) & 0x00ff;
        r[5] = (t4 >>> 1) & 0x1ffe;
        r[6] = ((t4 >>> 14) | (t5 << 2)) & 0x1fff;
        r[7] = ((t5 >>> 11) | (t6 << 5)) & 0x1f81;
        r[8] = ((t6 >>> 8) | (t7 << 8)) & 0x1fff;
        r[9] = (t7 >>> 5) & 0x007f;
        for (let i = 0; i < 8; i++) this.pad[i] = t(16 + i * 2);
    }

    private blocks(m: Uint8Array, off: number, len: number, hibit: number) {
        const { h, r } = this;
        const r0 = r[0], r1 = r[1], r2 = r[2], r3 = r[3], r4 = r[4], r5 = r[5], r6 = r[6], r7 = r[7], r8 = r[8], r9 = r[9];
        const s1 = r1 * 5, s2 = r2 * 5, s3 = r3 * 5, s4 = r4 * 5, s5 = r5 * 5, s6 = r6 * 5, s7 = r7 * 5, s8 = r8 * 5, s9 = r9 * 5;
        let h0 = h[0], h1 = h[1], h2 = h[2], h3 = h[3], h4 = h[4], h5 = h[5], h6 = h[6], h7 = h[7], h8 = h[8], h9 = h[9];

        while (len >= 16) {
            const t0 = m[off + 0] | (m[off + 1] << 8);
            const t1 = m[off + 2] | (m[off + 3] << 8);
            const t2 = m[off + 4] | (m[off + 5] << 8);
            const t3 = m[off + 6] | (m[off + 7] << 8);
            const t4 = m[off + 8] | (m[off + 9] << 8);
            const t5 = m[off + 10] | (m[off + 11] << 8);
            const t6 = m[off + 12] | (m[off + 13] << 8);
            const t7 = m[off + 14] | (m[off + 15] << 8);

            h0 += t0 & 0x1fff;
            h1 += ((t0 >>> 13) | (t1 << 3)) & 0x1fff;
            h2 += ((t1 >>> 10) | (t2 << 6)) & 0x1fff;
            h3 += ((t2 >>> 7) | (t3 << 9)) & 0x1fff;
            h4 += ((t3 >>> 4) | (t4 << 12)) & 0x1fff;
            h5 += (t4 >>> 1) & 0x1fff;
            h6 += ((t4 >>> 14) | (t5 << 2)) & 0x1fff;
            h7 += ((t5 >>> 11) | (t6 << 5)) & 0x1fff;
            h8 += ((t6 >>> 8) | (t7 << 8)) & 0x1fff;
            h9 += (t7 >>> 5) | hibit;

            let c = 0;
            let d0 = c + h0 * r0 + h1 * s9 + h2 * s8 + h3 * s7 + h4 * s6 + h5 * s5 + h6 * s4 + h7 * s3 + h8 * s2 + h9 * s1;
            c = Math.floor(d0 / 8192); d0 -= c * 8192;
            let d1 = c + h0 * r1 + h1 * r0 + h2 * s9 + h3 * s8 + h4 * s7 + h5 * s6 + h6 * s5 + h7 * s4 + h8 * s3 + h9 * s2;
            c = Math.floor(d1 / 8192); d1 -= c * 8192;
            let d2 = c + h0 * r2 + h1 * r1 + h2 * r0 + h3 * s9 + h4 * s8 + h5 * s7 + h6 * s6 + h7 * s5 + h8 * s4 + h9 * s3;
            c = Math.floor(d2 / 8192); d2 -= c * 8192;
            let d3 = c + h0 * r3 + h1 * r2 + h2 * r1 + h3 * r0 + h4 * s9 + h5 * s8 + h6 * s7 + h7 * s6 + h8 * s5 + h9 * s4;
            c = Math.floor(d3 / 8192); d3 -= c * 8192;
            let d4 = c + h0 * r4 + h1 * r3 + h2 * r2 + h3 * r1 + h4 * r0 + h5 * s9 + h6 * s8 + h7 * s7 + h8 * s6 + h9 * s5;
            c = Math.floor(d4 / 8192); d4 -= c * 8192;
            let d5 = c + h0 * r5 + h1 * r4 + h2 * r3 + h3 * r2 + h4 * r1 + h5 * r0 + h6 * s9 + h7 * s8 + h8 * s7 + h9 * s6;
            c = Math.floor(d5 / 8192); d5 -= c * 8192;
            let d6 = c + h0 * r6 + h1 * r5 + h2 * r4 + h3 * r3 + h4 * r2 + h5 * r1 + h6 * r0 + h7 * s9 + h8 * s8 + h9 * s7;
            c = Math.floor(d6 / 8192); d6 -= c * 8192;
            let d7 = c + h0 * r7 + h1 * r6 + h2 * r5 + h3 * r4 + h4 * r3 + h5 * r2 + h6 * r1 + h7 * r0 + h8 * s9 + h9 * s8;
            c = Math.floor(d7 / 8192); d7 -= c * 8192;
            let d8 = c + h0 * r8 + h1 * r7 + h2 * r6 + h3 * r5 + h4 * r4 + h5 * r3 + h6 * r2 + h7 * r1 + h8 * r0 + h9 * s9;
            c = Math.floor(d8 / 8192); d8 -= c * 8192;
            let d9 = c + h0 * r9 + h1 * r8 + h2 * r7 + h3 * r6 + h4 * r5 + h5 * r4 + h6 * r3 + h7 * r2 + h8 * r1 + h9 * r0;
            c = Math.floor(d9 / 8192); d9 -= c * 8192;
            c = c * 5 + d0;
            d0 = c % 8192;
            d1 += Math.floor(c / 8192);
            h0 = d0; h1 = d1; h2 = d2; h3 = d3; h4 = d4; h5 = d5; h6 = d6; h7 = d7; h8 = d8; h9 = d9;

            off += 16;
            len -= 16;
        }
        h[0] = h0; h[1] = h1; h[2] = h2; h[3] = h3; h[4] = h4; h[5] = h5; h[6] = h6; h[7] = h7; h[8] = h8; h[9] = h9;
    }

    update(m: Uint8Array): this {
        let off = 0;
        let len = m.length;
        if (this.leftover) {
            const want = Math.min(16 - this.leftover, len);
            this.buffer.set(m.subarray(0, want), this.leftover);
            this.leftover += want;
            off += want;
            len -= want;
            if (this.leftover < 16) return this;
            this.blocks(this.buffer, 0, 16, 1 << 11);
            this.leftover = 0;
        }
        const full = len - (len % 16);
        this.blocks(m, off, full, 1 << 11);
        if (len > full) {
            this.buffer.set(m.subarray(off + full, off + len));
            this.leftover = len - full;
        }
        return this;
    }

    digest(): Uint8Array {
        const h = this.h;
        if (this.leftover) {
            let i = this.leftover;
            this.buffer[i++] = 1;
            for (; i < 16; i++) this.buffer[i] = 0;
            this.blocks(this.buffer, 0, 16, 0);
        }

        let c = h[1] >>> 13;
        h[1] &= 0x1fff;
        for (let i = 2; i < 10; i++) {
            h[i] += c;
            c = h[i] >>> 13;
            h[i] &= 0x1fff;
        }
        h[0] += c * 5;
        c = h[0] >>> 13;
        h[0] &= 0x1fff;
        h[1] += c;
        c = h[1] >>> 13;
        h[1] &= 0x1fff;
        h[2] += c;

        const g = new Array<number>(10);
        g[0] = h[0] + 5;
        c = g[0] >>> 13;
        g[0] &= 0x1fff;
        for (let i = 1; i < 10; i++) {
            g[i] = h[i] + c;
            c = g[i] >>> 13;
            g[i] &= 0x1fff;
        }
        g[9] -= 1 << 13;

        let mask = (c ^ 1) - 1;
        for (let i = 0; i < 10; i++) g[i] &= mask;
        mask = ~mask;
        for (let i = 0; i < 10; i++) h[i] = (h[i] & mask) | g[i];

        const o = new Array<number>(8);
        o[0] = (h[0] | (h[1] << 13)) & 0xffff;
        o[1] = ((h[1] >>> 3) | (h[2] << 10)) & 0xffff;
        o[2] = ((h[2] >>> 6) | (h[3] << 7)) & 0xffff;
        o[3] = ((h[3] >>> 9) | (h[4] << 4)) & 0xffff;
        o[4] = ((h[4] >>> 12) | (h[5] << 1) | (h[6] << 14)) & 0xffff;
        o[5] = ((h[6] >>> 2) | (h[7] << 11)) & 0xffff;
        o[6] = ((h[7] >>> 5) | (h[8] << 8)) & 0xffff;
        o[7] = ((h[8] >>> 8) | (h[9] << 5)) & 0xffff;

        const mac = new Uint8Array(16);
        let f = o[0] + this.pad[0];
        o[0] = f & 0xffff;
        for (let i = 1; i < 8; i++) {
            f = (((o[i] + this.pad[i]) | 0) + (f >>> 16)) | 0;
            o[i] = f & 0xffff;
        }
        for (let i = 0; i < 8; i++) {
            mac[i * 2] = o[i] & 0xff;
            mac[i * 2 + 1] = (o[i] >>> 8) & 0xff;
        }

        h.fill(0);
        this.r.fill(0);
        this.pad.fill(0);
        return mac;
    }
}

const ZERO_PAD = new Uint8Array(16);

function aeadTag(polyKey: Uint8Array, aad: Uint8Array, ct: Uint8Array): Uint8Array {
    const p = new Poly1305(polyKey);
    p.update(aad);
    if (aad.length % 16) p.update(ZERO_PAD.subarray(0, 16 - (aad.length % 16)));
    p.update(ct);
    if (ct.length % 16) p.update(ZERO_PAD.subarray(0, 16 - (ct.length % 16)));
    const lens = new Uint8Array(16);
    const view = new DataView(lens.buffer);
    view.setBigUint64(0, BigInt(aad.length), true);
    view.setBigUint64(8, BigInt(ct.length), true);
    p.update(lens);
    return p.digest();
}

function polyKeyFor(key: Uint8Array, nonce: Uint8Array): Uint8Array {
    return chacha20Xor(key, nonce, 0, new Uint8Array(64)).subarray(0, 32);
}

/** Returns ciphertext || 16-byte tag. */
export function chachaPolySeal(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Buffer {
    const polyKey = polyKeyFor(key, nonce);
    const ct = chacha20Xor(key, nonce, 1, plaintext);
    const tag = aeadTag(polyKey, aad, ct);
    polyKey.fill(0);
    return Buffer.concat([ct, tag]);
}

/** Accepts ciphertext || 16-byte tag. Throws when authentication fails. */
export function chachaPolyOpen(key: Uint8Array, nonce: Uint8Array, sealed: Uint8Array, aad: Uint8Array): Buffer {
    if (sealed.length < 16) throw new Error("ChaCha20-Poly1305: message too short");
    const ct = sealed.subarray(0, sealed.length - 16);
    const tag = sealed.subarray(sealed.length - 16);
    const polyKey = polyKeyFor(key, nonce);
    const expected = aeadTag(polyKey, aad, ct);
    polyKey.fill(0);
    if (!timingSafeEqual(expected, tag)) throw new Error("ChaCha20-Poly1305: authentication failed");
    return Buffer.from(chacha20Xor(key, nonce, 1, ct));
}

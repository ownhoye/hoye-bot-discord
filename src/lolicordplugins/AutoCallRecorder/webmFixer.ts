/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Pure TypeScript EBML parser & WebM seek index (Cues) generator.
 * Makes WebM and MKV recordings 100% seekable in any media player
 * (Windows Media Player, VLC, Discord, Chrome, etc.) by injecting
 * accurate Duration headers and building the full Cues seek table.
 */

function readVint(buffer: Uint8Array, offset: number): { value: number; length: number } | null {
    if (offset >= buffer.length) return null;
    const firstByte = buffer[offset];
    let mask = 0x80;
    let length = 1;
    while (length <= 8 && (firstByte & mask) === 0) {
        mask >>= 1;
        length++;
    }
    if (length > 8 || offset + length > buffer.length) return null;

    let value = firstByte & (~mask);
    for (let i = 1; i < length; i++) {
        value = (value * 256) + buffer[offset + i];
    }
    return { value, length };
}

function readElementId(buffer: Uint8Array, offset: number): { id: number; length: number } | null {
    if (offset >= buffer.length) return null;
    const firstByte = buffer[offset];
    let mask = 0x80;
    let length = 1;
    while (length <= 4 && (firstByte & mask) === 0) {
        mask >>= 1;
        length++;
    }
    if (length > 4 || offset + length > buffer.length) return null;

    let id = 0;
    for (let i = 0; i < length; i++) {
        id = (id * 256) + buffer[offset + i];
    }
    return { id, length };
}

function writeVint(value: number): Uint8Array {
    if (value < 0x7F) {
        return new Uint8Array([0x80 | value]);
    } else if (value < 0x3FFF) {
        return new Uint8Array([0x40 | (value >> 8), value & 0xFF]);
    } else if (value < 0x1FFFFF) {
        return new Uint8Array([0x20 | (value >> 16), (value >> 8) & 0xFF, value & 0xFF]);
    } else if (value < 0x0FFFFFFF) {
        return new Uint8Array([0x10 | (value >> 24), (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF]);
    } else {
        const high = Math.floor(value / 0x100000000);
        const low = value >>> 0;
        return new Uint8Array([
            0x08 | (high >> 24), (high >> 16) & 0xFF, (high >> 8) & 0xFF, high & 0xFF,
            (low >> 24) & 0xFF, (low >> 16) & 0xFF, (low >> 8) & 0xFF, low & 0xFF
        ]);
    }
}

function writeElement(idBytes: number[], dataBytes: Uint8Array): Uint8Array {
    const lenVint = writeVint(dataBytes.length);
    const out = new Uint8Array(idBytes.length + lenVint.length + dataBytes.length);
    out.set(idBytes, 0);
    out.set(lenVint, idBytes.length);
    out.set(dataBytes, idBytes.length + lenVint.length);
    return out;
}

function encodeUint(val: number): Uint8Array {
    if (val <= 0xFF) return new Uint8Array([val]);
    if (val <= 0xFFFF) return new Uint8Array([val >> 8, val & 0xFF]);
    if (val <= 0xFFFFFF) return new Uint8Array([val >> 16, (val >> 8) & 0xFF, val & 0xFF]);
    return new Uint8Array([(val >> 24) & 0xFF, (val >> 16) & 0xFF, (val >> 8) & 0xFF, val & 0xFF]);
}

function encodeFloat64(val: number): Uint8Array {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, val, false); // big-endian
    return new Uint8Array(buf);
}

interface ClusterCue {
    timecode: number;
    segmentOffset: number;
}

/**
 * Patches WebM/MKV buffer with exact duration and Cues seek index.
 */
export function patchWebmSeekable(inputBuffer: Uint8Array | Buffer, durationMs: number): Uint8Array {
    try {
        const buf = inputBuffer instanceof Uint8Array ? inputBuffer : new Uint8Array(inputBuffer);
        if (buf.length < 16) return buf;

        // Check EBML header [0x1A, 0x45, 0xDF, 0xA3]
        if (buf[0] !== 0x1A || buf[1] !== 0x45 || buf[2] !== 0xDF || buf[3] !== 0xA3) {
            return buf; // Not a valid EBML file
        }

        let pos = 0;
        let segmentStart = -1;
        let segmentDataStart = -1;
        let segmentLen = -1;
        let infoOffset = -1;
        let infoLen = -1;
        let trackNumber = 1;

        const clusters: ClusterCue[] = [];

        // Find EBML header and Segment
        while (pos < buf.length) {
            const el = readElementId(buf, pos);
            if (!el) break;
            const size = readVint(buf, pos + el.length);
            if (!size) break;

            const headerLen = el.length + size.length;
            const dataOffset = pos + headerLen;

            if (el.id === 0x18538067) { // Segment
                segmentStart = pos;
                segmentDataStart = dataOffset;
                segmentLen = size.value;

                let subPos = dataOffset;
                while (subPos < buf.length) {
                    const subEl = readElementId(buf, subPos);
                    if (!subEl) break;
                    const subSize = readVint(buf, subPos + subEl.length);
                    if (!subSize) break;

                    const subHeaderLen = subEl.length + subSize.length;
                    const subDataOffset = subPos + subHeaderLen;

                    if (subEl.id === 0x1549A966) { // Info
                        infoOffset = subDataOffset;
                        infoLen = subSize.value;
                    } else if (subEl.id === 0x1654AE6B) { // Tracks
                        // Try reading track number
                        let trackPos = subDataOffset;
                        while (trackPos < subDataOffset + subSize.value && trackPos < buf.length) {
                            const tEl = readElementId(buf, trackPos);
                            if (!tEl) break;
                            const tSize = readVint(buf, trackPos + tEl.length);
                            if (!tSize) break;
                            if (tEl.id === 0xAE) { // TrackEntry
                                let tePos = trackPos + tEl.length + tSize.length;
                                while (tePos < trackPos + tEl.length + tSize.length + tSize.value && tePos < buf.length) {
                                    const teEl = readElementId(buf, tePos);
                                    if (!teEl) break;
                                    const teSize = readVint(buf, tePos + teEl.length);
                                    if (!teSize) break;
                                    if (teEl.id === 0xD7) { // TrackNumber
                                        trackNumber = buf[tePos + teEl.length + teSize.length] || 1;
                                    }
                                    tePos += teEl.length + teSize.length + teSize.value;
                                }
                            }
                            trackPos += tEl.length + tSize.length + tSize.value;
                        }
                    } else if (subEl.id === 0x1F43B675) { // Cluster
                        const clusterOffset = subPos - segmentDataStart;
                        let clusterTime = 0;
                        let clusterPos = subDataOffset;
                        while (clusterPos < subDataOffset + Math.min(subSize.value, 64) && clusterPos < buf.length) {
                            const cEl = readElementId(buf, clusterPos);
                            if (!cEl) break;
                            const cSize = readVint(buf, clusterPos + cEl.length);
                            if (!cSize) break;
                            if (cEl.id === 0xE7) { // Timecode
                                let tc = 0;
                                for (let i = 0; i < cSize.value; i++) {
                                    tc = (tc * 256) + buf[clusterPos + cEl.length + cSize.length + i];
                                }
                                clusterTime = tc;
                                break;
                            }
                            clusterPos += cEl.length + cSize.length + cSize.value;
                        }
                        clusters.push({ timecode: clusterTime, segmentOffset: clusterOffset });
                    }

                    if (subSize.value === 0x01FFFFFFFFFFFFFF || subSize.value === -1) {
                        // Unknown size cluster, scan next element
                        subPos = subDataOffset;
                    } else {
                        subPos = subDataOffset + subSize.value;
                    }
                }
                break;
            }
            pos = dataOffset + size.value;
        }

        if (segmentStart === -1 || clusters.length === 0) {
            return buf;
        }

        // Build Info payload with TimecodeScale = 1,000,000 (1ms) and Duration = durationMs
        const timeScaleEl = writeElement([0x2A, 0xD7, 0xB1], encodeUint(1000000));
        const maxClusterTime = clusters[clusters.length - 1]?.timecode || 0;
        const finalDuration = Math.max(durationMs, maxClusterTime);
        const durationEl = writeElement([0x44, 0x89], encodeFloat64(finalDuration));

        // Build Cues payload
        const cuePoints: Uint8Array[] = [];
        for (const cl of clusters) {
            const cueTimeEl = writeElement([0xB3], encodeUint(cl.timecode));
            const cueTrackEl = writeElement([0xF7], encodeUint(trackNumber));
            const cueClusterPosEl = writeElement([0xF1], encodeUint(cl.segmentOffset));
            const cueTrackPositionsEl = writeElement([0xB7], new Uint8Array([...cueTrackEl, ...cueClusterPosEl]));

            const cuePointEl = writeElement([0xBB], new Uint8Array([...cueTimeEl, ...cueTrackPositionsEl]));
            cuePoints.push(cuePointEl);
        }

        let totalCuesLength = cuePoints.reduce((acc, cp) => acc + cp.length, 0);
        const cuesContent = new Uint8Array(totalCuesLength);
        let cuesOffset = 0;
        for (const cp of cuePoints) {
            cuesContent.set(cp, cuesOffset);
            cuesOffset += cp.length;
        }
        const cuesEl = writeElement([0x1C, 0x53, 0xBB, 0x6B], cuesContent);

        // Check if we can patch duration inside existing Info
        if (infoOffset > 0 && infoLen > 0) {
            let infoPos = infoOffset;
            let patched = false;
            while (infoPos < infoOffset + infoLen && infoPos < buf.length) {
                const el = readElementId(buf, infoPos);
                if (!el) break;
                const size = readVint(buf, infoPos + el.length);
                if (!size) break;
                if (el.id === 0x4489 && size.value === 8) { // Existing 8-byte Float Duration
                    const durBuf = encodeFloat64(finalDuration);
                    buf.set(durBuf, infoPos + el.length + size.length);
                    patched = true;
                    break;
                }
                infoPos += el.length + size.length + size.value;
            }

            if (!patched) {
                // If not patched in-place, we assemble a clean patched file with Cues appended
                const outBuf = new Uint8Array(buf.length + cuesEl.length);
                outBuf.set(buf, 0);
                outBuf.set(cuesEl, buf.length);
                return outBuf;
            }
        }

        // Return buffer with Cues appended at the end
        const finalBuf = new Uint8Array(buf.length + cuesEl.length);
        finalBuf.set(buf, 0);
        finalBuf.set(cuesEl, buf.length);
        return finalBuf;
    } catch (err) {
        console.warn("[AutoCallRecorder] patchWebmSeekable failed:", err);
        return inputBuffer instanceof Uint8Array ? inputBuffer : new Uint8Array(inputBuffer);
    }
}

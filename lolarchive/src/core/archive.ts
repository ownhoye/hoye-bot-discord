/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomBytes } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { FileHandle, lstat, mkdir, open, readdir, rename, rm, utimes } from "fs/promises";
import { basename, join, resolve, sep } from "path";
import { PassThrough, Readable, Transform, TransformCallback, Writable } from "stream";
import { pipeline } from "stream/promises";
import { brotliCompressSync, brotliDecompressSync, constants as zc, createBrotliCompress, createBrotliDecompress } from "zlib";

import { ArchiveKeys, deriveKeys, wipeKeys } from "./crypto";
import {
    ArchiveEntry, ArchiveHeader, ArchiveIndex, Compression, CorruptArchiveError, DEFAULT_CHUNK_SIZE, DEFAULT_ITERATIONS,
    decodeFrame, decodeHeader, encodeFrame, encodeHeader, FRAME_FINAL, FRAME_HEADER_SIZE, HEADER_SIZE, maxFramePayload,
    MAX_INDEX_FRAME, parseIndex, serializeIndex
} from "./format";

export class PasswordRequiredError extends Error {
    constructor() {
        super("Cette archive est protégée par un mot de passe.");
        this.name = "PasswordRequiredError";
    }
}

export type CompressionPreset = "store" | "fast" | "normal" | "max";

export interface Progress {
    done: number;
    total: number;
    current: string;
}

export interface CreateOptions {
    sources: string[];
    output: string;
    password?: string;
    compression?: CompressionPreset;
    iterations?: number;
    onProgress?: (p: Progress) => void;
    signal?: AbortSignal;
}

interface SourceEntry extends ArchiveEntry {
    abs: string;
}

const BROTLI_QUALITY: Record<Exclude<CompressionPreset, "store">, number> = { fast: 4, normal: 7, max: 11 };

async function collectEntries(sources: string[]): Promise<SourceEntry[]> {
    const out: SourceEntry[] = [];
    const taken = new Set<string>();

    const uniqueRoot = (name: string) => {
        let candidate = name;
        for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${name} (${i})`;
        taken.add(candidate.toLowerCase());
        return candidate;
    };

    const walk = async (abs: string, rel: string) => {
        const st = await lstat(abs);
        if (st.isSymbolicLink()) return;
        if (st.isDirectory()) {
            out.push({ abs, path: rel, type: "dir", size: 0, mtime: st.mtimeMs });
            const children = (await readdir(abs)).sort((a, b) => a.localeCompare(b));
            for (const child of children) await walk(join(abs, child), `${rel}/${child}`);
        } else if (st.isFile()) {
            out.push({ abs, path: rel, type: "file", size: st.size, mtime: st.mtimeMs });
        }
    };

    for (const src of sources) {
        const abs = resolve(src);
        await walk(abs, uniqueRoot(basename(abs)));
    }
    return out;
}

/** Splits the data stream into chunk-sized sealed frames; the last one is marked final. */
class FrameEncoder extends Transform {
    private pending: Buffer[] = [];
    private pendingLength = 0;
    private counter = 1n;

    constructor(private header: ArchiveHeader, private keys: ArchiveKeys | null, preamble: Buffer) {
        super();
        this.push(preamble);
    }

    override _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
        try {
            this.pending.push(chunk);
            this.pendingLength += chunk.length;
            const size = this.header.chunkSize;
            // Keep at least one byte back so the final frame is never empty unless the stream is.
            while (this.pendingLength > size) {
                const all = Buffer.concat(this.pending, this.pendingLength);
                this.push(encodeFrame(this.header, this.keys, this.counter++, false, all.subarray(0, size)));
                const rest = all.subarray(size);
                this.pending = [rest];
                this.pendingLength = rest.length;
            }
            cb();
        } catch (err) {
            cb(err as Error);
        }
    }

    override _flush(cb: TransformCallback) {
        try {
            const rest = Buffer.concat(this.pending, this.pendingLength);
            this.push(encodeFrame(this.header, this.keys, this.counter++, true, rest));
            this.pending = [];
            cb();
        } catch (err) {
            cb(err as Error);
        }
    }
}

export async function createArchive(opts: CreateOptions): Promise<{ entries: number; bytes: number; }> {
    if (!opts.sources.length) throw new Error("Aucun fichier à ajouter.");
    const entries = await collectEntries(opts.sources);
    const total = entries.reduce((n, e) => n + e.size, 0);
    const preset = opts.compression ?? "normal";
    const encrypted = !!opts.password;

    const header = decodeHeader(encodeHeader({
        encrypted,
        compression: preset === "store" ? Compression.Store : Compression.Brotli,
        level: preset === "store" ? 0 : BROTLI_QUALITY[preset],
        iterations: encrypted ? (opts.iterations ?? DEFAULT_ITERATIONS) : 0,
        chunkSize: DEFAULT_CHUNK_SIZE,
        salt: randomBytes(32),
        aesNonce: randomBytes(12),
        chachaNonce: randomBytes(12)
    }));

    const keys = encrypted ? await deriveKeys(opts.password!, header.salt, header.iterations) : null;
    const tmp = `${opts.output}.part`;

    try {
        const index: ArchiveIndex = {
            version: 1,
            createdAt: Date.now(),
            entries: entries.map(({ path, type, size, mtime }) => ({ path, type, size, mtime }))
        };
        const indexData = brotliCompressSync(Buffer.from(serializeIndex(index), "utf8"));
        if (indexData.length > MAX_INDEX_FRAME) throw new Error("Trop de fichiers dans une seule archive.");
        const preamble = Buffer.concat([header.raw, encodeFrame(header, keys, 0n, false, indexData)]);

        let done = 0;
        async function* fileData() {
            for (const e of entries) {
                if (e.type !== "file") continue;
                opts.onProgress?.({ done, total, current: e.path });
                let read = 0;
                for await (const chunk of createReadStream(e.abs, { highWaterMark: 1 << 20 })) {
                    const buf = chunk as Buffer;
                    read += buf.length;
                    if (read > e.size) break;
                    done += buf.length;
                    opts.onProgress?.({ done, total, current: e.path });
                    yield buf;
                }
                if (read !== e.size) throw new Error(`Le fichier "${e.path}" a été modifié pendant la compression.`);
            }
        }

        const compressor = header.compression === Compression.Brotli
            ? createBrotliCompress({
                params: {
                    [zc.BROTLI_PARAM_QUALITY]: header.level,
                    [zc.BROTLI_PARAM_LGWIN]: preset === "max" ? 24 : 22,
                    [zc.BROTLI_PARAM_SIZE_HINT]: Math.min(total, 0xffffffff)
                }
            })
            : new PassThrough();

        await pipeline(
            Readable.from(fileData(), { objectMode: false }),
            compressor,
            new FrameEncoder(header, keys, preamble),
            createWriteStream(tmp),
            { signal: opts.signal }
        );
        await rename(tmp, opts.output);
        return { entries: entries.length, bytes: total };
    } catch (err) {
        await rm(tmp, { force: true }).catch(() => { });
        throw err;
    } finally {
        wipeKeys(keys);
    }
}

export interface OpenedArchive {
    path: string;
    header: ArchiveHeader;
    index: ArchiveIndex;
    keys: ArchiveKeys | null;
    totalSize: number;
}

async function readExactly(fh: FileHandle, length: number, position: number): Promise<Buffer> {
    const buf = Buffer.alloc(length);
    let got = 0;
    while (got < length) {
        const { bytesRead } = await fh.read(buf, got, length - got, position + got);
        if (bytesRead === 0) throw new CorruptArchiveError("fichier tronqué");
        got += bytesRead;
    }
    return buf;
}

/** Reads the header and index. Throws PasswordRequiredError / WrongPasswordError when relevant. */
export async function openArchive(path: string, password?: string): Promise<OpenedArchive> {
    const fh = await open(path, "r");
    let keys: ArchiveKeys | null = null;
    try {
        const header = decodeHeader(await readExactly(fh, HEADER_SIZE, 0));
        if (header.encrypted && !password) throw new PasswordRequiredError();

        const fhead = await readExactly(fh, FRAME_HEADER_SIZE, HEADER_SIZE);
        const len = fhead.readUInt32BE(1);
        if (fhead[0] !== 0 || len > maxFramePayload(header, 0n)) throw new CorruptArchiveError("index invalide");
        const payload = await readExactly(fh, len, HEADER_SIZE + FRAME_HEADER_SIZE);

        if (header.encrypted) keys = await deriveKeys(password!, header.salt, header.iterations);
        const data = decodeFrame(header, keys, 0n, 0, payload);

        let json: string;
        try {
            json = brotliDecompressSync(data, { maxOutputLength: 256 << 20 }).toString("utf8");
        } catch {
            throw new CorruptArchiveError("index illisible");
        }
        const index = parseIndex(json);
        const totalSize = index.entries.reduce((n, e) => n + e.size, 0);
        return { path, header, index, keys, totalSize };
    } catch (err) {
        wipeKeys(keys);
        throw err;
    } finally {
        await fh.close();
    }
}

export function closeArchive(a: OpenedArchive) {
    wipeKeys(a.keys);
    a.keys = null;
}

/** Parses frames from the raw file (after the header), authenticates them and emits data frames. */
class FrameDecoder extends Transform {
    private chunks: Buffer[] = [];
    private length = 0;
    private counter = 0n;
    private finished = false;

    constructor(private header: ArchiveHeader, private keys: ArchiveKeys | null) {
        super();
    }

    private takeBytes(n: number): Buffer {
        const all = Buffer.concat(this.chunks, this.length);
        const head = all.subarray(0, n);
        const rest = all.subarray(n);
        this.chunks = rest.length ? [rest] : [];
        this.length = rest.length;
        return head;
    }

    private peekHeader(): Buffer {
        if (this.chunks[0].length < FRAME_HEADER_SIZE) {
            const all = Buffer.concat(this.chunks, this.length);
            this.chunks = [all];
        }
        return this.chunks[0];
    }

    override _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
        try {
            this.chunks.push(chunk);
            this.length += chunk.length;
            while (this.length >= FRAME_HEADER_SIZE) {
                if (this.finished) throw new CorruptArchiveError("données en trop après la fin");
                const fh = this.peekHeader();
                const flags = fh[0];
                const len = fh.readUInt32BE(1);
                if ((flags & ~FRAME_FINAL) !== 0 || len > maxFramePayload(this.header, this.counter))
                    throw new CorruptArchiveError("bloc invalide");
                if (this.length < FRAME_HEADER_SIZE + len) break;

                const frame = this.takeBytes(FRAME_HEADER_SIZE + len);
                const counter = this.counter++;
                if (counter === 0n) continue;
                const data = decodeFrame(this.header, this.keys, counter, flags, frame.subarray(FRAME_HEADER_SIZE));
                if (flags & FRAME_FINAL) this.finished = true;
                if (data.length) this.push(data);
            }
            cb();
        } catch (err) {
            cb(err as Error);
        }
    }

    override _flush(cb: TransformCallback) {
        if (!this.finished || this.length !== 0) cb(new CorruptArchiveError("archive tronquée"));
        else cb();
    }
}

/** Routes the decompressed data stream into the individual files, in index order. */
class EntryWriter extends Writable {
    private next = 0;
    private fh: FileHandle | null = null;
    private current: ArchiveEntry | null = null;
    private currentTarget = "";
    private remaining = 0;
    private done = 0;

    constructor(
        private files: ArchiveEntry[],
        private targetFor: (e: ArchiveEntry) => string | null,
        private onProgress?: (p: Progress) => void,
        private total = 0
    ) {
        super();
    }

    /** Opens the next file with data, materialising any empty files on the way. */
    private async advance(): Promise<boolean> {
        while (this.next < this.files.length) {
            const e = this.files[this.next++];
            const target = this.targetFor(e);
            if (target) await mkdir(resolve(target, ".."), { recursive: true });
            if (e.size === 0) {
                if (target) {
                    await (await open(target, "wx")).close();
                    await utimes(target, new Date(e.mtime), new Date(e.mtime)).catch(() => { });
                }
                continue;
            }
            this.current = e;
            this.currentTarget = target ?? "";
            this.remaining = e.size;
            this.fh = target ? await open(target, "wx") : null;
            if (this.destroyed && this.fh) {
                await this.fh.close();
                this.fh = null;
                return false;
            }
            if (this.fh) this.onProgress?.({ done: this.done, total: this.total, current: e.path });
            return true;
        }
        return false;
    }

    private async finishCurrent() {
        if (this.fh) {
            await this.fh.close();
            this.fh = null;
            const m = new Date(this.current!.mtime);
            await utimes(this.currentTarget, m, m).catch(() => { });
        }
        this.current = null;
    }

    private async consume(chunk: Buffer) {
        let off = 0;
        while (off < chunk.length) {
            if (!this.current && !(await this.advance())) throw new CorruptArchiveError("données en trop");
            const n = Math.min(this.remaining, chunk.length - off);
            if (this.fh) {
                let written = 0;
                while (written < n) written += (await this.fh.write(chunk, off + written, n - written)).bytesWritten;
            }
            off += n;
            this.remaining -= n;
            if (this.fh) {
                this.done += n;
                this.onProgress?.({ done: this.done, total: this.total, current: this.current!.path });
            }
            if (this.remaining === 0) await this.finishCurrent();
        }
    }

    override _write(chunk: Buffer, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
        this.consume(chunk).then(() => cb(), cb);
    }

    override _final(cb: (err?: Error | null) => void) {
        (async () => {
            if (this.current || await this.advance()) throw new CorruptArchiveError("archive incomplète");
        })().then(() => cb(), cb);
    }

    override _destroy(err: Error | null, cb: (err?: Error | null) => void) {
        const fh = this.fh;
        this.fh = null;
        (fh ? fh.close() : Promise.resolve()).catch(() => { }).finally(() => cb(err));
    }
}

export interface ExtractOptions {
    destination: string;
    /** Archive paths to extract (a directory selects everything below it). All entries when omitted. */
    only?: string[];
    onProgress?: (p: Progress) => void;
    signal?: AbortSignal;
}

export async function extractArchive(archive: OpenedArchive, opts: ExtractOptions): Promise<void> {
    const { header, index, keys } = archive;
    if (header.encrypted && !keys) throw new PasswordRequiredError();

    const root = resolve(opts.destination);
    const only = opts.only ? new Set(opts.only) : null;
    const isSelected = (p: string) => {
        if (!only) return true;
        const parts = p.split("/");
        for (let i = parts.length; i > 0; i--) if (only.has(parts.slice(0, i).join("/"))) return true;
        return false;
    };
    const targetFor = (e: ArchiveEntry) => {
        if (!isSelected(e.path)) return null;
        const target = resolve(root, ...e.path.split("/"));
        if (!target.startsWith(root + sep)) throw new CorruptArchiveError("chemin de fichier dangereux");
        return target;
    };

    await mkdir(root, { recursive: true });
    for (const e of index.entries) {
        if (e.type !== "dir") continue;
        const target = targetFor(e);
        if (target) await mkdir(target, { recursive: true });
    }

    const files = index.entries.filter(e => e.type === "file");
    const total = files.reduce((n, e) => n + (isSelected(e.path) ? e.size : 0), 0);
    await pipeline(
        createReadStream(archive.path, { start: HEADER_SIZE, highWaterMark: 1 << 20 }),
        new FrameDecoder(header, keys),
        header.compression === Compression.Brotli ? createBrotliDecompress() : new PassThrough(),
        new EntryWriter(files, targetFor, opts.onProgress, total),
        { signal: opts.signal }
    );

    // Directory timestamps last, since writing files into them bumps their mtime.
    for (const e of index.entries) {
        if (e.type !== "dir") continue;
        const target = targetFor(e);
        if (target) await utimes(target, new Date(e.mtime), new Date(e.mtime)).catch(() => { });
    }
}

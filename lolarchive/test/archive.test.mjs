/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { brotliCompressSync } from "node:zlib";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");
const { createArchive, openArchive, extractArchive, closeArchive, PasswordRequiredError, WrongPasswordError, CorruptArchiveError } = core;

const work = mkdtempSync(join(tmpdir(), "lolarchive-test-"));
after(() => rmSync(work, { recursive: true, force: true }));

// Fewer PBKDF2 rounds keep the suite fast; the minimum accepted by the reader is 100k.
const ITER = 100_000;

function makeTree(name) {
    const root = join(work, name);
    mkdirSync(join(root, "sous dossier", "vide"), { recursive: true });
    writeFileSync(join(root, "texte.txt"), "salut les potes\n".repeat(1000));
    writeFileSync(join(root, "vide.bin"), "");
    writeFileSync(join(root, "sous dossier", "gros.bin"), randomBytes(3 * 1024 * 1024 + 17));
    writeFileSync(join(root, "sous dossier", "accentue-eee.txt"), "cafe");
    return root;
}

function assertSameFile(a, b) {
    assert.ok(readFileSync(a).equals(readFileSync(b)), `${a} != ${b}`);
}

for (const compression of ["store", "fast", "normal"]) {
    for (const password of [undefined, "mot de passe secret"]) {
        test(`round trip (${compression}, ${password ? "chiffre" : "sans mot de passe"})`, async () => {
            const src = makeTree(`src-${compression}-${!!password}`);
            const out = join(work, `a-${compression}-${!!password}.lol`);
            await createArchive({ sources: [src], output: out, password, compression, iterations: ITER });

            const a = await openArchive(out, password);
            assert.equal(a.header.encrypted, !!password);
            const name = src.split(/[\\/]/).pop();
            const paths = a.index.entries.map(e => e.path).sort();
            assert.deepEqual(paths, [
                name, `${name}/sous dossier`, `${name}/sous dossier/accentue-eee.txt`, `${name}/sous dossier/gros.bin`,
                `${name}/sous dossier/vide`, `${name}/texte.txt`, `${name}/vide.bin`
            ].sort());

            const dest = join(work, `x-${compression}-${!!password}`);
            let last = 0;
            await extractArchive(a, { destination: dest, onProgress: p => { last = p.done; assert.ok(p.done <= p.total); } });
            closeArchive(a);
            assert.equal(last, a.totalSize);
            for (const f of ["texte.txt", "vide.bin", "sous dossier/gros.bin", "sous dossier/accentue-eee.txt"])
                assertSameFile(join(src, f), join(dest, name, f));
            assert.ok(statSync(join(dest, name, "sous dossier", "vide")).isDirectory());
        });
    }
}

test("names are hidden when encrypted", async () => {
    const src = makeTree("hidden");
    const out = join(work, "hidden.xxx");
    await createArchive({ sources: [src], output: out, password: "pw", iterations: ITER });
    const raw = readFileSync(out);
    assert.equal(raw.indexOf("texte.txt"), -1);
    assert.equal(raw.indexOf("salut les potes"), -1);
});

test("password required, wrong password rejected", async () => {
    const src = makeTree("pw");
    const out = join(work, "pw.lol");
    await createArchive({ sources: [src], output: out, password: "bon", iterations: ITER });
    await assert.rejects(openArchive(out), PasswordRequiredError);
    await assert.rejects(openArchive(out, "mauvais"), WrongPasswordError);
});

test("tampered data frame is detected", async () => {
    const src = makeTree("tamper");
    for (const password of [undefined, "pw"]) {
        const out = join(work, `tamper-${!!password}.lol`);
        await createArchive({ sources: [src], output: out, password, compression: "store", iterations: ITER });
        const raw = readFileSync(out);
        raw[raw.length - 100] ^= 0x01;
        writeFileSync(out, raw);
        const a = await openArchive(out, password);
        await assert.rejects(extractArchive(a, { destination: join(work, `tamper-out-${!!password}`) }));
        closeArchive(a);
    }
});

test("truncated archive is detected", async () => {
    const src = makeTree("trunc");
    const out = join(work, "trunc.lol");
    await createArchive({ sources: [src], output: out, password: "pw", compression: "store", iterations: ITER });
    const raw = readFileSync(out);

    // Locate the start of the last frame so it can be dropped cleanly.
    let pos = 76, lastStart = pos;
    while (pos < raw.length) {
        lastStart = pos;
        pos += 5 + raw.readUInt32BE(pos + 1);
    }
    assert.equal(pos, raw.length);

    for (const [label, cut] of [["mid-frame", raw.length - 1000], ["frame boundary", lastStart]]) {
        const p = join(work, `trunc-${label}.lol`);
        writeFileSync(p, raw.subarray(0, cut));
        const a = await openArchive(p, "pw");
        await assert.rejects(extractArchive(a, { destination: join(work, `trunc-out-${label}`) }), CorruptArchiveError);
        closeArchive(a);
    }
});

test("selective extraction", async () => {
    const src = makeTree("sel");
    const out = join(work, "sel.lol");
    await createArchive({ sources: [src], output: out, iterations: ITER });
    const a = await openArchive(out);
    const dest = join(work, "sel-out");
    await extractArchive(a, { destination: dest, only: ["sel/sous dossier"] });
    assertSameFile(join(src, "sous dossier", "gros.bin"), join(dest, "sel", "sous dossier", "gros.bin"));
    assert.throws(() => statSync(join(dest, "sel", "texte.txt")));
});

test("path traversal entries are refused", async () => {
    const { encodeHeader, encodeFrame, decodeHeader } = core.format;
    const header = decodeHeader(encodeHeader({
        encrypted: false, compression: 0, level: 0, iterations: 0, chunkSize: 1 << 20,
        salt: Buffer.alloc(32), aesNonce: Buffer.alloc(12), chachaNonce: Buffer.alloc(12)
    }));
    for (const evil of ["../evil.txt", "a/../../evil.txt", "/etc/evil", "C:/evil.txt", "a\\..\\evil.txt", "a/./b"]) {
        const out = join(work, "evil.lol");
        const index = JSON.stringify({ version: 1, createdAt: 0, entries: [{ p: evil, t: "f", s: 1, m: 0 }] });
        writeFileSync(out, Buffer.concat([
            header.raw,
            encodeFrame(header, null, 0n, false, brotliCompressSync(Buffer.from(index))),
            encodeFrame(header, null, 1n, true, Buffer.from("x"))
        ]));
        await assert.rejects(openArchive(out), CorruptArchiveError, evil);
    }
});

test("not an archive", async () => {
    const out = join(work, "random.lol");
    writeFileSync(out, randomBytes(500));
    await assert.rejects(openArchive(out), CorruptArchiveError);
});

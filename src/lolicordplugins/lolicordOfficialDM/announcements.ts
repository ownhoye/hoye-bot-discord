/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

// Announcements live in announcements.json at the root of the LoliCord repository.
// Everyone reads the public raw file; the owner writes it through the GitHub API.
const REPO = "ownhoye/hoye-bot-discord";
const BRANCH = "main";
const FILE = "announcements.json";
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${FILE}`;
const API_URL = `https://api.github.com/repos/${REPO}/contents/${FILE}`;
const TOKEN_KEY = "lolicord_announcements_github_token";
const DISCORD_EPOCH = 1420070400000n;

export interface Announcement {
    id: string;
    content: string;
    created_at: string;
    image?: string;
}

function isAnnouncement(value: any): value is Announcement {
    return value != null
        && typeof value.id === "string"
        && typeof value.content === "string"
        && typeof value.created_at === "string";
}

function encodeBase64(text: string) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
}

function decodeBase64(base64: string) {
    const binary = atob(base64.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

/** Snowflake for "now", so Discord sorts and timestamps announcements like real messages. */
function newSnowflake() {
    return ((BigInt(Date.now()) - DISCORD_EPOCH) << 22n).toString();
}

/** Public list for every user. Returns null when the file could not be fetched. */
export async function fetchAnnouncements(): Promise<Announcement[] | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(`${RAW_URL}?t=${Date.now()}`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) return null;
        const data = await res.json();
        return Array.isArray(data) ? data.filter(isAnnouncement) : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

export const getGithubToken = async () => (await DataStore.get<string>(TOKEN_KEY)) || null;
export const setGithubToken = (token: string) => DataStore.set(TOKEN_KEY, token.trim());
export const clearGithubToken = () => DataStore.del(TOKEN_KEY);

async function githubRequest(token: string, init?: RequestInit) {
    const res = await fetch(`${API_URL}?ref=${BRANCH}`, {
        ...init,
        cache: "no-store",
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
            ...init?.headers
        }
    });
    if (res.status === 401 || res.status === 403) {
        throw new Error("GitHub refused the token (check that it has write access to the repository contents).");
    }
    return res;
}

/** Reads the current file through the API (fresh, with its sha) for an update. */
async function readForWrite(token: string): Promise<{ list: Announcement[]; sha?: string; }> {
    const res = await githubRequest(token);
    if (res.status === 404) return { list: [] };
    if (!res.ok) throw new Error(`GitHub error ${res.status}`);
    const data = await res.json();
    const parsed = JSON.parse(decodeBase64(data.content ?? "W10="));
    return { list: Array.isArray(parsed) ? parsed.filter(isAnnouncement) : [], sha: data.sha };
}

async function writeList(token: string, list: Announcement[], sha: string | undefined, message: string) {
    const res = await githubRequest(token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            message,
            branch: BRANCH,
            sha,
            content: encodeBase64(JSON.stringify(list, null, 4) + "\n")
        })
    });
    if (res.status === 409 || res.status === 422) throw new Error("The file changed at the same time, please try again.");
    if (!res.ok) throw new Error(`GitHub error ${res.status}`);
}

export async function publishAnnouncement(token: string, content: string, image?: string): Promise<Announcement> {
    const { list, sha } = await readForWrite(token);
    const announcement: Announcement = {
        id: newSnowflake(),
        content: content.trim(),
        created_at: new Date().toISOString(),
        ...(image?.trim() ? { image: image.trim() } : {})
    };
    await writeList(token, [...list, announcement], sha, "chore(announcements): publish announcement");
    return announcement;
}

export async function deleteAnnouncement(token: string, id: string) {
    const { list, sha } = await readForWrite(token);
    const next = list.filter(a => a.id !== id);
    if (next.length === list.length) return;
    await writeList(token, next, sha, "chore(announcements): delete announcement");
}

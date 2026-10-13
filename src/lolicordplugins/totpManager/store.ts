/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Nightcord Team
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { TOTPAlgorithm } from "./totp";

export interface TotpAccount {
    id: string;
    name: string;
    issuer?: string;
    secret: string;
    digits?: number;
    period?: number;
    algorithm?: TOTPAlgorithm;
    color?: string;
    createdAt: number;
}

const STORE_KEY = "lolicord_totp_accounts_v1";

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeTotpStore(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notify() {
    listeners.forEach(l => l());
}

let cachedAccounts: TotpAccount[] | null = null;

export async function getTotpAccounts(): Promise<TotpAccount[]> {
    if (cachedAccounts !== null) return [...cachedAccounts];
    try {
        const stored = await DataStore.get<TotpAccount[]>(STORE_KEY);
        cachedAccounts = Array.isArray(stored) ? stored : [];
    } catch {
        cachedAccounts = [];
    }
    return [...cachedAccounts];
}

export function getCachedTotpAccounts(): TotpAccount[] {
    return cachedAccounts ? [...cachedAccounts] : [];
}

export async function saveTotpAccounts(accounts: TotpAccount[]): Promise<void> {
    cachedAccounts = [...accounts];
    await DataStore.set(STORE_KEY, cachedAccounts);
    notify();
}

export async function addTotpAccount(account: Omit<TotpAccount, "id" | "createdAt">): Promise<TotpAccount> {
    const accounts = await getTotpAccounts();
    const newAccount: TotpAccount = {
        ...account,
        id: "totp_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9),
        createdAt: Date.now()
    };
    accounts.unshift(newAccount);
    await saveTotpAccounts(accounts);
    return newAccount;
}

export async function updateTotpAccount(id: string, updates: Partial<TotpAccount>): Promise<void> {
    const accounts = await getTotpAccounts();
    const idx = accounts.findIndex(a => a.id === id);
    if (idx !== -1) {
        accounts[idx] = { ...accounts[idx], ...updates };
        await saveTotpAccounts(accounts);
    }
}

export async function deleteTotpAccount(id: string): Promise<void> {
    const accounts = await getTotpAccounts();
    const filtered = accounts.filter(a => a.id !== id);
    await saveTotpAccounts(filtered);
}

export async function exportTotpAccountsJson(): Promise<string> {
    const accounts = await getTotpAccounts();
    return JSON.stringify(accounts, null, 2);
}

export function resetCachedTotpAccounts() {
    cachedAccounts = null;
}

export async function importTotpAccountsJson(jsonStr: string, overwrite = false): Promise<number> {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) throw new Error("Format JSON invalide");

    // Force fresh read from DataStore
    const current = (await DataStore.get<TotpAccount[]>(STORE_KEY)) || [];
    let count = 0;

    for (const item of parsed) {
        if (item && typeof item.secret === "string" && typeof item.name === "string") {
            const cleanSec = item.secret.toUpperCase().replace(/\s/g, "");
            const existsIdx = current.findIndex(c => c.secret.toUpperCase().replace(/\s/g, "") === cleanSec);
            if (existsIdx === -1) {
                current.push({
                    id: item.id || ("totp_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9)),
                    name: item.name,
                    issuer: item.issuer || undefined,
                    secret: item.secret,
                    digits: item.digits || 6,
                    period: item.period || 30,
                    algorithm: item.algorithm || "SHA-1",
                    color: item.color || undefined,
                    createdAt: item.createdAt || Date.now()
                });
                count++;
            } else if (overwrite) {
                current[existsIdx] = {
                    ...current[existsIdx],
                    name: item.name,
                    issuer: item.issuer || current[existsIdx].issuer,
                    secret: item.secret,
                    digits: item.digits || current[existsIdx].digits,
                    period: item.period || current[existsIdx].period,
                    algorithm: item.algorithm || current[existsIdx].algorithm,
                    color: item.color || current[existsIdx].color,
                };
                count++;
            }
        }
    }

    cachedAccounts = [...current];
    await DataStore.set(STORE_KEY, cachedAccounts);
    notify();

    return count > 0 ? count : parsed.length;
}

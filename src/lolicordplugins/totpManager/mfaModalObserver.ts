/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Nightcord Team
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { copyWithToast } from "@utils/discord";
import { FluxDispatcher, showToast, Toasts, UserStore } from "@webpack/common";
import { t } from "../autoTranslateLoliCord";
import { getServiceBrand } from "./brandIcons";
import { addTotpAccount, getTotpAccounts, TotpAccount } from "./store";
import { generateTOTP } from "./totp";

let modalObserver: MutationObserver | null = null;
const activeCardTimers = new Set<ReturnType<typeof setInterval>>();
let mfaObserverPending = false;
let lastLoginEmail = "";
let lastLoginUsername = "";

// Initialize last login email from localStorage if available
try {
    lastLoginEmail = localStorage.getItem("lolicord_last_login_email") || "";
} catch {}

function setLastLoginIdentifier(identifier: string) {
    if (!identifier || typeof identifier !== "string") return;
    const clean = identifier.trim().toLowerCase();
    if (clean.includes("@")) {
        lastLoginEmail = clean;
        lastLoginUsername = clean.split("@")[0];
        try {
            localStorage.setItem("lolicord_last_login_email", clean);
        } catch {}
    } else if (clean.length > 2) {
        lastLoginUsername = clean;
    }
}

// Global listener for email/login input fields
function handleGlobalInput(e: Event) {
    const target = e.target as HTMLInputElement;
    if (!target || target.tagName !== "INPUT") return;

    const type = target.type?.toLowerCase();
    const name = target.name?.toLowerCase() || "";
    const placeholder = target.placeholder?.toLowerCase() || "";
    const autocomplete = target.autocomplete?.toLowerCase() || "";

    if (
        type === "email" ||
        name === "email" ||
        name === "login" ||
        autocomplete === "username" ||
        autocomplete === "email" ||
        placeholder.includes("email") ||
        placeholder.includes("e-mail") ||
        placeholder.includes("phone")
    ) {
        if (target.value && target.value.trim().length > 3) {
            setLastLoginIdentifier(target.value);
        }
    }
}

// Flux action listener for login events
function handleFluxDispatch(action: any) {
    if (!action) return;
    if (action.type === "LOGIN_ATTEMPT" || action.type === "LOGIN_SUBMIT" || action.type === "SET_LOGIN_CREDENTIALS") {
        if (action.login) setLastLoginIdentifier(action.login);
        if (action.email) setLastLoginIdentifier(action.email);
    } else if (action.type === "LOGIN_MFA_STEP") {
        if (action.ticket?.user?.email) setLastLoginIdentifier(action.ticket.user.email);
        if (action.ticket?.user?.username) setLastLoginIdentifier(action.ticket.user.username);
    }
}

// ─── Smart Account Matching Algorithm ─────────────────────────────────────────

function rankTotpAccount(account: TotpAccount, targetEmail: string, targetUsername: string): number {
    const accName = account.name.toLowerCase();
    const accIssuer = (account.issuer || "").toLowerCase();
    const tEmail = targetEmail.toLowerCase();
    const tUser = targetUsername.toLowerCase();

    // 1. Exact email match in name or issuer
    if (tEmail && (accName.includes(tEmail) || accIssuer.includes(tEmail))) {
        return 100;
    }

    // 2. Email username part match (e.g. "alex" from "alex@gmail.com")
    if (tUser && (accName.includes(tUser) || accIssuer.includes(tUser))) {
        return 80;
    }

    // 3. Current logged in user match
    const curr = UserStore.getCurrentUser();
    if (curr) {
        const cEmail = curr.email?.toLowerCase();
        const cUser = curr.username?.toLowerCase();
        const cGlobal = curr.globalName?.toLowerCase();

        if (cEmail && (accName.includes(cEmail) || accIssuer.includes(cEmail))) return 90;
        if (cUser && (accName.includes(cUser) || accIssuer.includes(cUser))) return 70;
        if (cGlobal && (accName.includes(cGlobal) || accIssuer.includes(cGlobal))) return 70;
    }

    // 4. Discord-labeled account
    if (accName.includes("discord") || accIssuer.includes("discord")) {
        return 50;
    }

    return 10;
}

// ─── Input Code Filler ────────────────────────────────────────────────────────

function fillCodeIntoInput(input: HTMLInputElement, code: string) {
    if (!input || !code) return;

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
    )?.set;

    if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, code);
    } else {
        input.value = code;
    }

    input.dataset.lolicordFilledCode = code;

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();

    // Trigger Enter key press events
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));

    // Attempt automatic submit if form or submit button exists
    const modalOrForm = input.closest("form") || input.closest('[data-mana-component="modal"], [class*="modal__"], [role="dialog"]');
    const submitBtn = modalOrForm?.querySelector<HTMLButtonElement>(
        'button[type="submit"], [class*="submitButton__"], [class*="lookFilled__"][class*="colorPrimary__"], button[class*="primaryButton_"]'
    );
    if (submitBtn && !submitBtn.disabled) {
        setTimeout(() => {
            submitBtn.click();
        }, 100);
    }
}

// ─── 2FA Auto-Fill Suggestion Card Injection & Manual Click Entry ─────────────

function isInside2FASetupModal(el: HTMLElement): boolean {
    const modal = el.closest('[data-mana-component="modal"], [class*="modal__"], [class*="container__8a031"], [role="dialog"]');
    if (!modal) return false;
    const hasSecret = !!modal.querySelector('[class*="secret__"], .secret__07d82, [class*="qrCode_"], img[alt*="qr" i], [class*="qrCodeOverlay_"], .lolicord-2fa-quickadd-btn');
    const modalText = modal.textContent || "";
    const isSetupText = modalText.includes("Enable Authenticator") || modalText.includes("Activer l'application d'authentification") || modalText.includes("2FA Key (Manual entry)");
    return hasSecret || isSetupText;
}

function formatAccountDisplayName(account: TotpAccount): string {
    const name = account.name || "";
    const issuer = (account.issuer || "").toLowerCase();
    const isDiscord = issuer === "discord" || name.toLowerCase().includes("discord");

    if (isDiscord) {
        const curr = UserStore.getCurrentUser();
        const username = curr?.username || curr?.globalName;
        if (username) {
            return `Discord (${username})`;
        }
    }

    return name.replace(/\(([^@\s\)]+)@[^)]+\)/g, "($1)").replace(/([^\s@]+)@[^\s)]+/g, "$1");
}

function injectAutofillBanner(input: HTMLInputElement, accounts: TotpAccount[]) {
    // Never inject in 2FA registration/setup modals
    if (isInside2FASetupModal(input)) return;

    const targetEmail = lastLoginEmail;
    const targetUser = lastLoginUsername;

    // Sort accounts by match score
    const sorted = [...accounts].sort((a, b) =>
        rankTotpAccount(b, targetEmail, targetUser) - rankTotpAccount(a, targetEmail, targetUser)
    );

    let selectedAccount = sorted[0];

    // Check if UI card is already injected
    const wrapper = input.closest('[class*="inputWrapper_"], [class*="inputWrapper"], [class*="inputDefault_"]') || input.parentElement;
    if (wrapper?.nextElementSibling?.classList.contains("lolicord-2fa-autofill-card")) return;
    if (input.parentElement?.querySelector(".lolicord-2fa-autofill-card")) return;

    const card = document.createElement("div");
    card.className = "lolicord-2fa-autofill-card";
    card.title = t("Click to insert 2FA code & submit");

    card.onclick = async (e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") return;
        try {
            const res = await generateTOTP(selectedAccount.secret, {
                digits: selectedAccount.digits || 6,
                period: selectedAccount.period || 30,
                algorithm: selectedAccount.algorithm || "SHA-1"
            });
            fillCodeIntoInput(input, res.otp);
        } catch {}
    };

    function renderCardContent() {
        const displayName = formatAccountDisplayName(selectedAccount);

        card.innerHTML = `
            <div class="lolicord-2fa-autofill-left">
                <div class="lolicord-2fa-autofill-info">
                    <div class="lolicord-2fa-autofill-title">
                        <span class="lolicord-2fa-acc-label">${displayName}</span>
                    </div>
                    <div class="lolicord-2fa-autofill-code-preview">
                        <span class="lolicord-2fa-live-otp">------</span>
                        <span class="lolicord-2fa-live-timer">30s</span>
                    </div>
                </div>
            </div>
            <div class="lolicord-2fa-autofill-right">
                ${sorted.length > 1 ? `
                    <select class="lolicord-2fa-acc-select" title="${t("Select Account")}">
                        ${sorted.map(a => `<option value="${a.id}" ${a.id === selectedAccount.id ? "selected" : ""}>${formatAccountDisplayName(a)}</option>`).join("")}
                    </select>
                ` : ""}
            </div>
        `;

        const otpSpan = card.querySelector<HTMLElement>(".lolicord-2fa-live-otp");
        const timerSpan = card.querySelector<HTMLElement>(".lolicord-2fa-live-timer");
        const selectEl = card.querySelector<HTMLSelectElement>(".lolicord-2fa-acc-select");

        async function updateCode() {
            try {
                const res = await generateTOTP(selectedAccount.secret, {
                    digits: selectedAccount.digits || 6,
                    period: selectedAccount.period || 30,
                    algorithm: selectedAccount.algorithm || "SHA-1"
                });
                if (otpSpan) otpSpan.innerText = res.otp.length === 6 ? `${res.otp.slice(0, 3)} ${res.otp.slice(3)}` : res.otp;
                if (timerSpan) timerSpan.innerText = `${res.secondsRemaining}s`;
            } catch {
                if (otpSpan) otpSpan.innerText = "ERROR";
            }
        }

        updateCode();
        const timer = setInterval(updateCode, 1000);
        activeCardTimers.add(timer);

        if (selectEl) {
            selectEl.onchange = (e) => {
                const newId = (e.target as HTMLSelectElement).value;
                const found = sorted.find(a => a.id === newId);
                if (found) {
                    clearInterval(timer);
                    activeCardTimers.delete(timer);
                    selectedAccount = found;
                    renderCardContent();
                }
            };
        }
    }

    renderCardContent();

    // Insert card AFTER input wrapper (never inside the input container itself)
    if (wrapper && wrapper.parentElement) {
        wrapper.insertAdjacentElement("afterend", card);
    }
}

// ─── Scan for 2FA / MFA Code Inputs ───────────────────────────────────────────

function scanForMfaCodeInputs() {
    // Clean up any improperly placed cards in setup modals
    document.querySelectorAll('[data-mana-component="modal"], [class*="modal__"], [class*="container__8a031"], [role="dialog"]').forEach(modal => {
        if (isInside2FASetupModal(modal as HTMLElement)) {
            modal.querySelectorAll(".lolicord-2fa-autofill-card").forEach(c => c.remove());
        }
    });

    // 1. Find 2FA / 6-digit code inputs
    const codeInputs = document.querySelectorAll<HTMLInputElement>(
        'input[autocomplete="one-time-code"], input[placeholder*="000 000"], input[placeholder*="6-digit"], input[placeholder*="6 chiffres"], input[placeholder*="Auth Code"], input[aria-label*="Discord Auth"], input[aria-label*="Code"], input[name="code"], input[maxlength="6"], input[maxlength="7"], input[maxlength="8"]'
    );

    if (codeInputs.length > 0) {
        getTotpAccounts().then(accounts => {
            if (!accounts || accounts.length === 0) return;
            for (const input of Array.from(codeInputs)) {
                // Ignore general search inputs
                if (input.type === "search" || input.placeholder.toLowerCase().includes("search")) continue;
                // Never inject login autofill in setup modals
                if (isInside2FASetupModal(input)) continue;
                injectAutofillBanner(input, accounts);
            }
        });
    }

    // 2. Scan for QR / Secret setup modals (to add new 2FA)
    const secretEls = document.querySelectorAll<HTMLElement>(
        '[class*="secret__"], .secret__07d82'
    );

    for (const secretEl of Array.from(secretEls)) {
        const modal = secretEl.closest<HTMLElement>(
            '[data-mana-component="modal"], [class*="modal__"], [class*="container__8a031"], [role="dialog"]'
        ) || secretEl.parentElement?.parentElement;

        if (!modal || secretEl.parentElement?.querySelector(".lolicord-2fa-quickadd-btn")) continue;

        const btn = document.createElement("button");
        btn.className = "lolicord-2fa-quickadd-btn";
        btn.type = "button";
        btn.innerText = t("Add to LoliCord 2FA");
        btn.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 10px;
            height: 38px;
            padding: 0 16px;
            font-size: 14px;
            font-weight: 500;
            font-family: var(--font-primary, "gg sans", "Noto Sans", sans-serif);
            background: var(--brand-500, #5865f2);
            color: #ffffff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
            box-sizing: border-box;
            white-space: nowrap;
            transition: background-color 0.17s ease;
        `;

        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rawSecret = secretEl.textContent || "";
            const cleanSecret = rawSecret.replace(/[\s\-_]/g, "").toUpperCase();
            if (!cleanSecret || cleanSecret.length < 8) {
                showToast(t("Invalid 2FA secret key"), Toasts.Type.FAILURE);
                return;
            }

            const currentUser = UserStore.getCurrentUser();
            const userLabel = currentUser?.username || currentUser?.globalName || "";
            const accountName = userLabel ? `Discord (${userLabel})` : "Discord";

            getTotpAccounts().then(async accounts => {
                const existing = accounts.find(a => a.secret.replace(/[\s\-_]/g, "").toUpperCase() === cleanSecret);
                if (!existing) {
                    await addTotpAccount({
                        name: accountName,
                        issuer: "Discord",
                        secret: cleanSecret,
                        digits: 6,
                        period: 30,
                        algorithm: "SHA-1"
                    });
                }

                try {
                    const totp = await generateTOTP(cleanSecret, { digits: 6, period: 30, algorithm: "SHA-1" });
                    const code = totp.otp;
                    const codeInput = modal.querySelector<HTMLInputElement>(
                        'input[autocomplete="one-time-code"], input[placeholder="000 000"], input[maxlength="7"], input[maxlength="6"]'
                    );
                    if (codeInput) {
                        fillCodeIntoInput(codeInput, code);
                    }
                    copyWithToast(code, t("2FA Code copied to clipboard!"));
                    showToast(t("Discord 2FA saved in LoliCord & code filled!"), Toasts.Type.SUCCESS);
                    btn.innerText = `${t("Added & Code Filled")} (${code})`;
                    btn.style.background = "var(--status-positive, #23a55a)";
                    btn.disabled = true;
                } catch {
                    showToast(t("Failed to compute 2FA code"), Toasts.Type.FAILURE);
                }
            });
        };

        secretEl.parentElement?.appendChild(btn);
    }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export function startMfaModalObserver() {
    if (modalObserver) return;

    // Add global input listener for email tracking
    document.addEventListener("input", handleGlobalInput, true);
    document.addEventListener("change", handleGlobalInput, true);

    // Subscribe to Flux Dispatcher
    try {
        FluxDispatcher.subscribe("LOGIN_ATTEMPT", handleFluxDispatch);
        FluxDispatcher.subscribe("LOGIN_SUBMIT", handleFluxDispatch);
        FluxDispatcher.subscribe("LOGIN_MFA_STEP", handleFluxDispatch);
        FluxDispatcher.subscribe("SET_LOGIN_CREDENTIALS", handleFluxDispatch);
    } catch {}

    scanForMfaCodeInputs();

    modalObserver = new MutationObserver(() => {
        if (mfaObserverPending) return;
        mfaObserverPending = true;
        requestAnimationFrame(() => {
            mfaObserverPending = false;
            scanForMfaCodeInputs();
        });
    });

    modalObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

export function stopMfaModalObserver() {
    document.removeEventListener("input", handleGlobalInput, true);
    document.removeEventListener("change", handleGlobalInput, true);

    try {
        FluxDispatcher.unsubscribe("LOGIN_ATTEMPT", handleFluxDispatch);
        FluxDispatcher.unsubscribe("LOGIN_SUBMIT", handleFluxDispatch);
        FluxDispatcher.unsubscribe("LOGIN_MFA_STEP", handleFluxDispatch);
        FluxDispatcher.unsubscribe("SET_LOGIN_CREDENTIALS", handleFluxDispatch);
    } catch {}

    if (modalObserver) {
        modalObserver.disconnect();
        modalObserver = null;
    }
    mfaObserverPending = false;
    activeCardTimers.forEach(t => clearInterval(t));
    activeCardTimers.clear();
    document.querySelectorAll(".lolicord-2fa-autofill-card, .lolicord-2fa-quickadd-btn").forEach(el => el.remove());
}

/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Nightcord Team
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { copyWithToast } from "@utils/discord";
import { closeModal, ModalRoot, ModalSize, openModal } from "@utils/modal";
import {
    Select,
    showToast,
    TextInput,
    Toasts,
    useEffect,
    useRef,
    useState,
    UserStore
} from "@webpack/common";
import { t } from "../autoTranslateLoliCord";
import { getServiceBrand } from "./brandIcons";
import {
    getVaultMetadata,
    VaultMetadata
} from "./cloudSync";
import { openCloudSyncModal } from "./CloudSyncModal";
import {
    addTotpAccount,
    deleteTotpAccount,
    exportTotpAccountsJson,
    getCachedTotpAccounts,
    getTotpAccounts,
    importTotpAccountsJson,
    subscribeTotpStore,
    TotpAccount,
    updateTotpAccount
} from "./store";
import { generateTOTP, parseOtpAuthUri, TOTPAlgorithm, TOTPResult } from "./totp";

function ShieldKeyIcon({ size = 20 }: { size?: number }) {
    return (
        <svg aria-hidden="true" role="img" width={size} height={size} viewBox="0 0 24 24" fill="none">
            <path
                d="M12 2L4 5V11.09C4 16.14 7.41 20.85 12 22C16.59 20.85 20 16.14 20 11.09V5L12 2Z"
                fill="currentColor"
                opacity="0.2"
            />
            <path
                d="M12 2L4 5V11.09C4 16.14 7.41 20.85 12 22C16.59 20.85 20 16.14 20 11.09V5L12 2Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M12 8V12M12 16H12.01"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function CloudIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
        </svg>
    );
}

function PlusIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
            <path d="M12 5V19M5 12H19" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function ExportIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5-5 5 5M12 5v12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function ImportIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function EditIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function CopyIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
    );
}

// ─── TOTP Account Card Component ──────────────────────────────────────────────

interface TotpCardProps {
    account: TotpAccount;
    onEdit: (account: TotpAccount) => void;
    onDelete: (id: string) => void;
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

function TotpAccountCard({ account, onEdit, onDelete }: TotpCardProps) {
    const [totpData, setTotpData] = useState<TOTPResult>({
        otp: "------",
        expires: 0,
        secondsRemaining: 30,
        progress: 1
    });
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let mounted = true;

        async function updateCode() {
            try {
                const res = await generateTOTP(account.secret, {
                    digits: account.digits || 6,
                    period: account.period || 30,
                    algorithm: account.algorithm || "SHA-1"
                });
                if (mounted) setTotpData(res);
            } catch {
                if (mounted) {
                    setTotpData({
                        otp: "ERROR",
                        expires: 0,
                        secondsRemaining: 0,
                        progress: 0
                    });
                }
            }
        }

        updateCode();
        const interval = setInterval(updateCode, 1000);
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, [account.secret, account.digits, account.period, account.algorithm]);

    const formattedOtp = totpData.otp.length === 6
        ? `${totpData.otp.slice(0, 3)} ${totpData.otp.slice(3)}`
        : totpData.otp;

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (totpData.otp && totpData.otp !== "ERROR" && totpData.otp !== "------") {
            copyWithToast(totpData.otp, t("2FA Code copied to clipboard!"));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const isExpiring = totpData.secondsRemaining <= 5 && totpData.secondsRemaining > 0;
    const brand = getServiceBrand(account.name, account.issuer);
    const avatarColor = account.color || brand.color;

    // SVG Circular Progress
    const radius = 12;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference * (1 - totpData.progress);

    return (
        <div className="totp-card" onClick={handleCopy} title={t("Click to copy code")}>
            {copied && <div className="totp-copied-badge">{t("Copied!")}</div>}

            <div className="totp-card-left">
                <div className="totp-account-avatar" style={{ backgroundColor: avatarColor }}>
                    {brand.icon}
                </div>
                <div className="totp-account-info">
                    <span className="totp-account-name">{formatAccountDisplayName(account)}</span>
                    {account.issuer && <span className="totp-account-issuer">{account.issuer}</span>}
                </div>
            </div>

            <div className="totp-card-right">
                <div className="totp-code-display">
                    <span className={`totp-code-value ${isExpiring ? "totp-code-value--expiring" : ""}`}>
                        {formattedOtp}
                    </span>
                </div>

                <div className="totp-timer-container">
                    <svg className="totp-timer-svg" viewBox="0 0 30 30">
                        <circle className="totp-timer-bg" cx="15" cy="15" r={radius} />
                        <circle
                            className={`totp-timer-progress ${isExpiring ? "totp-timer-progress--danger" : ""}`}
                            cx="15"
                            cy="15"
                            r={radius}
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                        />
                    </svg>
                    <span className="totp-timer-seconds">{totpData.secondsRemaining}</span>
                </div>

                <div className="totp-card-actions" onClick={e => e.stopPropagation()}>
                    <Button
                        size="xs"
                        variant="secondary"
                        onClick={handleCopy}
                        title={t("Copy Code")}
                    >
                        <CopyIcon />
                        {t("Copy")}
                    </Button>
                    <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => onEdit(account)}
                        title={t("Edit")}
                    >
                        <EditIcon />
                    </Button>
                    <Button
                        size="xs"
                        variant="dangerSecondary"
                        onClick={() => onDelete(account.id)}
                        title={t("Delete")}
                    >
                        <TrashIcon />
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Add / Edit Account Form ──────────────────────────────────────────────────

interface AddEditModalProps {
    account?: TotpAccount | null;
    onClose: () => void;
    onSaved: () => void;
}

export function AddEditAccountModal({ account, onClose, onSaved }: AddEditModalProps) {
    const [name, setName] = useState(account?.name || "");
    const [issuer, setIssuer] = useState(account?.issuer || "");
    const [secret, setSecret] = useState(account?.secret || "");
    const [digits, setDigits] = useState<number>(account?.digits || 6);
    const [period, setPeriod] = useState<number>(account?.period || 30);
    const [algorithm, setAlgorithm] = useState<TOTPAlgorithm>(account?.algorithm || "SHA-1");
    const [error, setError] = useState<string | null>(null);

    const handleSecretChange = (val: string) => {
        if (val.startsWith("otpauth://")) {
            const parsed = parseOtpAuthUri(val);
            if (parsed) {
                setName(parsed.account || parsed.label || name);
                setIssuer(parsed.issuer || issuer);
                setSecret(parsed.secret);
                if (parsed.digits) setDigits(parsed.digits);
                if (parsed.period) setPeriod(parsed.period);
                if (parsed.algorithm) setAlgorithm(parsed.algorithm);
                setError(null);
                return;
            }
        }
        setSecret(val);
        setError(null);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            setError(t("Account name is required"));
            return;
        }
        if (!secret.trim()) {
            setError(t("Secret key is required"));
            return;
        }

        try {
            await generateTOTP(secret.trim(), { digits, period, algorithm });
        } catch {
            setError(t("Invalid Base32 secret key"));
            return;
        }

        const isNew = !account;

        if (account) {
            await updateTotpAccount(account.id, {
                name: name.trim(),
                issuer: issuer.trim() || undefined,
                secret: secret.trim(),
                digits,
                period,
                algorithm
            });
            showToast(t("Account updated successfully!"), Toasts.Type.SUCCESS);
        } else {
            await addTotpAccount({
                name: name.trim(),
                issuer: issuer.trim() || undefined,
                secret: secret.trim(),
                digits,
                period,
                algorithm
            });
            showToast(t("Account added successfully!"), Toasts.Type.SUCCESS);
        }

        onSaved();
        onClose();

        // If new account added, prompt for cloud sync
        if (isNew) {
            getVaultMetadata().then(meta => {
                if (!meta.hasCloudBackup) {
                    setTimeout(() => {
                        openCloudSyncModal("sync");
                    }, 500);
                }
            });
        }
    };

    return (
        <div className="totp-edit-panel">
            <div className="totp-edit-panel-header">
                <Heading level={3} className="totp-edit-title" style={{ color: "#ffffff", margin: 0 }}>
                    {account ? t("Edit 2FA Account") : t("Add 2FA Account")}
                </Heading>
                <Button
                    size="xs"
                    variant="none"
                    onClick={onClose}
                >
                    ✕
                </Button>
            </div>

            <div className="totp-form-body">
                <div className="totp-form-group">
                    <BaseText size="sm" weight="semibold" className="totp-form-label">
                        {t("Account Name")} *
                    </BaseText>
                    <TextInput
                        placeholder="e.g. Discord, GitHub, myemail@gmail.com"
                        value={name}
                        onChange={(val: string) => setName(val)}
                        autoFocus
                    />
                </div>

                <div className="totp-form-group">
                    <BaseText size="sm" weight="semibold" className="totp-form-label">
                        {t("Issuer (Optional)")}
                    </BaseText>
                    <TextInput
                        placeholder="e.g. Discord, Google, Amazon"
                        value={issuer}
                        onChange={(val: string) => setIssuer(val)}
                    />
                </div>

                <div className="totp-form-group">
                    <BaseText size="sm" weight="semibold" className="totp-form-label">
                        {t("Secret Key or otpauth:// URI")} *
                    </BaseText>
                    <TextInput
                        placeholder="JBSWY3DPEHPK3PXP or paste otpauth:// link"
                        value={secret}
                        onChange={(val: string) => handleSecretChange(val)}
                        error={error || undefined}
                    />
                    <Paragraph size="xs" color="text-muted" style={{ marginTop: 4 }}>
                        {t("Paste your Base32 secret key or full otpauth:// URI.")}
                    </Paragraph>
                </div>

                <div className="totp-form-row">
                    <div className="totp-form-group">
                        <BaseText size="sm" weight="semibold" className="totp-form-label">
                            {t("Digits")}
                        </BaseText>
                        <Select
                            options={[
                                { label: `6 ${t("digits")}`, value: 6 },
                                { label: `8 ${t("digits")}`, value: 8 }
                            ]}
                            select={(v: number) => setDigits(v)}
                            serialize={(v: number) => String(v)}
                            isSelected={(v: number) => v === digits}
                        />
                    </div>

                    <div className="totp-form-group">
                        <BaseText size="sm" weight="semibold" className="totp-form-label">
                            {t("Period")}
                        </BaseText>
                        <Select
                            options={[
                                { label: `30 ${t("seconds")}`, value: 30 },
                                { label: `60 ${t("seconds")}`, value: 60 }
                            ]}
                            select={(v: number) => setPeriod(v)}
                            serialize={(v: number) => String(v)}
                            isSelected={(v: number) => v === period}
                        />
                    </div>
                </div>

                <div className="totp-form-actions">
                    <Button
                        size="small"
                        variant="secondary"
                        onClick={onClose}
                    >
                        {t("Cancel")}
                    </Button>
                    <Button
                        size="small"
                        variant="primary"
                        onClick={handleSave}
                    >
                        {account ? t("Save Changes") : t("Add Account")}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Settings Panel (Embedded directly inside Plugin Settings) ────────────────

export function TotpSettingsPanel() {
    const [accounts, setAccounts] = useState<TotpAccount[]>(getCachedTotpAccounts());
    const [search, setSearch] = useState("");
    const [editingAccount, setEditingAccount] = useState<TotpAccount | null | "new">(null);
    const [vaultMeta, setVaultMeta] = useState<VaultMetadata | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        getTotpAccounts().then(setAccounts);
        getVaultMetadata().then(setVaultMeta);
        const unsub = subscribeTotpStore(() => {
            getTotpAccounts().then(setAccounts);
            getVaultMetadata().then(setVaultMeta);
        });
        return unsub;
    }, []);

    const filteredAccounts = accounts.filter(a => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            a.name.toLowerCase().includes(q) ||
            (a.issuer && a.issuer.toLowerCase().includes(q))
        );
    });

    const handleDelete = async (id: string) => {
        const acc = accounts.find(a => a.id === id);
        if (confirm(`${t("Are you sure you want to delete")} "${acc?.name || "account"}"?`)) {
            await deleteTotpAccount(id);
            showToast(t("Account deleted"), Toasts.Type.INFO);
        }
    };

    const handleExport = async () => {
        try {
            const json = await exportTotpAccountsJson();
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `lolicord_2fa_backup_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast(t("2FA Accounts exported successfully!"), Toasts.Type.SUCCESS);
        } catch {
            showToast(t("Export failed"), Toasts.Type.FAILURE);
        }
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const count = await importTotpAccountsJson(text);
            showToast(`${count} ${t("accounts imported successfully!")}`, Toasts.Type.SUCCESS);
        } catch (err: any) {
            showToast(t("Invalid JSON file"), Toasts.Type.FAILURE);
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const isCloudSynced = vaultMeta?.hasCloudBackup;

    return (
        <div className="totp-settings-wrap">
            {/* Hidden file input for import */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                style={{ display: "none" }}
                onChange={handleFileSelected}
            />

            {/* Top Action Bar */}
            <div className="totp-action-bar">
                <div className="totp-action-bar-left">
                    <div className="totp-shield-badge">
                        <ShieldKeyIcon size={18} />
                    </div>
                    <div>
                        <div className="totp-main-title">
                            {t("LoliCord 2FA Authenticator")}
                        </div>
                        <Paragraph size="xs" color="text-muted">
                            {accounts.length} {accounts.length === 1 ? t("account configured") : t("accounts configured")}
                            {isCloudSynced && (
                                <span className="totp-cloud-status-pill">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4, verticalAlign: "middle" }}>
                                        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                                    </svg>
                                    {t("Cloud Synced")}
                                </span>
                            )}
                        </Paragraph>
                    </div>
                </div>

                <div className="totp-action-bar-right">
                    <Button
                        size="small"
                        variant="secondary"
                        onClick={() => openCloudSyncModal("sync", () => {
                            getTotpAccounts().then(setAccounts);
                            getVaultMetadata().then(setVaultMeta);
                        })}
                        title={t("Zero-Knowledge Cloud Backup (AES-256 + ChaCha20)")}
                    >
                        <CloudIcon />
                        {t("Cloud Sync")}
                    </Button>
                    <Button
                        size="small"
                        variant="secondary"
                        onClick={handleExport}
                        title={t("Export Backup (JSON)")}
                    >
                        <ExportIcon />
                        {t("Export")}
                    </Button>
                    <Button
                        size="small"
                        variant="secondary"
                        onClick={handleImportClick}
                        title={t("Import Backup (JSON)")}
                    >
                        <ImportIcon />
                        {t("Import")}
                    </Button>
                    <Button
                        size="small"
                        variant="primary"
                        onClick={() => setEditingAccount("new")}
                    >
                        <PlusIcon />
                        {t("Add Account")}
                    </Button>
                </div>
            </div>

            {/* If editing or adding an account, show ONLY the form */}
            {editingAccount ? (
                <div style={{ marginTop: 12 }}>
                    <AddEditAccountModal
                        account={editingAccount === "new" ? null : editingAccount}
                        onClose={() => setEditingAccount(null)}
                        onSaved={() => getTotpAccounts().then(setAccounts)}
                    />
                </div>
            ) : (
                <>
                    {/* Search Input */}
                    {accounts.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                            <TextInput
                                placeholder={t("Search accounts by name or issuer…")}
                                value={search}
                                onChange={(val: string) => setSearch(val)}
                            />
                        </div>
                    )}

                    {/* List of accounts */}
                    <div className="totp-cards-list">
                        {accounts.length === 0 ? (
                            <div className="totp-empty-box">
                                <div className="totp-empty-icon-wrap">
                                    <ShieldKeyIcon size={36} />
                                </div>
                                <Heading level={3} style={{ marginBottom: 4, color: "#ffffff" }}>
                                    {t("No 2FA accounts yet")}
                                </Heading>
                                <Paragraph size="sm" color="text-muted" style={{ maxWidth: 360, textAlign: "center", marginBottom: 16 }}>
                                    {t("Store your 2FA authentication secret keys securely in LoliCord and generate instant 6-digit verification codes.")}
                                </Paragraph>
                                <div style={{ display: "flex", gap: 10 }}>
                                    <Button
                                        size="medium"
                                        variant="primary"
                                        onClick={() => setEditingAccount("new")}
                                    >
                                        <PlusIcon />
                                        {t("Add your first account")}
                                    </Button>
                                    <Button
                                        size="medium"
                                        variant="secondary"
                                        onClick={() => openCloudSyncModal("restore", () => {
                                            getTotpAccounts().then(setAccounts);
                                            getVaultMetadata().then(setVaultMeta);
                                        })}
                                    >
                                        <CloudIcon />
                                        {t("Restore from Cloud")}
                                    </Button>
                                </div>
                            </div>
                        ) : filteredAccounts.length === 0 ? (
                            <div className="totp-empty-box" style={{ padding: "30px 20px" }}>
                                <Heading level={4} style={{ color: "#ffffff" }}>{t("No matching accounts")}</Heading>
                                <Paragraph size="sm" color="text-muted">{t("Try searching for another keyword.")}</Paragraph>
                            </div>
                        ) : (
                            filteredAccounts.map(account => (
                                <TotpAccountCard
                                    key={account.id}
                                    account={account}
                                    onEdit={acc => setEditingAccount(acc)}
                                    onDelete={handleDelete}
                                />
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Quick Modal (Accessible from Header Button or /2fa slash command) ─────────

export function TotpModal({ onClose }: { onClose: () => void }) {
    return (
        <div style={{ padding: "16px 20px 24px", minWidth: 500, maxWidth: "90vw" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -10 }}>
                <Button
                    size="xs"
                    variant="none"
                    onClick={onClose}
                >
                    ✕
                </Button>
            </div>
            <TotpSettingsPanel />
        </div>
    );
}

let activeTotpModalKey: string | null = null;

export function openTotpModal() {
    if (activeTotpModalKey) return;
    activeTotpModalKey = openModal(props => (
        <ModalRoot {...props} size={ModalSize.LARGE}>
            <TotpModal
                onClose={() => {
                    if (activeTotpModalKey) {
                        closeModal(activeTotpModalKey);
                        activeTotpModalKey = null;
                    }
                }}
            />
        </ModalRoot>
    ));
}

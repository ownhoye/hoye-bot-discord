/*
 * LoliCord 2FA Authenticator — Cloud Sync Modal Component
 * Zero-Knowledge Dual Layer Encryption Modal
 * Copyright (c) 2026 Nightcord Team
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { closeModal, ModalRoot, ModalSize, openModal } from "@utils/modal";
import {
    showToast,
    TextInput,
    Toasts,
    useEffect,
    useState
} from "@webpack/common";
import { t } from "../autoTranslateLoliCord";
import {
    getLocalVaultEnvelope,
    getValidCloudToken,
    getVaultMetadata,
    restoreAccountsFromCloud,
    syncAccountsToCloud,
    VaultMetadata
} from "./cloudSync";
import { authorizePluginSync } from "@api/SettingsSync/pluginSync";

export interface CloudSyncModalProps {
    initialMode?: "sync" | "restore";
    onClose: () => void;
    onCompleted?: () => void;
}

export function CloudSyncModal({ initialMode = "sync", onClose, onCompleted }: CloudSyncModalProps) {
    const [mode, setMode] = useState<"sync" | "restore">(initialMode);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [meta, setMeta] = useState<VaultMetadata | null>(null);
    const [cloudToken, setCloudToken] = useState<string | null>(null);

    useEffect(() => {
        getVaultMetadata().then(setMeta);
        getValidCloudToken(false).then(setCloudToken);
    }, []);

    const handleConnectCloud = async () => {
        setLoading(true);
        try {
            const ok = await authorizePluginSync();
            if (ok) {
                const token = await getValidCloudToken(false);
                setCloudToken(token);
                showToast(t("Connected to LoliCord Cloud!"), Toasts.Type.SUCCESS);
            }
        } catch {
            showToast(t("Connection failed"), Toasts.Type.FAILURE);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        if (!password) {
            setError(t("Master password is required"));
            return;
        }
        if (password.length < 8) {
            setError(t("Master password must be at least 8 characters long"));
            return;
        }
        if (password !== confirmPassword) {
            setError(t("Passwords do not match"));
            return;
        }

        setError(null);
        setLoading(true);
        try {
            if (!cloudToken) {
                const token = await getValidCloudToken(true);
                if (token) setCloudToken(token);
            }
            const updatedMeta = await syncAccountsToCloud(password);
            setMeta(updatedMeta);
            showToast(t("2FA Vault encrypted & synced to LoliCord Cloud!"), Toasts.Type.SUCCESS);
            onCompleted?.();
            onClose();
        } catch (err: any) {
            setError(err?.message || t("Encryption or sync failed"));
            showToast(t("Cloud sync failed"), Toasts.Type.FAILURE);
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async () => {
        if (!password) {
            setError(t("Master password is required"));
            return;
        }

        setError(null);
        setLoading(true);
        try {
            if (!cloudToken) {
                const token = await getValidCloudToken(true);
                if (token) setCloudToken(token);
            }
            const count = await restoreAccountsFromCloud(password);
            showToast(`${count} ${t("2FA accounts successfully restored from Cloud!")}`, Toasts.Type.SUCCESS);
            onCompleted?.();
            onClose();
        } catch (err: any) {
            if (err?.message === "NO_VAULT_FOUND") {
                setError(t("No encrypted vault found in LoliCord Cloud"));
            } else {
                setError(t("Incorrect master password or corrupted vault data"));
            }
            showToast(t("Restoration failed"), Toasts.Type.FAILURE);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="totp-cloud-modal">
            {/* Header */}
            <div className="totp-cloud-header">
                <div className="totp-cloud-title-wrap">
                    <div className="totp-cloud-badge-icon">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                            <path d="M12 12v4M10 14l2-2 2 2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div>
                        <Heading level={2} style={{ color: "#ffffff", margin: 0, fontSize: 18 }}>
                            {t("LoliCord 2FA Cloud Vault")}
                        </Heading>
                        <Paragraph size="xs" color="text-muted">
                            {t("Zero-Knowledge End-to-End Encryption")}
                        </Paragraph>
                    </div>
                </div>
                <Button size="xs" variant="none" onClick={onClose}>✕</Button>
            </div>

            {/* Mode Switcher */}
            <div className="totp-cloud-tabs">
                <button
                    className={`totp-cloud-tab ${mode === "sync" ? "totp-cloud-tab--active" : ""}`}
                    onClick={() => { setMode("sync"); setError(null); }}
                >
                    {t("Backup & Sync to Cloud")}
                </button>
                <button
                    className={`totp-cloud-tab ${mode === "restore" ? "totp-cloud-tab--active" : ""}`}
                    onClick={() => { setMode("restore"); setError(null); }}
                >
                    {t("Restore from Cloud")}
                </button>
            </div>

            {/* Encryption Explanatory & Warning Banner */}
            <div className="totp-cloud-warning-card">
                <div className="totp-cloud-security-tags">
                    <span className="totp-crypto-tag">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4, verticalAlign: "middle" }}>
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        AES-256-GCM
                    </span>
                    <span className="totp-crypto-tag">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4, verticalAlign: "middle" }}>
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                        ChaCha20-Poly1305
                    </span>
                    <span className="totp-crypto-tag">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4, verticalAlign: "middle" }}>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        PBKDF2 600,000 Rounds
                    </span>
                </div>

                <Paragraph size="xs" style={{ color: "var(--text-normal, #dbdee1)", marginTop: 8, lineHeight: 1.45 }}>
                    {t("Your 2FA secrets are encrypted client-side using cascaded AES-256-GCM and ChaCha20-Poly1305 before being sent to LoliCord Cloud. Only you possess the key.")}
                </Paragraph>

                <div className="totp-cloud-danger-box">
                    <strong style={{ color: "#f0b232", display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        {t("CRITICAL: Master Password Notice")}
                    </strong>
                    <Paragraph size="xs" style={{ color: "#f2f3f5", margin: 0, lineHeight: 1.4 }}>
                        {t("This Master Password is the ONLY key to decrypt your 2FA vault. LoliCord servers NEVER store this password and CANNOT reset it. You must store this password in a safe place. If you lose it, your 2FA backup will be permanently lost.")}
                    </Paragraph>
                </div>
            </div>

            {/* Form Fields */}
            <div className="totp-form-body" style={{ marginTop: 14 }}>
                <div className="totp-form-group">
                    <BaseText size="sm" weight="semibold" className="totp-form-label">
                        {mode === "sync" ? t("Create Master Password") : t("Enter Master Password")} *
                    </BaseText>
                    <TextInput
                        type="password"
                        placeholder={t("Enter your master password")}
                        value={password}
                        onChange={(val: string) => { setPassword(val); setError(null); }}
                        autoFocus
                    />
                </div>

                {mode === "sync" && (
                    <div className="totp-form-group">
                        <BaseText size="sm" weight="semibold" className="totp-form-label">
                            {t("Confirm Master Password")} *
                        </BaseText>
                        <TextInput
                            type="password"
                            placeholder={t("Confirm your master password")}
                            value={confirmPassword}
                            onChange={(val: string) => { setConfirmPassword(val); setError(null); }}
                        />
                    </div>
                )}

                {error && (
                    <div className="totp-error-text">
                        {error}
                    </div>
                )}

                {/* Footer Actions */}
                <div className="totp-form-actions" style={{ marginTop: 14 }}>
                    <Button
                        size="small"
                        variant="secondary"
                        onClick={onClose}
                        disabled={loading}
                    >
                        {t("Cancel")}
                    </Button>
                    <Button
                        size="small"
                        variant="primary"
                        onClick={mode === "sync" ? handleSync : handleRestore}
                        disabled={loading}
                    >
                        {loading ? t("Encrypting & Syncing...") : (mode === "sync" ? t("Encrypt & Sync to Cloud") : t("Decrypt & Restore"))}
                    </Button>
                </div>
            </div>
        </div>
    );
}

let activeCloudModalKey: string | null = null;

export function openCloudSyncModal(initialMode: "sync" | "restore" = "sync", onCompleted?: () => void) {
    if (activeCloudModalKey) return;
    activeCloudModalKey = openModal(props => (
        <ModalRoot {...props} size={ModalSize.LARGE}>
            <ErrorBoundary message="Failed to render 2FA Cloud Sync modal">
                <CloudSyncModal
                    initialMode={initialMode}
                    onClose={() => {
                        if (activeCloudModalKey) {
                            closeModal(activeCloudModalKey);
                            activeCloudModalKey = null;
                        }
                    }}
                    onCompleted={onCompleted}
                />
            </ErrorBoundary>
        </ModalRoot>
    ));
}

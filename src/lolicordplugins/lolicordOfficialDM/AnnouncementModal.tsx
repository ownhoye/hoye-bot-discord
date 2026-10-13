/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { React, showToast, TextArea, TextInput, Toasts, useEffect, useState } from "@webpack/common";

import { t } from "../autoTranslateLoliCord";
import { Announcement, clearGithubToken, getGithubToken, publishAnnouncement, setGithubToken } from "./announcements";

const titleStyle: React.CSSProperties = { color: "var(--header-primary, #ffffff)", fontSize: 20, fontWeight: 600, margin: 0 };
const labelStyle: React.CSSProperties = { color: "var(--header-secondary, #b5bac1)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", margin: "16px 0 8px" };
const hintStyle: React.CSSProperties = { color: "var(--text-muted, #949ba4)", fontSize: 13, marginTop: 6 };

function AnnouncementModal({ onPublished, ...props }: ModalProps & { onPublished: (a: Announcement) => void; }) {
    const [content, setContent] = useState("");
    const [image, setImage] = useState("");
    const [token, setToken] = useState("");
    const [hasSavedToken, setHasSavedToken] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getGithubToken().then(saved => setHasSavedToken(!!saved));
    }, []);

    async function publish() {
        if (!content.trim()) return setError(t("The announcement is empty."));
        setBusy(true);
        setError(null);
        try {
            if (token.trim()) await setGithubToken(token);
            const activeToken = await getGithubToken();
            if (!activeToken) throw new Error(t("A GitHub token is required to publish."));

            const announcement = await publishAnnouncement(activeToken, content, image);
            onPublished(announcement);
            showToast(t("Announcement published"), Toasts.Type.SUCCESS);
            props.onClose();
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setBusy(false);
        }
    }

    async function forgetToken() {
        await clearGithubToken();
        setHasSavedToken(false);
        setToken("");
    }

    return (
        <ModalRoot {...props} size={ModalSize.MEDIUM}>
            <ModalHeader separator={false}>
                <div style={{ display: "flex", alignItems: "center", width: "100%", padding: "4px 8px" }}>
                    <h1 style={{ ...titleStyle, flexGrow: 1 }}>{t("Write an announcement")}</h1>
                    <ModalCloseButton onClick={props.onClose} />
                </div>
            </ModalHeader>

            <ModalContent style={{ padding: "0 24px 20px" }}>
                <div style={hintStyle}>
                    {t("The message appears in the official LoliCord channel of every user within a few minutes.")}
                </div>

                <div style={labelStyle}>{t("Message")}</div>
                <TextArea value={content} onChange={setContent} rows={6} placeholder={t("Write your announcement (Discord markdown is supported)")} />

                <div style={labelStyle}>{t("Image link (optional)")}</div>
                <TextInput value={image} onChange={setImage} placeholder="https://..." />

                <div style={labelStyle}>{t("GitHub token")}</div>
                {hasSavedToken
                    ? (
                        <div style={{ ...hintStyle, display: "flex", alignItems: "center", gap: 12 }}>
                            <span>{t("A token is saved on this computer.")}</span>
                            <Button size="small" variant="secondary" onClick={forgetToken}>{t("Forget it")}</Button>
                        </div>
                    )
                    : (
                        <>
                            <TextInput type="password" value={token} onChange={setToken} placeholder="github_pat_..." />
                            <div style={hintStyle}>
                                {t("Fine-grained token for this repository with Contents: Read and write. It is stored only on this computer.")}
                            </div>
                        </>
                    )}

                {error && <div style={{ color: "var(--text-danger, #f23f43)", fontSize: 14, marginTop: 12 }}>{error}</div>}
            </ModalContent>

            <ModalFooter>
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "4px 8px" }}>
                    <Button variant="secondary" onClick={props.onClose}>{t("Cancel")}</Button>
                    <Button variant="primary" disabled={busy} onClick={publish}>
                        {busy ? t("Publishing...") : t("Publish")}
                    </Button>
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

export function openAnnouncementModal(onPublished: (a: Announcement) => void) {
    openModal(props => <AnnouncementModal {...props} onPublished={onPublished} />);
}

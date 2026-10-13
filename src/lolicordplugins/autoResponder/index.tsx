/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/index";
import { t } from "../autoTranslateLoliCord";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, React, RestAPI, Text, UserStore } from "@webpack/common";
import plugins from "~plugins";

import { getGroqKey, groqChat } from "../lolicordAI/groqManager";

const MessageStore = findByPropsLazy("getMessages");

const settings = definePluginSettings({
    warning: {
        type: OptionType.COMPONENT,
        component: () => (
            <div style={{
                backgroundColor: "rgba(250, 166, 26, 0.1)",
                border: "1px solid var(--status-warning)",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "16px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                color: "#FFFFFF"
            }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--status-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                    <div style={{ fontWeight: "bold", color: "var(--status-warning)" }}>{t("API Key Required")}</div>
                    <div style={{ fontSize: "13px", marginTop: "4px" }}>
                        AutoResponder requires a Groq API Key to function.
                        Please configure it once in the <strong>{t("LoliCordAI")}</strong>{t("settings.")}</div>
                </div>
            </div>
        )
    },
    isActive: {
        type: OptionType.BOOLEAN,
        description: "AutoResponder functional status",
        default: false,
        restartNeeded: false
    },
    personalInfo: {
        type: OptionType.STRING,
        description: "Personal Information (Name, Age, Location, etc.)",
        default: "",
        restartNeeded: false,
    },
    writingStyle: {
        type: OptionType.STRING,
        description: "Your Writing Style (e.g. casual, no caps, use 'ptn', etc.)",
        default: "",
        restartNeeded: false,
    },
    customInstructions: {
        type: OptionType.STRING,
        description: "Custom Instructions (What to say or NOT to say)",
        default: "",
        restartNeeded: false,
    },
    blacklistedWords: {
        type: OptionType.STRING,
        description: "Blacklisted Words or Topics (comma separated)",
        default: "",
        restartNeeded: false,
    },
    blacklistedUsers: {
        type: OptionType.STRING,
        description: "Blacklisted User IDs (comma separated) — AutoResponder will not reply to these users.",
        default: "",
        restartNeeded: false,
    },
    delayMin: {
        type: OptionType.NUMBER,
        description: "Minimum Delay (seconds)",
        default: 5,
        restartNeeded: false,
    },
    delayMax: {
        type: OptionType.NUMBER,
        description: "Maximum Delay (seconds)",
        default: 12,
        restartNeeded: false,
    }
});

const DS_STYLE_KEY = "auto-responder-global-style";

const _recentMessageIds = new Set<string>();
const cachedGlobalStyle = "";
const _pendingResponderTimers = new Set<ReturnType<typeof setTimeout>>();

async function handleMessage(message: any) {
    if (!settings.store.isActive) return;

    const currentUser = UserStore.getCurrentUser();
    const authorId = message.author?.id || message.authorId;
    if (!currentUser || !authorId || authorId === currentUser.id) return;
    if (message.author?.bot) return;

    const channelId = message.channel_id || message.channelId;
    if (!channelId) return;

    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return;
    const isDM = channel.type === 1 || (typeof channel.isDM === "function" && channel.isDM());
    if (!isDM) return;

    if (!message.content || typeof message.content !== "string" || !message.content.trim()) return;

    // Check blacklisted users
    const blacklistedUsers = settings.store.blacklistedUsers?.split(",").map((id: string) => id.trim()).filter(Boolean) || [];
    if (blacklistedUsers.includes(authorId)) {
        return;
    }

    if (message.id && _recentMessageIds.has(message.id)) return;
    if (message.id) {
        _recentMessageIds.add(message.id);
        if (_recentMessageIds.size > 200) {
            const first = _recentMessageIds.values().next().value;
            if (first) _recentMessageIds.delete(first);
        }
    }

    try {
        const apiKey = await getGroqKey();
        if (!apiKey) {
            try {
                const { openConfirmationModal } = findByPropsLazy("openConfirmationModal");
                openConfirmationModal({
                    header: "API Key Required",
                    content: "AutoResponder requires a Groq API Key to function. Please configure it once in the LoliCordAI settings.",
                    confirmText: "Configure LoliCordAI",
                    cancelText: "Cancel",
                    onConfirm: () => {
                        const { openModal } = findByPropsLazy("openModal");
                    }
                });
            } catch (e) {
                console.error("[AutoResponder] API Key missing and could not open modal", e);
            }
            return;
        }

        // Récupération de l'historique récent pour la cohérence
        let localHistory = "";
        try {
            const rawMsgs = MessageStore.getMessages(channelId);
            const msgsArray = typeof rawMsgs?.toArray === "function" ? rawMsgs.toArray() : Array.isArray(rawMsgs) ? rawMsgs : [];
            const msgs = msgsArray.slice(-15);
            localHistory = msgs.map((m: any) => {
                const aId = m.author?.id || m.authorId;
                const author = aId === currentUser.id ? "MOI" : "L'AMI";
                return `${author}: ${m.content || ""}`;
            }).filter(Boolean).join("\n");
        } catch { }

        const prompt = `Tu es l'utilisateur (MOI). Réponds au dernier message de L'AMI.
        
MES INFOS PERSONNELLES :
${settings.store.personalInfo || "Aucune"}

MES INSTRUCTIONS :
${settings.store.customInstructions || "Aucune"}

LISTE NOIRE :
${settings.store.blacklistedWords || "Aucune"}

HISTORIQUE :
${localHistory || `L'AMI: ${message.content}`}

LATEST MESSAGE : "${message.content}"

RÈGLES DE COMPORTEMENT (CRUCIAL) :
1. RÉPONSES COURTES : Fais des réponses concises (1 ou 2 phrases max). Ne fais pas de longs paragraphes.
2. DISCRÉTION DES INFOS : N'utilise mes infos personnelles que si c'est pertinent.
3. STYLE ÉCRIT NATUREL : À l'écrit, supprime toute trace d'hésitation orale.
4. HUMAIN : Parle comme un pote sur Discord (langage SMS léger autorisé si mon style le permet).

MISSION :
Réponds de manière naturelle. NE RENVOIE QUE LE TEXTE DE TA RÉPONSE.`;

        const reply = await groqChat({
            messages: [
                { role: "system", content: "Tu es un AutoResponder ultra-personnalisable pour Discord." },
                { role: "user", content: prompt }
            ],
            temperature: 0.7,
            maxTokens: 500,
            forceModel: "qwen/qwen3.8-27b"
        });

        if (reply && !reply.startsWith("❌")) {
            let cleanReply = reply.trim();
            if (
                (cleanReply.startsWith('"') && cleanReply.endsWith('"')) ||
                (cleanReply.startsWith("«") && cleanReply.endsWith("»")) ||
                (cleanReply.startsWith("“") && cleanReply.endsWith("”")) ||
                (cleanReply.startsWith("”") && cleanReply.endsWith("”")) ||
                (cleanReply.startsWith("'") && cleanReply.endsWith("'"))
            ) {
                cleanReply = cleanReply.slice(1, -1).trim();
            }

            const min = Math.max(1, settings.store.delayMin ?? 3);
            const max = Math.max(min, settings.store.delayMax ?? 8);
            const baseDelay = Math.floor(Math.random() * (max - min + 1) + min);
            const totalDelay = baseDelay * 1000;

            try {
                const TypingActions = findByPropsLazy("startTyping");
                TypingActions?.startTyping?.(channelId);
            } catch { }

            const _t = setTimeout(async () => {
                _pendingResponderTimers.delete(_t);
                if (!settings.store.isActive) return;
                try {
                    await RestAPI.post({
                        url: `/channels/${channelId}/messages`,
                        body: { content: cleanReply }
                    });
                } catch (e) {
                    console.error("[AutoResponder] Post error:", e);
                }
            }, totalDelay);
            _pendingResponderTimers.add(_t);
        }
    } catch (err) {
        console.error("[AutoResponder] Error:", err);
    }
}

const messageCreateListener = (data: any) => {
    // Discord dispatch MESSAGE_CREATE structure can vary
    const msg = data.message || data;
    if (msg && msg.author) {
        handleMessage(msg);
    }
};

const KeyboardIcon = (props: any) => (
    <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
        <line x1="6" y1="8" x2="6" y2="8" />
        <line x1="10" y1="8" x2="10" y2="8" />
        <line x1="14" y1="8" x2="14" y2="8" />
        <line x1="18" y1="8" x2="18" y2="8" />
        <line x1="6" y1="12" x2="6" y2="12" />
        <line x1="10" y1="12" x2="10" y2="12" />
        <line x1="14" y1="12" x2="14" y2="12" />
        <line x1="18" y1="12" x2="18" y2="12" />
        <line x1="7" y1="16" x2="17" y2="16" />
        {!props.enabled && <line x1="22" y1="2" x2="2" y2="22" stroke="var(--status-danger)" strokeWidth="2.5" />}
    </svg>
);

let _forceUpdate: () => void = () => { };
function forceRerender() {
    _forceUpdate();
}

const AutoResponderButton = () => {
    const [, setTick] = React.useState(0);
    const isEnabled = settings.store.isActive;

    React.useEffect(() => {
        _forceUpdate = () => setTick(t => t + 1);
        return () => { _forceUpdate = () => { }; };
    }, []);

    const toggle = () => {
        const newState = !settings.store.isActive;

        if (newState) {
            openModal(props => (
                <ModalRoot {...props} size={ModalSize.SMALL}>
                    <ModalHeader separator={false}>
                        <Text variant="heading-lg/semibold">{t("Autoresponder Warning")}</Text>
                        <ModalCloseButton onClick={props.onClose} />
                    </ModalHeader>
                    <ModalContent>
                        <Text variant="text-md/normal" style={{ marginBottom: 16 }}>
                            {t("Are you sure you want to enable the Autoresponder plugin? An AI will automatically reply to your DMs when you are unavailable.")}
                        </Text>
                    </ModalContent>
                    <div style={{ padding: "16px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <Button
                            variant="link"
                            onClick={props.onClose}
                        >
                            {t("Cancel")}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={async () => {
                                props.onClose();
                                const key = await getGroqKey();
                                if (!key) {
                                    openModal(props2 => (
                                        <ModalRoot {...props2} size={ModalSize.SMALL}>
                                            <ModalHeader separator={false}>
                                                <Text variant="heading-lg/semibold">{t("API Key Required")}</Text>
                                                <ModalCloseButton onClick={props2.onClose} />
                                            </ModalHeader>
                                            <ModalContent>
                                                <Text variant="text-md/normal" style={{ marginBottom: 16 }}>
                                                    {t("AutoResponder requires a Groq API Key to function. Please configure it once in the LoliCordAI settings.")}
                                                </Text>
                                            </ModalContent>
                                            <div style={{ padding: "16px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                                                <Button variant="primary" onClick={props2.onClose}>
                                                    {t("Close")}
                                                </Button>
                                            </div>
                                        </ModalRoot>
                                    ));
                                    return;
                                }
                                settings.store.isActive = true;
                                setTick(t => t + 1);
                            }}
                        >
                            {t("Enable")}
                        </Button>
                    </div>
                </ModalRoot>
            ));
        } else {
            settings.store.isActive = false;
            setTick(t => t + 1);
        }
    };

    return (
        <ChatBarButton
            tooltip={t("AutoResponder:") + " " + (isEnabled ? t("ON") : t("OFF"))}
            onClick={toggle}
            onContextMenu={e => {
                e.preventDefault();
                openPluginModal(plugins["AutoResponder"] ?? plugins["autoResponder"]);
            }}
        >
            <KeyboardIcon enabled={isEnabled} style={{ color: isEnabled ? "var(--brand-experiment)" : "var(--interactive-normal)" }} />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "AutoResponder",
    enabledByDefault: true,
    description: "Automatically reply to DMs using AI to match your writing style.",
    authors: [{ name: "Nightcord",
     id: 0n }],
    settings,
    chatBarButton: {
        icon: KeyboardIcon,
        render: AutoResponderButton,
    },

    flux: {
        async MESSAGE_CREATE(data: any) {
            if (!settings.store.isActive) return;
            const msg = data.message || data;
            if (msg && msg.author) {
                handleMessage(msg);
            }
        }
    },

    start() {
        _pendingResponderTimers.clear();
    },

    stop() {
        _pendingResponderTimers.forEach(clearTimeout);
        _pendingResponderTimers.clear();
    }
});

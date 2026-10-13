import {
    addBadgeVisibilityListener,
    BadgeSource,
    getOwnHiddenBadgeSources,
    removeBadgeVisibilityListener,
    setOwnHiddenBadgeSources,
} from "@api/BadgeVisibility";
import { useSettings } from "@api/Settings";
import { beginDiscordOAuth, checkOAuthToken, clearToken, getStoredToken, storeToken } from "@api/OAuth2";
import { authorizeCloud, deauthorizeCloud } from "@api/SettingsSync/cloudSetup";
import { deleteCloudSettings, eraseAllCloudData, getCloudSettings, putCloudSettings } from "@api/SettingsSync/cloudSync";

import { Button } from "@components/Button";
import { CheckedTextInput } from "@components/CheckedTextInput";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { CloudDownloadIcon, CloudUploadIcon, DeleteIcon } from "@components/Icons";
import { Link } from "@components/Link";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";

import { localStorage } from "@utils/localStorage";
import { Margins } from "@utils/margins";
import { openModal } from "@utils/modal";
import { useForceUpdater } from "@utils/react";
import { findComponentByCodeLazy } from "@webpack";
import { Alerts, React, useState, OAuth2AuthorizeModal } from "@webpack/common";
import { SafeSearchableSelect } from "@components/SafeSearchableSelect";
import { t } from "@api/i18n";
import { ILLEGALCORD_ICON_DATA_URI } from "@api/illegalcord_base64";

const ICON_STYLE: React.CSSProperties = { width: 20, height: 20, borderRadius: 4, verticalAlign: "middle" };
const LOLICORD_ICON_STYLE: React.CSSProperties = { width: 20, height: 20, borderRadius: 4, verticalAlign: "middle" };

const LOLICORD_ICON_DATA_URI = "data:image/png;base64,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"

function LoliCordIcon() {
    return <img src={LOLICORD_ICON_DATA_URI} alt="LoliCord" style={LOLICORD_ICON_STYLE} />;
}

function EquicordIcon() {
    return <img src="https://equicord.org/assets/favicon.png" alt="Equicord" style={ICON_STYLE} />;
}

function VencordIcon() {
    return <img src="https://equicord.org/assets/icons/vencord/icon-light.png" alt="Vencord" style={ICON_STYLE} />;
}

function GlobalBadgesIcon() {
    return <img src="https://equicord.org/assets/icons/misc/userplugin.png" alt="GlobalBadges" style={ICON_STYLE} />;
}

function IllegalcordIcon() {
    return <img src={ILLEGALCORD_ICON_DATA_URI} alt="Illegalcord" style={ICON_STYLE} />;
}

const RefreshIcon = findComponentByCodeLazy("M4 12a8 8 0 0 1 14.93-4H15");
const TrashIcon = findComponentByCodeLazy("2.81h8.36a3");

function validateUrl(url: string) {
    try {
        new URL(url);
        return true;
    } catch {
        return "Invalid URL";
    }
}

const cloudBackendOptions = [
    { label: "Equicord Cloud", value: "https://cloud.equicord.org/" },
    { label: "Vencord Cloud", value: "https://api.vencord.dev/" }
];

const syncDirectionOptions = [
    { label: "Two-way sync (changes go both directions)", value: "both" },
    { label: "This device is the source (upload only)", value: "push" },
    { label: "The cloud is the source (download only)", value: "pull" },
    { label: "Do not sync automatically (manual sync via buttons below only)", value: "manual" }
];

const BADGE_OPTIONS: Array<{ label: string; value: BadgeSource }> = [
    { label: "LoliCord Badges", value: "lolicord" },
    { label: "Equicord Badges", value: "equicord" },
    { label: "Vencord Badges", value: "vencord" },
    { label: "GlobalBadges", value: "globalbadges" },
    { label: "Illegalcord Badges", value: "illegalcord" },
];

function renderPrefix(option: { value: BadgeSource }) {
    switch (option.value) {
        case "lolicord": return <LoliCordIcon />;
        case "equicord": return <EquicordIcon />;
        case "vencord": return <VencordIcon />;
        case "globalbadges": return <GlobalBadgesIcon />;
        case "illegalcord": return <IllegalcordIcon />;
        default: return null;
    }
}

function CustomProfileSyncToggle() {
    const settings = useSettings();
    const [token, setToken] = React.useState<string | null>(null);
    const [checking, setChecking] = React.useState(true);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        let isMounted = true;
        getStoredToken().then(async t => {
            if (!isMounted) return;
            if (t) {
                const check = await checkOAuthToken(t);
                if (!isMounted) return;
                if (check?.valid) {
                    setToken(t);
                    settings.syncOwnCustomProfile = true;
                    settings.seeAllCustomProfile = true;
                } else {
                    await clearToken();
                    if (!isMounted) return;
                    settings.syncOwnCustomProfile = false;
                    settings.seeAllCustomProfile = false;
                }
            } else {
                settings.syncOwnCustomProfile = false;
                settings.seeAllCustomProfile = false;
            }
            setChecking(false);
        });
        return () => { isMounted = false; };
    }, []);

    const isEnabled = !!token;

    async function handleToggle(on: boolean) {
        if (busy) return;
        if (on) {
            setBusy(true);
            let oauthData: { url: string; redirectUri: string; scopes: string[]; clientId?: string; } | null = null;
            try {
                oauthData = await beginDiscordOAuth();
            } catch (e) {
                console.error("[CustomProfileSync] Failed to fetch OAuth config:", e);
                setBusy(false);
                return;
            }
            setBusy(false);

            let clientId = oauthData.clientId;
            if (!clientId) {
                try {
                    clientId = new URL(oauthData.url).searchParams.get("client_id") ?? undefined;
                } catch { }
            }
            if (!clientId) return;

            openModal(oauthProps => <OAuth2AuthorizeModal
                {...oauthProps}
                scopes={oauthData!.scopes}
                responseType="code"
                redirectUri={oauthData!.redirectUri}
                permissions={0n}
                clientId={clientId!}
                cancelCompletesFlow={false}
                callback={async ({ location }: any) => {
                    if (!location) return;
                    try {
                        const res = await fetch(location, { headers: { Accept: "application/json" } });
                        const { token: newToken } = await res.json();
                        if (newToken) {
                            await storeToken(newToken);
                            setToken(newToken);
                            settings.syncOwnCustomProfile = true;
                            settings.seeAllCustomProfile = true;
                        }
                    } catch (e) {
                        console.error("[CustomProfileSync] OAuth callback failed:", e);
                    }
                }}
            />);
        } else {
            setBusy(true);
            await clearToken();
            setToken(null);
            settings.syncOwnCustomProfile = false;
            settings.seeAllCustomProfile = false;
            setBusy(false);
        }
    }

    if (checking) return null;

    return (
        <div style={{ marginBottom: 16 }}>
            <FormSwitch
                value={isEnabled}
                onChange={handleToggle}
                title={t("LoliCord Sync")}
                description={isEnabled
                    ? t("Your custom profile is synced. Other LoliCord users can see your profile, and you can see theirs.")
                    : t("Enable to share your custom profile with other LoliCord users and see their profiles.")}
                disabled={busy}
            />

            {isEnabled && (
                <div style={{ marginTop: 4 }}>
                    <a role="button" onClick={async () => {
                        await clearToken();
                        setToken(null);
                        settings.syncOwnCustomProfile = false;
                        settings.seeAllCustomProfile = false;
                    }} style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                        {t("Disconnect account")}
                    </a>
                </div>
            )}
        </div>
    );
}

function CloudIntegrationSection() {
    const settings = useSettings(["cloud.authenticated", "cloud.url", "cloud.settingsSync"]);
    const [inputKey, setInputKey] = useState(0);
    const forceUpdate = useForceUpdater();

    const { cloud } = settings;
    const isAuthenticated = cloud.authenticated;
    const syncEnabled = isAuthenticated && cloud.settingsSync;

    async function changeUrl(url: string) {
        cloud.url = url;
        cloud.authenticated = false;

        await deauthorizeCloud();
        await authorizeCloud();

        setInputKey(prev => prev + 1);
    }

    return (
        <>
            <Heading className={Margins.top16}>{t("Cloud Integration")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("LoliCord's cloud integration allows you to sync your settings across multiple devices and Discord installations. Your data is securely stored and can be easily restored at any time.")}
            </Paragraph>

            <Notice.Info className={Margins.bottom16}>
                {t("We use our own LoliCord Cloud backend with enhanced features.")}
                {" "}
                {t("View our privacy policy to see what we store and how we use your data.")}
            </Notice.Info>

            <FormSwitch
                title={t("Enable Cloud Integration")}
                description={t("Connect to the cloud backend for settings synchronization. This will request authorization if you haven't set up cloud integration yet.")}
                value={isAuthenticated}
                onChange={v => {
                    if (v)
                        authorizeCloud();
                    else
                        cloud.authenticated = v;
                }}
                hideBorder
            />

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Cloud Backend")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Choose which cloud backend to use for storing your settings.")}
            </Paragraph>

            <div className={Margins.bottom8}>
                <SafeSearchableSelect
                    options={cloudBackendOptions}
                    value={cloudBackendOptions.find(o => o.value === cloud.url)?.value}
                    onChange={v => changeUrl(v)}
                    closeOnSelect={true}
                    renderOptionPrefix={o => {
                        if (o?.value?.includes("lolicord")) return <LoliCordIcon />;
                        if (o?.value?.includes("equicord")) return <EquicordIcon />;
                        return <VencordIcon />;
                    }}
                />
            </div>

            <Flex gap="8px" alignItems="center">
                <div style={{ flex: 1 }}>
                    <CheckedTextInput
                        key={"backendUrl-" + inputKey}
                        value={cloud.url}
                        onChange={async v => {
                            cloud.url = v;
                            cloud.authenticated = false;
                            await deauthorizeCloud();
                        }}
                        validate={validateUrl}
                    />
                </div>
                <Button
                    disabled={!isAuthenticated}
                    onClick={async () => {
                        cloud.authenticated = false;
                        await deauthorizeCloud();
                        await authorizeCloud();
                    }}
                >
                    <Flex gap="8px" alignItems="center">
                        <RefreshIcon color="currentColor" />
                        {t("Reauthorize")}
                    </Flex>
                </Button>
            </Flex>

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Settings Sync")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Synchronize your LoliCord settings to the cloud. This makes it easy to keep your configuration consistent across multiple devices without manual import/export.")}
            </Paragraph>

            <FormSwitch
                title={t("Enable Settings Sync")}
                description={t("When enabled, your settings can be synced to and from the cloud. Use the actions below to manually sync.")}
                value={cloud.settingsSync}
                onChange={v => { cloud.settingsSync = v; }}
                disabled={!isAuthenticated}
                hideBorder
            />

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Sync Rules for This Device")}</Heading>
            <Paragraph className={Margins.bottom16}>
                <span dangerouslySetInnerHTML={{ __html: t("This setting controls how settings move between <strong>this device</strong> and the cloud. You can let changes flow both ways, or choose one place to be the main source of truth.") }} />
            </Paragraph>

            <SafeSearchableSelect
                options={syncDirectionOptions}
                value={localStorage.Vencord_cloudSyncDirection ?? "both"}
                onChange={v => {
                    localStorage.Vencord_cloudSyncDirection = v;
                    forceUpdate();
                }}
                disabled={!syncEnabled}
                closeOnSelect={true}
            />

            <Flex gap="8px" className={Margins.top16}>
                <Button
                    style={{ flex: 1 }}
                    disabled={!syncEnabled}
                    onClick={() => putCloudSettings(true)}
                >
                    <Flex gap="8px" alignItems="center">
                        <CloudUploadIcon />
                        {t("Sync to Cloud")}
                    </Flex>
                </Button>
                <Button
                    style={{ flex: 1 }}
                    disabled={!syncEnabled}
                    onClick={() => getCloudSettings(true, true)}
                >
                    <Flex gap="8px" alignItems="center">
                        <CloudDownloadIcon />
                        {t("Sync from Cloud")}
                    </Flex>
                </Button>
            </Flex>

            {!isAuthenticated && (
                <Notice.Warning className={Margins.top8}>
                    {t("Enable cloud integration above to use settings sync features.")}
                </Notice.Warning>
            )}

            <Divider className={Margins.top20} />

            <Heading className={Margins.top20}>{t("Danger Zone")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Permanently delete all your data from the cloud. This action cannot be undone and will remove all synced settings and any other data stored on the cloud backend.")}
            </Paragraph>

            <Flex gap="8px">
                <Button
                    variant="dangerPrimary"
                    size="medium"
                    disabled={!syncEnabled}
                    onClick={() => deleteCloudSettings()}
                >
                    <Flex gap="8px" alignItems="center">
                        <TrashIcon color="currentColor" />
                        {t("Delete Cloud Settings")}
                    </Flex>
                </Button>
                <Button
                    variant="dangerSecondary"
                    size="medium"
                    disabled={!isAuthenticated}
                    onClick={() => Alerts.show({
                        title: t("Delete Cloud Account"),
                        body: t("Are you sure you want to permanently delete your cloud account and all associated data? This action cannot be undone."),
                        onConfirm: eraseAllCloudData,
                        confirmText: t("Delete Cloud Account"),
                        confirmColor: "vc-cloud-erase-data-danger-btn",
                        cancelText: t("Cancel")
                    })}
                >
                    <Flex gap="8px" alignItems="center">
                        <DeleteIcon />
                        {t("Delete Cloud Account")}
                    </Flex>
                </Button>
            </Flex>
        </>
    );
}

function SyncTab() {
    const [hidden, setHidden] = useState<BadgeSource[]>(getOwnHiddenBadgeSources());
    const [saving, setSaving] = useState(false);

    React.useEffect(() => {
        const listener = () => setHidden([...getOwnHiddenBadgeSources()]);
        addBadgeVisibilityListener(listener);
        return () => removeBadgeVisibilityListener(listener);
    }, []);

    async function onChange(next: BadgeSource[]) {
        setHidden(next);
        setSaving(true);
        try {
            await setOwnHiddenBadgeSources(next);
        } finally {
            setSaving(false);
        }
    }

    return (
        <SettingsTab>
            <CustomProfileSyncToggle />

            <Divider className={Margins.bottom16} />

            <CloudIntegrationSection />

            <Divider className={Margins.bottom16} />

            <Heading className={Margins.top16}>{t("Badges")}</Heading>
            <Paragraph className={Margins.bottom16}>
                {t("Choose which badge sources to hide on your own profile. Selected sources disappear from your profile for everyone — including yourself — wherever it's viewed.")}
            </Paragraph>

            <Notice.Info className={Margins.bottom16}>
                {t("This only affects your own profile. The first time you select a badge to hide, you'll be asked to sign in with Discord so your preference can be shared with others viewing your profile.")}
            </Notice.Info>

            <Divider className={Margins.bottom16} />

            <Heading className={Margins.bottom8} style={{ fontSize: 14 }}>{t("Hidden Badge Sources")}</Heading>
            <div className={Margins.bottom8}>
                <SafeSearchableSelect
                    multi
                    closeOnSelect={false}
                    options={BADGE_OPTIONS}
                    value={hidden}
                    placeholder={t("None hidden")}
                    onChange={onChange}
                    renderOptionPrefix={renderPrefix}
                />
            </div>

            {saving && (
                <Paragraph className={Margins.top8} style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {t("Saving...")}
                </Paragraph>
            )}
        </SettingsTab>
    );
}

export default wrapTab(SyncTab, "Synchronization");


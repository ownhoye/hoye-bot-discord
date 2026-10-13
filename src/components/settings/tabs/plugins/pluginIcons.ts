/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { iconsModule } from "@plugins/_core/concatenatedModules";
import { Plugin } from "@utils/types";
import { React } from "@webpack/common";

const PLUGIN_ICON_NAMES: Record<string, string[]> = {
    // LoliCord & Core Plugins
    AutoCallRecorder: ["PhoneCallIcon", "MicrophoneIcon", "VoiceIcon", "AudioIcon"],
    FakeNitro: ["NitroWheelIcon", "SparklesIcon", "GiftIcon", "NitroIcon"],
    ServerCloner: ["CopyIcon", "DuplicateIcon", "ServerIcon", "FolderIcon", "GuildIcon"],
    SoundCloud: ["HeadphonesIcon", "MusicIcon", "PlayIcon", "AudioIcon"],
    PreviewWebsite: ["CompassIcon", "GlobeEarthIcon", "BrowserIcon", "LinkIcon"],
    PreviewHTML: ["AngleBracketsIcon", "CodeIcon", "DocumentIcon"],
    CustomProfile: ["PaintbrushIcon", "UserIcon", "EditIcon", "UserEditIcon"],
    FakeDM: ["ChatPlusIcon", "ChatIcon", "MessageIcon", "ChatSparkleIcon"],
    FakeVoice: ["GhostIcon", "VoiceIcon", "DeafenedIcon", "MicrophoneIcon"],
    GhostClient: ["GhostIcon", "VoiceIcon", "UserIcon"],
    GhostInstaller: ["GhostIcon", "DownloadIcon", "WrenchIcon"],
    GhostClientInstaller: ["GhostIcon", "DownloadIcon", "WrenchIcon"],
    MessageLogger: ["EyeIcon", "HistoryIcon", "ChatIcon", "ClockIcon"],
    ShowHiddenChannels: ["ChannelLockIcon", "EyeSlashIcon", "LockIcon", "ChatLockIcon"],
    AntiSpam: ["ShieldIcon", "ShieldAlertIcon", "ShieldCheckIcon"],
    AntiRaid: ["ShieldIcon", "ShieldAlertIcon", "GavelIcon"],
    AuditLog: ["ScrollIcon", "ListBulletsIcon", "BookIcon"],
    BetterFolders: ["FolderIcon", "FolderOpenIcon", "FolderSettingsIcon"],
    CallTimer: ["ClockIcon", "HourglassIcon", "PhoneCallIcon"],
    ClearChat: ["TrashIcon", "BroomIcon", "ChatDeleteIcon"],
    CrashHandler: ["BugIcon", "AlertTriangleIcon", "WrenchIcon"],
    Experiments: ["FlaskIcon", "BeakerIcon", "WrenchIcon"],
    FavoriteGifs: ["StarIcon", "HeartIcon", "GiftIcon"],
    ImageZoom: ["MagnifyingGlassPlusIcon", "SearchIcon", "ImageIcon"],
    MoreKaomoji: ["EmoticonIcon", "SmileIcon", "ChatSparkleIcon"],
    NoTrack: ["EyeSlashIcon", "ShieldCheckIcon", "LockIcon"],
    OpenInApp: ["ExternalLinkIcon", "ShareIcon", "LaunchIcon"],
    PermissionsViewer: ["KeyIcon", "LockUnlockedIcon", "ShieldIcon"],
    PinDMs: ["PinIcon", "PushpinIcon", "ChatIcon"],
    SaveGroups: ["FolderIcon", "ArchiveIcon", "ChatIcon", "GroupIcon"],
    QuickMention: ["AtSignIcon", "ChatIcon", "UserIcon"],
    ReadAllNotifications: ["DoubleCheckmarkIcon", "CheckmarkIcon", "BellIcon"],
    RelationshipNotifier: ["UserPlusIcon", "HeartAlertIcon", "UserIcon"],
    SilentTyping: ["KeyboardIcon", "WaveformIcon", "ChatIcon"],
    ThemeAttributes: ["PaletteIcon", "PaintbrushIcon", "SparklesIcon"],
    UrbanDictionary: ["BookIcon", "NotebookIcon", "SearchIcon"],
    VoiceDownload: ["DownloadIcon", "FileAudioIcon", "VoiceIcon"],
    VolumeBooster: ["VolumeHighIcon", "SpeakerHighIcon", "AudioIcon"],
    AutoTranslate: ["TranslateIcon", "GlobeEarthIcon", "ChatIcon"],
    SpotifyControls: ["MusicIcon", "PlayIcon", "HeadphonesIcon"],
    SpotifyShare: ["MusicIcon", "ShareIcon", "LinkIcon"],
    CompactMode: ["WindowIcon", "CompressIcon", "LayoutIcon"],
    FollowMe: ["UserPlusIcon", "GroupIcon", "UserIcon"],
    DMBomb: ["BombIcon", "ChatPlusIcon", "ChatIcon"],
    DMPinnedMessages: ["PinIcon", "PushpinIcon", "ChatIcon"],
    GameActivity: ["GameControllerIcon", "PlayIcon", "GamepadIcon"],
    Greentext: ["ChatIcon", "AlignLeftIcon", "FormatTextIcon"],
    HideDisabledEmojis: ["EyeSlashIcon", "EmoticonIcon", "SmileIcon"],
    InvisibleChat: ["EyeSlashIcon", "GhostIcon", "LockIcon"],
    MemberCount: ["GroupIcon", "UserPlusIcon", "UserIcon"],
    MessageClickActions: ["CursorClickIcon", "ChatIcon", "PointerIcon"],
    MessageLinkEmbed: ["LinkIcon", "AttachmentIcon", "ChatIcon"],
    MutualServers: ["GuildIcon", "ServerIcon", "GroupIcon"],
    NoDeleteConfirmation: ["TrashIcon", "CheckmarkIcon"],
    NoReplyMention: ["AtSignIcon", "BellSlashIcon", "ChatIcon"],
    NoTypingAnimation: ["KeyboardIcon", "WaveformIcon"],
    NotificationVolume: ["VolumeHighIcon", "BellIcon", "SpeakerHighIcon"],
    OpenStreamInPopout: ["ScreenIcon", "WindowIcon", "VideoIcon"],
    PlatformIndicators: ["LaptopIcon", "MobilePhoneIcon", "DevicesIcon"],
    PreviewMessage: ["EyeIcon", "ChatIcon", "ChatSparkleIcon"],
    PronounDB: ["UserIcon", "ChatIcon", "UserQuestionIcon"],
    QuickReply: ["ChatReplyIcon", "ChatIcon", "ArrowAngleLeftUpIcon"],
    ReactionErrorNotifier: ["AlertTriangleIcon", "EmoticonIcon", "AlertCircleIcon"],
    ReplyTimestamp: ["ClockIcon", "CalendarIcon", "HistoryIcon"],
    ReverseImageSearch: ["SearchIcon", "ImageIcon", "MagnifyingGlassPlusIcon"],
    RoleColorEverywhere: ["PaletteIcon", "PaintbrushIcon", "CircleIcon"],
    SearchReply: ["SearchIcon", "ChatIcon", "MagnifyingGlassIcon"],
    SendTimestamps: ["ClockIcon", "CalendarIcon", "ChatIcon"],
    ShowAllMessageActions: ["MoreHorizontalIcon", "MenuIcon", "DotsIcon"],
    ShowBadgesInChat: ["ShieldCheckIcon", "StarIcon", "AwardIcon"],
    ShowConnections: ["LinkIcon", "GlobeEarthIcon", "DevicesIcon"],
    ShowTimeouts: ["ClockIcon", "HourglassIcon", "GavelIcon"],
    SortFriendList: ["SortIcon", "ListBulletsIcon", "UserIcon"],
    SplitLargeMessages: ["ScissorsIcon", "ChatIcon", "SplitIcon"],
    StickerPaste: ["StickerIcon", "EmoticonIcon", "ImageIcon"],
    TimeBarAllActivities: ["ClockIcon", "PlayIcon", "HistoryIcon"],
    TypingIndicator: ["KeyboardIcon", "WaveformIcon", "ChatDotsIcon"],
    TypingTweaks: ["KeyboardIcon", "EditIcon", "FormatTextIcon"],
    Unindent: ["AlignLeftIcon", "FormatTextIcon", "ChatIcon"],
    UnsuppressEmbeds: ["ImageIcon", "AttachmentIcon", "LinkIcon"],
    UserVoiceShow: ["VoiceIcon", "MicrophoneIcon", "UserIcon"],
    ValidUser: ["CheckmarkIcon", "UserCheckIcon", "UserIcon"],
    VoiceChatUtilities: ["MicrophoneIcon", "VoiceIcon", "WrenchIcon"],
    VoiceMessages: ["WaveformIcon", "MicrophoneIcon", "AudioIcon"],
    WebKeybinds: ["KeyboardIcon", "KeyIcon", "WrenchIcon"],
    WhoReacted: ["EmoticonIcon", "HeartIcon", "UserIcon"],
    WikiSearch: ["BookIcon", "SearchIcon", "GlobeEarthIcon"],
    YouTubeAdblock: ["PlayIcon", "ShieldIcon", "VideoIcon"],
    AlwaysAnimate: ["SparklesIcon", "PlayIcon", "StarIcon"],
    AnonymiseFileNames: ["EyeSlashIcon", "AttachmentIcon", "FileIcon"],
    Badges: ["StarIcon", "ShieldCheckIcon", "AwardIcon"],
    BetterRoleDot: ["CircleIcon", "PaletteIcon", "ShieldIcon"],
    BetterSessions: ["ShieldIcon", "DevicesIcon", "LockIcon"],
    BetterUploadButton: ["PlusIcon", "AttachmentIcon", "UploadIcon"],
    BiggerStreamPreview: ["ScreenIcon", "VideoIcon", "MagnifyingGlassPlusIcon"],
    BlurNSFW: ["EyeSlashIcon", "ShieldIcon", "LockIcon"],
    CopyUserURLs: ["CopyIcon", "LinkIcon", "UserIcon"],
    CustomRPC: ["GameControllerIcon", "PlayIcon", "GamepadIcon"],
    DisableCallIdle: ["PhoneCallIcon", "ClockIcon", "PhoneIcon"],
    EquicordHelper: ["QuestionMarkIcon", "HelpIcon", "SparklesIcon"],
    FriendsSince: ["HeartIcon", "CalendarIcon", "UserIcon"],
    FullSearchContext: ["SearchIcon", "ChatIcon", "MagnifyingGlassIcon"],
    GoogleSearch: ["SearchIcon", "GlobeEarthIcon", "MagnifyingGlassIcon"],
    HoldToRecord: ["MicrophoneIcon", "WaveformIcon", "AudioIcon"],
    KeepCurrentChannel: ["PinIcon", "ChatIcon", "ChannelLockIcon"],
    LastMessageDate: ["ClockIcon", "CalendarIcon", "HistoryIcon"],
    MentionAvatars: ["AtSignIcon", "UserIcon", "ChatIcon"],
    MessageAccessories: ["ChatIcon", "AttachmentIcon", "SparklesIcon"],
    NoDevtoolsWarning: ["TerminalIcon", "CodeIcon", "WrenchIcon"],
    NoFrecency: ["ClockIcon", "SparklesIcon", "HistoryIcon"],
    NormalizeMessageLinks: ["LinkIcon", "AttachmentIcon", "ChatIcon"],
    NotificationSounds: ["BellIcon", "VolumeHighIcon", "AudioIcon"],
    OnePingPerDM: ["BellIcon", "ChatIcon", "AtSignIcon"],
    OpenInExternalApp: ["ExternalLinkIcon", "ShareIcon", "LaunchIcon"],
    OverrideFormulaColor: ["PaletteIcon", "PaintbrushIcon", "CircleIcon"],
    PlainFolderIcon: ["FolderIcon", "FolderOpenIcon"],
    PreviewInlineAudio: ["PlayIcon", "VolumeHighIcon", "AudioIcon"],
    QuickLeave: ["DoorExitIcon", "LeaveIcon", "ArrowAngleRightUpIcon"],
    QuickQuote: ["QuoteIcon", "ChatIcon", "FormatTextIcon"],
    RawEmbeds: ["CodeIcon", "AngleBracketsIcon", "DocumentIcon"],
    ReactErrorNotifier: ["AlertTriangleIcon", "EmoticonIcon", "AlertCircleIcon"],
    RoleMembers: ["GroupIcon", "UserIcon", "ShieldIcon"],
    SaveToClipboard: ["CopyIcon", "ClipboardIcon", "SaveIcon"],
    SecretRingTone: ["PhoneCallIcon", "MusicIcon", "AudioIcon"],
    SelectWholeWord: ["CursorIcon", "EditIcon", "PointerIcon"],
    SendPluginList: ["ShareIcon", "ListBulletsIcon", "DocumentIcon"],
    ShowAllRoles: ["ShieldIcon", "UserIcon", "CircleIcon"],
    ShowHiddenThings: ["EyeIcon", "SearchIcon", "LockUnlockedIcon"],
    ShowTimeoutDuration: ["ClockIcon", "HourglassIcon", "GavelIcon"],
    SilentMessageToggle: ["BellSlashIcon", "ChatIcon", "NotificationOffIcon"],
    SpotifyCrack: ["MusicIcon", "PlayIcon", "HeadphonesIcon"],
    StreamerModePlus: ["ScreenIcon", "VideoIcon", "ShieldIcon"],
    SuperReactionsToggle: ["SparklesIcon", "HeartIcon", "StarIcon"],
    TextReplace: ["EditIcon", "ChatIcon", "FormatTextIcon"],
    ToneIndicators: ["ChatIcon", "QuestionMarkIcon", "EmoticonIcon"],
    TranslateMessage: ["TranslateIcon", "GlobeEarthIcon", "ChatIcon"],
    UnlimitedAccounts: ["UserPlusIcon", "UserIcon", "GroupIcon"],
    ViewIcons: ["ImageIcon", "SearchIcon", "SparklesIcon"],
    ViewRaw: ["CodeIcon", "AngleBracketsIcon", "DocumentIcon"],
    VoiceActivity: ["WaveformIcon", "MicrophoneIcon", "VoiceIcon"],
    WebContextMenus: ["MenuIcon", "ListBulletsIcon", "MoreHorizontalIcon"],
    WebRichPresence: ["GameControllerIcon", "PlayIcon", "GamepadIcon"],
    WordFilter: ["ShieldIcon", "EyeSlashIcon", "ChatLockIcon"],
    Equiboy: ["GameControllerIcon", "PlayIcon", "GamepadIcon"],
    NitroThemeColours: ["PaletteIcon", "SparklesIcon", "NitroWheelIcon"],
    OpenInDefaultApp: ["ExternalLinkIcon", "ShareIcon", "LaunchIcon"],
    PartyServer: ["SparklesIcon", "GroupIcon", "GuildIcon"],
    ReadLocalTracks: ["MusicIcon", "FolderIcon", "AudioIcon"],
    RevertReactions: ["EmoticonIcon", "UndoIcon", "HeartIcon"],
    SaveChat: ["DownloadIcon", "ChatIcon", "SaveIcon"],
    SuperReactionTimer: ["ClockIcon", "SparklesIcon", "HourglassIcon"],
    TotalMessageCount: ["ChatIcon", "ListBulletsIcon", "DocumentIcon"],
    VcNsfw: ["EyeSlashIcon", "VoiceIcon", "LockIcon"],
    VencordToolbox: ["WrenchIcon", "SettingsIcon", "HammerIcon"],
    VoiceSpam: ["VolumeHighIcon", "MicrophoneIcon", "AudioIcon"],
    WhosWatching: ["EyeIcon", "ScreenIcon", "VideoIcon"],
    ClientDiagnostics: ["WrenchIcon", "BugIcon", "TerminalIcon"],
    StereoInstaller: ["AudioIcon", "VolumeHighIcon", "HeadphonesIcon"],
    SecureBookmarks: ["BookmarkIcon", "LockIcon", "StarIcon"],
    StatusCycler: ["ClockIcon", "SparklesIcon", "RefreshIcon"],
    Surveillance: ["EyeIcon", "ShieldIcon", "CameraIcon"],
    MutualScanner: ["SearchIcon", "GroupIcon", "UserIcon"],
    DynamicIslande: ["SparklesIcon", "LayoutIcon", "WindowIcon"],
};

interface KeywordRule {
    keywords: string[];
    icons: string[];
}

const KEYWORD_RULES: KeywordRule[] = [
    { keywords: ["voice", "call", "mic", "recorder", "audio", "sound", "speak", "listen", "deaf", "mute", "speaker"], icons: ["MicrophoneIcon", "VoiceIcon", "VolumeHighIcon", "AudioIcon", "PhoneCallIcon"] },
    { keywords: ["music", "song", "spotify", "soundcloud", "track", "playlist", "radio", "melody"], icons: ["MusicIcon", "HeadphonesIcon", "PlayIcon"] },
    { keywords: ["video", "stream", "screen", "camera", "watch", "live", "recording"], icons: ["ScreenIcon", "VideoIcon", "CameraIcon"] },
    { keywords: ["chat", "message", "dm", "text", "type", "typing", "reply", "quote", "greentext", "talk"], icons: ["ChatIcon", "ChatPlusIcon", "ChatSparkleIcon"] },
    { keywords: ["theme", "color", "colour", "css", "style", "visual", "look", "custom", "paint"], icons: ["PaletteIcon", "PaintbrushIcon", "SparklesIcon"] },
    { keywords: ["user", "friend", "member", "profile", "avatar", "bio", "account", "person", "who", "pronoun"], icons: ["UserIcon", "GroupIcon", "UserPlusIcon"] },
    { keywords: ["server", "guild", "clone", "cloner", "channel", "folder", "tree"], icons: ["ServerIcon", "FolderIcon", "GuildIcon", "CopyIcon"] },
    { keywords: ["shield", "anti", "safe", "secure", "protect", "block", "lock", "filter", "hide", "secret", "anon", "blur"], icons: ["ShieldIcon", "LockIcon", "EyeSlashIcon", "ShieldCheckIcon"] },
    { keywords: ["search", "find", "lookup", "query", "explore", "view", "scan", "zoom", "inspect"], icons: ["SearchIcon", "EyeIcon", "MagnifyingGlassPlusIcon"] },
    { keywords: ["time", "clock", "date", "timer", "history", "recent", "last", "timestamp", "duration"], icons: ["ClockIcon", "HourglassIcon", "CalendarIcon"] },
    { keywords: ["code", "dev", "debug", "raw", "html", "json", "embed", "script", "api", "tools", "util"], icons: ["AngleBracketsIcon", "TerminalIcon", "CodeIcon", "WrenchIcon"] },
    { keywords: ["game", "rpc", "play", "activity", "gamepad"], icons: ["GameControllerIcon", "PlayIcon"] },
    { keywords: ["link", "url", "open", "external", "redirect", "web", "browser", "website", "share"], icons: ["LinkIcon", "CompassIcon", "ExternalLinkIcon", "GlobeEarthIcon"] },
    { keywords: ["copy", "clipboard", "duplicate", "paste", "save", "download"], icons: ["CopyIcon", "DownloadIcon", "SaveIcon"] },
    { keywords: ["star", "fav", "heart", "like", "boost", "nitro", "sparkle", "badge", "award"], icons: ["SparklesIcon", "StarIcon", "HeartIcon", "NitroWheelIcon"] },
    { keywords: ["emoji", "sticker", "react", "smile", "kaomoji", "gif"], icons: ["EmoticonIcon", "SmileIcon", "GiftIcon"] },
    { keywords: ["setting", "config", "option", "tweak", "setup"], icons: ["SettingsIcon", "WrenchIcon"] },
];

export function getPluginIcon(plugin: Plugin): React.ComponentType<any> | undefined {
    // 1. Direct icon on plugin definition
    const explicitIcon = (plugin as any).icon ||
                         plugin.headerBarButton?.icon ||
                         plugin.chatBarButton?.icon ||
                         plugin.messagePopoverButton?.icon ||
                         plugin.userAreaButton?.icon;
    if (explicitIcon) return explicitIcon;

    if (!iconsModule || typeof iconsModule !== "object") return undefined;

    // 2. Exact match in name map
    const mappedNames = PLUGIN_ICON_NAMES[plugin.name];
    if (mappedNames) {
        for (const name of mappedNames) {
            if (typeof iconsModule[name] === "function") {
                return iconsModule[name];
            }
        }
    }

    // 3. Keyword matching based on plugin name + description
    const text = `${plugin.name} ${plugin.description || ""}`.toLowerCase();
    for (const rule of KEYWORD_RULES) {
        if (rule.keywords.some(k => text.includes(k))) {
            for (const name of rule.icons) {
                if (typeof iconsModule[name] === "function") {
                    return iconsModule[name];
                }
            }
        }
    }

    // 4. Default fallback icon from iconsModule
    return iconsModule.SparklesIcon || iconsModule.AngleBracketsIcon || iconsModule.ChatIcon;
}

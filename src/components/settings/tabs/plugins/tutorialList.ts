/*
 * LoliCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * AUTO-GENERATED — do not edit by hand.
 * Update by running: node scripts/updateTutorialList.mjs
 */

/**
 * Maps a plugin's `name` to the basename (without extension) of its tutorial
 * video in the tutorials repository
 */
export const TUTORIAL_VIDEOS: ReadonlyMap<string, string> = new Map([
    ["Abbreviation", "Abbreviation"],
    ["AnonymiseFileNames", "AnonymiseFileNames"],
    ["AntiGroup", "AntiGroup"],
    ["AntiMoveDeco", "AntiMoveDeco"],
    ["AntiNickname", "AntiNickname"],
    ["AudioLimiter", "AudioLimiter"],
    ["AutoCallRecorder", "AutoCallRecorder"],
    ["AutoCorrect", "AutoCorrect"],
    ["AutoReply", "AutoReply"],
    ["AutoResponder", "AutoResponder"],
    ["AutoUnmute", "AutoUnmute"],
    ["Backpack", "BackPack"],
    ["BigFileUpload", "BigFileUpload"],
    ["BulkFriendRemove", "BulkFriendRemove"],
    ["CallTimer", "CallTimer"],
    ["CancelFriendRequest", "CancelFriendRequest"],
    ["ChannelWallpaper", "ChannelWallpaper"],
    ["ClearDMs", "ClearDMs"],
    ["ClearGroups", "ClearGroups"],
    ["CloseGroup", "CloseGroup"],
    ["CrashHandler", "CrashHandler"],
    ["CreateTheme", "CreateTheme"],
    ["CustomProfile", "CustomProfile"],
    ["DMBomb", "DMBomb"],
    ["DoubleCall", "DoubleCall"],
    ["DoubleEmoji", "DoubleEmoji"],
    ["EncryptedMessage", "EncryptedMessage"],
    ["EventLogs", "EventLogs"],
    ["ExportDM", "ExportDM"],
    ["Fake Voice Option", "Fake Voice Option"],
    ["FakeDeafen", "FakeDeafen"],
    ["FakeDM", "FakeDM"],
    ["FakeFriends", "FakeFriends"],
    ["FakeNitro", "Fakenitro"],
    ["FakePerm", "FakePerm"],
    ["FakeSwitcher", "FakeSwitcher"],
    ["FakeVoice", "FakeVoice"],
    ["FastPFP", "FastPFP"],
    ["FastPing", "FastPing"],
    ["FloodPanel", "FloodPanel"],
    ["FollowMe", "Followme"],
    ["FollowUser", "FollowUser"],
    ["GhostClient", "GhostClient"],
    ["GifConvertor", "Gifconvertor"],
    ["HideMedia", "HideMedia"],
    ["IgnoreCalls", "IgnoreCalls"],
    ["ImageZoom", "ImageZoom"],
    ["Impersonate", "Impersonate"],
    ["LastSeen", "lastseen"],
    ["LeaveAllServers", "leaveallservers"],
    ["LiveWallpaper", "LiveWallpaper"],
    ["LockGroup", "LockGroup"],
    ["MacOsButtons", "macosbuttons"],
    ["MassDM", "MassDM"],
    ["MemberCount", "MemberCount"],
    ["MessageCleaner", "MessageCleaner"],
    ["MessageLogger", "MessageLogger"],
    ["MessageLoggerEnhanced", "MessageLoggerEnhanced"],
    ["MultiInstance", "MultiInstance"],
    ["MuteAllServers", "MuteAllServers"],
    ["LoliCordAI", "lolicordai"],
    ["NoCaps", "NoCaps"],
    ["passcodeLock", "passcodeLock"],
    ["PlatformIndicators", "PlatformIndicators"],
    ["PreviewHTML", "PreviewHTML"],
    ["PreviewWebsite", "PreviewWebsite"],
    ["PrevNames", "prevnames"],
    ["QxChat", "QxChat"],
    ["RealtimeTimestamps", "realtimetimestamps"],
    ["ReverseImageSearch", "ReverseImageSearch"],
    ["SaveProfile", "SaveProfile"],
    ["SaveThem", "SaveThem"],
    ["SaveVideos", "SaveVideos"],
    ["SecureBookmarks", "SecureBookMarks"],
    ["SelfDestruct", "SelfDestruct"],
    ["ServerCloner", "ServerCloner"],
    ["SharePerms", "SharePerms"],
    ["ShowHiddenChannels", "ShowHiddenChannels"],
    ["ShowHiddenThings", "ShowHiddenThings"],
    ["ShowID", "showid"],
    ["SilentDelete", "SilentDelete"],
    ["SilentEdit", "SilentEdit"],
    ["SmoothType", "smoothtype"],
    ["SoundCordPlayer", "SoundCordPlayer"],
    ["StatusCycler", "StatusCycler"],
    ["StreamProof", "StreamProof"],
    ["TokenImporter", "TokenImporter"],
    ["Translate", "Translate"],
    ["UnlimitedAccount", "UnlimitedAccount"],
    ["UserVoiceShow", "UserVoiceShow"],
    ["ValidUser", "ValidUser"],
    ["VideoRecorder", "VideoRecorder"],
    ["ViewIcons", "ViewIcons"],
    ["VoiceChannelSearch", "VoiceChannelSearch"],
    ["VoiceDictation", "voicedictation"],
    ["VoiceDownload", "VoiceDownload"],
    ["VoiceMessages", "VoiceMessages"],
    ["VolumeBooster", "VolumeBooster"],
    ["WhosWatching", "WhosWatching"],
    ["youtubePlayer", "youtubeplayer"],
]);

export const TUTORIAL_PLUGIN_NAMES = new Set(TUTORIAL_VIDEOS.keys());

export function hasTutorial(pluginName: string): boolean {
    return TUTORIAL_VIDEOS.has(pluginName);
}

export function getTutorialVideoName(pluginName: string): string | undefined {
    return TUTORIAL_VIDEOS.get(pluginName);
}

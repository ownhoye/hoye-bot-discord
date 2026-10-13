import { proxyLazy } from "@utils/lazy";
import { sleep } from "@utils/misc";
import { Queue } from "@utils/Queue";
import { ChannelActionCreators, ChannelStore, Flux, FluxDispatcher, GuildChannelStore } from "@webpack/common";

export const OnlineMemberCountStore = proxyLazy(() => {
    const preloadQueue = new Queue();

    const onlineMemberMap = new Map<string, number>();

    class OnlineMemberCountStore extends Flux.Store {
        getCount(guildId?: string) {
            return onlineMemberMap.get(guildId!);
        }

        async _ensureCount(guildId: string) {
            if (onlineMemberMap.has(guildId)) return;

            let channel = GuildChannelStore.getDefaultChannel(guildId);
            if (!channel) {
                const channels = GuildChannelStore.getChannels(guildId);
                const flat: any[] = [];
                for (const arr of Object.values(channels ?? {})) {
                    if (Array.isArray(arr)) for (const item of arr) flat.push(item?.channel ?? item);
                }
                channel = flat.find(c => c?.id) ?? null;
            }
            if (!channel) {
                const all = ChannelStore.getChannels?.() ?? {};
                const list = Array.isArray(all) ? all : Object.values(all);
                channel = list.find((c: any) => c?.guild_id === guildId) ?? null;
            }
            if (!channel?.id) return;

            try {
                await ChannelActionCreators.preload(guildId, channel.id);
            } catch { }
        }

        ensureCount(guildId?: string) {
            if (!guildId || onlineMemberMap.has(guildId)) return;

            preloadQueue.push(() =>
                this._ensureCount(guildId)
                    .then(
                        () => sleep(200),
                        () => sleep(200)
                    )
            );
        }
    }

    return new OnlineMemberCountStore(FluxDispatcher, {
        GUILD_MEMBER_LIST_UPDATE({ guildId, groups }: { guildId: string, groups: { count: number; id: string; }[]; }) {
            if (!groups || !Array.isArray(groups)) return;
            onlineMemberMap.set(
                guildId,
                groups.reduce((total, curr) => total + (curr.id === "offline" ? 0 : curr.count), 0)
            );
        },
        ONLINE_GUILD_MEMBER_COUNT_UPDATE({ guildId, count }) {
            if (typeof count === "number") onlineMemberMap.set(guildId, count);
        }
    });
});


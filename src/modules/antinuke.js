const { AuditLogEvent, PermissionsBitField, PermissionFlagsBits } = require('discord.js');
const db = require('../structures/Database');
const { MODULES, PUNISHMENTS } = require('./definitions');
const { punish } = require('./sanctions');
const { isImmune } = require('../utils/perms');
const { sendLog } = require('../utils/logger');

const DANGEROUS = new PermissionsBitField([
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.MentionEveryone,
]).bitfield;

const hasDangerous = (bits) => (BigInt(bits ?? 0) & DANGEROUS) !== 0n;
const gainedDangerous = (oldBits, newBits) => {
  const added = BigInt(newBits ?? 0) & ~BigInt(oldBits ?? 0);
  return (added & DANGEROUS) !== 0n;
};

// ───── Cache des salons / rôles supprimés (pour pouvoir les recréer) ─────
const deleted = { channels: new Map(), roles: new Map() };
function remember(type, object) {
  deleted[type].set(object.id, object);
  setTimeout(() => deleted[type].delete(object.id), 60_000).unref();
}

// ───── Compteurs d'actions par auteur ─────
const counters = new Map();
const recentlyPunished = new Map();
const reason = (mod) => `[Protection] ${MODULES[mod].name}`;

/**
 * Enregistre une action suspecte. Si le seuil du module est dépassé :
 * sanction de l'auteur + annulation de toutes ses actions récentes.
 */
async function trigger(guild, moduleKey, executorId, { revert, detail, force = false }) {
  const settings = db.guild(guild.id).protections[moduleKey];
  if (!settings?.enabled) return;

  const punishedKey = `${guild.id}:${executorId}`;
  // Auteur déjà sanctionné il y a peu : on annule directement ses actions restantes.
  if (recentlyPunished.has(punishedKey)) {
    await revert?.().catch(() => null);
    return;
  }

  const key = `${guild.id}:${executorId}:${moduleKey}`;
  const now = Date.now();
  const windowMs = (settings.interval ?? 10) * 1000;
  const actions = (counters.get(key) ?? []).filter((a) => now - a.time < windowMs);
  actions.push({ time: now, revert, detail });
  counters.set(key, actions);

  if (!force && actions.length <= (settings.limit ?? 0)) return;

  counters.delete(key);
  recentlyPunished.set(punishedKey, now);
  setTimeout(() => recentlyPunished.delete(punishedKey), 30_000).unref();

  // 1) On neutralise l'auteur d'abord, 2) puis on annule les dégâts.
  const result = await punish(guild, executorId, settings.punishment, reason(moduleKey));
  const reverts = await Promise.allSettled(actions.map((a) => (a.revert ? a.revert() : Promise.resolve())));
  const restored = reverts.filter((r) => r.status === 'fulfilled').length;

  const mod = MODULES[moduleKey];
  await sendLog(guild, 'protection', {
    title: `🛡️ Protection déclenchée — ${mod.emoji} ${mod.name}`,
    description: [
      `**Auteur :** <@${executorId}> (\`${executorId}\`)`,
      `**Sanction :** ${PUNISHMENTS[settings.punishment]?.emoji ?? ''} ${result.ok ? result.text : `⚠️ ${result.text}`}`,
      `**Actions annulées :** ${restored}/${actions.length}`,
    ].join('\n'),
    fields: [{ name: 'Détails', value: actions.map((a) => `• ${a.detail}`).join('\n').slice(0, 1000) }],
  });
}

// ───── Restauration ─────
async function restoreChannel(guild, channel, why) {
  if (!channel) throw new Error('Salon introuvable dans le cache');
  const overwrites = channel.permissionOverwrites?.cache
    .filter((o) => guild.roles.cache.has(o.id) || guild.members.cache.has(o.id))
    .map((o) => ({ id: o.id, type: o.type, allow: o.allow.bitfield, deny: o.deny.bitfield }));
  return guild.channels.create({
    name: channel.name,
    type: channel.type,
    parent: channel.parentId && guild.channels.cache.has(channel.parentId) ? channel.parentId : null,
    topic: channel.topic ?? undefined,
    nsfw: channel.nsfw ?? undefined,
    rateLimitPerUser: channel.rateLimitPerUser || undefined,
    bitrate: channel.bitrate ?? undefined,
    userLimit: channel.userLimit ?? undefined,
    position: channel.rawPosition,
    permissionOverwrites: overwrites,
    reason: why,
  });
}

async function restoreRole(guild, role, why) {
  if (!role) throw new Error('Rôle introuvable dans le cache');
  return guild.roles.create({
    name: role.name,
    colors: role.colors,
    hoist: role.hoist,
    permissions: role.permissions,
    mentionable: role.mentionable,
    position: role.position,
    reason: why,
  });
}

const CHANNEL_KEYS = {
  name: 'name',
  topic: 'topic',
  nsfw: 'nsfw',
  rate_limit_per_user: 'rateLimitPerUser',
  bitrate: 'bitrate',
  user_limit: 'userLimit',
};
const ROLE_KEYS = { name: 'name', color: 'color', hoist: 'hoist', mentionable: 'mentionable', permissions: 'permissions' };

function oldValues(changes, map) {
  const data = {};
  for (const change of changes) {
    if (map[change.key]) data[map[change.key]] = change.old ?? null;
  }
  return data;
}

const pending = (ms) => new Promise((r) => setTimeout(r, ms));

// ───── Gestionnaires par type d'entrée du journal d'audit ─────
const HANDLERS = {
  [AuditLogEvent.ChannelCreate]: (entry, guild) =>
    trigger(guild, 'antichannel', entry.executorId, {
      detail: `Création du salon \`${entry.target?.name ?? entry.targetId}\``,
      revert: () => guild.channels.cache.get(entry.targetId)?.delete(reason('antichannel')),
    }),

  [AuditLogEvent.ChannelDelete]: (entry, guild) =>
    trigger(guild, 'antichannel', entry.executorId, {
      detail: `Suppression du salon \`${entry.target?.name ?? entry.targetId}\``,
      revert: async () => {
        if (!deleted.channels.has(entry.targetId)) await pending(1500);
        await restoreChannel(guild, deleted.channels.get(entry.targetId), reason('antichannel'));
      },
    }),

  [AuditLogEvent.ChannelUpdate]: (entry, guild) => {
    // On ignore les simples déplacements (position) pour éviter les faux positifs.
    if (!entry.changes.some((c) => c.key in CHANNEL_KEYS)) return;
    return trigger(guild, 'antichannel', entry.executorId, {
      detail: `Modification du salon <#${entry.targetId}>`,
      revert: () => {
        const data = oldValues(entry.changes, CHANNEL_KEYS);
        return guild.channels.cache.get(entry.targetId)?.edit({ ...data, reason: reason('antichannel') });
      },
    });
  },

  [AuditLogEvent.RoleCreate]: (entry, guild) =>
    trigger(guild, 'antirole', entry.executorId, {
      detail: `Création du rôle \`${entry.target?.name ?? entry.targetId}\``,
      revert: () => guild.roles.cache.get(entry.targetId)?.delete(reason('antirole')),
    }),

  [AuditLogEvent.RoleDelete]: (entry, guild) =>
    trigger(guild, 'antirole', entry.executorId, {
      detail: `Suppression du rôle \`${entry.target?.name ?? entry.targetId}\``,
      revert: async () => {
        if (!deleted.roles.has(entry.targetId)) await pending(1500);
        await restoreRole(guild, deleted.roles.get(entry.targetId), reason('antirole'));
      },
    }),

  [AuditLogEvent.RoleUpdate]: (entry, guild) => {
    if (!entry.changes.some((c) => c.key in ROLE_KEYS)) return;
    const perms = entry.changes.find((c) => c.key === 'permissions');
    const moduleKey = perms && gainedDangerous(perms.old, perms.new) ? 'antiperm' : 'antirole';
    return trigger(guild, moduleKey, entry.executorId, {
      detail:
        moduleKey === 'antiperm'
          ? `Permissions dangereuses ajoutées au rôle <@&${entry.targetId}>`
          : `Modification du rôle <@&${entry.targetId}>`,
      revert: () => {
        const data = oldValues(entry.changes, ROLE_KEYS);
        if ('permissions' in data) data.permissions = BigInt(data.permissions ?? 0);
        if ('color' in data) {
          data.colors = { primaryColor: data.color ?? 0 };
          delete data.color;
        }
        return guild.roles.cache.get(entry.targetId)?.edit({ ...data, reason: reason(moduleKey) });
      },
    });
  },

  [AuditLogEvent.MemberRoleUpdate]: (entry, guild) => {
    const added = entry.changes.find((c) => c.key === '$add')?.new ?? [];
    const dangerous = added.filter((r) => hasDangerous(guild.roles.cache.get(r.id)?.permissions.bitfield));
    if (!dangerous.length) return;
    return trigger(guild, 'antiperm', entry.executorId, {
      detail: `Rôle(s) dangereux ${dangerous.map((r) => `<@&${r.id}>`).join(', ')} donné(s) à <@${entry.targetId}>`,
      revert: async () => {
        const member = await guild.members.fetch(entry.targetId);
        await member.roles.remove(dangerous.map((r) => r.id), reason('antiperm'));
      },
    });
  },

  [AuditLogEvent.MemberBanAdd]: (entry, guild) =>
    trigger(guild, 'antiban', entry.executorId, {
      detail: `Bannissement de <@${entry.targetId}>`,
      revert: () => guild.members.unban(entry.targetId, reason('antiban')),
    }),

  [AuditLogEvent.MemberKick]: (entry, guild) =>
    trigger(guild, 'antikick', entry.executorId, { detail: `Expulsion de <@${entry.targetId}>` }),

  [AuditLogEvent.MemberPrune]: (entry, guild) =>
    trigger(guild, 'antikick', entry.executorId, {
      detail: `Prune de ${entry.extra?.removed ?? '?'} membres`,
      force: true,
    }),

  [AuditLogEvent.BotAdd]: (entry, guild) =>
    trigger(guild, 'antibot', entry.executorId, {
      detail: `Ajout du bot <@${entry.targetId}>`,
      revert: async () => {
        const bot = await guild.members.fetch(entry.targetId);
        await bot.kick(reason('antibot'));
      },
    }),

  [AuditLogEvent.WebhookCreate]: (entry, guild) =>
    trigger(guild, 'antiwebhook', entry.executorId, {
      detail: `Création du webhook \`${entry.target?.name ?? entry.targetId}\``,
      revert: async () => {
        const webhook = await guild.client.fetchWebhook(entry.targetId);
        await webhook.delete(reason('antiwebhook'));
      },
    }),

  [AuditLogEvent.GuildUpdate]: (entry, guild) => {
    const name = entry.changes.find((c) => c.key === 'name');
    const icon = entry.changes.find((c) => c.key === 'icon_hash');
    if (!name && !icon) return;
    return trigger(guild, 'antiguild', entry.executorId, {
      detail: [name && `Nom : \`${name.old}\` → \`${name.new}\``, icon && 'Icône modifiée'].filter(Boolean).join(' · '),
      revert: async () => {
        if (name) await guild.setName(name.old, reason('antiguild'));
        if (icon) {
          const url = icon.old ? `https://cdn.discordapp.com/icons/${guild.id}/${icon.old}.png?size=1024` : null;
          await guild.setIcon(url, reason('antiguild'));
        }
      },
    });
  },
};

async function handleAuditEntry(entry, guild) {
  const handler = HANDLERS[entry.action];
  if (!handler || !entry.executorId) return;
  if (isImmune(entry.executorId, guild)) return;
  await handler(entry, guild);
}

module.exports = { handleAuditEntry, remember, DANGEROUS };

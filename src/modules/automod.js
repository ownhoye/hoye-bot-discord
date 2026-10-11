const { PermissionFlagsBits } = require('discord.js');
const db = require('../structures/Database');
const { MODULES, PUNISHMENTS } = require('./definitions');
const { punish } = require('./sanctions');
const { isImmune, isBlacklisted } = require('../utils/perms');
const { sendLog } = require('../utils/logger');
const { card } = require('../utils/ui');
const { colors } = require('../config');

const INVITE = /(discord\.(gg|io|me|li)|discord(app)?\.com\/invite)\/[\w-]+/i;
const LINK = /(https?:\/\/[^\s]+|www\.[^\s]+\.[a-z]{2,})/i;
const EVERYONE = /@(everyone|here)/;

const spam = new Map();
const joins = new Map();

// ───────────────────────── Messages ─────────────────────────

function detect(message, p) {
  const content = message.content ?? '';

  if (p.antieveryone.enabled && EVERYONE.test(content)) return { key: 'antieveryone', why: 'Mention @everyone/@here' };

  const mentions = message.mentions.users.size + message.mentions.roles.size;
  if (p.antimassmention.enabled && mentions > p.antimassmention.limit) {
    return { key: 'antimassmention', why: `${mentions} mentions dans un message` };
  }

  if (p.antilink.enabled) {
    const regex = p.antilink.mode === 'all' ? new RegExp(`${INVITE.source}|${LINK.source}`, 'i') : INVITE;
    if (regex.test(content)) return { key: 'antilink', why: p.antilink.mode === 'all' ? 'Lien interdit' : 'Invitation Discord' };
  }

  if (p.antispam.enabled) {
    const key = `${message.guildId}:${message.author.id}`;
    const now = Date.now();
    const list = (spam.get(key) ?? []).filter((m) => now - m.time < p.antispam.interval * 1000);
    list.push({ time: now, id: message.id, channel: message.channel });
    spam.set(key, list);
    if (list.length >= p.antispam.limit) {
      spam.delete(key);
      return { key: 'antispam', why: `${list.length} messages en ${p.antispam.interval}s`, messages: list };
    }
  }
  return null;
}

async function handleMessage(message) {
  if (!message.inGuild() || message.author.bot || message.webhookId || !message.member) return;
  const { guild, member } = message;
  if (isImmune(member.id, guild) || member.permissions.has(PermissionFlagsBits.Administrator)) return;

  const p = db.guild(guild.id).protections;
  const hit = detect(message, p);
  if (!hit) return;

  const settings = p[hit.key];
  const mod = MODULES[hit.key];

  if (hit.messages) {
    // Anti-spam : suppression groupée par salon
    const byChannel = new Map();
    for (const m of hit.messages) {
      if (!byChannel.has(m.channel.id)) byChannel.set(m.channel.id, { channel: m.channel, ids: [] });
      byChannel.get(m.channel.id).ids.push(m.id);
    }
    for (const { channel, ids } of byChannel.values()) await channel.bulkDelete(ids, true).catch(() => null);
  } else {
    await message.delete().catch(() => null);
  }

  const result =
    settings.punishment === 'delete'
      ? { ok: true, text: PUNISHMENTS.delete.label }
      : await punish(guild, member.id, settings.punishment, `[Protection] ${mod.name} — ${hit.why}`);

  const notice = await message.channel
    .send(
      card({
        description: `${mod.emoji} ${member}, ton message a été bloqué par **${mod.name}** (${hit.why}).`,
        color: colors.warn,
      }),
    )
    .catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => null), 6000).unref();

  await sendLog(guild, 'protection', {
    title: `${mod.emoji} ${mod.name}`,
    description: [
      `**Membre :** ${member} (\`${member.id}\`)`,
      `**Salon :** ${message.channel}`,
      `**Raison :** ${hit.why}`,
      `**Sanction :** ${result.text}`,
    ].join('\n'),
    fields: message.content ? [{ name: 'Contenu', value: `\`\`\`${message.content.replace(/`/g, 'ˋ').slice(0, 900)}\`\`\`` }] : [],
    color: colors.warn,
  });
}

// ───────────────────────── Arrivées ─────────────────────────

async function sanctionJoin(member, punishment, title, why) {
  await member
    .send(
      card({
        title,
        description: `Tu as été ${punishment === 'ban' ? 'banni' : 'expulsé'} de **${member.guild.name}**.\n**Raison :** ${why}`,
        color: colors.error,
      }),
    )
    .catch(() => null);
  const result = await punish(member.guild, member.id, punishment, `[Protection] ${why}`);
  await sendLog(member.guild, 'protection', {
    title,
    description: `**Membre :** ${member.user} (\`${member.id}\`)\n**Raison :** ${why}\n**Sanction :** ${result.text}`,
    thumbnail: member.user.displayAvatarURL(),
  });
}

async function handleJoin(member) {
  const { guild } = member;
  if (member.user.bot || isImmune(member.id, guild)) return;
  const data = db.guild(guild.id);
  const p = data.protections;

  if (p.blacklist.enabled && isBlacklisted(member.id)) {
    const entry = db.data.blacklist[member.id];
    return sanctionJoin(member, p.blacklist.punishment, '⛔ Blacklist globale', entry.reason || 'Utilisateur blacklist');
  }

  if (data.raidmode) {
    return sanctionJoin(member, p.antiraid.punishment, '🚨 Raidmode', 'Le serveur est en raidmode');
  }

  if (p.antialt.enabled) {
    const age = Date.now() - member.user.createdTimestamp;
    if (age < p.antialt.days * 864e5) {
      return sanctionJoin(member, p.antialt.punishment, '👶 Anti-Alt', `Compte créé il y a moins de ${p.antialt.days} jour(s)`);
    }
  }

  if (p.antiraid.enabled) {
    const now = Date.now();
    const list = (joins.get(guild.id) ?? []).filter((j) => now - j.time < p.antiraid.interval * 1000);
    list.push({ time: now, member });
    joins.set(guild.id, list);
    if (list.length > p.antiraid.limit) {
      joins.delete(guild.id);
      data.raidmode = true;
      db.save();
      await sendLog(guild, 'protection', {
        title: '🚨 Raid détecté — raidmode activé',
        description: `**${list.length}** arrivées en ${p.antiraid.interval}s.\nLes nouveaux membres seront sanctionnés jusqu'à \`/raidmode off\`.`,
      });
      await Promise.allSettled(
        list.map((j) => sanctionJoin(j.member, p.antiraid.punishment, '🚨 Anti-Raid', 'Raid détecté')),
      );
    }
  }
}

module.exports = { handleMessage, handleJoin };

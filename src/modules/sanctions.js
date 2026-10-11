const db = require('../structures/Database');
const { PUNISHMENTS } = require('./definitions');

const MUTE_DURATION = 10 * 60 * 1000;

function addWarn(guildId, userId, moderatorId, reason) {
  const data = db.guild(guildId);
  const warn = { id: ++data.warnCounter, moderatorId, reason, date: Date.now() };
  (data.warns[userId] ??= []).push(warn);
  db.save();
  return warn;
}

/**
 * Applique une sanction à un utilisateur.
 * Retourne { ok, text } pour l'afficher dans les logs.
 */
async function punish(guild, userId, punishment, reason) {
  const member = await guild.members.fetch(userId).catch(() => null);
  const label = PUNISHMENTS[punishment]?.label ?? punishment;

  try {
    switch (punishment) {
      case 'ban':
        await guild.members.ban(userId, { reason, deleteMessageSeconds: 3600 });
        break;
      case 'kick':
        if (!member) return { ok: false, text: `${label} — membre introuvable` };
        await member.kick(reason);
        break;
      case 'derank': {
        if (!member) return { ok: false, text: `${label} — membre introuvable` };
        // Un bot garde toujours son rôle géré : on l'expulse directement.
        if (member.user.bot) {
          await member.kick(reason);
          return { ok: true, text: 'Expulsé (bot, dérank impossible)' };
        }
        const removable = member.roles.cache.filter((r) => r.id !== guild.id && r.editable && !r.managed);
        await member.roles.remove(removable, reason);
        break;
      }
      case 'mute':
        if (!member) return { ok: false, text: `${label} — membre introuvable` };
        await member.timeout(MUTE_DURATION, reason);
        break;
      case 'warn':
        addWarn(guild.id, userId, guild.client.user.id, reason);
        break;
      case 'delete':
        break;
      default:
        return { ok: false, text: `Sanction inconnue : ${punishment}` };
    }
    return { ok: true, text: label };
  } catch (err) {
    return { ok: false, text: `${label} — échec (${err.message})` };
  }
}

module.exports = { punish, addWarn, MUTE_DURATION };

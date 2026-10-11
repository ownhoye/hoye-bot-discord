const db = require('../structures/Database');
const { card } = require('./ui');
const { colors } = require('../config');

/**
 * Envoie un log dans le salon configuré (/logs).
 * type : "protection" | "moderation"
 */
async function sendLog(guild, type, { title, description, fields, color, thumbnail }) {
  const channelId = db.guild(guild.id).logs[type];
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;
  const payload = card({
    title,
    description,
    fields,
    thumbnail,
    color: color ?? (type === 'protection' ? colors.error : colors.info),
    footer: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
  });
  await channel.send(payload).catch(() => null);
}

module.exports = { sendLog };

const { Events, ActivityType } = require('discord.js');
const config = require('../config');
const db = require('../structures/Database');
const { deployCommands } = require('../handlers/loader');

function applyStatus(client) {
  const saved = db.data.status;
  client.user.setPresence({
    status: saved?.presence ?? 'online',
    activities: [
      {
        type: ActivityType[saved?.type ?? 'Watching'],
        name: saved?.text ?? `🛡️ ${client.guilds.cache.size} serveurs | /help`,
      },
    ],
  });
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  applyStatus,
  async execute(client) {
    console.log(`✅ Connecté en tant que ${client.user.tag} (${client.guilds.cache.size} serveurs)`);
    if (!config.devs.length && !config.owners.length) {
      console.warn('⚠️  Aucun DEV_IDS / OWNER_IDS dans le .env : personne ne pourra utiliser les commandes owner.');
    }
    try {
      const count = await deployCommands(client, config.devGuildId);
      console.log(`✅ ${count} commandes slash synchronisées.`);
    } catch (err) {
      console.error('❌ Impossible de publier les commandes :', err);
    }
    applyStatus(client);
    setInterval(() => applyStatus(client), 10 * 60 * 1000).unref();
  },
};

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');
const db = require('./structures/Database');
const { loadCommands, loadEvents } = require('./handlers/loader');

if (!config.token) {
  console.error('❌ DISCORD_TOKEN manquant : copie .env.example en .env et remplis-le.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildWebhooks,
  ],
  partials: [Partials.GuildMember],
  allowedMentions: { parse: ['users'], repliedUser: false },
});

client.startedAt = Date.now();
loadCommands(client);
loadEvents(client);

const shutdown = () => {
  db.flush();
  client.destroy();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

client.login(config.token);

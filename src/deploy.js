// Publie les commandes slash sans lancer le bot : npm run deploy
const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { loadCommands, deployCommands } = require('./handlers/loader');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
loadCommands(client);
client.once('clientReady', async () => {
  const count = await deployCommands(client, config.devGuildId);
  console.log(`✅ ${count} commandes publiées.`);
  client.destroy();
});
client.login(config.token);

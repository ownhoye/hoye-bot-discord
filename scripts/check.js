// Vérifie que toutes les commandes se chargent et que leurs définitions sont valides
// (sans se connecter à Discord) : npm run check
process.env.DISCORD_TOKEN ||= 'check';
const { Client, GatewayIntentBits } = require('discord.js');
const { loadCommands } = require('../src/handlers/loader');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commands = loadCommands(client);
let errors = 0;
for (const [name, command] of commands) {
  try {
    const json = command.data.toJSON();
    if (typeof command.execute !== 'function') throw new Error('execute() manquant');
    console.log(`✔ /${name} (${command.category})${json.options?.length ? ` — ${json.options.length} option(s)` : ''}`);
  } catch (err) {
    errors++;
    console.error(`✘ /${name} : ${err.message}`);
  }
}
console.log(`\n${commands.size} commandes, ${errors} erreur(s).`);
client.destroy();
process.exit(errors ? 1 : 0);

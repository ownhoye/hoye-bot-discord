const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');
const EVENTS_DIR = path.join(__dirname, '..', 'events');

function loadCommands(client) {
  client.commands = new Collection();
  for (const category of fs.readdirSync(COMMANDS_DIR)) {
    const dir = path.join(COMMANDS_DIR, category);
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      const filePath = path.join(dir, file);
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath);
      command.category = category;
      client.commands.set(command.data.name, command);
    }
  }
  return client.commands;
}

function loadEvents(client) {
  for (const file of fs.readdirSync(EVENTS_DIR).filter((f) => f.endsWith('.js'))) {
    const event = require(path.join(EVENTS_DIR, file));
    const run = (...args) =>
      Promise.resolve(event.execute(...args, client)).catch((err) => console.error(`[event:${event.name}]`, err));
    client[event.once ? 'once' : 'on'](event.name, run);
  }
}

/**
 * Enregistre les commandes slash auprès de Discord.
 * Les commandes "devGuild" ne sont publiées que sur DEV_GUILD_ID (si défini).
 */
async function deployCommands(client, devGuildId) {
  const all = [...client.commands.values()];
  const publicCmds = all.filter((c) => !(c.devGuild && devGuildId)).map((c) => c.data.toJSON());
  await client.application.commands.set(publicCmds);
  if (devGuildId) {
    const devCmds = all.filter((c) => c.devGuild).map((c) => c.data.toJSON());
    const guild = await client.guilds.fetch(devGuildId).catch(() => null);
    if (guild) await guild.commands.set(devCmds);
    else console.warn(`[deploy] Serveur de dev ${devGuildId} introuvable — commandes dev non publiées.`);
  }
  return all.length;
}

module.exports = { loadCommands, loadEvents, deployCommands };

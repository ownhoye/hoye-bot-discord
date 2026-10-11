const { Events } = require('discord.js');

module.exports = {
  name: Events.GuildCreate,
  execute: (guild) => console.log(`➕ Ajouté sur ${guild.name} (${guild.id}) — ${guild.memberCount} membres`),
};

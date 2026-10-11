const { Events } = require('discord.js');
const { remember } = require('../modules/antinuke');

// Garde une copie des rôles supprimés pour que l'anti-nuke puisse les recréer.
module.exports = {
  name: Events.GuildRoleDelete,
  execute: (role) => remember('roles', role),
};

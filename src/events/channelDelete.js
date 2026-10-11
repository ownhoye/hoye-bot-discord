const { Events } = require('discord.js');
const { remember } = require('../modules/antinuke');

// Garde une copie des salons supprimés pour que l'anti-nuke puisse les recréer.
module.exports = {
  name: Events.ChannelDelete,
  execute: (channel) => channel.guild && remember('channels', channel),
};

const { Events } = require('discord.js');
const { handleJoin } = require('../modules/automod');

module.exports = {
  name: Events.GuildMemberAdd,
  execute: (member) => handleJoin(member),
};

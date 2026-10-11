const { Events } = require('discord.js');
const { handleAuditEntry } = require('../modules/antinuke');

module.exports = {
  name: Events.GuildAuditLogEntryCreate,
  execute: (entry, guild) => handleAuditEntry(entry, guild),
};

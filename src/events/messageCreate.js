const { Events } = require('discord.js');
const { handleMessage } = require('../modules/automod');

module.exports = {
  name: Events.MessageCreate,
  execute: (message) => handleMessage(message),
};

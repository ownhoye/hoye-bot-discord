const userListCommand = require('../../utils/userList');

// Les membres whitelist ne sont jamais touchés par les protections.
module.exports = userListCommand({
  name: 'whitelist',
  field: 'whitelist',
  title: 'Whitelist',
  emoji: '📃',
  description: 'Gérer les membres ignorés par les protections',
});

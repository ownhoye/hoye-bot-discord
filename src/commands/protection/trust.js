const userListCommand = require('../../utils/userList');

// Les membres trust sont ignorés par les protections ET peuvent configurer le bot.
module.exports = userListCommand({
  name: 'trust',
  field: 'trusted',
  title: 'Liste trust',
  emoji: '🤝',
  description: 'Gérer les membres de confiance (configurent la protection)',
  max: 20,
});

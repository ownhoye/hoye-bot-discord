const { sendLog } = require('./logger');
const ui = require('./ui');
const { colors } = require('../config');

/**
 * Factorise une action de modération : MP à la cible, exécution (run), log et réponse.
 * Le MP est envoyé avant l'action pour qu'il arrive même après un kick/ban.
 */
async function moderate(interaction, { emoji, action, verb, user, reason, details = [], color = colors.error, dm = true, run }) {
  reason ||= 'Aucune raison fournie';
  if (dm && !user.bot) {
    await user
      .send(
        ui.card({
          title: `${emoji} ${action}`,
          description: [`Tu as été **${verb}** sur **${interaction.guild.name}**.`, `**Raison :** ${reason}`, ...details].join('\n'),
          color,
        }),
      )
      .catch(() => null);
  }
  if (run) await run();
  const lines = [
    `**Membre :** ${user} (\`${user.id}\`)`,
    `**Modérateur :** ${interaction.user}`,
    `**Raison :** ${reason}`,
    ...details,
  ];
  await sendLog(interaction.guild, 'moderation', {
    title: `${emoji} ${action}`,
    description: lines.join('\n'),
    thumbnail: user.displayAvatarURL(),
    color,
  });
  return ui.card({
    title: `${emoji} ${action}`,
    description: lines.join('\n'),
    thumbnail: user.displayAvatarURL(),
    color,
  });
}

module.exports = { moderate };

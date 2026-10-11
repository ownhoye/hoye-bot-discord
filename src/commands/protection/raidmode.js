const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const db = require('../../structures/Database');
const { LEVELS } = require('../../utils/perms');
const { sendLog } = require('../../utils/logger');
const ui = require('../../utils/ui');
const { colors } = require('../../config');

module.exports = {
  level: LEVELS.TRUSTED,
  data: new SlashCommandBuilder()
    .setName('raidmode')
    .setDescription('Sanctionner automatiquement tous les nouveaux membres')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName('etat')
        .setDescription('Activer ou désactiver')
        .setRequired(true)
        .addChoices({ name: '🟢 Activer', value: 'on' }, { name: '🔴 Désactiver', value: 'off' }),
    ),

  async execute(interaction) {
    const data = db.guild(interaction.guildId);
    data.raidmode = interaction.options.getString('etat') === 'on';
    db.save();
    const punishment = data.protections.antiraid.punishment === 'ban' ? 'bannis' : 'expulsés';
    const description = data.raidmode
      ? `🚨 Raidmode **activé** : tous les nouveaux membres seront ${punishment}.`
      : '✅ Raidmode **désactivé** : les arrivées sont de nouveau autorisées.';
    await sendLog(interaction.guild, 'protection', {
      title: '🚨 Raidmode',
      description: `${description}\n**Par :** ${interaction.user}`,
      color: data.raidmode ? colors.error : colors.success,
    });
    return interaction.reply(ui.card({ title: '🚨 Raidmode', description, color: data.raidmode ? colors.error : colors.success }));
  },
};

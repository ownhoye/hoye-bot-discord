const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { sendLog } = require('../../utils/logger');
const ui = require('../../utils/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprimer des messages en masse')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre de messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('membre').setDescription('Ne supprimer que les messages de ce membre'))
    .addBooleanOption((o) => o.setName('bots').setDescription('Ne supprimer que les messages des bots')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const amount = interaction.options.getInteger('nombre');
    const user = interaction.options.getUser('membre');
    const botsOnly = interaction.options.getBoolean('bots');

    let messages = await interaction.channel.messages.fetch({ limit: 100 });
    if (user) messages = messages.filter((m) => m.author.id === user.id);
    if (botsOnly) messages = messages.filter((m) => m.author.bot);
    const toDelete = [...messages.values()].slice(0, amount);

    const deleted = await interaction.channel.bulkDelete(toDelete, true);
    await sendLog(interaction.guild, 'moderation', {
      title: '🧹 Clear',
      description: `**${deleted.size}** message(s) supprimé(s) dans ${interaction.channel} par ${interaction.user}${user ? ` (filtre : ${user})` : ''}.`,
    });
    const skipped = toDelete.length - deleted.size;
    return interaction.editReply(
      ui.edit(
        ui.success(
          `**${deleted.size}** message(s) supprimé(s).${skipped ? `\n-# ${skipped} message(s) de plus de 14 jours ignoré(s).` : ''}`,
          'Clear',
        ),
      ),
    );
  },
};

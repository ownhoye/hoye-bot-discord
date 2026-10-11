const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const db = require('../../structures/Database');
const { addWarn } = require('../../modules/sanctions');
const { moderate } = require('../../utils/moderation');
const ui = require('../../utils/ui');
const { colors } = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Avertir un membre')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Membre à avertir').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setRequired(true).setMaxLength(400)),

  async execute(interaction) {
    const user = interaction.options.getUser('membre');
    if (user.bot) return interaction.reply(ui.error('Impossible d\'avertir un bot.'));
    const reason = interaction.options.getString('raison');
    const warn = addWarn(interaction.guildId, user.id, interaction.user.id, reason);
    const total = db.guild(interaction.guildId).warns[user.id].length;
    return interaction.reply(
      await moderate(interaction, {
        emoji: '⚠️',
        action: 'Avertissement',
        verb: 'averti',
        user,
        reason,
        color: colors.warn,
        details: [`**ID :** \`#${warn.id}\` · **Total :** ${total} avertissement(s)`],
      }),
    );
  },
};

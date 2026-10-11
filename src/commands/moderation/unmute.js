const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { moderate } = require('../../utils/moderation');
const ui = require('../../utils/ui');
const { colors } = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Retirer le mute d\'un membre')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Membre à unmute').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(400)),

  async execute(interaction) {
    const member = interaction.options.getMember('membre');
    if (!member) return interaction.reply(ui.error('Ce membre n\'est pas sur le serveur.'));
    if (!member.isCommunicationDisabled()) return interaction.reply(ui.warn('Ce membre n\'est pas mute.'));
    if (!member.moderatable) return interaction.reply(ui.error('Je ne peux pas unmute ce membre.'));
    const reason = interaction.options.getString('raison');
    await member.timeout(null, `${interaction.user.tag} : ${reason ?? 'Aucune raison'}`);
    return interaction.reply(
      await moderate(interaction, { emoji: '🔊', action: 'Unmute', verb: 'unmute', user: member.user, reason, color: colors.success }),
    );
  },
};

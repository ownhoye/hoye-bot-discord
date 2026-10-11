const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { checkHierarchy } = require('../../utils/perms');
const { moderate } = require('../../utils/moderation');
const ui = require('../../utils/ui');
const { colors } = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulser un membre')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Membre à expulser').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(400)),

  async execute(interaction) {
    const member = interaction.options.getMember('membre');
    if (!member) return interaction.reply(ui.error('Ce membre n\'est pas sur le serveur.'));
    const problem = checkHierarchy(interaction.member, member);
    if (problem) return interaction.reply(ui.error(problem));
    if (!member.kickable) return interaction.reply(ui.error('Je ne peux pas expulser ce membre.'));

    const reason = interaction.options.getString('raison');
    const payload = await moderate(interaction, {
      emoji: '👢',
      action: 'Expulsion',
      verb: 'expulsé',
      user: member.user,
      reason,
      color: colors.warn,
      run: () => member.kick(`${interaction.user.tag} : ${reason ?? 'Aucune raison'}`),
    });
    return interaction.reply(payload);
  },
};

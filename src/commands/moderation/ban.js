const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { checkHierarchy } = require('../../utils/perms');
const { moderate } = require('../../utils/moderation');
const ui = require('../../utils/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannir un utilisateur (même s\'il n\'est pas sur le serveur)')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur à bannir').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison du bannissement').setMaxLength(400))
    .addIntegerOption((o) =>
      o
        .setName('messages')
        .setDescription('Supprimer ses messages récents')
        .addChoices(
          { name: 'Ne rien supprimer', value: 0 },
          { name: 'Dernière heure', value: 3600 },
          { name: 'Dernières 24h', value: 86400 },
          { name: '7 derniers jours', value: 604800 },
        ),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('utilisateur');
    const reason = interaction.options.getString('raison');
    const member = interaction.options.getMember('utilisateur');
    const problem = checkHierarchy(interaction.member, member);
    if (problem) return interaction.reply(ui.error(problem));
    if (member && !member.bannable) return interaction.reply(ui.error('Je ne peux pas bannir ce membre.'));

    const payload = await moderate(interaction, {
      emoji: '🔨',
      action: 'Bannissement',
      verb: 'banni',
      user,
      reason,
      dm: Boolean(member),
      run: () =>
        interaction.guild.members.ban(user.id, {
          reason: `${interaction.user.tag} : ${reason ?? 'Aucune raison'}`,
          deleteMessageSeconds: interaction.options.getInteger('messages') ?? 0,
        }),
    });
    return interaction.reply(payload);
  },
};

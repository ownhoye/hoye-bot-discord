const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { moderate } = require('../../utils/moderation');
const ui = require('../../utils/ui');
const { colors } = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Débannir un utilisateur')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) =>
      o.setName('utilisateur').setDescription('Utilisateur banni (recherche par nom ou ID)').setRequired(true).setAutocomplete(true),
    )
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(400)),

  async autocomplete(interaction) {
    const query = interaction.options.getFocused().toLowerCase();
    const bans = await interaction.guild.bans.fetch({ limit: 1000 });
    const results = bans
      .filter((b) => b.user.username.toLowerCase().includes(query) || b.user.id.includes(query))
      .first(25)
      .map((b) => ({ name: `${b.user.username} (${b.user.id})`, value: b.user.id }));
    return interaction.respond(results);
  },

  async execute(interaction) {
    const id = interaction.options.getString('utilisateur');
    const ban = await interaction.guild.bans.fetch(id).catch(() => null);
    if (!ban) return interaction.reply(ui.error('Cet utilisateur n\'est pas banni.'));
    const reason = interaction.options.getString('raison');
    await interaction.guild.members.unban(id, `${interaction.user.tag} : ${reason ?? 'Aucune raison'}`);
    return interaction.reply(
      await moderate(interaction, { emoji: '🔓', action: 'Débannissement', verb: 'débanni', user: ban.user, reason, color: colors.success, dm: false }),
    );
  },
};

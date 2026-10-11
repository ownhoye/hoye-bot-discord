const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const db = require('../../structures/Database');
const ui = require('../../utils/ui');
const { colors } = require('../../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Gérer les avertissements')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName('list')
        .setDescription('Voir les avertissements d\'un membre')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Supprimer un avertissement')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
        .addIntegerOption((o) => o.setName('id').setDescription('ID de l\'avertissement').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((s) =>
      s
        .setName('clear')
        .setDescription('Supprimer tous les avertissements d\'un membre')
        .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)),
    ),

  async execute(interaction) {
    const data = db.guild(interaction.guildId);
    const user = interaction.options.getUser('membre');
    const warns = data.warns[user.id] ?? [];
    const sub = interaction.options.getSubcommand();

    if (sub === 'remove') {
      const id = interaction.options.getInteger('id');
      if (!warns.some((w) => w.id === id)) return interaction.reply(ui.error(`Aucun avertissement \`#${id}\` pour ${user}.`));
      data.warns[user.id] = warns.filter((w) => w.id !== id);
      db.save();
      return interaction.reply(ui.success(`Avertissement \`#${id}\` de ${user} supprimé.`));
    }

    if (sub === 'clear') {
      delete data.warns[user.id];
      db.save();
      return interaction.reply(ui.success(`${warns.length} avertissement(s) de ${user} supprimé(s).`));
    }

    return interaction.reply(
      ui.card({
        title: `⚠️ Avertissements — ${user.username}`,
        thumbnail: user.displayAvatarURL(),
        color: warns.length ? colors.warn : colors.success,
        description: warns.length
          ? warns
              .slice(-15)
              .map((w) => `**\`#${w.id}\`** ${ui.ts(w.date)} par <@${w.moderatorId}>\n> ${w.reason}`)
              .join('\n')
          : `${user} n'a aucun avertissement.`,
        footer: `${warns.length} avertissement(s) au total`,
      }),
    );
  },
};

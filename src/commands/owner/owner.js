const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config');
const db = require('../../structures/Database');
const { LEVELS, isMainOwner, isBotOwner } = require('../../utils/perms');
const ui = require('../../utils/ui');

module.exports = {
  level: LEVELS.BOT_OWNER,
  devGuild: true,
  data: new SlashCommandBuilder()
    .setName('owner')
    .setDescription('Gérer les owners du bot (accès total sur tous les serveurs)')
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Ajouter un owner du bot')
        .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Retirer un owner du bot')
        .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('list').setDescription('Lister les owners et développeurs du bot')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('utilisateur');

    if (sub !== 'list' && !isMainOwner(interaction.user.id)) {
      return interaction.reply(ui.error('Seuls les développeurs et les owners définis dans le `.env` peuvent gérer les owners.'));
    }

    if (sub === 'add') {
      if (user.bot) return interaction.reply(ui.error('Un bot ne peut pas être owner.'));
      if (isBotOwner(user.id)) return interaction.reply(ui.warn(`${user} est déjà owner du bot.`));
      db.data.owners.push(user.id);
      db.save();
      return interaction.reply(ui.success(`${user} est maintenant **owner du bot**.`, '👑 Owner ajouté'));
    }

    if (sub === 'remove') {
      if (config.devs.includes(user.id) || config.owners.includes(user.id)) {
        return interaction.reply(ui.error(`${user} est défini dans le fichier \`.env\` : retire son ID de \`DEV_IDS\` / \`OWNER_IDS\`.`));
      }
      if (!db.data.owners.includes(user.id)) return interaction.reply(ui.warn(`${user} n'est pas owner du bot.`));
      db.data.owners = db.data.owners.filter((id) => id !== user.id);
      db.save();
      return interaction.reply(ui.success(`${user} n'est plus owner du bot.`, '👑 Owner retiré'));
    }

    const format = (ids) => (ids.length ? ids.map((id) => `<@${id}> — \`${id}\``).join('\n') : '*Aucun*');
    return interaction.reply(
      ui.card({
        title: '👑 Équipe du bot',
        fields: [
          { name: '👨‍💻 Développeurs (.env)', value: format(config.devs) },
          { name: '👑 Owners principaux (.env)', value: format(config.owners) },
          { name: '⭐ Owners ajoutés', value: format(db.data.owners) },
        ],
        ephemeral: true,
      }),
    );
  },
};

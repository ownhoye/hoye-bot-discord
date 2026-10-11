const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const db = require('../structures/Database');
const { LEVELS } = require('./perms');
const ui = require('./ui');

/**
 * Fabrique une commande de gestion de liste d'utilisateurs par serveur
 * (utilisée par /whitelist et /trust).
 */
module.exports = function userListCommand({ name, field, title, emoji, description, max = 50 }) {
  return {
    level: LEVELS.TRUSTED,
    levels: { add: LEVELS.GUILD_OWNER, remove: LEVELS.GUILD_OWNER, clear: LEVELS.GUILD_OWNER },
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(description)
      .setContexts(InteractionContextType.Guild)
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand((s) =>
        s
          .setName('add')
          .setDescription(`Ajouter un utilisateur à la ${title.toLowerCase()}`)
          .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur à ajouter').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('remove')
          .setDescription(`Retirer un utilisateur de la ${title.toLowerCase()}`)
          .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur à retirer').setRequired(true)),
      )
      .addSubcommand((s) => s.setName('list').setDescription(`Afficher la ${title.toLowerCase()}`))
      .addSubcommand((s) => s.setName('clear').setDescription(`Vider la ${title.toLowerCase()}`)),

    async execute(interaction) {
      const data = db.guild(interaction.guildId);
      const list = data[field];
      const sub = interaction.options.getSubcommand();
      const user = interaction.options.getUser('utilisateur');

      if (sub === 'add') {
        if (user.bot && field === 'trusted') return interaction.reply(ui.error('Un bot ne peut pas être trust.'));
        if (list.includes(user.id)) return interaction.reply(ui.warn(`${user} est déjà dans la ${title.toLowerCase()}.`));
        if (list.length >= max) return interaction.reply(ui.error(`Limite de ${max} utilisateurs atteinte.`));
        list.push(user.id);
        db.save();
        return interaction.reply(ui.success(`${user} a été ajouté à la ${title.toLowerCase()}.`, `${emoji} ${title}`));
      }

      if (sub === 'remove') {
        if (!list.includes(user.id)) return interaction.reply(ui.warn(`${user} n'est pas dans la ${title.toLowerCase()}.`));
        data[field] = list.filter((id) => id !== user.id);
        db.save();
        return interaction.reply(ui.success(`${user} a été retiré de la ${title.toLowerCase()}.`, `${emoji} ${title}`));
      }

      if (sub === 'clear') {
        const count = list.length;
        data[field] = [];
        db.save();
        return interaction.reply(ui.success(`${count} utilisateur(s) retiré(s).`, `${emoji} ${title} vidée`));
      }

      return interaction.reply(
        ui.card({
          title: `${emoji} ${title} — ${list.length}/${max}`,
          description: list.length ? list.map((id, i) => `\`${i + 1}.\` <@${id}> — \`${id}\``).join('\n') : '*Aucun utilisateur.*',
          ephemeral: true,
        }),
      );
    },
  };
};

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../structures/Database');
const { LEVELS, isBotOwner } = require('../../utils/perms');
const { punish } = require('../../modules/sanctions');
const { sendLog } = require('../../utils/logger');
const ui = require('../../utils/ui');

module.exports = {
  level: LEVELS.BOT_OWNER,
  devGuild: true,
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Blacklist globale : bloque le bot et sanctionne sur tous les serveurs protégés')
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Blacklist un utilisateur')
        .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur').setRequired(true))
        .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(300))
        .addBooleanOption((o) => o.setName('sanctionner').setDescription('Le sanctionner tout de suite sur les serveurs où il est présent')),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Retirer un utilisateur de la blacklist')
        .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('list').setDescription('Voir la blacklist globale')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('utilisateur');

    if (sub === 'add') {
      if (isBotOwner(user.id) || user.id === interaction.client.user.id) {
        return interaction.reply(ui.error('Impossible de blacklist un owner / développeur du bot.'));
      }
      const reason = interaction.options.getString('raison') ?? 'Aucune raison fournie';
      db.data.blacklist[user.id] = { reason, by: interaction.user.id, date: Date.now() };
      db.save();

      if (!interaction.options.getBoolean('sanctionner')) {
        return interaction.reply(ui.success(`${user} (\`${user.id}\`) est blacklist.\n**Raison :** ${reason}`, '⛔ Blacklist'));
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      let count = 0;
      for (const guild of interaction.client.guilds.cache.values()) {
        const settings = db.guild(guild.id).protections.blacklist;
        if (!settings.enabled || !(await guild.members.fetch(user.id).catch(() => null))) continue;
        const result = await punish(guild, user.id, settings.punishment, `[Blacklist globale] ${reason}`);
        if (result.ok) {
          count++;
          await sendLog(guild, 'protection', {
            title: '⛔ Blacklist globale',
            description: `**Membre :** ${user} (\`${user.id}\`)\n**Raison :** ${reason}\n**Sanction :** ${result.text}`,
          });
        }
      }
      return interaction.editReply(
        ui.edit(ui.success(`${user} est blacklist et a été sanctionné sur **${count}** serveur(s).\n**Raison :** ${reason}`, '⛔ Blacklist')),
      );
    }

    if (sub === 'remove') {
      if (!db.data.blacklist[user.id]) return interaction.reply(ui.warn(`${user} n'est pas blacklist.`));
      delete db.data.blacklist[user.id];
      db.save();
      return interaction.reply(ui.success(`${user} a été retiré de la blacklist.`, '⛔ Blacklist'));
    }

    const entries = Object.entries(db.data.blacklist);
    return interaction.reply(
      ui.card({
        title: `⛔ Blacklist globale — ${entries.length}`,
        description: entries.length
          ? entries
              .slice(-25)
              .map(([id, e]) => `<@${id}> \`${id}\` · ${ui.ts(e.date)} par <@${e.by}>\n> ${e.reason}`)
              .join('\n')
          : '*Personne n\'est blacklist.*',
        ephemeral: true,
      }),
    );
  },
};

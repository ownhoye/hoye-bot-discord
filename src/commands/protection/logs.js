const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const db = require('../../structures/Database');
const { LEVELS } = require('../../utils/perms');
const ui = require('../../utils/ui');

const TYPES = { protection: '🛡️ Protection', moderation: '🔨 Modération' };

module.exports = {
  level: LEVELS.TRUSTED,
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Configurer les salons de logs')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('setup').setDescription('Créer automatiquement une catégorie privée avec les salons de logs'))
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Définir un salon de logs')
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('Type de logs')
            .setRequired(true)
            .addChoices(...Object.entries(TYPES).map(([value, name]) => ({ name, value }))),
        )
        .addChannelOption((o) =>
          o.setName('salon').setDescription('Salon de logs').setRequired(true).addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('disable')
        .setDescription('Désactiver un type de logs')
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('Type de logs')
            .setRequired(true)
            .addChoices(...Object.entries(TYPES).map(([value, name]) => ({ name, value }))),
        ),
    )
    .addSubcommand((s) => s.setName('show').setDescription('Voir la configuration des logs')),

  async execute(interaction) {
    const data = db.guild(interaction.guildId);
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const { guild } = interaction;
      const category = await guild.channels.create({
        name: '📁・logs',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        ],
      });
      for (const type of Object.keys(TYPES)) {
        const channel = await guild.channels.create({ name: `🔒・logs-${type}`, type: ChannelType.GuildText, parent: category });
        data.logs[type] = channel.id;
      }
      db.save();
      return interaction.editReply(
        ui.edit(ui.success(
          `Catégorie ${category} créée (visible uniquement par les admins) :\n` +
            Object.keys(TYPES).map((t) => `• ${TYPES[t]} → <#${data.logs[t]}>`).join('\n'),
          'Logs configurés',
        )),
      );
    }

    if (sub === 'set') {
      const type = interaction.options.getString('type');
      const channel = interaction.options.getChannel('salon');
      if (!channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
        return interaction.reply(ui.error(`Je ne peux pas écrire dans ${channel}.`));
      }
      data.logs[type] = channel.id;
      db.save();
      return interaction.reply(ui.success(`Les logs **${TYPES[type]}** seront envoyés dans ${channel}.`));
    }

    if (sub === 'disable') {
      const type = interaction.options.getString('type');
      data.logs[type] = null;
      db.save();
      return interaction.reply(ui.success(`Logs **${TYPES[type]}** désactivés.`));
    }

    return interaction.reply(
      ui.card({
        title: '📜 Salons de logs',
        description: Object.entries(TYPES)
          .map(([t, name]) => `**${name} :** ${data.logs[t] ? `<#${data.logs[t]}>` : '*non défini*'}`)
          .join('\n'),
        ephemeral: true,
      }),
    );
  },
};

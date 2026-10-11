const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ChannelType } = require('discord.js');
const db = require('../../structures/Database');
const { LEVELS } = require('../../utils/perms');
const { sendLog } = require('../../utils/logger');
const ui = require('../../utils/ui');
const { colors } = require('../../config');

module.exports = {
  level: LEVELS.TRUSTED,
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Verrouiller / déverrouiller TOUS les salons textuels (urgence raid)')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName('etat')
        .setDescription('Activer ou désactiver')
        .setRequired(true)
        .addChoices({ name: '🔒 Verrouiller', value: 'on' }, { name: '🔓 Déverrouiller', value: 'off' }),
    ),

  async execute(interaction) {
    await interaction.deferReply();
    const { guild } = interaction;
    const data = db.guild(guild.id);
    const everyone = guild.roles.everyone;
    const lock = interaction.options.getString('etat') === 'on';
    const why = `Lockdown par ${interaction.user.tag}`;
    let count = 0;

    if (lock) {
      data.lockdown ??= [];
      const channels = guild.channels.cache.filter(
        (c) =>
          [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) &&
          c.manageable &&
          c.permissionsFor(everyone).has(PermissionFlagsBits.SendMessages) &&
          !data.lockdown.includes(c.id),
      );
      for (const channel of channels.values()) {
        const ok = await channel.permissionOverwrites
          .edit(everyone, { SendMessages: false }, { reason: why })
          .then(() => true)
          .catch(() => false);
        if (ok) {
          data.lockdown.push(channel.id);
          count++;
        }
      }
    } else {
      for (const id of data.lockdown ?? []) {
        const channel = guild.channels.cache.get(id);
        if (channel && (await channel.permissionOverwrites.edit(everyone, { SendMessages: null }, { reason: why }).then(() => true).catch(() => false))) {
          count++;
        }
      }
      data.lockdown = [];
    }
    db.save();

    const payload = {
      title: lock ? '🔒 Lockdown activé' : '🔓 Lockdown terminé',
      description: lock
        ? `**${count}** salon(s) verrouillé(s) par ${interaction.user}.\nUtilise \`/lockdown etat:Déverrouiller\` pour tout rouvrir.`
        : `**${count}** salon(s) déverrouillé(s) par ${interaction.user}.`,
      color: lock ? colors.error : colors.success,
    };
    await sendLog(guild, 'moderation', payload);
    return interaction.editReply(ui.card(payload));
  },
};

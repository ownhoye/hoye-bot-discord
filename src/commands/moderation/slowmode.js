const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ChannelType } = require('discord.js');
const { formatDuration } = require('../../utils/time');
const ui = require('../../utils/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Définir le mode lent d\'un salon')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((o) =>
      o.setName('secondes').setDescription('Délai entre deux messages (0 = désactivé, max 21600)').setRequired(true).setMinValue(0).setMaxValue(21600),
    )
    .addChannelOption((o) =>
      o.setName('salon').setDescription('Salon (par défaut : ici)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildForum),
    ),

  async execute(interaction) {
    const seconds = interaction.options.getInteger('secondes');
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    await channel.setRateLimitPerUser(seconds, `Slowmode par ${interaction.user.tag}`);
    return interaction.reply(
      ui.card({
        title: '🐢 Mode lent',
        description: seconds ? `Mode lent de **${formatDuration(seconds * 1000)}** activé dans ${channel}.` : `Mode lent désactivé dans ${channel}.`,
      }),
    );
  },
};

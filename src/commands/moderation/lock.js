const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, ChannelType } = require('discord.js');
const { sendLog } = require('../../utils/logger');
const ui = require('../../utils/ui');
const { colors } = require('../../config');

const build = (name, locked) => ({
  data: new SlashCommandBuilder()
    .setName(name)
    .setDescription(locked ? 'Verrouiller un salon' : 'Déverrouiller un salon')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) =>
      o.setName('salon').setDescription('Salon (par défaut : ici)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(300)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    const reason = interaction.options.getString('raison') ?? 'Aucune raison fournie';
    await channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone,
      { SendMessages: locked ? false : null, SendMessagesInThreads: locked ? false : null, AddReactions: locked ? false : null },
      { reason: `${interaction.user.tag} : ${reason}` },
    );
    const payload = {
      title: locked ? '🔒 Salon verrouillé' : '🔓 Salon déverrouillé',
      description: `${channel} a été ${locked ? 'verrouillé' : 'déverrouillé'} par ${interaction.user}.\n**Raison :** ${reason}`,
      color: locked ? colors.error : colors.success,
    };
    await sendLog(interaction.guild, 'moderation', payload);
    if (channel.id !== interaction.channelId) await channel.send(ui.card(payload)).catch(() => null);
    return interaction.reply(ui.card(payload));
  },
});

module.exports = build('lock', true);
module.exports.build = build;

const { SlashCommandBuilder, InteractionContextType, ChannelType, GuildVerificationLevel } = require('discord.js');
const db = require('../../structures/Database');
const ui = require('../../utils/ui');

const VERIFICATION = {
  [GuildVerificationLevel.None]: 'Aucune',
  [GuildVerificationLevel.Low]: 'Faible',
  [GuildVerificationLevel.Medium]: 'Moyenne',
  [GuildVerificationLevel.High]: 'Élevée',
  [GuildVerificationLevel.VeryHigh]: 'Très élevée',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Informations sur le serveur')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const { guild } = interaction;
    const channels = guild.channels.cache;
    const data = db.guild(guild.id);
    const active = Object.values(data.protections).filter((p) => p.enabled).length;

    return interaction.reply(
      ui.card({
        title: `🏠 ${guild.name}`,
        description: guild.description ?? '',
        thumbnail: guild.iconURL({ size: 256 }) ?? undefined,
        fields: [
          {
            name: '📋 Général',
            value: `**ID :** \`${guild.id}\`\n**Propriétaire :** <@${guild.ownerId}>\n**Création :** ${ui.ts(guild.createdAt, 'D')} (${ui.ts(guild.createdAt)})\n**Vérification :** ${VERIFICATION[guild.verificationLevel]}`,
          },
          {
            name: '👥 Membres',
            value: `**Total :** ${guild.memberCount}\n**Boosts :** ${guild.premiumSubscriptionCount ?? 0} (niveau ${guild.premiumTier})`,
          },
          {
            name: '💬 Salons & rôles',
            value: `**Textuels :** ${channels.filter((c) => c.type === ChannelType.GuildText).size} · **Vocaux :** ${channels.filter((c) => c.type === ChannelType.GuildVoice).size} · **Catégories :** ${channels.filter((c) => c.type === ChannelType.GuildCategory).size}\n**Rôles :** ${guild.roles.cache.size - 1} · **Émojis :** ${guild.emojis.cache.size}`,
          },
          {
            name: '🛡️ Protection',
            value: `**Modules actifs :** ${active}/${Object.keys(data.protections).length}\n**Raidmode :** ${data.raidmode ? '🔴 Activé' : '🟢 Désactivé'}\n**Whitelist :** ${data.whitelist.length} · **Trust :** ${data.trusted.length}`,
          },
        ],
      }),
    );
  },
};

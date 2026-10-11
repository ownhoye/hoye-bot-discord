const { SlashCommandBuilder, version: djsVersion, ActionRowBuilder, ButtonBuilder, ButtonStyle, OAuth2Scopes, PermissionFlagsBits } = require('discord.js');
const config = require('../../config');
const db = require('../../structures/Database');
const { formatDuration } = require('../../utils/time');
const ui = require('../../utils/ui');

module.exports = {
  data: new SlashCommandBuilder().setName('botinfo').setDescription('Informations sur le bot'),

  async execute(interaction) {
    const { client } = interaction;
    const users = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
    const invite = client.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: [PermissionFlagsBits.Administrator],
    });
    const buttons = [new ButtonBuilder().setLabel('Inviter le bot').setEmoji('➕').setStyle(ButtonStyle.Link).setURL(invite)];
    if (config.supportUrl) {
      buttons.push(new ButtonBuilder().setLabel('Support').setEmoji('💬').setStyle(ButtonStyle.Link).setURL(config.supportUrl));
    }
    const owners = [...new Set([...config.owners, ...db.data.owners])];

    return interaction.reply(
      ui.card({
        title: `🤖 ${client.user.username}`,
        description: 'Bot de protection et de modération pour ta communauté.',
        thumbnail: client.user.displayAvatarURL({ size: 256 }),
        fields: [
          { name: '📊 Statistiques', value: `**Serveurs :** ${client.guilds.cache.size}\n**Utilisateurs :** ${users.toLocaleString('fr-FR')}\n**Commandes :** ${client.commands.size}` },
          {
            name: '⚙️ Technique',
            value: `**Uptime :** ${formatDuration(Date.now() - client.startedAt)}\n**Ping :** ${client.ws.ping} ms\n**RAM :** ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} Mo\n**Node.js :** ${process.version} · **discord.js :** v${djsVersion}`,
          },
          { name: '👨‍💻 Développeurs', value: config.devs.map((id) => `<@${id}>`).join(', ') || '*Aucun*' },
          { name: '👑 Owners', value: owners.map((id) => `<@${id}>`).join(', ') || '*Aucun*' },
        ],
        rows: [new ActionRowBuilder().addComponents(buttons)],
      }),
    );
  },
};

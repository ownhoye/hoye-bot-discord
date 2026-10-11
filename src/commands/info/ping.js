const { SlashCommandBuilder } = require('discord.js');
const ui = require('../../utils/ui');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Afficher la latence du bot'),

  async execute(interaction) {
    const start = Date.now();
    await interaction.deferReply();
    const api = Date.now() - start;
    const ws = interaction.client.ws.ping;
    const quality = (ms) => (ms < 150 ? '🟢' : ms < 400 ? '🟡' : '🔴');
    return interaction.editReply(
      ui.card({
        title: '🏓 Pong !',
        description: `${quality(ws)} **WebSocket :** \`${ws} ms\`\n${quality(api)} **API :** \`${api} ms\``,
      }),
    );
  },
};

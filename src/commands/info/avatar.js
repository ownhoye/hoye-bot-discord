const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');
const ui = require('../../utils/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Afficher l\'avatar d\'un utilisateur')
    .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur (par défaut : toi)')),

  async execute(interaction) {
    const user = interaction.options.getUser('utilisateur') ?? interaction.user;
    const url = user.displayAvatarURL({ size: 1024 });
    const container = new ContainerBuilder()
      .setAccentColor(config.colors.main)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 🖼️ Avatar de ${user.username}`))
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems((item) => item.setURL(url)))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Ouvrir').setStyle(ButtonStyle.Link).setURL(url)),
      );
    return interaction.reply(ui.v2([container]));
  },
};

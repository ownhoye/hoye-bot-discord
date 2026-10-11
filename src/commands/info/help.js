const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ApplicationCommandOptionType,
  MessageFlags,
} = require('discord.js');
const config = require('../../config');
const { getLevel, LEVELS, LEVEL_NAMES } = require('../../utils/perms');
const ui = require('../../utils/ui');

const CATEGORIES = {
  protection: { name: 'Protection', emoji: '🛡️', description: 'Anti-nuke, anti-raid, whitelist, logs…' },
  moderation: { name: 'Modération', emoji: '🔨', description: 'Ban, mute, warn, clear, lock…' },
  info: { name: 'Informations', emoji: 'ℹ️', description: 'Infos sur le bot, le serveur, les membres' },
  owner: { name: 'Owner & Dev', emoji: '👑', description: 'Gestion globale du bot', level: LEVELS.BOT_OWNER },
};

function mention(client, name, sub) {
  const cmd = client.application.commands.cache.find((c) => c.name === name);
  const full = sub ? `${name} ${sub}` : name;
  return cmd ? `</${full}:${cmd.id}>` : `\`/${full}\``;
}

function commandLines(client, category) {
  const lines = [];
  for (const cmd of client.commands.filter((c) => c.category === category).values()) {
    const json = cmd.data.toJSON();
    const subs = (json.options ?? []).filter((o) => o.type === ApplicationCommandOptionType.Subcommand);
    if (subs.length) {
      for (const sub of subs) lines.push(`${mention(client, json.name, sub.name)} — ${sub.description}`);
    } else {
      lines.push(`${mention(client, json.name)} — ${json.description}`);
    }
  }
  return lines;
}

function view(interaction, category) {
  const { client } = interaction;
  const level = getLevel(interaction.user.id, interaction.guild);
  const visible = Object.entries(CATEGORIES).filter(([, c]) => !c.level || level >= c.level);

  const container = new ContainerBuilder().setAccentColor(config.colors.main);

  if (!category) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🛡️ ${client.user.username} — Aide\n` +
          'Bot de protection complet : anti-nuke, anti-raid, anti-spam, vérification et modération.\n' +
          `Ton rang : **${LEVEL_NAMES[level]}**`,
      ),
    );
    container.addSeparatorComponents(ui.separator());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        visible.map(([key, c]) => `${c.emoji} **${c.name}** · ${commandLines(client, key).length} commandes\n-# ${c.description}`).join('\n'),
      ),
    );
    container.addSeparatorComponents(ui.separator());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '### 🚀 Démarrage rapide\n' +
          `1. ${mention(client, 'logs', 'setup')} pour créer les salons de logs\n` +
          `2. ${mention(client, 'protection', 'preset')} pour choisir un niveau\n` +
          `3. ${mention(client, 'whitelist', 'add')} pour tes modérateurs de confiance\n` +
          `4. ${mention(client, 'protection', 'panel')} pour tout personnaliser`,
      ),
    );
  } else {
    const cat = CATEGORIES[category];
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${cat.emoji} ${cat.name}\n${commandLines(client, category).join('\n')}`),
    );
  }

  container.addSeparatorComponents(ui.separator());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`help:category:${interaction.user.id}`)
        .setPlaceholder('📚 Choisir une catégorie…')
        .addOptions(
          { label: 'Accueil', value: 'home', emoji: '🏠', default: !category },
          ...visible.map(([key, c]) => ({ label: c.name, value: key, emoji: c.emoji, description: c.description, default: key === category })),
        ),
    ),
  );
  if (config.supportUrl) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Serveur support').setEmoji('💬').setStyle(ButtonStyle.Link).setURL(config.supportUrl)),
    );
  }
  return ui.v2([container]);
}

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('Afficher la liste des commandes'),

  async execute(interaction) {
    return interaction.reply(view(interaction));
  },

  async component(interaction, [, ownerId]) {
    const value = interaction.values[0];
    const payload = view(interaction, value === 'home' ? null : value);
    // Quelqu'un d'autre utilise le menu : on lui répond en privé sans toucher au message d'origine.
    if (interaction.user.id !== ownerId) return interaction.reply({ ...payload, flags: payload.flags | MessageFlags.Ephemeral });
    return interaction.update(payload);
  },
};

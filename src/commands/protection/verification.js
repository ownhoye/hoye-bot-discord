const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../../structures/Database');
const { LEVELS } = require('../../utils/perms');
const { sendLog } = require('../../utils/logger');
const ui = require('../../utils/ui');
const { colors } = require('../../config');

const EMOJIS = ['🍎', '🍌', '🍇', '🍉', '🍒', '🥝', '🍍', '🥥', '🍋', '🍑', '🥕', '🌽'];
const challenges = new Map();

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

function panel(guild) {
  const container = new ContainerBuilder()
    .setAccentColor(colors.main)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🔐 Vérification — ${guild.name}\n` +
          'Bienvenue ! Pour accéder au serveur, prouve que tu n\'es pas un robot en cliquant sur le bouton ci-dessous.',
      ),
    )
    .addSeparatorComponents(ui.separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('verification:start').setLabel('Me vérifier').setEmoji('✅').setStyle(ButtonStyle.Success),
      ),
    );
  return ui.v2([container]);
}

module.exports = {
  level: LEVELS.TRUSTED,
  data: new SlashCommandBuilder()
    .setName('verification')
    .setDescription('Système de vérification anti-bot (captcha)')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName('setup')
        .setDescription('Envoyer le panneau de vérification')
        .addRoleOption((o) => o.setName('role').setDescription('Rôle donné après vérification').setRequired(true))
        .addChannelOption((o) =>
          o.setName('salon').setDescription('Salon du panneau (par défaut : ici)').addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) => s.setName('disable').setDescription('Désactiver la vérification')),

  async execute(interaction) {
    const data = db.guild(interaction.guildId);

    if (interaction.options.getSubcommand() === 'disable') {
      data.verification.enabled = false;
      db.save();
      return interaction.reply(ui.success('Vérification désactivée.'));
    }

    const role = interaction.options.getRole('role');
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    if (!role.editable || role.managed) {
      return interaction.reply(ui.error(`Je ne peux pas donner le rôle ${role} : il doit être sous mon rôle le plus haut.`));
    }
    await channel.send(panel(interaction.guild));
    data.verification = { enabled: true, roleId: role.id, channelId: channel.id };
    db.save();
    return interaction.reply(ui.success(`Panneau envoyé dans ${channel}. Rôle donné : ${role}.`, 'Vérification activée'));
  },

  async component(interaction, [action, choice]) {
    const config = db.guild(interaction.guildId).verification;
    if (!config.enabled) return interaction.reply(ui.error('La vérification est désactivée sur ce serveur.'));
    const role = interaction.guild.roles.cache.get(config.roleId);
    if (!role) return interaction.reply(ui.error('Le rôle de vérification n\'existe plus. Préviens un administrateur.'));
    if (interaction.member.roles.cache.has(role.id)) return interaction.reply(ui.warn('Tu es déjà vérifié !'));

    if (action === 'start') {
      const options = shuffle(EMOJIS).slice(0, 5);
      const answer = options[Math.floor(Math.random() * options.length)];
      challenges.set(interaction.user.id, answer);
      setTimeout(() => challenges.delete(interaction.user.id), 120_000).unref();

      const row = new ActionRowBuilder().addComponents(
        options.map((emoji) =>
          new ButtonBuilder().setCustomId(`verification:answer:${emoji}`).setEmoji(emoji).setStyle(ButtonStyle.Secondary),
        ),
      );
      return interaction.reply(
        ui.card({
          title: '🧩 Captcha',
          description: `Clique sur le bouton **${answer}** pour être vérifié.\n-# Tu as 2 minutes.`,
          rows: [row],
          ephemeral: true,
        }),
      );
    }

    if (action === 'answer') {
      const expected = challenges.get(interaction.user.id);
      challenges.delete(interaction.user.id);
      if (!expected) return interaction.update(ui.edit(ui.error('Captcha expiré, recommence.')));
      if (expected !== choice) {
        return interaction.update(ui.edit(ui.error('Mauvaise réponse ! Clique à nouveau sur **Me vérifier**.')));
      }
      await interaction.member.roles.add(role, 'Vérification réussie');
      await sendLog(interaction.guild, 'moderation', {
        title: '✅ Membre vérifié',
        description: `${interaction.user} (\`${interaction.user.id}\`) a passé la vérification.`,
        color: colors.success,
      });
      return interaction.update(ui.edit(ui.success(`Tu as reçu le rôle ${role}. Bienvenue !`, 'Vérifié')));
    }
  },
};

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
} = require('discord.js');
const db = require('../../structures/Database');
const { MODULES, CATEGORIES, PUNISHMENTS, PRESETS, defaultProtections } = require('../../modules/definitions');
const { LEVELS, getLevel } = require('../../utils/perms');
const { v2, separator, toggle, error, success } = require('../../utils/ui');
const { colors } = require('../../config');

const NUMBER_LIMITS = { limit: [0, 100], interval: [1, 600], days: [1, 3650] };
const UNITS = { interval: 's', days: ' j' };

function params(key, settings) {
  const mod = MODULES[key];
  const parts = [];
  for (const k of Object.keys(mod.numbers ?? {})) parts.push(`${k === 'limit' ? 'seuil' : k === 'days' ? 'âge' : 'fenêtre'} ${settings[k]}${UNITS[k] ?? ''}`);
  for (const [k, choice] of Object.entries(mod.choices ?? {})) parts.push(choice.options[settings[k]]);
  return parts;
}

// ───────────────────────── Vues ─────────────────────────

function homeView(guild, userId) {
  const p = db.guild(guild.id).protections;
  const active = Object.values(p).filter((m) => m.enabled).length;
  const total = Object.keys(MODULES).length;

  const container = new ContainerBuilder()
    .setAccentColor(active ? colors.success : colors.error)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🛡️ Protection — ${guild.name}\n` +
          `**${active}/${total}** modules actifs. Choisis un module dans le menu pour le configurer.`,
      ),
    );

  for (const [catKey, cat] of Object.entries(CATEGORIES)) {
    const lines = Object.entries(MODULES)
      .filter(([, m]) => m.category === catKey)
      .map(([key, m]) => {
        const s = p[key];
        const extra = [PUNISHMENTS[s.punishment]?.label, ...params(key, s)].filter(Boolean).join(' · ');
        return `${toggle(s.enabled)} ${m.emoji} **${m.name}** · *${extra}*`;
      });
    container
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${cat.emoji} ${cat.name}\n${lines.join('\n')}`));
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`protection:module:${userId}`)
    .setPlaceholder('⚙️ Configurer un module…')
    .addOptions(
      Object.entries(MODULES).map(([key, m]) => ({
        label: m.name,
        value: key,
        emoji: m.emoji,
        description: `${p[key].enabled ? 'Activé' : 'Désactivé'} — ${CATEGORIES[m.category].name}`,
      })),
    );

  const preset = new StringSelectMenuBuilder()
    .setCustomId(`protection:preset:${userId}`)
    .setPlaceholder('🎚️ Appliquer un niveau de protection…')
    .addOptions(Object.entries(PRESETS).map(([key, pr]) => ({ label: `Niveau ${pr.label}`, value: key })));

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`protection:all:${userId}:on`).setLabel('Tout activer').setEmoji('🟢').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`protection:all:${userId}:off`).setLabel('Tout désactiver').setEmoji('🔴').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`protection:home:${userId}`).setLabel('Actualiser').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
  );

  container
    .addSeparatorComponents(separator())
    .addActionRowComponents(new ActionRowBuilder().addComponents(select))
    .addActionRowComponents(new ActionRowBuilder().addComponents(preset))
    .addActionRowComponents(buttons);

  return v2([container]);
}

function moduleView(guild, userId, key) {
  const mod = MODULES[key];
  const s = db.guild(guild.id).protections[key];

  const info = [
    `## ${mod.emoji} ${mod.name}`,
    mod.description,
    '',
    `**État :** ${toggle(s.enabled)} ${s.enabled ? 'Activé' : 'Désactivé'}`,
    `**Sanction :** ${PUNISHMENTS[s.punishment]?.emoji} ${PUNISHMENTS[s.punishment]?.label}`,
    ...Object.entries(mod.numbers ?? {}).map(([k, label]) => `**${label} :** \`${s[k]}\``),
    ...Object.entries(mod.choices ?? {}).map(([k, c]) => `**${c.label} :** ${c.options[s[k]]}`),
  ];
  if (mod.category === 'nuke') info.push('', '-# Les membres whitelist, trust et owners ne sont jamais sanctionnés.');

  const container = new ContainerBuilder()
    .setAccentColor(s.enabled ? colors.success : colors.error)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(info.join('\n')))
    .addSeparatorComponents(separator());

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`protection:punish:${userId}:${key}`)
        .setPlaceholder('Choisir la sanction…')
        .addOptions(
          mod.punishments.map((p) => ({
            label: PUNISHMENTS[p].label,
            value: p,
            emoji: PUNISHMENTS[p].emoji,
            default: s.punishment === p,
          })),
        ),
    ),
  );

  for (const [k, choice] of Object.entries(mod.choices ?? {})) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`protection:choice:${userId}:${key}:${k}`)
          .setPlaceholder(choice.label)
          .addOptions(Object.entries(choice.options).map(([value, label]) => ({ label, value, default: s[k] === value }))),
      ),
    );
  }

  const buttons = [
    new ButtonBuilder()
      .setCustomId(`protection:toggle:${userId}:${key}`)
      .setLabel(s.enabled ? 'Désactiver' : 'Activer')
      .setStyle(s.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
  ];
  if (mod.numbers) {
    buttons.push(
      new ButtonBuilder().setCustomId(`protection:edit:${userId}:${key}`).setLabel('Paramètres').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
    );
  }
  buttons.push(
    new ButtonBuilder().setCustomId(`protection:home:${userId}`).setLabel('Retour').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  );
  container.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));

  return v2([container]);
}

function settingsModal(guild, userId, key) {
  const mod = MODULES[key];
  const s = db.guild(guild.id).protections[key];
  const modal = new ModalBuilder().setCustomId(`protection:modal:${userId}:${key}`).setTitle(`${mod.name} — paramètres`);
  for (const [k, label] of Object.entries(mod.numbers)) {
    const [min, max] = NUMBER_LIMITS[k];
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel(label.slice(0, 45))
        .setDescription(`Nombre entre ${min} et ${max}`)
        .setTextInputComponent(
          new TextInputBuilder().setCustomId(k).setStyle(TextInputStyle.Short).setValue(String(s[k])).setMaxLength(4).setRequired(true),
        ),
    );
  }
  return modal;
}

function applyPreset(guildId, presetKey) {
  const preset = PRESETS[presetKey];
  const data = db.guild(guildId);
  data.protections = defaultProtections();
  for (const [key, settings] of Object.entries(data.protections)) {
    settings.enabled = preset.enable.includes(key);
    const override = preset.override?.punishment?.[MODULES[key].category];
    if (override && MODULES[key].punishments.includes(override)) settings.punishment = override;
  }
  db.save();
}

// ───────────────────────── Commande ─────────────────────────

module.exports = {
  level: LEVELS.TRUSTED,
  data: new SlashCommandBuilder()
    .setName('protection')
    .setDescription('Configurer la protection du serveur')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('panel').setDescription('Ouvrir le panneau interactif de protection'))
    .addSubcommand((s) =>
      s
        .setName('preset')
        .setDescription('Appliquer un niveau de protection prédéfini')
        .addStringOption((o) =>
          o
            .setName('niveau')
            .setDescription('Niveau de protection')
            .setRequired(true)
            .addChoices(...Object.entries(PRESETS).map(([value, p]) => ({ name: p.label, value }))),
        ),
    )
    .addSubcommand((s) => s.setName('reset').setDescription('Remettre tous les modules par défaut')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'panel') return interaction.reply(homeView(interaction.guild, interaction.user.id));

    if (sub === 'preset') {
      const key = interaction.options.getString('niveau');
      applyPreset(interaction.guildId, key);
      return interaction.reply(homeView(interaction.guild, interaction.user.id));
    }

    if (sub === 'reset') {
      db.guild(interaction.guildId).protections = defaultProtections();
      db.save();
      return interaction.reply(success('Tous les modules ont été remis par défaut.'));
    }
  },

  async component(interaction, [action, ownerId, key, extra]) {
    if (interaction.user.id !== ownerId) {
      return interaction.reply(error('Ce panneau ne t\'appartient pas. Ouvre le tien avec `/protection panel`.'));
    }
    if (getLevel(interaction.user.id, interaction.guild) < LEVELS.TRUSTED) {
      return interaction.reply(error('Tu n\'as plus la permission de configurer la protection.'));
    }

    const { guild } = interaction;
    const data = db.guild(guild.id);
    const userId = interaction.user.id;

    switch (action) {
      case 'home':
        return interaction.update(homeView(guild, userId));

      case 'module':
        return interaction.update(moduleView(guild, userId, interaction.values[0]));

      case 'preset':
        applyPreset(guild.id, interaction.values[0]);
        return interaction.update(homeView(guild, userId));

      case 'all':
        for (const settings of Object.values(data.protections)) settings.enabled = key === 'on';
        db.save();
        return interaction.update(homeView(guild, userId));

      case 'toggle':
        data.protections[key].enabled = !data.protections[key].enabled;
        db.save();
        return interaction.update(moduleView(guild, userId, key));

      case 'punish':
        data.protections[key].punishment = interaction.values[0];
        db.save();
        return interaction.update(moduleView(guild, userId, key));

      case 'choice':
        data.protections[key][extra] = interaction.values[0];
        db.save();
        return interaction.update(moduleView(guild, userId, key));

      case 'edit':
        return interaction.showModal(settingsModal(guild, userId, key));

      case 'modal': {
        const updates = {};
        for (const k of Object.keys(MODULES[key].numbers)) {
          const value = Number(interaction.fields.getTextInputValue(k));
          const [min, max] = NUMBER_LIMITS[k];
          if (!Number.isInteger(value) || value < min || value > max) {
            return interaction.reply(error(`**${MODULES[key].numbers[k]}** doit être un nombre entier entre ${min} et ${max}.`));
          }
          updates[k] = value;
        }
        Object.assign(data.protections[key], updates);
        db.save();
        return interaction.update(moduleView(guild, userId, key));
      }
    }
  },
};

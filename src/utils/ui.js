const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
} = require('discord.js');
const { colors } = require('../config');

/**
 * Helpers pour construire des messages "Components V2"
 * (conteneurs, textes, séparateurs, sections avec miniature…).
 *
 * card({ title, description, color, thumbnail, fields, footer, rows, ephemeral })
 *   → options prêtes à passer à reply / editReply / update / send.
 */
function card({
  title,
  description,
  color = colors.main,
  thumbnail,
  fields = [],
  footer,
  rows = [],
  ephemeral = false,
} = {}) {
  const container = new ContainerBuilder().setAccentColor(color);

  const header = [title && `## ${title}`, description].filter(Boolean).join('\n');
  if (header && thumbnail) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail)),
    );
  } else if (header) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));
  }

  if (fields.length) {
    container.addSeparatorComponents(separator());
    const content = fields
      .filter(Boolean)
      .map((f) => `**${f.name}**\n${f.value}`)
      .join('\n\n');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  }

  if (rows.length) {
    container.addSeparatorComponents(separator());
    container.addActionRowComponents(...rows);
  }

  if (footer) {
    container.addSeparatorComponents(separator(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));
  }

  return v2([container], ephemeral);
}

/** Enveloppe une liste de composants dans un payload V2. */
function v2(components, ephemeral = false) {
  let flags = MessageFlags.IsComponentsV2;
  if (ephemeral) flags |= MessageFlags.Ephemeral;
  return { components, flags, allowedMentions: { parse: [] } };
}

function separator(divider = true, large = false) {
  return new SeparatorBuilder()
    .setDivider(divider)
    .setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}

const success = (description, title = 'Succès') =>
  card({ title: `✅ ${title}`, description, color: colors.success, ephemeral: true });

const error = (description, title = 'Erreur') =>
  card({ title: `❌ ${title}`, description, color: colors.error, ephemeral: true });

const warn = (description, title = 'Attention') =>
  card({ title: `⚠️ ${title}`, description, color: colors.warn, ephemeral: true });

/** Pour editReply / update : le flag éphémère ne peut pas être modifié après coup. */
const edit = (payload) => ({ ...payload, flags: payload.flags & ~MessageFlags.Ephemeral });

const toggle = (value) => (value ? '🟢' : '🔴');
const ts = (date, style = 'R') => `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;

module.exports = { card, v2, separator, success, error, warn, edit, toggle, ts };

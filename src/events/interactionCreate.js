const { Events } = require('discord.js');
const { getLevel, isBlacklisted, isBotOwner, LEVEL_NAMES } = require('../utils/perms');
const ui = require('../utils/ui');

async function safeReply(interaction, payload) {
  if (interaction.replied || interaction.deferred) return interaction.followUp(payload).catch(() => null);
  return interaction.reply(payload).catch(() => null);
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (isBlacklisted(interaction.user.id) && !isBotOwner(interaction.user.id)) {
      if (interaction.isRepliable()) await safeReply(interaction, ui.error('Tu es blacklist de ce bot.'));
      return;
    }

    // ───── Autocomplétion ─────
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      return command?.autocomplete?.(interaction).catch(() => null);
    }

    // ───── Commandes slash ─────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      const sub = interaction.options.getSubcommand(false);
      const required = command.levels?.[sub] ?? command.level ?? 0;
      if (required && getLevel(interaction.user.id, interaction.guild) < required) {
        return safeReply(
          interaction,
          ui.error(`Cette commande est réservée au rang **${LEVEL_NAMES[required]}** ou supérieur.`, 'Permission refusée'),
        );
      }

      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[/${interaction.commandName}]`, err);
        await safeReply(interaction, ui.error(`Une erreur est survenue :\n\`\`\`${String(err.message).slice(0, 500)}\`\`\``));
      }
      return;
    }

    // ───── Boutons / menus / modals : customId = "commande:action:args…" ─────
    if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
      const [name, ...args] = interaction.customId.split(':');
      const command = client.commands.get(name);
      if (!command?.component) return;
      try {
        await command.component(interaction, args, client);
      } catch (err) {
        console.error(`[component:${interaction.customId}]`, err);
        await safeReply(interaction, ui.error(`Une erreur est survenue :\n\`\`\`${String(err.message).slice(0, 500)}\`\`\``));
      }
    }
  },
};

const { SlashCommandBuilder, InteractionContextType } = require('discord.js');
const db = require('../../structures/Database');
const { getLevel, LEVEL_NAMES, isBlacklisted } = require('../../utils/perms');
const ui = require('../../utils/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Informations sur un utilisateur')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('utilisateur').setDescription('Utilisateur (par défaut : toi)')),

  async execute(interaction) {
    const user = await (interaction.options.getUser('utilisateur') ?? interaction.user).fetch();
    const member = interaction.options.getMember('utilisateur') ?? (user.id === interaction.user.id ? interaction.member : null);
    const warns = db.guild(interaction.guildId).warns[user.id]?.length ?? 0;
    const roles = member?.roles.cache.filter((r) => r.id !== interaction.guildId).sort((a, b) => b.position - a.position);

    const fields = [
      {
        name: '👤 Compte',
        value: `**Nom :** ${user.username}${user.bot ? ' 🤖' : ''}\n**ID :** \`${user.id}\`\n**Création :** ${ui.ts(user.createdAt, 'D')} (${ui.ts(user.createdAt)})`,
      },
    ];
    if (member) {
      fields.push({
        name: '🏠 Serveur',
        value: `**Arrivée :** ${ui.ts(member.joinedAt, 'D')} (${ui.ts(member.joinedAt)})\n**Rôles (${roles.size}) :** ${roles.first(15).join(' ') || '*Aucun*'}`,
      });
    }
    fields.push({
      name: '🛡️ Bot',
      value: `**Rang :** ${LEVEL_NAMES[getLevel(user.id, interaction.guild)]}\n**Avertissements :** ${warns}\n**Blacklist globale :** ${isBlacklisted(user.id) ? '⛔ Oui' : 'Non'}`,
    });

    return interaction.reply(
      ui.card({
        title: member?.displayName ?? user.globalName ?? user.username,
        thumbnail: user.displayAvatarURL({ size: 256 }),
        color: user.accentColor ?? undefined,
        fields,
      }),
    );
  },
};

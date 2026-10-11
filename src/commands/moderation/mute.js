const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require('discord.js');
const { checkHierarchy } = require('../../utils/perms');
const { moderate } = require('../../utils/moderation');
const { parseDuration, formatDuration } = require('../../utils/time');
const ui = require('../../utils/ui');
const { colors } = require('../../config');

const MAX = 28 * 864e5;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Rendre un membre muet (timeout)')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Membre à mute').setRequired(true))
    .addStringOption((o) => o.setName('duree').setDescription('Durée : 30s, 10m, 2h, 1d, 1w… (max 28j)').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(400)),

  async execute(interaction) {
    const member = interaction.options.getMember('membre');
    if (!member) return interaction.reply(ui.error('Ce membre n\'est pas sur le serveur.'));
    const problem = checkHierarchy(interaction.member, member);
    if (problem) return interaction.reply(ui.error(problem));
    if (!member.moderatable) return interaction.reply(ui.error('Je ne peux pas mute ce membre.'));

    const duration = parseDuration(interaction.options.getString('duree'));
    if (!duration || duration > MAX) return interaction.reply(ui.error('Durée invalide. Exemples : `30s`, `10m`, `2h`, `1d` (max 28 jours).'));

    const reason = interaction.options.getString('raison');
    await member.timeout(duration, `${interaction.user.tag} : ${reason ?? 'Aucune raison'}`);
    return interaction.reply(
      await moderate(interaction, {
        emoji: '🔇',
        action: 'Mute',
        verb: 'mute',
        user: member.user,
        reason,
        color: colors.warn,
        details: [`**Durée :** ${formatDuration(duration)} (fin ${ui.ts(Date.now() + duration)})`],
      }),
    );
  },
};

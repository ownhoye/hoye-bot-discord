const util = require('node:util');
const path = require('node:path');
const {
  SlashCommandBuilder,
  MessageFlags,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  FileBuilder,
  version: djsVersion,
} = require('discord.js');
const config = require('../../config');
const db = require('../../structures/Database');
const { LEVELS } = require('../../utils/perms');
const { loadCommands, deployCommands } = require('../../handlers/loader');
const { applyStatus } = require('../../events/ready');
const { formatDuration } = require('../../utils/time');
const ui = require('../../utils/ui');

const redact = (text) => text.replaceAll(config.token, '[TOKEN]');

module.exports = {
  level: LEVELS.DEV,
  devGuild: true,
  data: new SlashCommandBuilder()
    .setName('dev')
    .setDescription('Commandes développeur')
    .addSubcommand((s) => s.setName('stats').setDescription('Statistiques détaillées du bot'))
    .addSubcommand((s) => s.setName('guilds').setDescription('Lister les serveurs du bot'))
    .addSubcommand((s) =>
      s
        .setName('leave')
        .setDescription('Faire quitter un serveur au bot')
        .addStringOption((o) => o.setName('id').setDescription('ID du serveur').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('status')
        .setDescription('Changer le statut du bot')
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('Type d\'activité')
            .setRequired(true)
            .addChoices(
              { name: 'Regarde', value: 'Watching' },
              { name: 'Joue à', value: 'Playing' },
              { name: 'Écoute', value: 'Listening' },
              { name: 'En compétition', value: 'Competing' },
              { name: 'Personnalisé', value: 'Custom' },
            ),
        )
        .addStringOption((o) => o.setName('texte').setDescription('Texte du statut').setRequired(true).setMaxLength(120))
        .addStringOption((o) =>
          o
            .setName('presence')
            .setDescription('Présence')
            .addChoices(
              { name: '🟢 En ligne', value: 'online' },
              { name: '🌙 Inactif', value: 'idle' },
              { name: '⛔ Ne pas déranger', value: 'dnd' },
            ),
        ),
    )
    .addSubcommand((s) => s.setName('status-reset').setDescription('Remettre le statut par défaut'))
    .addSubcommand((s) => s.setName('reload').setDescription('Recharger et republier les commandes'))
    .addSubcommand((s) => s.setName('backup').setDescription('Recevoir une copie de la base de données'))
    .addSubcommand((s) => s.setName('eval').setDescription('Exécuter du code JavaScript')),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'stats') {
      const mem = process.memoryUsage();
      return interaction.reply(
        ui.card({
          title: '📊 Statistiques développeur',
          fields: [
            { name: 'Bot', value: `**Serveurs :** ${client.guilds.cache.size}\n**Utilisateurs en cache :** ${client.users.cache.size}\n**Salons en cache :** ${client.channels.cache.size}\n**Commandes :** ${client.commands.size}` },
            { name: 'Process', value: `**Uptime :** ${formatDuration(Date.now() - client.startedAt)}\n**RAM :** ${(mem.rss / 1048576).toFixed(1)} Mo (heap ${(mem.heapUsed / 1048576).toFixed(1)} Mo)\n**Node.js :** ${process.version} · **discord.js :** v${djsVersion}\n**PID :** ${process.pid}` },
            { name: 'Base de données', value: `**Serveurs configurés :** ${Object.keys(db.data.guilds).length}\n**Owners ajoutés :** ${db.data.owners.length}\n**Blacklist :** ${Object.keys(db.data.blacklist).length}` },
          ],
          ephemeral: true,
        }),
      );
    }

    if (sub === 'guilds') {
      const guilds = [...client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);
      return interaction.reply(
        ui.card({
          title: `🌐 Serveurs — ${guilds.length}`,
          description: guilds
            .slice(0, 30)
            .map((g, i) => `\`${i + 1}.\` **${g.name}** — ${g.memberCount} membres\n-# \`${g.id}\` · owner <@${g.ownerId}>`)
            .join('\n'),
          footer: guilds.length > 30 ? `… et ${guilds.length - 30} autres` : undefined,
          ephemeral: true,
        }),
      );
    }

    if (sub === 'leave') {
      const guild = client.guilds.cache.get(interaction.options.getString('id'));
      if (!guild) return interaction.reply(ui.error('Serveur introuvable.'));
      await guild.leave();
      return interaction.reply(ui.success(`J'ai quitté **${guild.name}** (\`${guild.id}\`).`));
    }

    if (sub === 'status') {
      db.data.status = {
        type: interaction.options.getString('type'),
        text: interaction.options.getString('texte'),
        presence: interaction.options.getString('presence') ?? 'online',
      };
      db.save();
      applyStatus(client);
      return interaction.reply(ui.success('Statut mis à jour.'));
    }

    if (sub === 'status-reset') {
      db.data.status = null;
      db.save();
      applyStatus(client);
      return interaction.reply(ui.success('Statut remis par défaut.'));
    }

    if (sub === 'reload') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      loadCommands(client);
      const count = await deployCommands(client, config.devGuildId);
      return interaction.editReply(ui.edit(ui.success(`**${count}** commandes rechargées et republiées.`)));
    }

    if (sub === 'backup') {
      db.flush();
      const container = new ContainerBuilder()
        .setAccentColor(config.colors.main)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## 💾 Backup\nBase de données au ${ui.ts(Date.now(), 'F')}`))
        .addFileComponents(new FileBuilder().setURL('attachment://database.json'));
      return interaction.reply({
        ...ui.v2([container], true),
        files: [{ attachment: db.file, name: path.basename(db.file) }],
      });
    }

    if (sub === 'eval') {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('dev:eval')
          .setTitle('Eval JavaScript')
          .addLabelComponents(
            new LabelBuilder()
              .setLabel('Code')
              .setDescription('Variables : client, interaction, db, config')
              .setTextInputComponent(new TextInputBuilder().setCustomId('code').setStyle(TextInputStyle.Paragraph).setRequired(true)),
          ),
      );
    }
  },

  async component(interaction, [action], client) {
    // Double vérification : le modal n'est accessible qu'aux développeurs.
    if (action !== 'eval' || !config.devs.includes(interaction.user.id)) return;
    const code = interaction.fields.getTextInputValue('code');
    let output;
    let ok = true;
    const start = performance.now();
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('client', 'interaction', 'db', 'config', `return (async () => { ${code.includes('return') ? code : `return ${code}`} })();`);
      output = await fn(client, interaction, db, config);
    } catch (err) {
      ok = false;
      output = err;
    }
    const time = (performance.now() - start).toFixed(2);
    const text = redact(typeof output === 'string' ? output : util.inspect(output, { depth: 1 }));
    return interaction.reply(
      ui.card({
        title: ok ? '✅ Eval' : '❌ Eval — erreur',
        color: ok ? config.colors.success : config.colors.error,
        fields: [
          { name: 'Entrée', value: `\`\`\`js\n${code.slice(0, 900)}\n\`\`\`` },
          { name: 'Sortie', value: `\`\`\`js\n${text.slice(0, 1800)}\n\`\`\`` },
        ],
        footer: `${time} ms`,
        ephemeral: true,
      }),
    );
  },
};

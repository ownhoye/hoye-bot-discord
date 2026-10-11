/**
 * Définition de tous les modules de protection.
 *  - category : nuke | message | member
 *  - punishments : sanctions possibles
 *  - numbers : paramètres numériques modifiables depuis le panneau (modal)
 *  - choices : paramètres à choix (menu déroulant)
 */
const PUNISHMENTS = {
  delete: { label: 'Supprimer le message', emoji: '🗑️' },
  warn: { label: 'Avertir', emoji: '⚠️' },
  mute: { label: 'Mute (timeout)', emoji: '🔇' },
  derank: { label: 'Dérank (retirer les rôles)', emoji: '📉' },
  kick: { label: 'Expulser', emoji: '👢' },
  ban: { label: 'Bannir', emoji: '🔨' },
};

const NUKE = ['derank', 'kick', 'ban'];
const MESSAGE = ['delete', 'warn', 'mute', 'kick', 'ban'];

const MODULES = {
  // ───── Anti-nuke ─────
  antichannel: {
    name: 'Anti-Channel',
    emoji: '📁',
    category: 'nuke',
    description: 'Création, suppression et modification de salons. Les salons supprimés sont recréés.',
    punishments: NUKE,
    defaults: { enabled: true, punishment: 'derank', limit: 2, interval: 10 },
    numbers: { limit: 'Actions autorisées avant sanction', interval: 'Fenêtre de temps (secondes)' },
  },
  antirole: {
    name: 'Anti-Role',
    emoji: '🎭',
    category: 'nuke',
    description: 'Création, suppression et modification de rôles. Les rôles supprimés sont recréés.',
    punishments: NUKE,
    defaults: { enabled: true, punishment: 'derank', limit: 2, interval: 10 },
    numbers: { limit: 'Actions autorisées avant sanction', interval: 'Fenêtre de temps (secondes)' },
  },
  antiban: {
    name: 'Anti-Ban',
    emoji: '🔨',
    category: 'nuke',
    description: 'Bannissements de masse. Les membres bannis sont débannis.',
    punishments: NUKE,
    defaults: { enabled: true, punishment: 'derank', limit: 3, interval: 10 },
    numbers: { limit: 'Bans autorisés avant sanction', interval: 'Fenêtre de temps (secondes)' },
  },
  antikick: {
    name: 'Anti-Kick',
    emoji: '👢',
    category: 'nuke',
    description: 'Expulsions de masse et prune de membres.',
    punishments: NUKE,
    defaults: { enabled: true, punishment: 'derank', limit: 3, interval: 10 },
    numbers: { limit: 'Kicks autorisés avant sanction', interval: 'Fenêtre de temps (secondes)' },
  },
  antibot: {
    name: 'Anti-Bot',
    emoji: '🤖',
    category: 'nuke',
    description: 'Expulse les bots ajoutés par un membre non whitelist.',
    punishments: NUKE,
    defaults: { enabled: true, punishment: 'derank' },
  },
  antiwebhook: {
    name: 'Anti-Webhook',
    emoji: '🪝',
    category: 'nuke',
    description: 'Supprime les webhooks créés par un membre non whitelist.',
    punishments: NUKE,
    defaults: { enabled: true, punishment: 'derank' },
  },
  antiperm: {
    name: 'Anti-Permissions',
    emoji: '🔑',
    category: 'nuke',
    description: 'Empêche de donner des permissions dangereuses (admin, ban, gérer le serveur…) à un rôle ou un membre.',
    punishments: NUKE,
    defaults: { enabled: true, punishment: 'derank' },
  },
  antiguild: {
    name: 'Anti-Update Serveur',
    emoji: '🏠',
    category: 'nuke',
    description: 'Annule les modifications du nom / de l\'icône du serveur.',
    punishments: NUKE,
    defaults: { enabled: true, punishment: 'derank' },
  },

  // ───── Messages ─────
  antilink: {
    name: 'Anti-Link',
    emoji: '🔗',
    category: 'message',
    description: 'Supprime les liens envoyés par les membres.',
    punishments: MESSAGE,
    defaults: { enabled: false, punishment: 'delete', mode: 'invites' },
    choices: {
      mode: {
        label: 'Type de liens bloqués',
        options: { invites: 'Invitations Discord uniquement', all: 'Tous les liens' },
      },
    },
  },
  antispam: {
    name: 'Anti-Spam',
    emoji: '💬',
    category: 'message',
    description: 'Détecte les membres qui envoient trop de messages en peu de temps.',
    punishments: MESSAGE,
    defaults: { enabled: false, punishment: 'mute', limit: 6, interval: 5 },
    numbers: { limit: 'Messages max dans la fenêtre', interval: 'Fenêtre de temps (secondes)' },
  },
  antimassmention: {
    name: 'Anti-Mass Mention',
    emoji: '📢',
    category: 'message',
    description: 'Bloque les messages contenant trop de mentions.',
    punishments: MESSAGE,
    defaults: { enabled: false, punishment: 'mute', limit: 5 },
    numbers: { limit: 'Mentions max par message' },
  },
  antieveryone: {
    name: 'Anti-Everyone',
    emoji: '📣',
    category: 'message',
    description: 'Bloque les @everyone / @here des membres non whitelist.',
    punishments: MESSAGE,
    defaults: { enabled: false, punishment: 'delete' },
  },

  // ───── Membres ─────
  antiraid: {
    name: 'Anti-Raid',
    emoji: '🚨',
    category: 'member',
    description: 'Active automatiquement le raidmode si trop de membres rejoignent en peu de temps.',
    punishments: ['kick', 'ban'],
    defaults: { enabled: false, punishment: 'kick', limit: 10, interval: 10 },
    numbers: { limit: 'Arrivées max dans la fenêtre', interval: 'Fenêtre de temps (secondes)' },
  },
  antialt: {
    name: 'Anti-Alt',
    emoji: '👶',
    category: 'member',
    description: 'Sanctionne les comptes Discord trop récents.',
    punishments: ['kick', 'ban'],
    defaults: { enabled: false, punishment: 'kick', days: 7 },
    numbers: { days: 'Âge minimum du compte (jours)' },
  },
  blacklist: {
    name: 'Blacklist Globale',
    emoji: '⛔',
    category: 'member',
    description: 'Sanctionne les utilisateurs présents dans la blacklist globale du bot.',
    punishments: ['kick', 'ban'],
    defaults: { enabled: true, punishment: 'ban' },
  },
};

const CATEGORIES = {
  nuke: { name: 'Anti-Nuke', emoji: '💣' },
  message: { name: 'Messages', emoji: '💬' },
  member: { name: 'Membres', emoji: '👥' },
};

const PRESETS = {
  off: { label: 'Désactivé', enable: [] },
  low: {
    label: 'Faible',
    enable: ['antibot', 'antiwebhook', 'antiperm', 'blacklist'],
  },
  medium: {
    label: 'Moyen',
    enable: ['antichannel', 'antirole', 'antiban', 'antikick', 'antibot', 'antiwebhook', 'antiperm', 'antiguild', 'antieveryone', 'blacklist'],
  },
  high: {
    label: 'Élevé',
    enable: ['antichannel', 'antirole', 'antiban', 'antikick', 'antibot', 'antiwebhook', 'antiperm', 'antiguild', 'antilink', 'antispam', 'antimassmention', 'antieveryone', 'antiraid', 'blacklist'],
  },
  max: {
    label: 'Maximum',
    enable: Object.keys(MODULES),
    override: { punishment: { nuke: 'ban' } },
  },
};

function defaultProtections() {
  return Object.fromEntries(Object.entries(MODULES).map(([key, mod]) => [key, { ...mod.defaults }]));
}

module.exports = { MODULES, CATEGORIES, PUNISHMENTS, PRESETS, defaultProtections };

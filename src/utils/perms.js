const config = require('../config');
const db = require('../structures/Database');

/**
 * Hiérarchie des rangs du bot :
 *  5 - Développeur      (DEV_IDS dans le .env)
 *  4 - Owner du bot     (OWNER_IDS dans le .env + /owner add)
 *  3 - Owner du serveur (propriétaire du serveur Discord)
 *  2 - Trust            (/trust add — peut configurer la protection)
 *  1 - Whitelist        (/whitelist add — ignoré par les protections)
 *  0 - Membre
 */
const LEVELS = {
  MEMBER: 0,
  WHITELIST: 1,
  TRUSTED: 2,
  GUILD_OWNER: 3,
  BOT_OWNER: 4,
  DEV: 5,
};

const LEVEL_NAMES = {
  0: 'Membre',
  1: 'Whitelist',
  2: 'Trust',
  3: 'Owner du serveur',
  4: 'Owner du bot',
  5: 'Développeur',
};

const isDev = (id) => config.devs.includes(id);
const isMainOwner = (id) => isDev(id) || config.owners.includes(id);
const isBotOwner = (id) => isMainOwner(id) || db.data.owners.includes(id);
const isBlacklisted = (id) => Boolean(db.data.blacklist[id]);

function getLevel(userId, guild) {
  if (isDev(userId)) return LEVELS.DEV;
  if (isBotOwner(userId)) return LEVELS.BOT_OWNER;
  if (!guild) return LEVELS.MEMBER;
  if (guild.ownerId === userId) return LEVELS.GUILD_OWNER;
  const data = db.guild(guild.id);
  if (data.trusted.includes(userId)) return LEVELS.TRUSTED;
  if (data.whitelist.includes(userId)) return LEVELS.WHITELIST;
  return LEVELS.MEMBER;
}

/** Un utilisateur ignoré par les protections (whitelist et au-dessus, ou le bot lui-même). */
function isImmune(userId, guild) {
  if (!userId || userId === guild.client.user.id) return true;
  return getLevel(userId, guild) >= LEVELS.WHITELIST;
}

/**
 * Vérifie qu'un modérateur peut agir sur une cible (hiérarchie des rôles).
 * Retourne un message d'erreur ou null.
 */
function checkHierarchy(moderator, target) {
  if (!target) return null;
  const guild = target.guild;
  if (target.id === moderator.id) return 'Tu ne peux pas faire ça sur toi-même.';
  if (target.id === guild.ownerId) return 'Impossible d\'agir sur le propriétaire du serveur.';
  if (target.id === guild.client.user.id) return 'Je ne peux pas agir sur moi-même.';
  if (
    moderator.id !== guild.ownerId &&
    target.roles.highest.position >= moderator.roles.highest.position &&
    getLevel(moderator.id, guild) < LEVELS.BOT_OWNER
  ) {
    return 'Ce membre a un rôle supérieur ou égal au tien.';
  }
  if (!target.manageable) return 'Ce membre a un rôle supérieur ou égal au mien.';
  return null;
}

module.exports = {
  LEVELS,
  LEVEL_NAMES,
  isDev,
  isMainOwner,
  isBotOwner,
  isBlacklisted,
  getLevel,
  isImmune,
  checkHierarchy,
};

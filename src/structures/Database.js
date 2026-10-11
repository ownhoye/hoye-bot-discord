const fs = require('node:fs');
const path = require('node:path');
const { defaultProtections } = require('../modules/definitions');

const defaultGuild = () => ({
  whitelist: [],
  trusted: [],
  logs: { protection: null, moderation: null },
  protections: defaultProtections(),
  raidmode: false,
  lockdown: [],
  verification: { enabled: false, roleId: null, channelId: null },
  warns: {},
  warnCounter: 0,
});

/**
 * Petite base de données JSON : aucune dépendance native,
 * écriture atomique (fichier temporaire + rename) et sauvegarde différée.
 */
class Database {
  constructor(file) {
    this.file = file;
    this.timer = null;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      this.data = {};
    }
    this.data.owners ??= [];
    this.data.blacklist ??= {};
    this.data.guilds ??= {};
    this.data.status ??= null;
  }

  guild(id) {
    const base = defaultGuild();
    const current = (this.data.guilds[id] ??= base);
    for (const key of Object.keys(base)) current[key] ??= base[key];
    for (const [name, def] of Object.entries(base.protections)) {
      current.protections[name] = { ...def, ...current.protections[name] };
    }
    return current;
  }

  deleteGuild(id) {
    delete this.data.guilds[id];
    this.save();
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 500);
  }

  flush() {
    clearTimeout(this.timer);
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = new Database(path.join(__dirname, '..', '..', 'data', 'database.json'));

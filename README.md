# 🛡️ Hoye Bot — Protection Discord

Bot de protection pour communauté Discord : **anti-nuke, anti-raid, anti-spam, captcha, modération**.
Toutes les commandes sont en **slash (`/`)** et toutes les réponses utilisent les **Components V2** de Discord
(conteneurs, sections, séparateurs, menus intégrés) — plus d'anciens embeds.

- Node.js ≥ 18.17 · discord.js 14.27
- Aucune base de données à installer : tout est stocké dans `data/database.json`

---

## 🚀 Installation

```bash
git clone https://github.com/ownhoye/hoye-bot-discord.git
cd hoye-bot-discord
npm install
cp .env.example .env   # puis remplis le fichier .env
npm start
```

Les commandes slash sont publiées automatiquement au démarrage (`npm run deploy` pour les publier sans lancer le bot).
`npm run check` vérifie que toutes les commandes sont valides.

### Le fichier `.env`

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Token du bot (Developer Portal → Bot → Reset Token) |
| `CLIENT_ID` | ID de l'application |
| `DEV_IDS` | IDs des **développeurs**, séparés par des virgules (accès total + `/dev`) |
| `OWNER_IDS` | IDs des **owners principaux** du bot (accès total, peuvent ajouter d'autres owners) |
| `DEV_GUILD_ID` | *(optionnel)* serveur où seront publiées uniquement les commandes `/dev`, `/owner`, `/blacklist` |
| `MAIN_COLOR` | *(optionnel)* couleur des panneaux, ex. `#5865F2` |
| `SUPPORT_URL` | *(optionnel)* lien de ton serveur support |

> Pour copier un ID : Paramètres Discord → Avancés → **Mode développeur**, puis clic droit → *Copier l'identifiant*.

### Configuration sur le Developer Portal

1. **Bot → Privileged Gateway Intents** : active **Server Members Intent** et **Message Content Intent**.
2. Invite le bot avec les scopes `bot` + `applications.commands` et la permission **Administrateur**
   (le lien est aussi disponible avec `/botinfo`).
3. Sur ton serveur, place le **rôle du bot tout en haut** de la liste des rôles : il ne peut pas sanctionner
   quelqu'un qui a un rôle au-dessus du sien.

---

## 👑 Les rangs

| Rang | Qui | Ce qu'il peut faire |
|---|---|---|
| 5 · **Développeur** | `DEV_IDS` | Tout + `/dev` (eval, reload, statut, backup…) |
| 4 · **Owner du bot** | `OWNER_IDS` + `/owner add` | Tout configurer sur tous les serveurs, `/blacklist` |
| 3 · **Owner du serveur** | Propriétaire du serveur | Gérer la whitelist et les trusts |
| 2 · **Trust** | `/trust add` | Configurer la protection, logs, raidmode, vérification |
| 1 · **Whitelist** | `/whitelist add` | Ignoré par toutes les protections |

Seuls les **développeurs** et les **owners du `.env`** peuvent ajouter / retirer des owners avec `/owner`.

---

## 📚 Commandes

### 🛡️ Protection
| Commande | Description |
|---|---|
| `/protection panel` | Panneau interactif : activer/désactiver chaque module, choisir la sanction, régler les seuils |
| `/protection preset` | Appliquer un niveau : Désactivé, Faible, Moyen, Élevé, Maximum |
| `/protection reset` | Remettre la config par défaut |
| `/whitelist add/remove/list/clear` | Membres ignorés par les protections |
| `/trust add/remove/list/clear` | Membres de confiance qui peuvent configurer le bot |
| `/logs setup` | Crée une catégorie privée avec les salons de logs |
| `/logs set/disable/show` | Gérer les salons de logs (protection / modération) |
| `/raidmode` | Sanctionner automatiquement tous les nouveaux membres |
| `/lockdown` | Verrouiller / rouvrir tous les salons d'un coup |
| `/verification setup/disable` | Panneau de vérification avec captcha et rôle automatique |

### 🔨 Modération
`/ban` · `/unban` (autocomplétion des bannis) · `/kick` · `/mute` (`10m`, `2h`, `1d`…) · `/unmute` ·
`/warn` · `/warnings list/remove/clear` · `/clear` (filtre membre / bots) · `/lock` · `/unlock` · `/slowmode`

Chaque sanction envoie un MP au membre et un log dans le salon de modération.

### ℹ️ Informations
`/help` (menu par catégorie) · `/ping` · `/botinfo` · `/serverinfo` · `/userinfo` · `/avatar`

### 👑 Owner & Dev
| Commande | Rang | Description |
|---|---|---|
| `/owner add/remove/list` | Owner | Gérer les owners du bot |
| `/blacklist add/remove/list` | Owner | Blacklist globale (bloque le bot + sanction sur tous les serveurs protégés) |
| `/dev stats` | Dev | Statistiques détaillées |
| `/dev guilds` / `/dev leave` | Dev | Lister / quitter des serveurs |
| `/dev status` / `/dev status-reset` | Dev | Changer le statut du bot (sauvegardé) |
| `/dev reload` | Dev | Recharger les commandes sans redémarrer |
| `/dev backup` | Dev | Recevoir la base de données |
| `/dev eval` | Dev | Exécuter du JavaScript (modal) |

---

## 🧱 Modules de protection

**Anti-nuke** (détection via le journal d'audit, le bot a besoin de *Voir les logs du serveur*) :

| Module | Détecte | Annulation automatique |
|---|---|---|
| Anti-Channel | création / suppression / modification de salons | salons supprimés recréés, créés supprimés, modifs annulées |
| Anti-Role | création / suppression / modification de rôles | rôles recréés / supprimés / restaurés |
| Anti-Ban | bans en masse | membres débannis |
| Anti-Kick | kicks en masse, prune | — |
| Anti-Bot | ajout d'un bot | bot expulsé |
| Anti-Webhook | création de webhook | webhook supprimé |
| Anti-Permissions | permissions dangereuses données à un rôle ou un membre | permissions / rôles retirés |
| Anti-Update Serveur | changement de nom / icône du serveur | ancien nom / icône remis |

Sanctions possibles : **Dérank** (retire tous les rôles), **Kick**, **Ban**.
Chaque module a un **seuil** (nombre d'actions autorisées) et une **fenêtre de temps** : par ex. seuil 2 / 10 s →
la 3ᵉ suppression de salon en 10 s déclenche la sanction et **toutes** les actions sont annulées.

**Messages** : Anti-Link (invitations ou tous les liens), Anti-Spam, Anti-Mass Mention, Anti-Everyone.
Les administrateurs et la whitelist ne sont pas concernés.

**Membres** : Anti-Raid (active le raidmode si trop d'arrivées), Anti-Alt (comptes trop récents),
Blacklist globale.

---

## 📁 Structure

```
src/
├── index.js               # Démarrage du bot
├── deploy.js              # Publication des commandes
├── config.js              # Lecture du .env
├── commands/
│   ├── protection/        # protection, whitelist, trust, logs, raidmode, verification
│   ├── moderation/        # ban, kick, mute, warn, clear, lock, lockdown…
│   ├── info/              # help, ping, botinfo, serverinfo, userinfo, avatar
│   └── owner/             # owner, blacklist, dev
├── events/                # Événements Discord
├── handlers/loader.js     # Chargement des commandes / événements
├── modules/
│   ├── definitions.js     # Liste des modules, sanctions et presets
│   ├── antinuke.js        # Anti-nuke (journal d'audit)
│   ├── automod.js         # Protections messages + arrivées
│   └── sanctions.js       # Application des sanctions
├── structures/Database.js # Base JSON
└── utils/                 # Components V2, permissions, logs, durées
```

### Ajouter une commande

Crée un fichier dans `src/commands/<catégorie>/` :

```js
const { SlashCommandBuilder } = require('discord.js');
const { LEVELS } = require('../../utils/perms');
const ui = require('../../utils/ui');

module.exports = {
  level: LEVELS.TRUSTED, // optionnel : rang minimum
  data: new SlashCommandBuilder().setName('exemple').setDescription('Ma commande'),
  async execute(interaction) {
    return interaction.reply(ui.card({ title: 'Salut', description: 'Réponse en Components V2' }));
  },
  // optionnel : boutons / menus dont le customId commence par "exemple:"
  async component(interaction, args) {},
};
```

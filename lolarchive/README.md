# LolArchive

Archiveur perso façon WinRAR : tu mets des fichiers et des dossiers dans une archive
`.lol` ou `.xxx` (ou n'importe quelle extension de ton choix), compressée et protégée
par mot de passe. Fait pour toi et tes potes, tout reste en local.

## Lancer

```bash
cd lolarchive
npm install
npm start
```

## Créer l'installeur Windows

```bash
npm run dist
```

Ça produit dans `release/` un installeur et une version portable. L'installeur associe
`.lol` et `.xxx` à LolArchive : un double-clic sur une archive l'ouvre directement.

## Ce que ça fait

- Créer une archive à partir de fichiers et de dossiers (bouton ou glisser-déposer).
- Extension `.lol`, `.xxx` ou personnalisée. L'extension ne change rien au contenu : une
  archive renommée en `.zip2` s'ouvre toujours, LolArchive la reconnaît à son en-tête.
- Mot de passe optionnel. Avec mot de passe, **tout** est chiffré, y compris les noms de
  fichiers : sans le mot de passe on ne voit même pas ce qu'il y a dedans.
- Compression Brotli (aucune, rapide, normale, maximale).
- Ouvrir une archive, parcourir son contenu, chercher, extraire tout ou seulement une sélection.

## Sécurité

- Clé dérivée du mot de passe avec PBKDF2-SHA512 (600 000 itérations) puis HKDF-SHA256 :
  deux clés indépendantes de 256 bits.
- Double chiffrement de chaque bloc de 1 Mo : AES-256-GCM puis ChaCha20-Poly1305.
- Chaque bloc est authentifié avec l'en-tête et son numéro : un octet modifié, des blocs
  inversés ou une archive coupée sont détectés et l'extraction est refusée.
- Les chemins dangereux (`../`, chemins absolus) sont refusés à l'ouverture.
- Le mot de passe ne peut pas être récupéré. Si tu l'oublies, le contenu est perdu.

Sans mot de passe, l'archive est seulement compressée (avec une somme de contrôle) :
n'importe qui avec LolArchive peut l'ouvrir.

## Ligne de commande

```bash
npm run build
node dist/cli.js pack vacances.lol "Photos vacances" --password "secret" --level normal
node dist/cli.js list vacances.lol --password "secret"
node dist/cli.js unpack vacances.lol ./sortie --password "secret"
```

Le mot de passe peut aussi être passé via la variable `LOLARCHIVE_PASSWORD`.

## Tests

```bash
npm test
```

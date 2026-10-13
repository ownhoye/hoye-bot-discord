# Hydra Boss — modèle riggé + animations pour Roblox

Le modèle d'origine (`hydra_boss.glb`) était fait de blocs séparés sans squelette.
Il est maintenant **skinné sur un squelette de 37 os** et a **8 animations**.

## Fichiers

| Fichier | Contenu |
|---|---|
| `HydraBoss_Rig.fbx` | Le modèle + squelette (+ anim Idle). **C'est lui qu'on importe dans Roblox.** |
| `animations_fbx/Hydra_*.fbx` | Une animation par fichier, à importer dans l'Animation Editor |
| `HydraBoss_Animated.glb` | Modèle + les 8 animations en un seul fichier (glTF) |
| `HydraBoss_Animated.blend` | Fichier Blender source, si tu veux retoucher |
| `HydraAnimations.lua` | ModuleScript qui joue les animations en jeu |
| `HydraBossDemo.server.lua` | Script de démo (Idle + attaques au hasard) |
| `preview/` | Aperçus des poses clés |

## Animations (30 fps)

| Nom | Durée | Boucle | Description |
|---|---|---|---|
| Idle | 4 s | oui | respiration, les 3 cous ondulent, mâchoires, queue |
| Walk | 1,33 s | oui | marche quadrupède sur place |
| Roar | 3 s | non | les têtes se cabrent puis rugissent, ailes déployées |
| Bite | ~2 s | non | les 3 têtes mordent l'une après l'autre (centre, gauche, droite) |
| TailSwipe | 2 s | non | rotation du corps + coup de queue |
| WingGust | 2 s | non | se cabre et bat 2 fois des ailes |
| Hit | 0,8 s | non | recule quand il prend un coup |
| Death | 3,3 s | non | rugit, s'effondre, reste au sol |

## Import dans Roblox Studio

1. **Avatar → Import 3D** → choisis `HydraBoss_Rig.fbx`.
   - Rig General → Rig Type : **Custom** (ça ajoute l'AnimationController).
   - File Dimensions : règle l'échelle comme tu veux (le modèle mesure ~24 unités de haut).
2. Le boss arrive avec ses os (`Bone`) et ses MeshParts skinnées. L'anim Idle est dans `AnimSaves`.
3. Ouvre l'**Animation Editor**, clique sur le boss, puis `⋯ → Import → From FBX Animation`
   et choisis un fichier de `animations_fbx/` (ex : `Hydra_Bite.fbx`).
4. `⋯ → Publish to Roblox` → copie l'ID. Recommence pour chaque animation.
5. Mets les IDs dans `HydraAnimations.lua` (table `IDS`), place le ModuleScript et
   le Script de démo dans le modèle → Play.

> Roblox ne permet pas d'utiliser une animation sans la publier (il faut un `rbxassetid`) :
> l'étape 4 est obligatoire, même pour une anim importée avec le modèle.

## Squelette

`Root → Hips → Chest`, puis `Tail1-4` (sur Hips), `Leg{Front,Back}{Left,Right}_Upper/_Lower`,
`Neck{C,L,R}1-3 → Head{C,L,R} → Jaw{C,L,R}`, `Wing{L,R}1-3`.

## Régénérer

```
pip install bpy
python3 tools/build_rig.py hydra_boss.glb hydra_rigged.blend
python3 tools/animate.py hydra_rigged.blend out/
```

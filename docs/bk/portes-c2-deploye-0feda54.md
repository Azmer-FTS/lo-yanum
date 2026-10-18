# BK — chantier 2 — rejoué sur le DÉPLOYÉ `0feda54` (2026-10-18)

`version.json` = `0feda54` sur l'application et sur `/demo` (déploiement
39099112077 : toutes les portes de la CI vertes, dont `zones` et `freehand`
réécrites). Le commit précédent, `bfb75ab`, n'a jamais été servi : son
déploiement a été arrêté par `zones` 6 (voir `portes-c2-local.md`, « attrapé
par le déploiement »).

## Application (`BASE_URL=https://azmer-fts.github.io/lo-yanum`)

| Porte | Résultat |
|---|---|
| ★ `bkeditui` — chaque geste, souris (1 440) ET doigt (iPad 1 032 × 1 376, touchers réels), écran ET base ; A569 : six rechargements, une forme tracée pendant chaque relecture lente, jamais perdue | 152/152 |
| `bkui` (chantier 1, deux profils) | 31/31 |
| `bjui` | 56/56 |
| `biui` | 45/45 |
| `bhui` | 35/35 |
| `bgui` | 90/90 |
| `bfui` | 52/52 |
| `beui` | 57/57 |
| `bdui` | 76/76 |
| `bbui` | 82/82 |
| `assettings` | vert (exit 0) |
| `atsync` | 17/17 |

## Le jumeau (`BASE_URL=…/lo-yanum/demo`)

| Porte | Résultat |
|---|---|
| `bcmobile` | 246/246 |
| `aymobile` | 48/48 |

## La base réelle après le déploiement

3 formes, 17 / 31 / 23 sommets, dernières modifications du PO inchangées,
`path` nul : rien n'a été réécrit par la passe.

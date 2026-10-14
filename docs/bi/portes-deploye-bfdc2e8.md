# BI — portes rejouées sur le déployé `bfdc2e8` (2026-10-15)

`version.json` = `bfdc2e8`. App : bundle déployé + base FACTICE (fermes
rebaptisées, formes inventées) ; jumeau : `/lo-yanum/demo`. `PW_TIMEOUT=20000`.

| Porte | Cible | Résultat |
|---|---|---|
| `biui` (A504–A510 : ★ l'ordinateur d'avant BI dessine 31 + 29 sommets au chargement, après rechargement sous service worker, sur l'écran des fermes ; ★ relecture à chaud ; réglage absent/illisible/inconnu → montré ; pastille des formes cachées ; diagnostic + « העתקה » ; ★ brouillon après fermeture brutale ; ★ une seule surface) | app, 1 440 souris + tablette 1 032 | **45/45** |
| `bhui` | app, tablette 1 032 | 34/34 |
| `bgui` | app | 90/90 |
| `bfui` | app | 52/52 |
| `beui` | app | 57/57 |
| `bdui` | app | 76/76 |
| `bbui` | app | 82/82 |
| `bcmobile` | jumeau | 246/246 |
| `aymobile` | jumeau | 48/48 |

**Avant / après, même porte, même profil d'ordinateur** :

| bundle déployé | A504 chargement initial | après rechargement | écran des fermes |
|---|---|---|---|
| `9575112` (avant BI) | `source {} · rendu []` — ROUGE | ROUGE | ROUGE |
| `bfdc2e8` (BI) | 31 + 29, rendus — vert | vert | vert |

Le déploiement a lui-même rejoué ses portes (run 38653625881, succès).
Captures : `docs/screenshots/bi/deployed/`.

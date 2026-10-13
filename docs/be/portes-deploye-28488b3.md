# BE — portes rejouées sur le déployé `28488b3` (2026-10-13)

`version.json` = `28488b3`. App : bundle déployé + base FACTICE (noms inventés) ;
jumeau : `/lo-yanum/demo`. `PW_TIMEOUT=20000` (machine en échange).

| Porte | Cible | Résultat |
|---|---|---|
| `beui` (A445–A449) | app | **57/57** |
| `bdui` | app | 76/76 |
| `auui` (A316 adaptée) | app | 60/60 |
| `avui` (A327 adaptée) | app | 51/51 |
| `bcmobile` | jumeau | 246/246 |
| `aymobile` (402 px, strict) | jumeau | 48/48 |

Le déploiement a lui-même rejoué `ground`, `backdrop`, `redraw`, `overlap`,
`freehand`, `zones`, `agreement`, `demo` : vert.
Captures : `docs/screenshots/be/deployed/`.

# BC — les rouges d'AVANT BC, mesurés sur `HEAD` (b2f999f)

Les portes au rendu rouges dans la batterie de BC ont été rejouées sur le code
d'avant BC (worktree de `b2f999f` = BB + AZ4, mêmes portes, même machine), pour
séparer ce qui était déjà rouge de ce que BC a changé. Une porte que BC change
VOLONTAIREMENT (la forme voulue par le brief) a été adaptée — et seulement là.

| Porte | Sur `HEAD` (avant BC) | Ce que BC y change |
|---|---|---|
| `pills` | 63 / **18 rouges** : A71 fermes (une file sous le doigt, 1×1 px), A72 fermes (7 px), A71 réglages (aucune pastille), A85 ×7 (menus du « + » changés en AX ; volontaires = 2 choix depuis AY), A86 fermes filtres ouverts, A74/A72 tablette et grand écran fermes (rangée d'une ligne de BA, files à 1×1 px) | téléphone : les filtres sont dans la FEUILLE (A71/A72 mesurent ses lignes, A73 ses familles) ; tablette en mode partagé : forme compacte (A74). Disparus avec BC : A71/A72 fermes au téléphone, A86, A74 tablette fermes. Restent, antérieurs : A71 réglages, A85, A74/A72 grand écran fermes |
| `rhythm` | 402 / **18 rouges** : A62 compteur (chiffre d'AX3.5 collé au compteur ; « 14 » répété par la rangée des statuts de BA), A60 fermes tablette / grand écran (bande des statuts de BA collée au tableau) | forme compacte : le compteur quitte la barre collée (A62 disparaît au téléphone et en partagé 1 032) ; la sonde A60 lit désormais une barre de la couleur de la page à ses boutons, pas à son bord invisible. Restent, antérieurs : A60 fermes grand écran, A62 grand écran |
| `anui` | 149 / **2 rouges** : A236 « + » des volontaires (2 choix depuis AY : volontaire, conducteur), puis la tuile `driver-tile-open` disparue | A228 au téléphone : plus de mode partagé pour une liste (adaptée) |
| `akui` | **plante** au même endroit : A199 WebKit, `fill` du nom dans le formulaire de l'association (fenêtre refaite en AT6) | rien (le formulaire n'est pas touché par BC) |
| `amui` | **77 / 0** sur `HEAD` en batterie, mais la course de A215 existe déjà : le formulaire d'édition se remplit UNE fois, au montage ; monté avant l'arrivée de la ferme (la porte attend 800 ms sur le tableau de bord), il reste vide. Parcours EXACT de la porte, alterné, 8 fois chacun : BC 4/8, `HEAD` 5/8 ; temps d'arrivée de la ferme : BC 607–857 ms, `HEAD` 600–951 ms (pas de ralentissement) | rien ; A215 rouge dans les deux batteries de BC, au hasard de la course. Proposée en tâche séparée (attendre l'hydratation, et une porte qui la provoque à coup sûr) |
| `atui` | 126 / **16 rouges** : la section « salle d'attente » aux trois largeurs (elle attend le TABLEAU d'AX5 sans le demander : depuis AZ2 le mode partagé par défaut montre des vignettes, 0 ligne ; plus loin elle vise `lead-menu-…`, disparu avec `EntityTable`), AT4.4 ×3 (le bouton `farm-contacts-edit` de BA compte comme un bloc replié), A306 ×4 (onze tuiles au menu du téléphone, douze attendues) | AX5 : en forme compacte, les statuts ont leur déclencheur et les filtres sont derrière « סינון » (adaptée). Au téléphone, la liste déroulante du statut devient la pastille de BC 3e — vérifiée par `bcmobile` A423 et `axui` A354 G1, la section restant rouge pour ses raisons d'avant |
| `uipass` | rouge sur le jumeau DÉPLOYÉ d'avant BC : attend `kpi-strip` (retiré en AX3.4) | rien |
| `layout` | exige `BASE_URL` (un serveur sur 5173 par défaut) : rejouée sur un build de démo local | — |

## `layout` et `uipass` sur le build de BC (jumeau local)

- `layout` (390 × 844, 32 écrans) : 29 verts. **volunteers** — A30 « liste non
  contenue » : le tableau des volontaires (`EntityTable`, depuis AY2) n'est pas
  virtualisé et le téléphone l'ouvre désormais en liste (306 lignes du jumeau
  dans la page). Avant BC, ce même défaut montrait 306 VIGNETTES dans le
  panneau (plus lourdes) ; le mode liste du téléphone montrait déjà ce tableau.
  L'exemption de la porte parle encore du rôle virtualisé de G7, disparu en
  AY2. Proposé en tâche séparée (virtualiser `EntityTable`, sans plafond
  visible). **volunteer-modal**, **driver-modal** — le « + » des volontaires
  propose deux choix depuis AY, et `driver-tile-open` a disparu avec l'écran
  des conducteurs : même cause que `anui` A236, antérieure.
- `uipass` : s'arrête sur `kpi-strip` (retiré en AX3.4), comme sur le jumeau
  déployé d'avant BC.

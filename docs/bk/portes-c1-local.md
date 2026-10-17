# BK — chantier 1 (les douze arbitrages) — portes en local (2026-10-18)

Rejouées en série dans un worktree qui ne porte QUE le chantier 1 (le chantier 2
avançait à côté dans l'arbre principal), codes de sortie relevés porte par porte.
Journaux complets : `private/bk/logs/` (hors dépôt).

## Nouvelles portes

- **`bkpass` (A526–A529, pure) 46/46** — les douze décisions dans le registre ;
  plus aucune entrée « à arbitrer » ; une valeur de compte d'une clé passée sur
  l'appareil est ignorée à la relecture et ne remonte plus à la migration ;
  `activity-reports` : `sameReport` (date `+00:00`, clés jsonb dans un autre
  ordre = même rapport ; un caractère de texte, un instantané, une nature de
  période différents = pas le même), `planDrain`, `judgeDrain` (un manquant,
  un différent, pas de réponse → la clé RESTE) ; le code n'écrit plus jamais
  l'ancienne clé sauf pour l'effacer, et l'effacement est gardé par le
  verdict ; les sept sections de la fiche rangent leur pli par TYPE ; aucun
  fichier n'écrit ni ne lit `farm-form-…` ; `map-view` (validateur, écrans
  généraux seulement, écrite après un geste du PO, retrouvée sans recadrage).
- **`bkui` (A530–A534, rendu, deux profils) 31/31** — la zone regardée sur A
  retrouvée sur B rechargé (et elle y reste) ; « אנשים » repliée sur A
  (ferme 01) → repliée sur B pour les fermes 01, 02, 03, et retour ; ★ preuve
  INVERSE : « carte seule » sur A, B rechargé reste en « split », le compte ne
  porte aucun mode de carte ; contrôle : aucune clé `farm-form-…` ni sur les
  appareils ni sur le compte, aucune clé d'écran sur le compte ; l'ancienne
  clé de l'historique vidée dans la table puis effacée ; un envoi refusé (403)
  → la clé reste, intacte, et c'est dit.

## Portes réécrites (la règle a changé — pas un contournement)

- `bjguard` : raisons admises + `screen` ; « machine »/« écran » exigent une
  décision ; une entrée « à arbitrer » est refusée ; une clé abandonnée ne peut
  pas être redéclarée. 20/20.
- `bjpass` A512/A513 : `rail:expanded` et `map-mode:farms` ne sont plus des
  exemples de clé de compte (remplacés par `people-grouped` et
  `farm-tab:<ferme>`). 55/55.
- `bjui` A521 : le compte qui « avait déjà une valeur » porte le bandeau de
  couverture (le rail est passé sur l'appareil). 56/56.

## Attrapé par les portes

- `axui` A347 : l'aide de « סנכרון פריסה » allongée (« dans cet appareil »)
  dépassait les 80 caractères qu'une aide peut afficher d'office → raccourcie,
  l'information gardée. 116/116 ensuite.

## Non-régression — codes de sortie, toutes vertes

Pures : typecheck · bjguard 20 · bjpass 55 · bkpass 46 · bipass 71 · bhpass 24 ·
bgpass 53 · bfpass 51 · bepass 92 · bdpass 66 · bcpass 75 · bbpass 51 ·
bapass 36 · az5pass 18 · aypass 25 · axpass 40 · awpass 60 · avpass 15 ·
aupass 48 · aspass · appass 108 · aopass 113 · aodata 82 · anpass 27 ·
ampass 50 · alpass 40 · akpass 56 · adpass 46 · accept · tokens · contrast ·
persist · mapping · deletion · armigrations 56.
(`axpass`, `awpass`, `armigrations` rejouées dans l'arbre principal : le
worktree n'a ni l'archive `basemap/` ni la liaison Supabase, non suivies.)

Au rendu : bkui 31 · bjui 56 · biui 45 · bhui 34 · bgui 90 · bfui 52 · beui 57 ·
bdui 76 · bbui 82 · bcmobile 246 · aymobile 48 · assettings · atsync 17 ·
aitheme 18 · azui 125 · axui 116 · avui 51 · auui 60 · ayscreens 57 · ayui 105 ·
az5ui 21 · baui 45 · awui 57 · arfiche 144 · amui 77 · aqui 107.

De la CI, sur un build réel (`--mode real`, `vite preview` 5197) : ground 17 ·
backdrop 38 · redraw 18 · overlap 167 · freehand 30 · zones 38 · agreement 18 ·
demo 17.

## Rouges antérieurs

Inchangés depuis BJ, non rejoués ici : `adui` A115, `anui` A236, `atui`,
`pills`, `rhythm`, `akui`, `uipass`, `sheets`, `layout`.

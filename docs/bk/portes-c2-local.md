# BK — chantier 2 (l'éditeur de tracés) — portes en local (2026-10-18)

Arbre principal (chantier 1 commité, chantier 2 dans l'arbre), en série, codes
de sortie relevés porte par porte. Journaux : `private/bk/logs/` (hors dépôt).
Tableau geste → porte : `docs/bk/editeur.md`.

## Nouvelles portes

- **`bkedit` (A540–A545, pure) 51/51** — une forme ancienne en coins rend
  EXACTEMENT ses sommets et sa surface ; densifié, le modèle passe par chaque
  nœud ; ★ tuile « מדוד » = étiquette = surface du modèle (le magasin garde le
  modèle avec l'anneau) ; le modèle n'est repris que s'il redonne l'anneau
  (aller-retour JSON : oui ; anneau réécrit : non, coins ; illisible, ouvert :
  coins) ; les gestes (déplacer, arrondir/coin, poignée alignée qui garde sa
  longueur, ajouter sur une courbe SANS la changer — écart 0, retirer, jamais
  sous trois) ; la plume, la main levée (carré tremblé → 4 coins ; arc →
  arrondis ; portion remplacée du bon côté ; prolonger un tracé ouvert) ;
  trente annulations / trente « refaire » exacts.
- **`bkeditui` (A550–A569, rendu) 152/152** — chaque geste DEUX fois,
  « souris » (1 440, souris + clavier) et « doigt » (iPad 1 032 × 1 376,
  touchers CDP réels), vérifié à l'écran ET en base factice. Sur la
  configuration réelle de `farm-ak1-11` (limite dans le pâturage) : le choix
  propose LES DEUX, la plus petite d'abord, et ouvre la limite.

## ★ Attrapé par le DÉPLOIEMENT (run 39090191840, `bfb75ab` jamais servi)

`zones` 6 en CI : « a zone drawn while the app is still hydrating » → 3 au
lieu de 4 sur la liste et la carte, 4 en base, 4 après un rechargement. Vert
en local (cinq passages, processeur ralenti ×1 à ×6, copie de la porte).

- **Horodatages du journal de CI** : rechargement 02:38:09.6, forme tracée
  entre 14.2 et 18.2, contrôle à 27.2 (relectures lentes de 6 s).
- **La cause, antérieure à BK** (`data/store.ts`) : DEUX relectures partent à
  chaque démarrage — l'une sur le cache mémoire, l'autre quand IndexedDB
  s'ouvre (`openIndexedDbCache().then(… sync())`) ; `refreshData` en relance
  une sans attendre. L'enregistrement des modifications faites « pendant la
  relecture » était UNE variable globale : la seconde relecture la
  remplaçait, la forme n'était enregistrée que pour elle, et quand la
  première répondait en dernier — un tirage — elle installait un instantané
  sans la forme. Deux fenêtres de plus n'étaient pas enregistrées : la
  lecture de l'identité, et l'intervalle entre la réponse et la fusion.
- **Pourquoi maintenant** : l'éditeur écrit la forme dès que le trait se
  referme (l'ancien outil attendait « סגור פוליגון ») — plus tôt dans la
  relecture.
- **Correctif** : un enregistrement PAR relecture, ouvert dès sa première
  ligne, fermé après l'installation de sa fusion ; chaque modification va
  dans tous les enregistrements ouverts ; ce qui est tracé pendant la lecture
  du cache est aussi reposé sur le cache restauré.
- **Preuve, rouge puis vert, même banc** : `bkeditui` A569 (rechargements
  successifs, une forme tracée pendant chaque relecture lente, carte relevée
  toutes les 200 ms). Ancien `store.ts` : essai 5, 7 formes attendues, **6**
  vues → ROUGE. Correctif : 8 essais, 0 perte → VERT.

## Attrapé par les portes et les sondes pendant la passe

- **La plume tirée** ajoutait un nœud de trop (le geste partait de l'aperçu,
  pas du modèle enregistré) — `bkeditui` A559.
- **La main levée** qui COMMENCE sur un point déplaçait ce point au lieu de
  dessiner — A560 / A561 ; en main levée, les points laissent passer le trait.
- **Au doigt, un point glissé s'arrêtait à 22 px** : le navigateur reprenait
  le geste pour faire défiler la fiche (`pointercancel`, mesuré en sonde : 3
  mouvements puis annulation) → `touchstart` non passif sur les poignées.
- ⛔ **Et l'annulation était traitée comme un lâcher**, coordonnées (0, 0) :
  avec la correction précédente elle aurait posé le point AU COIN de la carte.
  Désormais une annulation n'écrit rien.
- **Une forme supprimée** laissait l'éditeur ouvert sur rien — A558.
- **L'appui long** (épingle rapide, AV2) aurait pu se déclencher en plein
  tracé : coupé pendant une édition (relecture du code).
- **Une forme neuve à moins de trois points distincts** restait « fermée mais
  pas enregistrée » : elle reste ouverte, et c'est dit (relecture).
- **Le panneau** cachait la forme sur la carte courte de la fiche à l'iPad
  (première capture) → une ligne d'identité, une ligne d'outils, le reste
  derrière « פעולות ».
- `zones` (CI) : le trait de l'étape hors ligne tombait sur le panneau de
  l'éditeur (bas de la carte) → tracé plus haut.
- `bjui` A523 : ouvrait le diagnostic depuis la légende (retiré) → הגדרות.

## Portes réécrites (la règle a changé — pas un contournement)

`bhui` (A491 le « en direct » lu sur le contour de l'éditeur ; A493 un appui,
même long, SÉLECTIONNE, « מחיקת הנקודה » supprime ; A495/A496/A497 sur les
boutons de l'éditeur) 35 · `biui` (A508 diagnostic depuis הגדרות, « aucune
fiche ouverte » ; A509/A510 sur l'éditeur) 45 · `bipass` A501–A503 relues sur
`PathEditor` 73 · `freehand` (CI) 30 · `zones` (CI) 38 · `bjui` A523 56.

## Non-régression — codes de sortie, toutes vertes

Pures : typecheck · bjguard 20 · bjpass 55 · bkpass 46 · bkedit 51 ·
bipass 73 · bhpass 24 · bgpass 53 · bfpass 51 · bepass 92 · bdpass 66 ·
bcpass 75 · bbpass 51 · bapass 38 · az5pass 18 · aypass 25 · axpass 40 ·
awpass 60 · avpass 15 · aupass 48 · aspass · appass 108 · aopass 113 ·
aodata 82 · anpass 27 · ampass 50 · alpass 40 · akpass 56 · adpass 46 ·
accept · tokens · contrast · persist · mapping · deletion · armigrations 57 ·
sync.

Batterie REJOUÉE ENTIÈRE après le correctif de `data/store.ts` (codes de
sortie) — chiffres ci-dessous. `bjui` A525 est tombée une fois sur un serveur
de prévisualisation oublié sur son port 5499 (lancé depuis le worktree du
chantier 1, supprimé depuis) ; port libéré, rejouée seule : 56/56.

Au rendu : bkeditui 152 · bkui 31 · bjui 56 · biui 45 · bhui 35 · bgui 90 ·
bfui 52 · beui 57 · bdui 76 · bbui 82 · bcmobile 246 · aymobile 48 ·
assettings · atsync 17 · aitheme 18 · azui 125 · axui 116 · avui 51 · auui 60 ·
ayscreens 57 · ayui 105 · az5ui 21 · baui 45 · awui 57 · arfiche 144 ·
amui 77 · aqui 107.

De la CI, build réel (`--mode real`, `vite preview` 5197) : ground 17 ·
backdrop 38 · redraw 18 · overlap 167 · freehand 30 · zones 38 · agreement 18 ·
demo 17.

## La base réelle

Migration `20261018000100` appliquée par le MCP (version `20261017234659`),
`repair` + jalon, `armigrations` 57/57. Après : 3 formes, 17/31/23 sommets,
`path` nul (non touchées). Droits : `authenticated` lit/écrit `path`, `anon`
non. Épreuve dans une transaction ANNULÉE, sous l'identité du PO : insertion
d'une forme avec `path`, modification de `path` → réussies ; après : 3 formes,
aucune sonde restée.

## Non rejouées (antérieures à BK, hors de la batterie de BJ)

`offline` : VERTE (exit 0). ⚠️ Un premier passage l'avait donnée rouge, « à
l'identique sur `bfb75ab` » : FAUX — les deux passages visaient MON propre
`vite preview` resté sur 5197 (des essais de `zones`), qui servait un build
réel (écran de connexion, « nav introuvable »). Port libéré : verte. `sync`
(qui pilote `applyRecords`) : verte.

`settings` (ancien écran des régions : `region-pencil`, `region-dunams`…) et
`touch` exercent l'ANCIEN éditeur et ne sont plus à jour ; elles étaient déjà
hors de la batterie de BJ. Rouges antérieurs inchangés : `adui` A115, `anui`
A236, `atui`, `pills`, `rhythm`, `akui`, `uipass`, `sheets`, `layout`.

## `settings` et `touch` réécrites sur l'éditeur de tracés (après 253ae7e)

La RÈGLE a changé en BK (un éditeur, `PathEditor` ; toucher un point le
SÉLECTIONNE, « מחיקת הנקודה » / Suppr le supprime) : les deux portes ont été
réécrites sur la nouvelle grammaire, chaque intention gardée. Ce n'est pas un
contournement : rien n'a été retiré sans être remplacé par le même geste.

### Sur `HEAD` (253ae7e), avant réécriture — build local, ports libres

`lsof -nP -iTCP -sTCP:LISTEN` : aucun `vite preview` en écoute. ⚠️ Un premier
passage était FAUX : le worktree n'avait pas `public/basemap/` (non versionné),
la carte ne finissait jamais de charger (`map.on('load')` jamais tiré, pas
d'éditeur). Archive copiée depuis le dépôt principal, diagnostic rejoué :

- `settings` : 16 contrôles verts (A55, A54, A56, A65, A68), puis ARRÊT à A53 :
  `region-dunams` n'existe plus (30 s d'attente, exit 1). Rien d'après A53 ne
  jouait (Y2.7, A66, A69).
- `touch` : 15 verts, 6 rouges, puis ARRÊT : section 4 (« מציירים שטח מרעה »,
  « 4 פינות », « סגור פוליגון » disparus), section 5 (« ערוך » introuvable,
  0 poignée `פינת אזור`), plantage sur `.maplibregl-marker[aria-label*="פינת אזור"]`.
  Deux contrôles de la section 4 étaient verts PAR VIDE (« la surface se lit »
  trouvait n'importe quel « דונם » ; « la forme a rejoint la ferme » testait
  l'ABSENCE d'un texte qui n'existe plus).

### Ce qui a été réécrit

`settings` A53 (la région redessinée au STYLET, `pointerType: 'pen'`) :
- la région s'ouvre dans l'éditeur (`data-shape=negev`, `data-mode=edit`) ; la
  surface se lit sur `data-area` (plus `region-dunams`) ;
- outil « יד חופשית » (`editor-tool-pencil`, plus `region-pencil`) ; un trait
  au stylet d'un point de la région à un autre REMPLACE la portion entre eux
  (règle BK sur une forme fermée) → la surface change ; `editor-undo` armé
  (`data-undo`) la remet, `editor-redo` la rejoue ;
- « tout redessiner » = `editor-menu` → `editor-replace` → `region-replace-yes`,
  puis la petite boîte au stylet (inchangée : c'est sa petitesse qui rend le
  rattachement observable) ; fermée, elle doit REMPLACER la région ; « שמור
  גבול » ; les comptes du filtre de חוות doivent bouger ; « שחזר ברירת מחדל »
  les remet ;
- AJOUT : une retouche (un point supprimé), puis **Échap** — `region-rings` ET
  `region-paths` doivent être écrits (défaut 2 ci-dessous), puis « שחזר ברירת
  מחדל » ;
- Y2.7 compte aussi les points de l'éditeur (`g[data-testid^="editor-node-"]`),
  sinon il était vert par vide.

`touch` (au doigt, puis au stylet) :
- 4 / 10c : mode armé = `data-mode=new` + `data-tool=pen` ; quatre touchers =
  `data-nodes=4` ; ouverte, le panneau dit « הצורה עוד לא סגורה » (la surface ne
  vient qu'à la fermeture — c'est la règle BK, le contrôle a changé de sens) ;
  fermer : `editor-close-path` au doigt, un toucher sur le PREMIER point au
  stylet (aucun des deux n'est un double appui) ; la forme a rejoint la ferme =
  `data-mode=edit`, fermée, `data-area>0` ;
- 5–7 / 10d : « ערוך » est sous l'onglet « שטח » (fiche en onglets depuis AS —
  rouge déjà sur HEAD, indépendant de BK) : la porte y va au doigt ; points
  `editor-node-<i>`, « + » `editor-mid-<s>`, ✥ `editor-move` ; on vise un point
  que le doigt touche VRAIMENT (`elementFromPoint`, comme `bhui`) ;
- AJOUT (la nouvelle règle, au doigt et au stylet) : toucher un point le
  SÉLECTIONNE (`data-selected-node`, rien de retiré), « מחיקת הנקודה »
  (`editor-node-delete`) le retire, « ביטול » le remet ;
- 10 : la touche-sonde du stylet tombe sur une forme de farm-02 et l'OUVRE
  (règle BH A489) ; « סיום » la referme au stylet avant les outils ;
- 10e (signature, hors éditeur) : la section « הסכמים » s'ouvre désormais
  DÉPLIÉE ; la porte (AM3 : « repliée par défaut ») la REPLIAIT, puis cherchait
  « חתום » dans une section fermée. Dépliée seulement si repliée ; état dit.

### Après réécriture

- `touch` (build local `--outDir`, `vite preview` 5233) : **69/69, exit 0**.
- `settings` : sur l'app de 253ae7e, 40 verts et **4 rouges** — deux défauts de
  l'APPLICATION, pas de la porte (section suivante ; le contrôle Échap a été
  AJOUTÉ pour le second). Après le correctif : **44/44, exit 0**.

## Attrapé par `settings` A53 : deux retouches de région perdues en silence

Deux cas, une même classe de défaut — des props CAPTURÉES au rendu
d'ouverture de l'éditeur — et une même règle trahie (« jamais perdu en
silence », `RegionsEditScreen`). **Aucune forme déjà enregistrée n'était en
jeu** : seule la retouche EN COURS, sur l'écran des régions, se perdait. Les
fermes ne sont pas touchées (`bkeditui` A562 ; chaque geste y est écrit, BI).

**1. « פעולות → שרטוט מחדש » perdait la région neuve.** La nouvelle forme se
trace et se ferme (6 points, 1 060 532 ד׳), puis, **6 ms plus tard**, l'ancien
contour revient (7 points) ; « שמור גבול » reste éteint ; les comptes du filtre
de חוות ne bougent pas. Cause : `PathEditor.persist`, à la fermeture, appelle
`onCreate` (l'hôte change : `setSelected`, `setDraft`), puis
`setTimeout(() => p.onActiveChange(id), 0)` avec `p` capturé AVANT le rendu de
l'hôte. Pour `RegionsEditScreen` c'est l'ancienne fermeture, où `selected` vaut
encore `null` (le départ du tracé a appelé `open(null)`) : `id !== selected`,
donc `open('negev')`, qui VIDE le brouillon ; l'effet `activeRingKey` reprend
alors l'ancien contour.

**2. Échap refermait l'éditeur des régions SANS enregistrer.** L'effet clavier
(deps `[session !== null, picker]`) garde le `finish()` du rendu d'OUVERTURE,
qui appelait l'`onActiveChange` de ce rendu-là — où `dirty` vaut `false` : la
retouche (un point supprimé, « שמור גבול » allumé) partait sans `save()`
(`lo-yanum:region-rings` et `region-paths` non écrits), quand « סיום »
enregistrait. Le PO travaille au doigt sur iPad : seule la touche, avec un
clavier, y menait.

**Le correctif** (`src/ui/editor/PathEditor.tsx`, deux lignes) : le délai de
`persist` et `finish` lisent `latest.current.props.onActiveChange` au moment
où ils partent. `finish` sert aussi à « סיום » et à l'effet `activeExists`
(deps `[activeExists]`) : les trois chemins passent par la même lecture.
**Les autres appels différés, relus** : sains — le `setTimeout(setNotice)` (un
setter), le clic sur la carte (`cur.props`), les gestes de la plume, de la
main levée et du glisser (`latest.current`, `sessionRef`).

**Rouge, puis vert, sur le même banc** (`settings` réécrite, build local
`dist-settings`, 5209 libre) : `docs/bk/settings-a53-rouge-avant.log` (40 + 4
rouges : « closed, it REPLACED the region » 8 081 731 → 8 081 731 ; « שמור
גבול is armed » ; « the counts moved » ; « Escape … the retouch is written » :
anneau absent, tracé absent) puis `docs/bk/settings-a53-vert-apres.log`
(44/44 : 8 081 731 → 1 057 441 ד׳, comptes déplacés puis rétablis ; Échap :
anneau 6, tracé 6).

### La batterie, en série, après le correctif (build local)

Codes de sortie, `lsof` relevé avant chaque porte (seul autre écouteur : le
`vite preview` d'une autre session, `dist-bl`, sur 5541 puis 5471 — aucun de
nos ports) : typecheck 0 · bjguard 20/20 · bkedit 51/51 · bipass 73/73 ·
**bkeditui 152/152** (souris et doigt, A569 compris) · bhui 35/35 · biui 45/45 ·
settings 44/44 · freehand 30/30 · touch 69/69 · zones 38/38 (build réel
`--mode real`, `vite preview` 5197, comme la CI).

⚠️ `biui` est d'abord sortie en 1 dans la série : A510 « section interrompue »,
`net::ERR_CONNECTION_REFUSED` sur 5497 — son serveur avait DISPARU en cours de
route (aucune assertion n'a échoué ; l'autre session arrêtait et relançait ses
propres serveurs à ce moment-là). Rejouée seule, son port relevé toutes les
5 s du début à la fin : 45/45, serveur vivant tout du long.

## Déployé `77d6658`

CI verte, `version.json` = `77d6658`. `settings` 44/44 sur le jumeau `/demo`
déployé (le seul banc déployé construit, comme le sien, sans Supabase ; la
lecture de `BASE_URL` ajoutée à `settings` n'est pas encore commitée).
`bkeditui` 150/151 : A557 au doigt « section interrompue », `dbRing(db, B)[0]`
indéfini — rejouée seule : 1 rouge sur 3. Le sondage lisait la base factice
PENDANT l'écriture d'un déplacement : l'écriture d'un agrégat n'est pas
transactionnelle. Mesure : `docs/bk/ecriture-non-transactionnelle.md`.

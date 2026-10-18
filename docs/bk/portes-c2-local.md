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

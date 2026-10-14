# BH — le dessin des zones : diagnostic et portes en local (2026-10-14)

## Diagnostic (2.1), dans l'ordre demandé

**a) Ce que la base porte (MCP, `lo-yanum-prod`), AVANT tout correctif.** La
ferme concernée est `farm-ak1-11` (branches cattle · sheep · poultry, modifiées
à 16:56 UTC). Elle a DEUX formes, complètes :

| zone | genre | sommets | positions | écrite |
|---|---|---|---|---|
| `zone-mv8c7cz9-1` | `farm_boundary` | 31 | 0–30 contiguës | 2026-10-14 16:41 UTC |
| `zone-mv8cf7wz-2` | `grazing_area` | 29 | 0–28 contiguës | 2026-10-14 16:47 UTC |

(Une troisième forme existe sur une autre ferme depuis le 24.09 ; 77 sommets en
tout, aucun orphelin.) Stockage : une ligne `zones` (id, entity_id, kind) et une
ligne `zone_vertices` par sommet (zone_id, position, lat, lng).
→ **L'hypothèse « jamais écrit » est FAUSSE.**

**Les journaux du serveur (edge_logs)** : les deux formes ont été écrites PAR
L'IPAD (Safari 26.6.2), au moment du tracé, sans échec : 16:41:32
`DELETE zone_vertices` 204 → `POST zones` 201 → `POST zone_vertices` 201 ;
16:47:39 idem. Puis les DEUX appareils (l'iPad et l'ordinateur, Chrome 154)
relisent `zones` et `zone_vertices` toutes les 3 minutes, en 200, et reçoivent
les 77 sommets (`content-range 0-76`, 1 513 octets) dès 16:49 (iPad) et 16:50
(ordinateur). Les rechargements complets de la page de l'ordinateur
(requêtes OPTIONS) : 14:03, 14:23, **16:28**, puis 17:28 — le dernier avant
l'écriture est à 16:28, treize minutes AVANT que la forme existe en base.

**b)** sans objet : c'est écrit. Le chemin a quand même été remonté et
éprouvé : tracé → `closeDraft` → `createFarmZone` → `commit()` → la collection
`farmZones` → la file d'écriture (`applyChanges` : enfants effacés, parent
upserté, sommets insérés) — exactement le chemin des champs de la ferme (pas
de chemin parallèle, pas de brouillon local persistant : un tracé NON terminé
vit seulement dans l'état de l'écran).

**c) Lecture** : `hydrateFrom` lit `zones` et `zone_vertices` (paginé par
1 000), assemble par `zone_id`, range par `position` ; la fiche de ferme les
dessine (source `zones`). Rejoué sur le build actuel avec deux formes de 31 et
29 sommets : affichées à 1 440 et à 1 032 ; une forme arrivée par une
RELECTURE pendant que la page est ouverte apparaît (0 → 1). ⇒ Sur le code
servi, le chemin « écrit → relu → affiché » est sain. Ce que les traces
montrent : à 16:28 (dernier rechargement de l'ordinateur avant 16:41) la forme
n'existait que sur l'écran de l'iPad — un tracé non terminé (« סגור פוליגון »
pas encore pressé) ressemble à une forme dès trois sommets, mais n'est écrit
nulle part. C'est la seule explication compatible avec la base et les
journaux ; elle ne se prouve pas après coup.

**d) Le mode dessin, tel qu'il était** (`AnchorMap`) :
- sélectionner une forme : OUI, par un appui — mais seulement quand rien n'est
  armé ; et re-toucher la forme sélectionnée la DÉSÉLECTIONNAIT ;
- ⚠️ le lien de la file « לתיחום » (`?draw=farm_boundary`) ARMAIT le dessin à
  chaque ouverture, MÊME quand la ferme avait déjà sa forme : le premier appui
  sur la forme existante posait le premier sommet d'une NOUVELLE forme — le
  symptôme A, mot pour mot ;
- déplacer un sommet : OUI (poignées de 44 px, point visible de 12 px), mais la
  forme ne se redessinait qu'au lâcher ;
- ajouter un sommet : OUI, en TOUCHANT le milieu d'une arête (pas en tirant) ;
- retirer un sommet : NON (aucun code) ;
- supprimer la forme : OUI (« מחיקת האזור »), mais la confirmation affichait
  l'identifiant technique (`zone-…`), pas le nom de la forme ;
- annuler : NON (seulement « ביטול » d'un tracé en cours, qui jette tout) ;
- terminer : OUI (« סיום עריכה »), chaque glissé étant déjà écrit au lâcher ;
- le magasin acceptait une forme à deux sommets.
Aucune capacité présente dans le code n'était inatteignable depuis un écran.

## Portes

Nouvelles : `bhpass` (A482–A488, pur) **24/24** ; `bhui` (A489–A497, tablette
1 032 × 1 376, au doigt par CDP) **34/34**, dont A497 (★ la persistance :
tracer au doigt, écrit côté serveur, navigateur neuf, même forme ; modifiée,
écrite, relue).

Pures existantes, toutes vertes : typecheck · bgpass · bfpass · bepass · bdpass ·
bcpass · bbpass · bapass · az5pass · aypass · axpass · awpass · avpass · aupass ·
aspass · appass · aopass · aodata · anpass · ampass · alpass · akpass · adpass ·
accept · tokens · contrast · persist · mapping · deletion · armigrations.

Au rendu, toutes vertes : bgui 90 (l'écran de couverture de BG intact) ·
bfui 52 (25 s sans dézoom, Ctrl+K, menu « ⋯ ») · beui 57 · bdui 76 · bbui 82 ·
bcmobile 246 · aymobile 48 · azui 125 · axui 116 · avui 51 · auui 60 ·
ayscreens 57 · ayui 105 · az5ui 21 · baui 45 · awui 57 · arfiche 144 · amui 77 ·
aqui 107 · assettings · aitheme 18.

Portes du déploiement, en local : freehand 30 · redraw 18 · overlap 167 (le
libellé « צורה חדשה » ne recouvre rien) · zones 38 (l'aller-retour des formes,
le hors-ligne) · agreement 18 · demo 17 (build réel + base factice en 5197).

Rouge ANTÉRIEUR, prouvé sur un worktree de `HEAD` (`1a4ecf6`, BG) : `adui` A115
(la pastille de file de l'écran des fermes, « 0 à tracer sur 14 ») — identique
avant et après BH. Le test d'armement de `?draw=` qu'`adui` n'atteint plus est
repris dans `bhui` A489.

Journaux complets : `private/bh/logs/`.

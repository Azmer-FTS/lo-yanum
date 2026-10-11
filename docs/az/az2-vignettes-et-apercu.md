# AZ2 — Les vignettes du mode divisé, et ce que fait leur toucher

## La règle (celle du PO, appliquée telle quelle)

| Ce qui est à l'écran | Ce que montre la liste |
|---|---|
| La carte est visible (mode divisé, ou carte pleine) | **des vignettes** |
| La carte est masquée (« tableau seul ») | **le tableau d'AZ1** |

Ce n'est plus la largeur qui décide (AY passait en « lignes à deux étages »
sous 560 px de tableau, et montrait un tableau à côté de la carte au-dessus) :
c'est le **mode de carte** de l'écran (`MapSplit` le donne à ses enfants,
`EntityTable` le reçoit en `tiles`). Au téléphone, carte masquée, c'est donc
aussi le tableau : les colonnes qui n'ont pas la place passent sous le nom
(comme partout), l'état se lit au bout du nom, et les gestes se replient dans
un seul « ⋯ ».

## Les vignettes, agrandies

La vignette est `ListTile` — la tuile commune des cinq listes depuis Y4, celle
que les gardes n'avaient jamais quittée : photo sur toute la hauteur à droite,
puis trois lignes.

| | AY (déployé `5c09db6`) | AZ |
|---|---|---|
| Nom | 13,5 px (`text-caption`) | **18 px** (`text-heading`), gras |
| Ce qui situe la fiche | 11,5 px (`text-micro`), tronqué avec le téléphone | **16 px** (`text-body`) : lieu · région (fermes), lieu · contact (contacts), institution · localité (volontaires) |
| L'état | pastille | pastille, **à côté du lieu** |
| Hauteur | ≈ 60 px | **≥ 88 px** (`--tile-h`) |

Mesuré par `azui` A372 aux trois largeurs, sur les cinq listes.

## Le défaut : deux cartes à l'écran

Toucher une vignette ouvrait l'**aperçu latéral** d'AY3.3 — un panneau
`fixed`, collé au bord gauche, **avec sa propre carte épinglée en haut** — par
dessus la moitié carte de l'écran. Deux cartes s'empilaient : celle de
l'écran, à moitié couverte, et celle de l'aperçu.

### Ce qui a été décidé

**En mode divisé, l'aperçu s'ouvre DANS la colonne de la liste, à la place des
vignettes, SANS carte ; la carte de l'écran situe la fiche.** « ✕ » ramène aux
vignettes, sur celle qu'on avait touchée.

### Pourquoi celui-là

- **La carte est déjà là, et c'est le PO qui l'a voulue.** Il a choisi le mode
  divisé pour voir la géographie ; lui en ajouter une seconde, plus petite,
  par-dessus la première, c'est lui retirer la sienne. L'épingle de la fiche
  est sélectionnée sur SA carte : c'est elle qui dit « c'est ici ».
- **Rien n'est couvert.** Le panneau latéral `fixed` recouvrait 32 rem de la
  carte (à 1440 px, plus de la moitié de la moitié carte). Dans la colonne,
  l'aperçu prend la place exacte de ce qu'on lisait.
- **Le regard ne saute pas.** On touche une vignette à droite, la fiche
  s'ouvre à droite, au même endroit ; « ✕ » remet la même liste au même
  endroit.
- **Rien n'est perdu.** L'aperçu ancré porte tout l'aperçu (gestes d'appel,
  chiffres, détails, « עריכה », « לכרטיס המלא ») ; seule sa carte disparaît,
  puisqu'elle est déjà à côté.
- **Et le tableau seul garde l'aperçu d'AY3.3**, panneau latéral avec SA carte
  : là, il n'y a pas d'autre carte à l'écran (A373 le vérifie : une carte).
- Au téléphone, le mode divisé met la carte en haut ; l'aperçu se déplie
  dessous, dans la colonne — une carte, toujours.

Écartés :
- *Garder le panneau latéral et masquer SA carte* : le panneau couvrirait
  encore la carte de l'écran, et l'épingle centrée tomberait dessous.
- *Garder le panneau avec sa carte et masquer celle de l'écran* : le PO perd
  le mode qu'il a choisi, sans l'avoir demandé.
- *Naviguer vers la fiche complète* : perd la liste et le contexte ; l'aperçu
  existe précisément pour ne pas quitter la liste (AY3.3).

Vérifié par `azui` A373 (1440 · 1032 · 402, quatre listes) : une carte visible
avant, une carte visible après, aperçu ancré ouvert, et la vignette touchée
de nouveau à l'écran après « ✕ ».

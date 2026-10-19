# BM (chantier 2) — La barre : deux lignes, un seul bloc

> « Je me retrouve avec quatre lignes au-dessus de la carte. Il y a moyen de
> réduire tout ça à deux lignes max. Et de mettre tout ça sous le même fond, les
> outils et les noms des sections, pour que ça fasse un seul bloc. » — le PO

Aucune capacité n'est retirée : c'est une question de place.

## Ce qui est au-dessus de la carte, maintenant

Un seul bloc (un fond, un liseré, une ombre), deux lignes de 44 px :

| | Ce qu'elle porte |
|---|---|
| **Ligne 1** | retour · « עריכת אזורים » · les pastilles des 13 régions (nom + surface, elles défilent) · « חפיפות (N) » · « בטל שינויים » · « שמור גבול » · « סיום » · « ⋯ » |
| **Ligne 2** | les 7 outils · annuler · refaire · l'aimant · la forme d'origine · (le point choisi : ses 2 boutons) · **les mentions** |

## Les redondances retirées

- **L'outil actif n'est plus écrit** : son icône est pleine (un seul bouton plein
  dans la barre) ; son nom reste dans l'infobulle (survol, appui long) et pour
  un lecteur d'écran.
- **La surface n'a plus de ligne** : elle est sur la pastille de la région (et
  la pastille suit le tracé pendant le geste).
- **Le résumé « אזורי הארץ · בקעת הירדן · 5 נקודות · 1 428 370 דונם »** n'existe
  plus sur l'écran des régions : le nom et la surface sont sur la pastille
  active. ⚠️ Le **nombre de points** n'est plus écrit sur cet écran (il l'est
  toujours sur la carte d'une ferme) — c'est la seule information qui n'a plus
  de place ; les points se voient sur la carte.

## Les mentions : la ligne 2, jamais une troisième

La mer, l'au-delà des frontières, l'aimant actif, la forme d'origine affichée,
les voisines poussées, le vide à combler (avec son bouton « מילוי הרווח »), le
poussage arrêté, « la forme n'est pas fermée » : chacune est une pastille (icône
+ texte court) **sur la ligne 2, après les outils**. Quand plusieurs sont
actives, elles se partagent la place et se tronquent jusqu'à leur icône. **Un
toucher les déplie en entier**, sous la barre, par-dessus la carte — la barre ne
grandit jamais. **À l'étroit** (507 px avec cinq mentions actives, il ne reste
qu'environ 70 px), elles se **replient en une seule pastille** : l'icône de la
plus importante et le compte (« 5 ») ; le dépli les montre toutes, en entier,
avec le bouton « מילוי הרווח ». Elles restent lues par un lecteur d'écran.
L'ordre d'importance : le poussage arrêté (ou tout avis), le vide à combler, les
voisines poussées, la mer et l'au-delà, la forme non fermée, la forme d'origine,
l'aimant. La mer et l'au-delà sont condensés (« 90 807 דונם בים »,
« מעבר לגבול: 842 503 דונם בירדן ») ; la phrase entière est dans le dépli.

## L'iPad en écran partagé (678 et 507 px)

- **Les pastilles se replient dans un sélecteur** : sous 48 rem, la règle Z4 du
  projet interdit qu'un conteneur défile de côté — la rangée des 13 régions
  devenait une grille de quatre à cinq lignes. Le sélecteur montre la région
  ouverte et sa surface ; un toucher déplie les treize sous la barre.
- Le titre reste pour les lecteurs d'écran ; « בטל שינויים », « שמור גבול » et
  « סיום » deviennent des icônes (le mot dans l'infobulle et aria-label) ;
  « חפיפות » garde son icône et son compte.
- **Rien ne disparaît** : quand la ligne 2 manque de place (mesurée, pas
  devinée), « ביצוע מחדש », la forme d'origine et les boutons du point passent
  dans « ⋯ », dans cet ordre, et en reviennent dès que la place revient. Les
  sept outils, annuler et l'aimant restent toujours sur la ligne 2, à 44 px.

## La carte d'une ferme

Même barre, même règle : ligne 1 = le résumé de la forme (et, s'il y en a
plusieurs, leurs pastilles, qui défilent) puis « סגירת הצורה » / « סיום » / « ⋯ » ;
ligne 2 = les outils puis les mentions. Elle passait aussi par trois lignes.

## Exceptions assumées

- **Le téléphone** (402 px) : les neuf boutons de base (sept outils, annuler,
  l'aimant) demandent 396 px et un téléphone en a 368. Là seulement, la ligne 2
  passe à la ligne plutôt que de déborder de l'écran (`aymobile` A358) : trois
  lignes. L'iPad, plein écran comme partagé, tient en deux.
- **Les confirmations** (« שחזור המקור », « שרטוט מחדש ») ne sont plus une ligne
  de plus dans la barre : elles s'ouvrent accrochées SOUS la barre, par-dessus le
  haut de la carte, comme le menu « ⋯ » d'où elles viennent, le temps de la
  réponse. C'est un changement de la décision de BL (« la confirmation est dans
  la barre », `blui` A577, réécrite).

Le panneau des recouvrements (« חפיפות », que le PO ouvre et referme) prend la
place des outils et garde sa hauteur : c'est un mode de revue, pas la barre
d'édition. La ligne 1 (retour, pastilles) y reste.

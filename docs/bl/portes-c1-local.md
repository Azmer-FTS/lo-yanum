# BL — chantier 1 (la barre d'outils en haut) — portes en local (2026-10-18)

Build du chantier 1 seul (`dist-bl`), en série, codes de sortie relevés.
Journaux complets : `private/bl/logs/` (hors dépôt).

## Nouvelle porte

- **`blui` A570–A580 (rendu) 148/148** — souris (1 440 × 900) ET doigt (iPad
  1 032 × 1 376, touchers CDP) ; écran partagé 678 et 507 px.
  - A570 plus rien ne flotte sur la carte : la barre est AU-DESSUS (régions et
    ferme), la légende se retire, aucun élément de la barre sur la carte ; ★ la
    forme ne bouge pas sous le doigt quand la barre paraît, ni quand un point
    est sélectionné (attrapé : 11 px — d'où la place réservée et la
    compensation de la caméra) ;
  - A571 sept outils dans l'ordre d'Illustrator, icônes SVG sans texte, 44 px,
    nommés en hébreu ; A572 infobulle hébraïque au survol et à l'appui long
    (qui ne choisit pas l'outil), bornée à l'écran ; A573 un seul bouton plein
    (l'outil actif), son nom dans la barre, raccourcis V P + − ⇧C N M ;
  - A574 surfaces sur les pastilles des régions, plus de doublon en bas ;
    A575 le recentrage est une icône au bout de la pile en haut à gauche ;
    A576 forme d'origine en pointillés, nommée, bouton qui la masque ; la
    couche « אזורים » n'est plus dessinée sous l'éditeur (même allumée,
    comme sur le compte du PO) ; A577 « שחזור המקור » dans « ⋯ », confirmation
    qui nomme la région, ses points, sa surface et « צורה אחת » ;
  - A578 plume +, plume −, conversion (toucher / tirer : poignées
    symétriques), déplacement (saisi sur un point, la forme entière), écran ET
    base ; A579 écran partagé : rien ne déborde, 44 px gardés ; A580 « שרטוט
    מחדש » : l'ancienne forme en pointillés, plus en aplat.

## Portes réécrites (la règle a changé — pas un contournement)

- `bkeditui` A557 : la poignée ✥ au centre de la forme est devenue l'outil
  « הזזת הצורה כולה » de la barre ; A567 : l'aimant n'est plus dans
  « פעולות » ; A569 : les formes sont tracées sous le centre de la carte (la
  barre au-dessus de la carte lui prend sa bande du haut : le 3ᵉ essai tombait
  sur la barre — mesuré : y = 165 pour un haut de carte à 187).
- `bfui` inchangée : « מרכוז מחדש » garde son identifiant (`map-recenter`) et
  sa règle (paraît quand le PO a pris la caméra, disparaît après) ; il vit
  désormais dans la pile de la carte.

## Rejouées vertes sur ce build

`bkeditui` 152/152 (A557, A567, A569 rejouées après réécriture) · `bhui` 35 ·
`biui` 45 · `bfui` 52 (un premier passage rouge A457 sous une charge machine de
11 : rejoué seul, vert) · `bjguard` 20 · `typecheck`.

La batterie entière (BB → BK, et les portes de la CI) est rejouée sur l'arbre
FINAL de la passe, avant de pousser (`docs/bl/portes-local.md`).

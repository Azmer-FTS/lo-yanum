# BL — chantier 2 : l'accroche aux routes « ne marche pas » (2026-10-18)

> « Quand tu dis de le connecter à la route, je clique dessus, mais il ne se
> passe rien. Je ne comprends pas comment ça marche, mais je ne crois pas que ça
> marche. » — le PO

## Trancher par l'observation : elle marchait, et rien ne le montrait

Sonde sur le build de BK (`private/bl`, `scripts/blprobe3.ts`, écran des
régions, souris, 1 440 × 900) : l'option activée, un point lâché à **9 px**
d'une route finit à **0,00 px** d'elle — en fond « plan » comme en fond
**satellite** (celui du PO, mesuré sur son compte), au zoom 10. Au zoom 8 de
l'écran des régions, la couche `roads` est bien chargée (166 tronçons, routes
principales et autoroutes).

L'accroche fonctionnait donc. Ce que le PO voyait :

1. l'option vivait dans le menu « פעולות » ; un clic la cochait ET **refermait
   le menu** — rien ne changeait à l'écran (capture `private/bl/before/ipad-3-after-snap-click.png`) ;
2. rien ne disait qu'elle était active (il fallait rouvrir le menu) ;
3. aucune route ne s'éclairait ; le point **collait** à la route pendant le
   geste, sans jamais « sauter » : à 16 px près, rien ne se distinguait d'un
   point posé à la main.

Une accroche silencieuse est indistinguable d'une accroche cassée : c'est ce
défaut qui est corrigé.

## Ce qui la rend visible

- **L'aimant est dans la barre** (icône dessinée, `magnet`), une bascule : active,
  elle est cerclée d'accent et la barre écrit « הצמדה לכבישים פעילה — נקודה
  שתשחררו ליד כביש תקפוץ אליו ». Sans route dans la vue, la barre le dit
  (« אין כביש בתצוגה הזאת להיצמד אליו »).
- **En approchant** (à 18 px, `SNAP_PX`), **la route visée s'éclaire** (ambre sur
  liseré blanc) et une **cible** marque le point où le nœud ira ; le nœud, lui,
  suit le doigt.
- **Au lâcher, le nœud saute sur la route**, et un cercle qui s'élargit montre le
  saut. Même chose pour la plume (point posé) et le « + » d'un segment.

## Les portes (`blui`, souris ET doigt)

| | |
|---|---|
| A581 | l'aimant dans la barre ; actif : cerclé, et la barre le dit ; sans route : dit |
| A582 | à 9 px d'une route, AVANT de lâcher : la route s'éclaire, la cible est SUR la route (< 1,5 px), le nœud suit le doigt ; loin des routes : rien |
| A583 | ★ lâché à 9 px : à l'écran < 1 px de la route ; **en base, le sommet est sur le segment de route à moins d'un mètre** ; le saut se voit |
| A584 | ★ accroche coupée, même geste : le point reste où on l'a lâché (< 1 px), à 9 px de la route ; en base, à plus de 5 m d'elle |

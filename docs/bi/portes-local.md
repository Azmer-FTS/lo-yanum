# BI — portes en local (2026-10-15)

Diagnostic complet : `docs/bi/diagnostic.md`.

## La reproduction, AVANT tout correctif

`ONLY=A504 BASE_URL=https://azmer-fts.github.io/lo-yanum bun run biui`, sur le
bundle déployé `9575112` (profil d'un ordinateur d'avant BI) :

```
FAIL  A504 ★ chargement initial : DEUX anneaux, 31 et 29 sommets …  — source {} · rendu []
PASS  A504 rechargement complet : la page est servie SOUS le service worker  — contrôlée
FAIL  A504 ★ après rechargement : toujours deux anneaux, 31 et 29  — source {} · rendu []
FAIL  A504 la carte de l’écran des fermes dessine aussi les deux formes  — source {} · rendu []
```

Capture : `docs/screenshots/bi/deployed/a504-AVANT-9575112-aucune-forme.png`.

## Nouvelles portes

- `bipass` (A498–A503, pur) **71/71** : par défaut on montre (absent, illisible,
  inconnu, non booléen) ; la réactivation d'avant BI ; la fusion du réglage
  synchronisé ; le verdict et le texte du diagnostic ; ★ la surface — tuile
  « מדוד » = étiquette sur le même anneau (6, 31, 29 sommets ; l'hexagone du
  banc BH = 403), et après une retouche ; chaque geste écrit ; le brouillon
  (plusieurs par ferme, jamais effacé par un tracé vide ou un second tracé).
- `biui` (A504–A510, rendu) **45/45** : bundle construit, service worker aux
  commandes, Chrome 1 440 à la souris, profil d'ordinateur d'avant BI —
  ★ deux anneaux (31, 29) au chargement, après rechargement complet, sur
  l'écran des fermes ; ★ relecture à chaud (0 → 2, puis 31 → 33) ; réglage
  absent / illisible / inconnu → montré ; la pastille « צורה אחת מוסתרת » et
  son geste ; le panneau de diagnostic et « העתקה » ; ★ le brouillon de douze
  sommets au doigt après fermeture brutale de la page, un second tracé qui ne
  le remplace pas, la reprise, l'écriture, le rejet confirmé ; ★ barre =
  étiquette = tuile = base après un sommet tiré.

## Non-régression (BB → BH et le reste), toutes vertes

Pures (32, toutes `exit=0`) : typecheck · bipass · bhpass · bgpass · bfpass ·
bepass · bdpass · bcpass · bbpass · bapass · az5pass · aypass · axpass ·
awpass · avpass · aupass · aspass · appass · aopass · aodata · anpass · ampass ·
alpass · akpass · adpass · accept · tokens · contrast · persist · mapping ·
deletion · armigrations.

Au rendu : bhui 34 · bgui 90 · bfui 52 · beui 57 · bdui 76 · bbui 82 ·
bcmobile 246 · aymobile 48 · azui 125 · axui 116 · avui 51 · auui 60 ·
ayscreens 57 · ayui 105 · az5ui 21 · baui 45 · awui 57 · arfiche 144 ·
amui 77 · aqui 107 · assettings 20 · aitheme 18 ; du déploiement : freehand 30 ·
redraw 18 · overlap 167 · zones 38 · agreement 18 · demo 17.

## Ce que les portes ont attrapé pendant la passe

- `axui` A347 : la section « אבחון המכשיר » des réglages ouvrait son
  explication d'office → derrière ⓘ (`InfoTip`). Rejoué : 116/116.
- `freehand` A87 : la première version du brouillon (un seul, boutons de
  tracé éteints tant qu'il attendait) empêchait de recommencer un trait raté →
  plusieurs brouillons par ferme, rien de bloqué. Rejoué : 30/30.
- `overlap` : un build pris au milieu d'une édition (pas un contrôle). Rejoué :
  167/167.
- `bhui` A491 disait « rien n'est encore écrit (on enregistre à « סיום ») » —
  la règle qu'abolit le point 6 ; réécrit (« le geste est ÉCRIT dès le
  lâcher »). `bhpass` A488 : libellé corrigé (un brouillon local existe
  désormais pour un tracé non fermé).

Journaux complets : `private/bi/logs/` (non versionnés).

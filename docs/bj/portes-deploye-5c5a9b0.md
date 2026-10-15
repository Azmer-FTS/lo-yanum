# BJ — portes rejouées sur le DÉPLOYÉ `5c5a9b0` (2026-10-16)

`version.json` (app ET `/demo`) = `5c5a9b0` avant tout rejeu. Le premier
déploiement (`0fab57d`) avait été ARRÊTÉ par la porte `zones` de la CI
(voir `docs/bj/portes-local.md`) : il n'a jamais été servi.

## La démonstration à deux appareils — `BASE_URL=https://azmer-fts.github.io/lo-yanum bun run bjui` : 56/56

Deux profils de navigateur distincts (deux contextes : `localStorage`,
IndexedDB, service worker séparés), le bundle SERVI par GitHub Pages, un compte,
une base factice qui joue le serveur (déclencheur d'horodatage compris).

```
PASS  A518 avant : les deux appareils suivent leur système (rien de choisi)
PASS  A518 A est sombre
PASS  A518 ★ envoyé SUR-LE-CHAMP (pas au rechargement) : la file de A est vide en ≤ 6 s
PASS  A518 le compte porte « dark », horodaté par le SERVEUR (updated_at = written_at, posés par la base)
PASS  A518 ★ B rechargé, AUCUN geste : B est sombre
PASS  A518 … et B le range comme la valeur du compte
PASS  A518 ★ et dans l’autre sens : B choisit « clair », A rechargé est clair
PASS  A518 aucune erreur de page
PASS  A519 avant : « גבולות יישויות » cochée sur A (le défaut montre)
PASS  A519 ★ envoyé sur-le-champ
PASS  A519 le compte porte boundaries = false
PASS  A519 ★ B rechargé, aucun geste : la case est DÉCOCHÉE sur B
PASS  A519 ★ retour : B recoche, A rechargé l’a cochée
PASS  A520 avant : A est sur le plan
PASS  A520 A est en satellite
PASS  A520 ★ envoyé sur-le-champ ; le compte porte « satellite »
PASS  A520 ★ B rechargé, aucun geste : B est en satellite
PASS  A521 la migration a eu lieu, datée
PASS  A521 ★ le compte avait une valeur (rail replié) → elle GAGNE, la locale est remplacée
PASS  A521 ★ l’ancien bloc portait le thème « dark » → il est le compte : promu, et il gagne sur « light » de l’appareil
PASS  A521 l’ancien bloc portait la vigilance → promue sur la table
PASS  A521 ★ le compte n’avait rien, l’appareil oui → PROMUE (fond satellite, volontaires groupés)
PASS  A521 ★ illisible → le DÉFAUT (couches effacées : tout est montré), rien de promu
PASS  A521 les instants d’APPAREIL d’avant BJ sont effacés
PASS  A521 ★ le panneau de diagnostic trace la migration, avec sa date
PASS  A521 ★ second appareil : le compte gagne (satellite, sombre) ; ce que le compte n’a pas est promu (onglet des tâches)
PASS  A521 aucune erreur de page
PASS  A522 ★ A (en avance d’une heure) a écrit AVANT B : la valeur la plus récente sur le compte est celle de B
PASS  A522 ★ … et A rechargé l’adopte (avant BJ, l’instant d’appareil de A aurait gagné)
PASS  A522 A a MESURÉ son écart avec le serveur (≈ −1 h)
PASS  A522 hors ligne : la modification de A (pâturages éteints) attend dans la FILE
PASS  A522 B, en ligne, a choisi APRÈS : le compte porte pâturages MONTRÉS
PASS  A522 ★ A revient : sa file (plus ANCIENNE) n’écrase PAS la valeur plus récente de B
PASS  A522 ★ … A adopte la valeur du compte, et sa file est vide
PASS  A522 … et le PO en est averti (« הוחלף »)
PASS  A522 ★ la file de A est la plus RÉCENTE : au retour du réseau elle gagne (« light »)
PASS  A522 … et B rechargé l’a
PASS  A523 une ligne par réglage (au moins les réglages de compte déclarés)
PASS  A523 le thème : portée « compte », appareil = compte = כהה/dark, date de synchronisation
PASS  A523 ★ les couches, modifiées hors ligne : « différent », DIT en clair (en attente d’envoi)
PASS  A523 une clé d’appareil dit sa raison (la session : « התחברות »)
PASS  A523 ⛔ la SESSION n’est jamais montrée : seulement sa longueur
PASS  A523 la ligne de synthèse nomme la différence
PASS  A523 ★ le texte de « העתקה » emporte le bloc des réglages (titre, une ligne par réglage, la différence)
PASS  A523 ★ « העתקה » copie bien ce texte dans le presse-papiers
PASS  A523 ⛔ … et le texte copié ne porte AUCUN jeton de session
PASS  A524 ★ aucun accès refusé par le registre (console)
PASS  A524 ★ chaque clé rangée sur l’appareil est déclarée (13 clés)
PASS  A524 ★ chaque réglage de compte rangé ici est SUR LE COMPTE, à la même valeur (5)
PASS  A524 aucune erreur de page
PASS  A525 le thème s’applique (rangé sur l’appareil : il n’y a pas de compte)
PASS  A525 aucune file de réglages (rien à envoyer sans compte)
PASS  A525 le diagnostic dit « sans compte »
PASS  A525 ★ le registre s’applique au jumeau : aucun accès refusé
PASS  A525 chaque clé rangée est déclarée
PASS  A525 le jumeau n’a parlé à AUCUN Supabase
```

Captures : `docs/screenshots/bj/deployed/`.

## Non-régression sur le déployé — toutes vertes (codes de sortie)

App : biui 45 · bhui 34 · bgui 90 · bfui 52 · beui 57 · bdui 76 · bbui 82 ·
assettings 20 · atsync 17. Jumeau (`/demo`) : bcmobile 246 · aymobile 48.
Portes de la CI au déploiement (build réel) : toutes vertes (run 38803410750),
dont zones 38 · agreement 18 · demo 17 · freehand.

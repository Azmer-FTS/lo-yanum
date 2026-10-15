# BJ — portes en local (2026-10-15)

Inventaire : `docs/bj/reglages.md`. Récit : `ETAT.md` § BJ.

## Nouvelles portes

- **`bjguard` (A511, pure) 19/19** — la porte qui VERROUILLE la règle : aucun
  accès à `localStorage` / `sessionStorage` / IndexedDB / `document.cookie` /
  Cache Storage hors de `src/storage/` ; chaque clé employée résolue et
  déclarée ; chaque cache du service worker déclaré ; registre bien formé.
  Auto-contrôle : 9 violations FABRIQUÉES refusées (écriture directe, session,
  IndexedDB, `window['localStorage']`, clé non déclarée par constante, famille
  non déclarée par gabarit, littéral `lo-yanum:` en douce, paramètre libre,
  cache de service worker pirate), un commentaire et une clé déclarée admis.
- **La preuve qu'elle échoue sur un vrai arbre** : `docs/bj/bjguard-rouge.log`
  — copie de `src/` avec `src/ui/components/mapPins.ts` (une case de carte
  rangée en douce dans `localStorage`, le motif exact de BI) et `mapPins2.ts`
  (une clé non déclarée passée au registre) : **exit=1**, deux FAIL qui
  nomment fichier et ligne.
- **`bjpass` (A512–A517, pure) 55/55** — registre (défaut qui montre, refus
  d'une clé non déclarée, d'une valeur illisible, session de supabase-js par
  l'adaptateur) ; migration règle par règle ; relecture et file ; heure du
  serveur (SQL du déclencheur, rien d'envoyé comme instant, correction
  d'horloge, banc) ; bloc du diagnostic ; branchements.
- **`bjui` (A518–A525, rendu) 56/56** — build construit, base factice qui joue
  le serveur (déclencheur d'horodatage compris), DEUX contextes de navigateur =
  deux appareils, UN compte :

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

Captures : `docs/screenshots/bj/local/`.

## La base RÉELLE (`lo-yanum-prod`), éprouvée par le MCP, transactions ANNULÉES

Bloc `do … raise exception` : tout est défait à la fin (vérifié : 0 ligne).

```
1 insert: value=A updated=written:t server_now:t
2 older offline: kept=t value=A
3 future claim clamped to now (cannot beat): value=A updated_at_is_t0=t
4 other user sees rows=0
5 other user insert into PO row: refused (42501)
6 anon select: refused (42501)
```
et, après la seconde migration, la page publique (`anon`) lit le gabarit écrit
dans `user_setting_values` : `before=<null> after_write_as_anon=BJ-PROBE-TEXT`.

## Non-régression — toutes vertes (codes de sortie)

Pures (33) : typecheck · bjguard 19 · bjpass 55 · bipass 71 · bhpass ·
bgpass · bfpass · bepass · bdpass · bcpass 75 · bbpass · bapass · az5pass ·
aypass 25 · axpass 40 · awpass · avpass · aupass · aspass 84 · appass 108 ·
aopass · aodata 82 · anpass · ampass · alpass · akpass · adpass · accept 177 ·
tokens · contrast · persist 162 · mapping 40 · deletion 61 · armigrations 56.

Au rendu (31) : bjui 54 (puis 56 après le masquage de la session) · biui 45 ·
bhui 34 · bgui 90 · bfui 52 · beui 57 · bdui 76 · bbui 82 · bcmobile 246 ·
aymobile 48 · assettings 20 · atsync 17 · aitheme 18 · azui 125 · axui 116 ·
avui 51 · auui 60 · ayscreens 57 · ayui 105 · az5ui 21 · baui 45 · awui 57 ·
arfiche 144 · amui 77 · aqui 107 ; du déploiement : freehand 30 · redraw 18 ·
overlap 167 · zones 38 · agreement 18 · demo 17.

## Portes RÉÉCRITES (la règle a changé — pas un contournement)

- `aspass` A290, `aypass` A357, `bcpass` A416, `bipass` A499 : elles
  testaient `mergeSettings` (instants d'APPAREIL, bloc entier) et « choisie
  seulement ». Chaque intention est rejouée sur `planPull` / `planMigration`.
  Deux attentes CHANGENT de sens, par décision du PO : un thème ancien sur le
  compte GAGNE à la migration (« AY1.3 tient » n'est plus) ; « בחירה ישנה »
  n'existe plus (`themeSourceOf`).
- `bipass` A503 : la réactivation de BI part avant `account.startAccountSync`.
- `assettings`, `atsync` : lisent `user_setting_values` ; les écritures
  simulées par `localStorage.setItem` dans la page (que l'app ne fait plus)
  sont devenues des gestes à l'écran.
- `axpass`, `appass` A260 : lisent le registre au lieu de `sync.ts` ; A260
  vérifie en plus que `public_agreement_template()` lit la nouvelle table.

## Ce que les portes ont attrapé pendant la passe

- `appass` A260 : la page publique lisait le gabarit dans `user_settings`,
  que BJ n'écrit plus → migration `20261015000200`.
- `bjui` A522 : hors ligne, le bouton de fond de carte se retire (AK6) — le
  scénario hors ligne porte sur les couches ; et `setOffline` de Playwright ne
  coupe pas la base factice (coupure par route, `network()`).
- Capture A523 : le tableau du diagnostic MONTRAIT la session (`access_token`)
  et « העתקה » l'aurait copiée → les clés d'authentification ne montrent que
  leur longueur ; deux contrôles ajoutés (écran, presse-papiers).
- `bipass` A500 : un relevé de diagnostic sans bloc de réglages (forme
  d'avant) faisait planter le texte → toléré.

Journaux complets : `private/bj/logs/` (non versionnés).

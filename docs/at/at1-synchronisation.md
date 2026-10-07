# AT1 — La synchronisation des réglages : ce que les DEUX APPAREILS DU PO ont réellement fait

Mesuré le 2026-10-07 sur `lo-yanum-prod` (organisation Azmer-FTS), SANS mot de passe
et sans session fabriquée : `auth.sessions` et les journaux de la passerelle
(`edge_logs`, qui portent l'identifiant de session du jeton) disent, requête par
requête, ce que chaque appareil a envoyé et reçu. C'est le cas réel : deux
appareils, deux installations, la vraie base, la vraie session de coordinateur.

## 1. L'évidence d'abord

- **Un seul compte** : `auth.users` n'a qu'une ligne (`c9617ce1…`). Les deux
  appareils lisent le même compte.
- **La table a UNE ligne pour ce compte**, mise à jour le 2026-10-07 à 15:06:53 UTC :
  `lo-yanum:coordinator` = le nom, le téléphone et la région « רכז דרום » du PO
  (valeurs non recopiées ici : le dépôt est public),
  plus `vigil`, `origin`, `target`, `area-gap`, `coverage`, le logo du contrat
  (206 ko), et `__stamps = "{}"` (aucun instant : toutes ces valeurs datent
  d'avant AS4).
- **L'iPad ne s'annonce pas comme un iPad.** iPadOS envoie l'agent d'un Mac
  (« Macintosh; Intel Mac OS X 10_15_7 … Version/26.6.2 Safari »). Sa session est
  `c13e9f13…`, réseau domestique 79.177.x. L'iPhone est `d607b989…` (relais privé
  iCloud). Une troisième, Chrome sur Mac, `6308efa0…`.

## 2. La chronologie (UTC), lue dans les journaux

| Heure | Appareil | Requête | Réponse |
|---|---|---|---|
| 08:19 | iPhone (ancien build) | `GET user_settings?select=data` | **0 ligne** |
| 08:41, 08:42 | iPad (ancien build) | idem | **0 ligne** |
| 14:39 | — | `0b97ed4` publié | |
| **15:05:22** | — | **`b632ace` publié** (documentation seule, mais NOUVEL identifiant de build) | |
| **15:05:49** | iPad (nouveau build) | `POST user_settings` (création, `ignore-duplicates`) | 201 — **l'iPad crée la ligne avec SES valeurs : pas de nom, pas de téléphone** |
| 15:06:08 | iPad | `GET user_settings?select=data,updated_at` | 1 ligne — **la sienne** |
| 15:06:52 | iPhone (nouveau build) | `GET` | la ligne de l'iPad |
| 15:06:53 | iPhone | `PATCH … updated_at=eq.15:05:49.562` | 1 ligne — **l'iPhone écrit son nom, son téléphone, sa région** |
| 15:14–15:15 | iPad | `POST leads`, `POST entities` (201) | la conversion accidentelle (AT2) |
| 15:15:41 | iPad | `GET entities`, `GET leads` | **aucune lecture des réglages** |
| après | iPad | **plus AUCUNE requête de réglages** | |
| 15:08 → 16:38 | iPhone | 6 lectures | la ligne, à jour |

## 3. Les trois causes

1. **Rien ne faisait relire l'iPad.** Il a lu à 15:06:08 ; l'iPhone a écrit à
   15:06:53, 45 secondes plus tard. Une synchronisation n'était déclenchée qu'au
   démarrage, à la connexion, au RETOUR en avant-plan et après un changement
   LOCAL. Un iPad posé sur la table, écran allumé, ne « revient » jamais : il n'y
   a ni `visibilitychange`, ni `focus`, ni `pageshow`. La porte d'AS4 envoyait
   ces événements elle-même (`resume()`) : elle mesurait un retour que la
   réalité n'a pas fait. **C'est le motif d'AM4/AO, encore une fois.**
2. **La synchronisation manuelle ne touchait que les réglages, au mauvais
   moment, sans rien dire.** À 15:06:08 elle a relu la ligne… que l'iPad venait
   d'écrire lui-même : rien à changer, et rien à l'écran pour dire « lu à 15:06,
   rien de neuf, la base porte <ceci> ». L'actualisation des données
   (15:15:41) ne relit pas les réglages. Et aucune requête n'avait de délai : une
   connexion morte au sortir de veille (iOS) peut tenir un `fetch` plusieurs
   minutes — la roue tourne, rien n'arrive au serveur.
3. **« העדכון לא נקלט » était FAUX.** Le bandeau proposait `0b97ed4` ; le PO
   l'a touché à 15:05:4x ; le serveur servait depuis 15:05:22 `b632ace` (un
   commit de documentation, mais chaque build a son identifiant). L'iPad s'est
   rechargé sur `b632ace` — plus récent que la cible — et `settlePending`
   exigeait `RUNNING.id === cible` : il a déclaré l'échec d'une mise à jour
   réussie. L'iPad tournait bien le nouveau code (il appelle `data,updated_at`
   et la table `leads`, qui n'existent que depuis AS).

Les fermes étaient identiques parce que les FERMES sont relues par
l'hydratation et le « tirer pour rafraîchir » ; seuls les réglages dépendaient
d'un événement de retour.

## 4. Ce qui manque pour mesurer « en vrai » de bout en bout

Une session de coordinateur sur deux appareils RÉELS sous mon contrôle : il
faudrait le mot de passe du PO (refusé, à juste titre — 0-AO ter) ou créer un
compte dans la vraie base (je ne crée pas de compte). Les journaux du serveur
remplacent cette mesure pour le CONSTAT ; la porte `atsync` rejoue après
correction la séquence EXACTE ci-dessus (même ordre, aucun événement de retour)
sur le bundle déployé ; et le panneau « סנכרון הגדרות » permet au PO de lire,
sur chaque appareil, ce qui est monté, descendu, et l'erreur.

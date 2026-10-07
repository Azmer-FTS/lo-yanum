# AS4 — Les réglages entre deux appareils (2026-10-07)

## La mesure, sur le déployé d'avant (`0bd2cb5`)

`BASE_URL=https://azmer-fts.github.io/lo-yanum bun run assettings` — deux
contextes de navigateur (= deux appareils, chacun son stockage et sa session),
une base partagée (`FakeDb`) à la place de Supabase. Journal complet :
`as4-rouge-deploye-0bd2cb5.log`. **8 rouges sur 18.**

| Constat du PO | Mesuré | Cause |
|---|---|---|
| « je change sur l'iPhone, l'iPad n'a rien » | l'écriture MONTE (A → base : vert) ; B, déjà ouvert, au retour en avant-plan : **rien** | le bloc n'était lu qu'au démarrage À FROID ; une PWA reprise ne redémarre pas (AJ0.1) |
| | après un vrai rafraîchissement : B l'a | même cause — la seule lecture est au démarrage |
| | un retour à la carte livrée ne monte **jamais** | seul `setItem` était enveloppé, pas `removeItem` |
| | B (valeurs d'hier) change AUTRE CHOSE : la marge posée par A **disparaît** | le bloc ENTIER était poussé : le dernier appareil écrasait tout |
| | conflit : B garde sa valeur périmée, **sans rien dire** | « le serveur gagne au démarrage », jamais ailleurs, sans instant |
| (non visible) | rien n'était relu après la connexion | à froid, avant connexion, `getUser()` = rien |

## Le remède

- un **instant par clé** (`lo-yanum:settings-stamps` sur l'appareil, `__stamps`
  dans le bloc en base — les anciens builds l'ignorent) ;
- une **fusion clé par clé** (`mergeSettings`, pure) : la plus récente gagne ;
  modifiée ici depuis la dernière synchro ET battue = **conflit, dit au PO** ;
- une **écriture conditionnelle** (`updated_at` relu = `updated_at` en base),
  relue et refusionnée si un autre appareil a écrit entre-temps ;
- la synchro part **au démarrage, à la connexion, au retour en avant-plan**
  (`visibilitychange` / `pageshow` / `focus`, 10 s mini — la même liste que la
  vérification de version d'AJ), **au retour du réseau**, et **1,2 s après un
  changement** ;
- les modules en cache s'abonnent à `lo-yanum:settings-applied`
  (`ui/settings/applied.ts`) : l'écran ouvert se met à jour sans recharger ;
- bandeau `SettingsSyncNotice` : « ההגדרות עודכנו ממכשיר אחר » (8 s) ou
  « שינוי שעשית כאן הוחלף… » (reste jusqu'au geste) ;
- הגדרות › נתונים : « סנכרון הגדרות אחרון » et « סנכרון עכשיו ».

Après : **18/18** (`bun run assettings`, build local ; et sur le déployé après AS).

⚠️ Pendant la transition, un appareil resté sur l'ANCIEN build pousse encore
le bloc entier sans instants : mettre à jour les deux appareils.

## A290 — chaque clé, locale ou synchronisée

### Synchronisées (`SYNCED_SETTING_KEYS`)

| Clé | Ce que c'est |
|---|---|
| `lo-yanum:target` | l'objectif du programme |
| `lo-yanum:coverage` | seuil de couverture (« נשכחו ») |
| `lo-yanum:vigil` | seuils de vigilance |
| `lo-yanum:renewal-window` | fenêtre de renouvellement |
| `lo-yanum:area-gap` | seuil d'écart de surfaces |
| `lo-yanum:require-id-photo` | photo de ת״ז obligatoire |
| `lo-yanum:summons-template` | gabarit du message de convocation |
| `lo-yanum:agreement-doc-template` | texte de l'accord |
| `lo-yanum:agreement-doc-logo` | logo de l'accord |
| `lo-yanum:region-rings` | les régions redessinées |
| `lo-yanum:coordinator` | la carte du coordinateur |
| `lo-yanum:origin` | le point de départ des tournées |
| `lo-yanum:free-routes` | les tournées libres |
| `lo-yanum:route-margin` | la marge des durées de route |

### Locales, et c'est voulu (`LOCAL_ONLY_KEYS`)

| Clé | Pourquoi elle ne voyage pas |
|---|---|
| `lo-yanum:farmer-pass` | laissez-passer de l'agriculteur : un fait de CET appareil (AL11.2) |
| `lo-yanum:guard-pass` | laissez-passer du gardien : idem |
| `lo-yanum:link-unlock` | mémoire de temporisation (AG2) : la copier annulerait la protection |
| `lo-yanum:theme:<rôle>` | thème choisi pour CET écran (AI6) |
| `lo-yanum:view-as` | « voir comme » : un état d'écran |
| `lo-yanum:report-recipient` | destinataire du compte rendu (délibérément local) |
| `lo-yanum:activity-reports` | historique local ; la base garde `activity_reports` |
| `lo-yanum:intake:seen` | demandes « vues » : ne commande que la répétition d'un bandeau (AQ) |
| `lo-yanum:sheet-mapping:<type>` | correspondance de colonnes du dernier fichier importé ici |
| `lo-yanum:farm-tab:<fiche>` | onglet ouvert d'une fiche (AS5) |
| `map-mode`, `map-ratio`, `map-last`, `map-layers`, `map-base`, `layout-sync`, `block:*`, `numpad` | disposition d'écran et de carte |
| `last-fix`, `geo-granted`, `geo-diag`, `map-attempt` | localisation et diagnostics de cet appareil |
| `update-pending`, `update-verdict` | mise à jour du build de cet appareil (AJ) |
| `last-session`, `last-email`, `lo-yanum:auth` | la session elle-même |
| `lo-yanum:settings-stamps`, `lo-yanum:settings-synced-at` | la mémoire de synchronisation de cet appareil |

# Un agrégat en une transaction, et la boîte d'envoi qui se relance (BK, 2026-10-18)

> Suite de `docs/bk/ecriture-non-transactionnelle.md` (la mesure). Décision du
> PO, mot pour mot : « Fais l'écriture en une seule transaction côté base : une
> fonction Postgres par migration via le MCP, pour toutes les tables qui ont
> des sous-lignes, plus une relance automatique de la boîte d'envoi. Porte
> rouge avant, verte après. »

## La fonction — `public.write_aggregate(p_table text, p_rows jsonb, p_children jsonb)`

Migration `supabase/migrations/20261018000200_bk_write_aggregate.sql`.
Les trois pas de l'ancien `write.ts` en UN appel, donc une transaction :
effacer les sous-lignes des parents écrits (ordre INVERSE de la liste),
`insert … on conflict (id) do update` des parents sur les SEULES colonnes
envoyées, insérer les sous-lignes (ordre de la liste). Tout, ou rien.

- `SECURITY INVOKER` : la RLS de l'utilisateur s'applique telle quelle.
- `set search_path = ''` ; tout est qualifié (`public.`, `pg_catalog.`).
- **Liste blanche en dur**, recopiée de `MAPPINGS` (`src/data/rows.ts`) — les
  SIX agrégats qui ont des sous-lignes : `entities` (contacts, engagements,
  bétail, accords), `zones` (sommets), `threat_zones` (sommets), `missions`
  (postes, affectations, présences, chauffeurs, passagers, points de contrôle,
  annulations — l'ordre compte : `presence_marks` → `mission_assignments`),
  `incidents` (entrées), `tours` (étapes). Toute autre table : refusée
  (22023) ; une sous-table hors liste, une sous-ligne qui n'appartient à
  aucun parent écrit : refusées (22023) ; une colonne inconnue : refusée
  (42703, comme PostgREST).
- Identifiants dynamiques par `format(%I)` seulement ; les lignes passent par
  `jsonb_populate_recordset(null::public.<table>, $1)`, jamais par du texte.
- `revoke all … from public`, `from anon` ; `grant execute … to authenticated`.
  (Supabase accorde aussi `service_role` par ses privilèges par défaut ; ce
  rôle contourne la RLS de toute façon.)
- La suppression d'un agrégat entier (`delete … in ('id', …)`, cascade) était
  déjà une requête unique : inchangée.

## Sur la base réelle (`lo-yanum-prod`)

1. `list_organizations` → `jkqsqykhquutilldvcsv` (Azmer-FTS). Projet
   `lvrptqmkjikkkhcxocbe`.
2. **État avant** : la consigne parlait de « 3 formes, 17, 31 et 23 sommets ».
   La base en portait **4** : 17, 31, **147** et **367** — ce matin à 06 h 28 UTC
   le PO a retouché le pâturage avec l'éditeur BK (26 nœuds → anneau de 147
   points, `path` enregistré) et tracé une nouvelle limite (25 nœuds → 367).
   C'est son usage, pas une perte ; la référence de contrôle devient ces 4.
3. **Essai annulé** (un seul bloc `DO` qui crée la fonction, l'éprouve et se
   termine par une exception : rien ne peut être validé) :
   `coordinateur trouvé ; créée : 4 sommets ; réécrite : 5 sommets, lat 31→31.1 ;
   panne au milieu (deux sommets à la même position) : 23505 ; après la panne :
   5 sommets, lat 31.1 ; table hors liste : 22023 ; sous-ligne étrangère :
   22023 ; colonne inconnue : 42703 ; sous-table hors liste : 22023 ; RLS
   (authentifié sans droit, ferme hors de ses droits) : 42501 ; RLS sur la forme
   existante : 42501 ; anon : 42501 ; formes réelles inchangées dans la
   transaction : true`. Après : fonction absente, aucune forme d'essai, 4
   formes intactes.
4. `apply_migration` → version MCP **`20261018110736`**. Vérifié : `prosecdef`
   faux, `search_path=""`, `anon` sans `execute`, `authenticated` avec. Formes
   réelles : 17, 31, 147, 367 — intactes.
5. `supabase migration repair --status applied 20261018000200` ; jalon vide
   `20261018110736_jalon_historique_mcp.sql` ; `armigrations` **58/58** (104
   versions, 104 fichiers).
6. Advisors de sécurité : rien sur `write_aggregate`. (Ils signalent, comme
   avant, cinq fonctions `SECURITY DEFINER` exécutables par `anon` : les trois
   voulues de la page publique, et deux fonctions de déclencheur,
   `aid_requests_mail_dispatch` et `entities_land_documents_dispatch` — hors
   de cette passe, à regarder.)

## L'app

- `src/data/write.ts` : un agrégat à sous-lignes passe par
  `client.rpc('write_aggregate', …)` ; sans sous-lignes, l'upsert (déjà une
  requête). Un échec laisse l'agrégat dans la boîte d'envoi, comme avant.
- `src/data/store.ts` : **la relance automatique** — un seul minuteur pour le
  module, délais 2, 4, 8, 16, 30 puis 60 s (borné), réarmé après chaque échec,
  annulé et remis au premier délai dès que la boîte est vide (quel qu'en soit
  l'auteur : écriture, rechargement, `online`, rafraîchissement, déconnexion,
  « remettre à vide ») ; jamais deux à la fois ; hors ligne il ne relance pas
  (`online` reprend). Un second geste remplace toujours l'entrée de la boîte.
- Le jumeau `/demo` n'a pas de Supabase : ni RPC ni boîte d'envoi — inchangé.

## La base factice (`scripts/fake-supabase.ts`)

- `rpc/write_aggregate`, même sémantique : liste blanche (recopiée du SQL ;
  `bkecriture` A620 compare SQL, `MAPPINGS` et base factice), effacer, upsert
  sur les colonnes envoyées, insérer, **tout ou rien** (une panne remet les
  tables touchées dans leur état d'avant l'appel).
- `FakeDb.failInsert` : la panne « au milieu », la même pour les deux
  chemins — par PostgREST, les sous-lignes sont alors déjà effacées ; dans la
  RPC, la transaction est annulée.

## La porte — `bun run bkecriture` (A620–A626)

A620 (pur) liste blanche SQL = `MAPPINGS` = base factice, sécurité de la
fonction, `write.ts` par la RPC · A621 une panne au milieu laisse la forme
ENTIÈRE à l'ancienne position · A622 un second profil ne voit jamais 0 point
· A623 la boîte d'envoi rejoue SEULE (ni rechargement, ni `online`), après
trois échecs, en moins de 20 s · A624 délais croissants (mesurés 2,0 · 4,0 · 8,0 s), un second geste
ne part pas, plus rien après le succès, `online` ne double pas la relance ·
A625 une fiche de ferme : ni contacts ni engagements perdus, tout ou rien,
rejouée seule · A626 une zone de menace : entière, rejouée seule.

**Rouge avant, vert après, même porte, même base factice.**
- Avant (`e9838b2` : build de l'app d'avant, porte copiée dans son arbre) :
  **10 PASS, 20 FAIL, exit 1** — `docs/bk/bkecriture-rouge-avant.log`. A620 :
  pas de migration, `write.ts` sans RPC ; A621 « 0 sommet en base » ; A622
  « 0 sommet » chez B ; A623 « rien après 10 s, 1 essai » ; A624 un seul
  essai ; A625 « 0 contact, 0 engagement en base » et la fiche à moitié
  écrite (nom neuf) ; A626 « 0 sommet, high ».
- Après : **30 PASS, 0 FAIL, exit 0** — `docs/bk/bkecriture-vert-apres.log`.
- Déployé `5781fba` : **30/30** — `docs/bk/bkecriture-deploye-5781fba.log`.

Deux contrôles ont été compris avant d'être corrigés (la porte, pas l'app) :
A624 voyait un 2e essai pendant le second geste — c'était la relance de 2 s
(le geste, recadrage compris, durait 1,7 s) : le geste se fait désormais sans
recadrer et est jugé avant 2 s. A625 comptait 3 contacts après la relance —
le formulaire range aussi l'exploitant en carte de contact : la porte juge
les deux contacts D'ORIGINE, par identifiant.

## Portes touchées

- `bkeditui` A563 compte aussi `rpc/write_aggregate` parmi les écritures
  (sinon « ouverte puis refermée : rien n'est écrit » était vrai par vide).
  A557 n'est PAS assouplie.
- `settings` lit `BASE_URL` (sans build ni serveur) : le seul banc déployé
  fidèle pour elle est le jumeau `/demo`, construit comme le sien sans
  Supabase — `BASE_URL=https://azmer-fts.github.io/lo-yanum/demo`. Ses
  contrôles ne changent pas.

## La batterie, en série, après le correctif (build local) — toutes vertes

Codes de sortie relevés porte par porte, `lsof` avant chaque porte.

Pures : typecheck · bjguard 20 · bjpass 55 · bkpass 46 · bkedit 51 · bipass 73 ·
bhpass 24 · bgpass 53 · bfpass 51 · bepass 92 · bdpass 66 · bcpass 75 ·
bbpass 51 · bapass 38 · az5pass 18 · aypass 25 · axpass 40 · awpass 60 ·
avpass 15 · aupass 48 · aspass 84 · appass 108 · aopass 113 · aodata ·
anpass 27 · ampass 50 · alpass 40 · akpass 56 · adpass 46 · accept 177 ·
tokens · contrast · persist 162 · mapping 40 · deletion 61 · armigrations 58 ·
sync 34.

Au rendu : **bkecriture 30** · **bkeditui 152** (A557 non assouplie) · bkui 31 ·
bjui 56 · biui 45 · bhui 35 · bgui 90 · bfui 52 · beui 57 · bdui 76 · bbui 82 ·
bcmobile 246 · aymobile 48 · assettings 20 · atsync 17 · aitheme 18 · azui 125 ·
axui 116 · avui 51 · auui 60 · ayscreens 57 · ayui 105 · az5ui 21 · baui 45 ·
awui 57 · arfiche 144 · amui 77 · aqui 107 · settings 44 · touch 69.

De la CI : ground 17 · backdrop 38 · redraw 18 · overlap 167 · freehand 30 ;
build réel (`--mode real`, `vite preview` 5197) : zones 38 · agreement 18 ·
demo 17.

⚠️ **Deux portes rejouées seules, et pourquoi.** Une autre session (BL, dans
le dépôt principal) faisait tourner LA MÊME batterie, sur les mêmes ports,
au même moment. Croisé avec les relevés `lsof` : `bjui` avait démarré avec son
port 5499 tenu par un `vite preview --outDir dist-bjdemo` orphelin de cette
session — elle mesurait donc SON build ; et cette session a tué mon serveur
5209 en pleine `settings` (« ERR_CONNECTION_REFUSED », sans assertion en
échec). Les deux rejouées seules, ports libres : bjui 56/56, settings 44/44.
Aucune autre porte n'a démarré avec son port pris (l'autre batterie avait
plusieurs portes d'avance, sur d'autres ports).

## Déployé `5781fba`

CI verte ; `version.json` (app et jumeau) = `5781fba`.

- **`bkeditui` 152/152**, A557 verte à la souris ET au doigt — sans
  assouplissement : la fenêtre « zéro sommet » qu'elle lisait n'existe plus.
- `settings` 44/44 sur le jumeau `/demo`.
- **`bkecriture` 30/30** (version finale de la porte, ci-dessous).
- **Base réelle** après déploiement : 4 formes, 17, 31, 147 et 367 sommets,
  mêmes dates qu'avant ; aucune forme ni zone de menace sans sommet ; aucun
  reste de l'essai annulé.

**Le premier rejeu de `bkecriture` sur le déployé était à 26/30, et c'était
la porte.** A621 « départ » et A622 lisaient l'écran du second profil B après
1,5 s : sur le déployé, sa carte n'était pas toujours publiée, et la lecture
rendait « 0 point » alors que la forme était entière en base au même instant
(A621 seule : 1 rouge sur 3). La porte lit désormais B quand SA carte montre
les formes de la ferme (le pâturage, toujours là — sur l'ancien code B le voit
mais pas la limite : le contrôle reste rouge), et garde A en attente ≈ 14 s
(trois échecs) pour que B relise PENDANT l'attente ; A623 juge donc la relance
seule après trois échecs, sous 20 s. A624 jugeait le second geste fini 2,4 s
après l'ENVOI en échec : la relance part 2 s après la RÉPONSE ; la garde se
mesure désormais depuis la réponse. Puis, avec cette version finale : A621
3/3 sur le déployé ; porte entière ROUGE 10/20 sur l'ancien code, VERTE 30/30
en local, VERTE 30/30 sur le déployé.

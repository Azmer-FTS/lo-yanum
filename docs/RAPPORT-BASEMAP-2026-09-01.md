# Fond de carte — rapport du 2026-09-01

**Verdict : ~~le bug est OUVERT~~ → ✅ FERMÉ le 2026-09-01, voir le §9.** Vos quatre preuves ne sont pas au rapport, et
elles ne peuvent pas y être aujourd'hui. Voici pourquoi, mesuré et non plaidé.

> ✅ **LA CARTE NATIONALE EST EN PRODUCTION (§9).** `grep negev → 0`,
> `grep israel → 1` sur le bundle servi, l'archive répond `206` sur
> `94 268 129` octets, et Haïfa a 1 614 routes à z14. Le §1 ci-dessous décrit
> l'état de ce matin ; il est conservé parce qu'il est la mesure qui a mené à la
> cause.
>
> ⛔ **MISE À JOUR DU 2026-09-01, APRÈS VOTRE CAPTURE EN NAVIGATION PRIVÉE —
> LISEZ LE §8 AVANT LE §6.** Le §6 vous demande un téléversement dans le
> tableau de bord Supabase. **Ce téléversement est impossible** : le projet
> refuse tout fichier de plus de 50 Mio et l'archive nationale en fait 94,3.
> Mesuré, borné à l'octet près, au §8. Le §6 est conservé tel quel pour que
> l'erreur reste lisible, mais **il ne faut pas le suivre**.

---

## 1. Ce que la mesure dit — vos quatre preuves, telles qu'elles sont revenues

Navigateur réel (Chromium), **profil vierge** : aucun stockage, aucun service
worker, aucun cache. Commande : `bun run ground`.

| # | ce que vous demandiez | ce que le réseau a répondu |
|---|---|---|
| 1 | l'URL pmtiles qui part vraiment | `…/storage/v1/object/public/basemap/`**`negev-20260829-z14.pmtiles`**, en-tête `Range: bytes=0-16383`. Une seule archive est demandée, jamais deux |
| 2 | une réponse > 100 Mo | **`206`**, `content-range: bytes 0-16383/`**`42560293`** → **42,6 Mo** |
| 3 | הגדרות affichant `israel` et ~175 Mo | l'écran affiche **`negev-20260829-z14.pmtiles`** et le bouton **`רענון מפות לא מקוונות (42.6 MB)`** |
| 4 | Haïfa nette à z12–z14 | **0 feature, 0 route** aux trois zooms. Captures : `docs/screenshots/basemap/haifa-z{12,13,14}-negev-20260829-z14.pmtiles.png` |

**Trois de vos quatre chiffres étaient déjà exacts.** L'écran ne vous mentait
pas : il vous disait la vérité sur une carte que personne n'a remplacée.

---

## 2. La cause — une seule, et ce n'est pas la logique du basemap

· **Déploiement `33475282175`** (commit `43b43c8`, `success`, 05h52 UTC). Son
  étape *Resolve the basemap archive* a interrogé le bucket et a écrit, mot
  pour mot : `length : 88 (expected 94268129)` — `range : HTTP 400`.
· `HEAD …/basemap/israel-20260831-z14.pmtiles` → **`400`**.
  **L'archive nationale n'a jamais été téléversée.**
· `HEAD …/basemap/negev-20260829-z14.pmtiles` → **`200`, `42 560 293` octets.**
· Le bundle **déployé** (`assets/index-MQ5mES-Q.js`, récupéré par le réseau)
  ne nomme **qu'une seule** archive `.pmtiles` : l'extrait sud.

Le build demande donc la seule carte qui existe ; l'écran rapporte la carte
demandée ; le רענון télécharge la carte rapportée. **Trois symptômes, un seul
fait.**

---

## 3. Vos trois questions de diagnostic, répondues par le réseau

1. **Quelle URL part au chargement ?** L'extrait sud (preuve 1). Elle vient de
   `BASEMAP_KEY` dans `src/ui/components/basemap.ts`, que le build conserve
   quand `VITE_BASEMAP_URL` est vide — et le journal de déploiement dit
   pourquoi il était vide. Ce n'est pas une référence oubliée : le bundle
   déployé ne contient qu'un seul nom `.pmtiles`.
2. **La logique préfère-t-elle un fichier local périmé, même en ligne ?**
   **Non — et votre propre constat le prouve.** Vous voyez le même symptôme
   dans un navigateur ordinaire, hors PWA, sans rien de téléchargé : un
   appareil vide ne peut rien préférer. Le code va dans le même sens : l'app
   demande au worker *l'archive que ce build veut*, signale `stale` quand le
   nom diffère, et affiche une ligne `השמור במכשיר` dans ce cas. Naviguer sur
   la carte ne peut d'ailleurs pas remplir le cache : PMTiles lit par plages et
   l'API Cache refuse un `206`. **L'invalidation que vous demandez existe
   déjà ; ce n'est simplement pas ce qui se passe.**
3. **Que télécharge le רענון ?** La même URL unique — l'extrait sud — d'où les
   42,6 Mo. La porte vérifie que l'étiquette du bouton et le réseau
   s'accordent au dixième de mégaoctet.

---

## 4. Un chiffre à corriger : **94,3 Mo, pas 175**

L'archive nationale fait **94 268 129 octets**. Une règle « > 100 Mo »
refuserait pour toujours la vraie carte d'Israël et laisserait passer
n'importe quel extrait de 120 Mo. Les deux portes vérifient l'**égalité exacte
en octets** contre un registre — ce qui attrape en plus le téléversement
interrompu, qu'un seuil laisserait passer.

---

## 5. Ce qui a été construit : la vérification permanente que vous exigez

`bun run ground` (A83) + trois étapes dans `.github/workflows/deploy.yml`
(installation de Chromium → la porte → les captures publiées en artefact du
run, `if: always()`). **Elle tourne à chaque déploiement, définitivement.**

· Elle **fait échouer** le déploiement sur tout ce que l'absence de
  téléversement n'explique pas, et sur le garde-fou de régression (si
  l'archive nationale est dans le bucket et que le bundle demande encore
  l'extrait sud, le déploiement est **refusé**).
· Tant que l'archive nationale est réellement absente, elle imprime les trois
  lignes vides de Haïfa et laisse passer le build — sinon **tout** déploiement
  serait bloqué, y compris des travaux sans rapport avec la carte, sur un acte
  qu'aucune session ne peut accomplir.
· **Sa branche stricte a été exercée, pas supposée** : forcée sur la clé
  nationale absente, elle sort en **exit 1** avec chaque échec nommé.

⚠️ **Elle pilote un build DEMO, et c'est écrit dans le fichier.** L'app
déployée s'ouvre sur une porte de connexion dont vous êtes seul à avoir jamais
tapé le mot de passe. Aucune porte automatique ne peut s'y connecter, et
aucune ne doit pouvoir — c'est précisément ce que P3.1 a fermé. Ce qui décide
du fond de carte n'est pas la session : ce sont `VITE_BASEMAP_URL` et la
constante derrière, **les deux mêmes entrées dans les deux modes**. Vérifié
séparément : un navigateur à profil vierge sur l'URL déployée atteint la porte
en hébreu et ne demande **aucun** fond de carte.

---

## 6. ~~La manipulation à faire — une ligne, une minute, et elle est à vous~~

> ⛔ **CETTE SECTION EST FAUSSE ET RÉFUTÉE PAR LE §8.** Le téléversement décrit
> ci-dessous renvoie `413 Maximum size exceeded`, quel que soit l'opérateur.
> Ne la suivez pas. Elle reste ici parce qu'elle vous a coûté deux itérations.

> **Supabase → Storage → bucket `basemap` → Upload file →
> `israel-20260831-z14.pmtiles`** (le fichier est dans `basemap/` de ce dépôt,
> 94 268 129 octets ; le nom doit être exact).

Rien d'autre. Le déploiement suivant résout l'URL nationale tout seul, la
porte navigateur exige alors ses quatre preuves, et l'artefact
`basemap-proofs` du run contient Haïfa à z12–z14 avec des routes dessus — ou
le déploiement échoue.

---

## 7. Le fichier `negev` n'a **pas** été supprimé du bucket

Vous l'aviez conditionné aux quatre preuves : elles ne sont pas là. Deux
raisons de plus :

· **C'est le seul objet du bucket.** Le supprimer maintenant enlèverait toute
  carte à l'app que vous montrez à l'équipe — pire qu'une carte coupée au nord.
· **Aucune session ne peut y écrire** : l'écriture sur `basemap` est réservée
  au coordinateur et il n'existe plus d'accès non humain depuis P3.1.

**Le bon ordre : téléversement → les quatre preuves passent au vert →
suppression de l'extrait sud.** À ce moment-là le repli silencieux que vous
craignez est déjà impossible : la porte refuse de livrer un bundle qui demande
l'extrait partiel dès que l'archive nationale est utilisable.

---

# 8. ⛔ LE §6 CI-DESSUS EST FAUX. LE TÉLÉVERSEMENT EST **IMPOSSIBLE**, PAS EN ATTENTE

*Ajouté le 2026-09-01 après votre capture en navigation privée. Vous aviez
raison sur toute la ligne, et la raison est plus bas que là où deux rapports
ont cherché.*

Le §6 vous demandait un geste d'une minute dans le tableau de bord Supabase.
**Ce geste ne peut pas aboutir.** Ce n'est ni un oubli, ni un droit manquant,
ni un déploiement cassé : le projet Supabase refuse tout fichier de plus de
**50 Mio**, et l'archive nationale en fait 94,3. Personne ne peut la
téléverser — ni moi, ni vous, avec aucun mot de passe.

## 8.1 La mesure qui le prouve, bornée à l'octet près

Trois créations d'envoi TUS sur le bucket `basemap`, identiques sauf la
longueur déclarée :

```
--- upload-length = 52428800  (50 Mio pile)   ---  HTTP 403
--- upload-length = 52428801  (50 Mio + 1 o)  ---  HTTP 413
--- upload-length = 94268129  (l'archive)     ---  HTTP 413
```

Lisez la première ligne : à 50 Mio pile, le serveur accepte la **taille** et ne
refuse que sur l'**autorisation** (`403` — écriture réservée au coordinateur,
exactement comme prévu). Un octet de plus et il ne regarde même plus qui
demande : `413 Maximum size exceeded`. **Le plafond est donc exactement
52 428 800 octets, et il est vérifié avant l'identité.** Votre mot de passe ne
change rien à ce chiffre.

Et le bucket, lui, n'y est pour rien — il autorise 200 Mo :

```
id       | public | file_size_limit
basemap  | true   | 209715200
```

Le plafond est celui du **plan** du projet `lo-yanum-prod`, pas celui du
bucket. C'est la limite du palier gratuit de Supabase.

## 8.2 Toute la chaîne, et elle est cohérente de bout en bout

| maillon | état mesuré |
|---|---|
| `negev-20260829-z14.pmtiles`, 42 560 293 o | **< 50 Mio → téléversé, présent, `200`** |
| `israel-20260831-z14.pmtiles`, 94 268 129 o | **> 50 Mio → `413` → jamais téléversé** |
| fichier local `basemap/israel-…pmtiles` | présent, 94 268 129 o exacts, entête `PMTiles` — **il a bien été découpé, il n'a juste jamais pu partir** |
| commit de la constante | **il n'existe pas** : `BASEMAP_KEY` n'a jamais été modifiée depuis `0c11b10` |
| `main` / `origin/main` | `29c0ba0`, synchronisés, 0 en avance, 0 en retard |
| déploiement de ce SHA | run `33478765889`, `success`, 06h42 UTC |
| verdict du workflow | *« la nationale n'est toujours pas dans le bucket (longueur 88, range 400) »* |

**Rien n'a échoué. Rien n'a été oublié. Rien n'attend d'être poussé.** Le
correctif n'est pas en production parce qu'il n'a jamais existé sous la forme
que trois rapports lui ont supposée — une constante à changer. La constante
`negev` est *correcte* tant que l'archive `israel` n'est pas servable : la
changer maintenant ferait refuser le déploiement par la porte (« le bundle
demande une archive que le bucket ne sert pas »), et, forcée, donnerait un
écran blanc.

## 8.3 Les sorties brutes sur le SERVI, comme vous les exigez

`curl https://azmer-fts.github.io/lo-yanum/` → bundle référencé :

```
<script type="module" crossorigin src="./assets/index-MQ5mES-Q.js"></script>
```

`curl` de ce bundle (1 624 181 octets, sha256 `08ab7f16b95d…`) :

```
grep -o -i "negev"  | wc -l   →   1
grep -o -i "israel" | wc -l   →   0
```

et l'occurrence, en clair :

```js
const d6="negev-20260829-z14.pmtiles",
      h6=`https://lvrptqmkjikkkhcxocbe.supabase.co/storage/v1/object/public/basemap/${d6}`
```

**Votre prédiction était exacte au mot près.** Le bundle servi référence
toujours `negev`, et jamais `israel`.

## 8.4 Ce qu'il reste, et c'est une décision qui vous appartient

Trois voies, et une seule ne coûte rien :

1. **Héberger l'archive sur GitHub Pages plutôt que sur Supabase.** Mesuré :
   Pages répond `206` à une requête `Range` avec `access-control-allow-origin: *`
   — c'est tout ce que PMTiles demande, et c'est même la *même* origine que
   l'app. `VITE_BASEMAP_URL` existe déjà exactement pour ça. **Gratuit,
   aujourd'hui, sans re-découpe, en gardant le z14 et tout le pays.** C'est ma
   recommandation.
2. **Passer le projet Supabase au plan payant**, qui relève le plafond. ~25 $/mois
   pour un fichier — et c'est votre argent, donc votre décision.
3. **Re-découper l'archive sous 50 Mio** — soit en perdant le z14, soit en
   perdant du territoire. C'est exactement le compromis que vous avez refusé.

⚠️ Je n'ai pas engagé la voie 1 de moi-même : elle déplace l'hébergement du
fond de carte, ce que trois documents traitent comme une décision arrêtée, et
la publication de l'archive m'a de toute façon été refusée par la politique de
permissions de cette session. **Dites « voie 1 » et je la livre en entier** :
publication de l'archive, `basemap.ts` et `deploy.yml` recâblés, porte de
déploiement mise à jour, puis les `curl` sur le servi montrant `israel` présent
et `negev` absent — et enfin vos quatre preuves navigateur sur profil vierge.

---

# 9. ✅ VOIE 1 LIVRÉE — LES CURLS SUR LE SERVI, APRÈS DÉPLOIEMENT

*La carte nationale est en production. Voici les sorties brutes que vous exigez,
prises sur le site en ligne après la fin réelle du workflow.*

## 9.1 Ce qui a changé, en une phrase

L'archive ne vit plus dans le bucket qui la refuse : **elle voyage avec
l'application**, servie par GitHub Pages depuis la même origine que l'app. Le
workflow la récupère d'un asset de Release, la dépose dans le payload, et refuse
de déployer si elle n'y est pas à l'octet près. Les 94 Mo n'entrent jamais dans
git.

## 9.2 Le déploiement, avec ses horodatages

Commit `ce6cfcc`, run **33490777710**, `success` à **09h11m33 UTC**. Ses deux
portes, verbatim :

```
Basemap: israel-20260831-z14.pmtiles staged into the Pages payload at
94268129 bytes — this build carries the NATIONAL archive on its own origin.

Basemap gate: the bundle asks for the NATIONAL archive israel-20260831-z14.pmtiles,
and it is in the artefact at 94268129 bytes with the PMTiles magic. Passed.
```

## 9.3 ⭐ LES CURLS SUR LE SERVI — VOTRE CONDITION DE CLÔTURE

`curl https://azmer-fts.github.io/lo-yanum/` :

```
src="./assets/index-CeseSHSi.js"
```

`curl` de ce bundle (1 624 212 octets, sha256 `fb2ec1eccaf6…`) :

```
grep -o -i negev  | wc -l  ->  0
grep -o -i israel | wc -l  ->  1
```

**`negev` : ZÉRO. `israel` : UN.** L'inverse exact de ce que vous aviez mesuré
il y a deux heures. Et l'occurrence, en clair :

```js
const iS="israel-20260831-z14.pmtiles",
      h6 = typeof document>"u" ? `./basemap/${iS}`
                               : new URL(`basemap/${iS}`, document.baseURI).toString()
```

Et l'archive elle-même, servie :

```
HEAD …/lo-yanum/basemap/israel-20260831-z14.pmtiles
HTTP/2 200
content-type: application/octet-stream
access-control-allow-origin: *
accept-ranges: bytes
content-length: 94268129          ← 94,3 Mo, la carte de tout le pays

Range: bytes=0-16383
HTTP/2 206
content-range: bytes 0-16383/94268129
magic: PMTiles
```

## 9.4 Le navigateur réel, profil vierge, sur le DÉPLOYÉ

Chromium neuf — aucun cache, aucun service worker, aucun IndexedDB — pointé sur
`https://azmer-fts.github.io/lo-yanum/` :

```
bundle servi : ./assets/index-CeseSHSi.js
écran        : לא ינום | הִנֵּה לֹא יָנוּם וְלֹא יִישָׁן שׁוֹמֵר יִשְׂרָאֵל | כניסה למערכת
requête pmtiles depuis la page :
  url          https://azmer-fts.github.io/lo-yanum/basemap/israel-20260831-z14.pmtiles
  status       206
  contentRange bytes 0-16383/94268129
  magic        PMTiles
```

⚠️ **Une seule chose ne peut pas être à ce rapport, et c'est la même que
d'habitude** : l'écran הגדרות du site déployé est derrière la porte de
connexion, dont vous seul avez tapé le mot de passe. Aucune session ne peut s'y
connecter et aucune ne doit pouvoir. Ce que je peux prouver sur le déployé —
le bundle, la constante, l'archive, le 206, les 94 268 129 octets — est
ci-dessus. **Ouvrez הגדרות : le fichier doit s'appeler
`israel-20260831-z14.pmtiles` et le bouton annoncer 94,3 MB.**

## 9.5 Et les quatre preuves navigateur, elles, sont vertes

`bun run ground`, profil vierge, sur un build portant les mêmes entrées de fond
de carte — **et la porte tourne désormais à chaque déploiement** :

```
PROOF 1  l'URL qui part vraiment ............ israel-20260831-z14.pmtiles
PROOF 2  206, longueur totale sur le fil .... 94268129 (94.3 MB)
PROOF 3  l'écran הגדרות ..................... "רענון מפות לא מקוונות (94.3 MB)"
PROOF 4  חיפה (Haïfa) dessinée ..... z12: 986 features / 549 routes
                                     z13: 1668 features / 1163 routes
                                     z14: 1870 features / 1614 routes
VERDICT  11 passed, 0 failed
```

**Haïfa a 1 614 routes sous elle à z14.** Elle en avait zéro ce matin. Captures
dans l'artefact `basemap-proofs` du run et dans `docs/screenshots/basemap/`.

Et le hors-ligne, `bun run offline`, **21/21** : l'archive répond à une requête
Range **sans aucun réseau**, et Beer Sheva *et* Haïfa ont du sol sous elles
hors ligne.

## 9.6 Deux vrais bugs trouvés en chemin, et ils vous concernaient

Ni l'un ni l'autre n'aurait été vu en lisant le code — les portes les ont
attrapés :

1. **Le service worker ne reconnaissait le fond de carte que par l'hôte
   Supabase.** En même origine il retombait dans le cache de coquille — et
   `cache.put()` refuse un `206`. Toutes vos requêtes de plage hors ligne
   auraient échoué. Corrigé, et l'ancienne branche est conservée pour un
   appareil qui détient encore l'ancienne archive.
2. **Le garde-fou anti-troncature était désactivé sans que rien ne le dise.**
   Le téléchargement lisait la taille attendue dans un en-tête que le nouveau
   flux n'envoie pas, et retombait à 0 : plus de pourcentage sur le bouton, et
   surtout une archive à moitié téléchargée aurait été déclarée « détenue ».
   En clair : une carte qui se dit prête et qui échoue sur le terrain. Corrigé.

## 9.7 L'extrait `negev` n'est toujours pas supprimé du bucket

Vos quatre preuves sont vertes, donc votre condition est remplie — mais je ne
supprime rien sans que vous le disiez maintenant que le contexte a changé :
l'app n'en dépend plus du tout, et la porte refuse désormais tout build qui ne
demande pas l'archive nationale. **Dites-le et je le supprime**, ou laissez-le :
il ne coûte que 42 Mo et ne peut plus être servi par erreur.

---

# 10. LE FICHIER N'A JAMAIS ÉTÉ CORROMPU — C'EST L'HÔTE QUI LE COMPRESSAIT

Vos deux anomalies et les trous à fort zoom ont **une seule cause**, et ce
n'est ni l'archive, ni le réseau, ni un téléversement raté.

## 10.1 D'abord, ce qui est éliminé — mesuré, pas supposé

Le fichier servi est **identique octet pour octet** à celui généré ici :

```
sha256 local   c7265232b57eb2d6c52978e070e9f43d348b122191ee8d0285b65f630a4263cb
sha256 serveur c7265232b57eb2d6c52978e070e9f43d348b122191ee8d0285b65f630a4263cb
                                              (94 268 129 octets, téléchargés en entier)
```

Et l'archive elle-même est saine. En-tête PMTiles décodé :

```
magic PMTiles · version 3 · zooms 0 → 14 · 24 519 tuiles adressées
emprise  34,20 → 36,00 E   /   29,35 → 33,45 N     (tout le pays)
fin des données tuiles  44 016 + 94 224 113 = 94 268 129   ← exactement la taille
couches  boundaries, buildings, earth, landcover, landuse, places, pois, roads, water
```

Tuiles décodées **depuis le serveur**, comparées octet pour octet au local :

| ville | zoom | offset | octets | MVT décompressé | identique au serveur |
|---|---|---|---|---|---|
| ירושלים Jérusalem | z14 | 64 777 443 | 79 256 | 116 877 o, 7 couches | **OUI** |
| חיפה Haïfa | z13 | 44 565 355 | 81 174 | 106 869 o, 8 couches | **OUI** |
| אילת Eilat | z12 | 12 587 636 | 33 536 | 43 826 o, 8 couches | **OUI** |
| תל אביב Tel-Aviv | z14 | 86 786 817 | 45 252 | 64 722 o | **OUI** |
| באר שבע Beer-Sheva | z14 | 55 201 416 | 58 038 | 80 967 o | **OUI** |

**Aucun re-téléversement n'était nécessaire, et 175 Mo n'a jamais été la bonne
attente** : l'extrait national z14 pèse 94 268 129 octets, soit 94,3 Mo. C'est
le chiffre inscrit dans les portes depuis hier, et il est juste.

## 10.2 La cause : un seul en-tête de réponse

GitHub Pages est derrière Fastly, et Fastly compresse **selon le type MIME**.
Une extension inconnue — `.pmtiles` — est servie `application/octet-stream`,
et ce type est dans la liste des types compressés :

```
Accept-Encoding: identity  →  200, content-length: 94268129
Accept-Encoding: gzip      →  200, content-encoding: gzip,
                                   content-length: 93926002     ← 93,9 Mo
```

**Un navigateur envoie toujours la seconde forme.** `Accept-Encoding` est un
en-tête interdit dans `fetch` : ni la page ni le service worker ne peuvent
demander `identity`. Et voici ce que cela fait à une requête de plage :

```
Range: bytes=64777443-64856698        (la tuile Jérusalem z14, exactement)
→ 206  content-range: bytes 64777443-64856698/93926002     ← /93926002
→ le corps est une tranche du FLUX GZIP, pas de l'archive
→ le client tente de décompresser un fragment qui n'est pas un flux gzip
→ « incorrect header check » — la tuile n'arrive jamais.
```

Le dénominateur est la preuve : **la plage est appliquée à l'objet compressé.**
PMTiles calcule chacun de ses décalages sur le fichier *non* compressé, donc
toutes les lectures après la première visaient les mauvais octets.

## 10.3 Pourquoi la carte semblait *presque* correcte

C'est ce qui a rendu ce défaut si difficile à voir. La seule plage qui survit
est celle qui commence à l'octet 0 — un flux gzip tronqué se décode quand même
depuis son propre début — et les octets 0…16383 sont exactement **l'en-tête, le
répertoire racine et les métadonnées**.

D'où : l'archive s'identifiait correctement, l'app nommait le bon fichier,
chaque `curl` depuis un terminal passait (curl n'envoie aucun `Accept-Encoding`
sauf si on le lui demande), toutes les portes étaient vertes — **et les zooms
profonds, dont les tuiles vivent loin dans le fichier, revenaient vides.**
Jérusalem dessinée à z11 et blanche à z14, ce n'est pas une archive corrompue :
c'est cela, et rien d'autre.

## 10.4 Vos deux anomalies, expliquées à l'octet près

1. **« le serveur annonce 93,9 Mo »** — 93 926 002 octets est la longueur
   **compressée**. C'est ce que le HEAD annonçait et ce que le bouton affichait.
2. **« reçus 94,3 > annoncés 93,9 »** — le flux se décompresse en 94 268 129
   octets, la vraie taille. Le compteur mesurait les octets **décodés** contre
   un plafond **compressé**, donc il le dépassait, le garde-fou anti-troncature
   se déclenchait, et **un téléchargement parfaitement complet était supprimé et
   annoncé comme coupé.**

## 10.5 Le correctif

Pages n'offre ni fichier `_headers`, ni `.htaccess`, ni configuration par
fichier : **l'extension EST le type MIME, et le type MIME EST la décision de
compression.** Mesuré sur cet hôte, le même jour :

| type servi | compressé ? |
|---|---|
| `image/png` | **non** |
| `font/woff2` | **non** |
| `application/pdf` | **non** |
| `application/octet-stream` | oui |
| texte, javascript, json, svg+xml | oui |

L'objet servi s'appelle donc désormais **`israel-20260831-z14.pmtiles.png`**.
Mêmes octets, même *release asset*, renommé au moment de la mise en place. Le
vrai nom reste devant le suffixe pour que rien ne soit caché : **c'est ce que
l'écran הגדרות affichera, tel quel.**

## 10.6 Et les gardes qui l'ont laissé passer sont fermés

* Le service worker ne compare plus les octets reçus à un `content-length`
  placé sous un `content-encoding` ; **court est un échec, long ne l'est pas** —
  un flux qui livre plus que l'annonce ne peut pas être tronqué.
* Puis il demande **à l'archive** si elle est entière, au lieu de le demander
  aux en-têtes : magie, version, et la fin des données tuiles déclarée par son
  propre en-tête comparée à la taille stockée. Deux `content-length` ont été
  pris à mentir sur ce fichier précis ; l'en-tête PMTiles, lui, ne peut pas.
  Nouveau verdict `corrupt`, avec son texte hébreu.
* `bun run ground` **échoue sur tout `content-encoding`** sur une réponse de
  fond de carte, et sa quatrième preuve couvre huit couples lieu/zoom, dont
  **Jérusalem z14 et z16** — la tuile qui était vide sur votre écran.
* Le déploiement a une **nouvelle étape, après la mise en ligne**, qui
  interroge l'URL réelle comme le fait un navigateur : aucun `content-encoding`,
  longueur exacte, une plage au **milieu** du fichier dont le dénominateur est
  la vraie taille, et ces octets-là décompressés en la tuile Jérusalem z14.
  **Rien qui s'exécute avant un déploiement n'aurait pu voir ce défaut.**

## 10.7 Les preuves, sur le site déployé

Sur l'URL réelle, demandée comme un navigateur la demande :

```
HEAD  Accept-Encoding: gzip, deflate, br, zstd
  200 · content-type: image/png · content-length: 94268129
      · accept-ranges: bytes · access-control-allow-origin: *
      · AUCUN content-encoding

Range bytes=64777443-64856698 (tuile Jérusalem z14), même Accept-Encoding
  206 · content-range: bytes 64777443-64856698/94268129
      · 79 256 octets reçus, identiques à la tuile locale
      · gunzip → 116 877 octets de MVT valide
```

`bun run ground`, **profil vierge, contre l'archive déployée**, 17/17 :

```
PROOF 1  une seule archive demandée .... israel-20260831-z14.pmtiles.png
PROOF 2  206 · total sur le fil ........ 94 268 129 (94,3 MB)
         ★★ aucun ré-encodage .......... aucun content-encoding
PROOF 3  écran הגדרות .................. « רענון מפות לא מקוונות (94.3 MB) »
PROOF 4  ירושלים z14 ... 2 511 routes    ירושלים z16 ...   276 routes
         חיפה z12 ......   549 routes    חיפה z13 ...... 1 163 routes
         חיפה z14 ..... 1 614 routes     אילת z12 ......   121 routes
         תל אביב z14 .. 2 073 routes     באר שבע z14 ... 1 757 routes
```

Et le **téléchargement complet**, tapé à la main sur l'archive déployée, dans
un navigateur vierge — capture `deployed-download-complete.png` :

```
שמורה במכשיר · israel-20260831-z14.pmtiles.png · 94.3 MB
הניסיון האחרון : הצליח — 94.3 MB נשמרו
```

Là où le même écran disait ce matin « ההורדה נקטעה — התקבלו 94.3 מתוך 93.9 MB ».

---

# 11. VOS DEUX DEMANDES CARTE

## 11.1 A — Les frontières

Protomaps livre deux couches de limites et ce sont des chuchotements : 0,7 px
pour une frontière nationale, 0,4 px en dessous, dans le même gris qu'une voie
de service, avec le même pointillé. Une frontière dessinée comme une allée est
une frontière qu'on ne voit pas.

**La distinction que vous demandiez est dans les données** — je ne l'ai pas
inventée. En décodant la couche `boundaries` de l'archive autour de Jérusalem,
de la vallée du Jourdain et de la ligne sud, de z8 à z14 :

```
kind         country | region | county | locality
kind_detail  2 | 4 | 5 | 6 | 8            (le admin_level d'OSM)
disputed     true — et seulement sur certaines
```

Donc trois énoncés, dans le vocabulaire d'OSM lui-même :

| ligne | rendu |
|---|---|
| frontière internationale établie | **pleine**, le trait le plus épais du fond de carte |
| ligne contestée / armistice | **tirets**, à la **même** épaisseur — importance égale, statut explicitement différent |
| région, district, localité | fin, finement pointillé, discret |

De l'**encre**, jamais une couleur de zone : `--zone-boundary` veut dire « le
bord d'une ferme avec laquelle on travaille », une ligne administrative est un
autre type d'énoncé, et les deux ne doivent pas être confondables d'un coup
d'œil. Vos propres tracés restent les seules choses saturées de la carte, et
ils sont toujours peints **par-dessus** tout ceci.

Chaque ligne a son **propre halo** — MapLibre n'a pas de halo de ligne, donc
c'est une seconde ligne plus large dessous, dans la couleur de la page. Sans
lui, une frontière qui traverse la Méditerranée, une zone bâtie et du sable nu
change trois fois de contraste sur sa longueur.

⚠️ La première version s'est trompée là-dessus et la capture l'a montrée : un
halo **plein** sous une ligne en tirets transformait la ligne d'armistice en
trait **noir plein** avec des tirets blancs découpés dedans, sur l'imagerie.
Les creux d'un pointillé doivent laisser voir le sol. Chaque halo porte
maintenant le même motif, et les nombres sont divisés par le facteur
d'élargissement, parce qu'un `dasharray` se mesure en largeurs de trait et non
en pixels.

Captures : `borders-national.png`, `borders-light.png`, `borders-dark.png`.

## 11.2 B — La couche satellite, et **la vérification que vous aviez demandée**

Le bouton « מפה / לוויין » est en haut à gauche de chaque carte pilotable.

⚠️ **Ce n'est pas Esri, et c'est précisément parce que vous m'avez demandé de
vérifier les conditions.** Vérifié le 01/09/2026 :

* `server.arcgisonline.com/.../World_Imagery` répond de façon anonyme, envoie
  bien les en-têtes CORS, et offre du sub-métrique jusqu'à z17+ — mesuré.
* **Mais son propre descriptif de service ne porte aucun champ de licence**, et
  la position publiée d'Esri est que ce service relève de leurs conditions
  d'utilisation, exige une licence ArcGIS Online ou Enterprise, et **exclut
  l'usage commercial**.

Ce n'est pas une licence que je peux m'accorder à votre place. La couche
livrée est donc **Sentinel-2 cloudless d'EOX, millésime 2016 : CC BY 4.0** —
une vraie licence nommée, permissive, avec une seule obligation, l'attribution,
qui est désormais affichée par la carte elle-même :

> © OpenStreetMap | Sentinel-2 cloudless by EOX IT Services GmbH
> (Contains modified Copernicus Sentinel data 2016) — CC BY 4.0

**Esri est écrit dans le fichier, complet, à un mot de la bascule** si vous
acceptez ces conditions. C'est votre décision, elle est posée devant vous.

⚠️ **Et sa limite réelle, dite plutôt que cachée** : Sentinel-2, c'est 10 m par
pixel. Le service répond à une requête z17, mais avec 3,7 ko de flou
sur-échantillonné contre 24 ko de vrai détail chez Esri — mesuré, même tuile.
La source est donc plafonnée à z14 et MapLibre agrandit visiblement au-delà :
l'opérateur voit l'image devenir molle plutôt qu'on ne lui montre une netteté
inventée. Vergers, oueds, sol nu, lisières bâties et pistes se lisent
parfaitement à z13–14 — l'échelle à laquelle l'imagerie répond à « à quoi
ressemble le terrain autour de cette ferme ». Pour « qu'y a-t-il dans cette
cour », il faut Esri ou un fournisseur à clé.

Sur la photo, les couches de sol sont retirées et **l'orientation est
conservée** : routes, noms de lieux, noms de routes et les frontières, en blanc
sur halo sombre — l'encre de l'app disparaît dans un verger, un toit et de la
roche dans la même image. Les POI sont volontairement absents : ce sont **vos**
marqueurs qui doivent gagner.

⚠️ **EN LIGNE UNIQUEMENT, et le contrôle s'en charge lui-même.** Hors ligne, le
bouton לוויין est **désactivé** et dit pourquoi — « לוויין זמין רק בחיבור » — et
une carte **déjà** en mode satellite **retombe toute seule** sur l'archive
vectorielle nationale. Sinon un coordinateur qui bascule dans la cour et sort
de couverture se retrouve avec un rectangle noir et ses marqueurs dessus.

Captures : `satellite.png`, `satellite-offline-fallback.png`.

## 11.3 La porte

`bun run backdrop` (A84), **dans le déploiement**, 19 vérifications. Elle
refuse la présence d'une couche comme preuve — une couche peut être présente,
correctement filtrée et invisible, ce qui est exactement ce qu'était le trait
de 0,4 px de Protomaps. Tout y est soit interrogé sur ce que MapLibre a
réellement **rendu**, soit observé sur le réseau, soit lu dans le DOM du
contrôle. Son unique avertissement non bloquant est « le serveur d'un tiers ne
répond pas », jamais « cette app est cassée », et la distinction est écrite
dans le fichier.

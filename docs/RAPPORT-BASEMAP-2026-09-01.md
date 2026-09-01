# Fond de carte — rapport du 2026-09-01

**Verdict : le bug est OUVERT.** Vos quatre preuves ne sont pas au rapport, et
elles ne peuvent pas y être aujourd'hui. Voici pourquoi, mesuré et non plaidé.

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

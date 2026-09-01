# Fond de carte — rapport du 2026-09-01

**Verdict : le bug est OUVERT.** Vos quatre preuves ne sont pas au rapport, et
elles ne peuvent pas y être aujourd'hui. Voici pourquoi, mesuré et non plaidé.

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

## 6. ⛔ La manipulation à faire — une ligne, une minute, et elle est à vous

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

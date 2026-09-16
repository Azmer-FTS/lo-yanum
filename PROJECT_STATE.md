# PROJECT_STATE — Lo Yanum (לא ינום)

> Fichier de reprise. Une session neuve, sans mémoire de la conversation, doit
> pouvoir repartir d'ici sans poser de question. Le récit complet des décisions
> est dans `ETAT.md`, en tête (la passe la plus récente est la première).

## Où en est-on

- **Branche** : `main`. **Dernier commit** : voir `git log --oneline -1`
  (passe **AJ**, 2026-09-15).
- **Passe AK TERMINÉE** (2026-09-16) — reprise des données, typologie,
  formulaire calqué, documents bloquants, carte, archivage, signature à
  l'export. Dernier commit : `02f7928`. **Les deux URLs servent `02f7928`.**
  Tableau : section « AK » plus bas.
- **Passe précédente** : AJ — AJ0 « la version installée ne se met jamais à
  jour » (bloquant, traité en premier). **Correctif livré et poussé**
  (`f94c32a`) ; `ajupdate` 38/38 en local ; **sur le déployé 11/11** avec un
  vrai déploiement pendant que l'app restait ouverte (`ETAT.md` §AJ0.4).
- **Déployé** : les deux URLs, même commit.
  - App réelle : https://azmer-fts.github.io/lo-yanum/
  - Jumeau de démonstration : https://azmer-fts.github.io/lo-yanum/demo/
  - Le commit servi se lit dans `version.json` à la racine de chacune, et dans
    l'app : הגדרות › נתונים › « גרסת האפליקציה ».

## La commande pour reprendre

```bash
cd "/Users/clyoapple/Desktop/CLAUDE PROJECT/LO YANOUM"
bun install
lsof -nP -iTCP -sTCP:LISTEN | grep -E '519[0-9]|53[0-9][0-9]'   # aucun preview oublié
bun run typecheck && bun run akpass && bun run akui && bun run akmap && bun run accept
```

## Ce qui est fait dans AK

| Bloc | État |
|---|---|
| AK2 modèle | ✅ `farm_type` + `unknown` (migration `20260916000100`, appliquée sur prod) ; nature = deux cases חקלאות · מרעה sur `type` ; entités + מושב שיתופי, חברה בע״מ ; `guardedDunamsOf` → `number \| null`, plus de recopie (AK1.6 remplace AC3) |
| AK1 données | ✅ 15 fiches `farm-ak1-01…15` insérées sur `lo-yanum-prod` après le déploiement de `2945841` ; relues et repassées : `bun run akdata check docs/ak/ak1-prod-rows.json` 15/15 ; 6 positionnées ; pondéré 2 160 |
| AK3 formulaire | ✅ `AssociationFormModal` : libellés/ordre/gras/sauts de ligne/encadré (encadré tiré du gabarit, `**gras**` dans le gabarit ET le PDF) ; ת״ז et נייד `inputmode=numeric` ; pas de liste de lieux |
| AK4 ouverture | ✅ bandeau « הסכם התנדבות- ארצנו » en tête de fiche (état, document précédent, bouton) ; `Modal` : focus piégé, croix, Échap, geste ; `bun run akui` 75/75 |
| AK5 documents | ✅ `awaitingDocuments` / `closureBlocked` / `allowedStatus` (core/documents.ts) ; « פעילה » refusée à l'écran, dans `updateFarm`/`createFarm`/import ; bande « ממתין למסמכים » permanente dans le bandeau de fiche ; file « ממתינות / למסמכים » 2ᵉ vignette (après נשכחו) ; compte rendu : חתומות עם מסמכים / הממתינות ; `akpass` 30/30, `akui` A202 |
| Déploiement `0d2b506` | ❌ porte `agreement` (build réel) : le bandeau ajoute un 2ᵉ `agreement-view` ; porte re-ciblée (hors `farm-paper`), rejouée en local 18/18 |
| Déploiement `e8660ef` | ✅ servi sur les deux URLs (AK3 · AK4 · AK5) |
| AK6 carte | ✅ CAUSE MESURÉE : événement `offline` → `MapTools.applyConnectivity` → `onBase('vector')` → `writeStoredBase('vector')` (+ `readStoredBase` filtrait par `navigator.onLine` au lancement). Correctif : plus aucune écriture automatique, bande `map-imagery-notice` (hors ligne / tuiles en échec), reprise des tuiles satellite. `akmap` ROUGE 15/11 (`dist-ak6-before`) → VERT 26/0 ; `backdrop` réécrite 38/38. Logs `docs/ak/ak6-*.log` |
| AK7 archivage | ✅ `archivedAt` + `archiveReason` (migration `20260916000200`, appliquée sur prod) ; `archiveFarm`/`unarchiveFarm` ne touchent QUE `data.farms` ; `getVisibleFarms` retire les archivées (listes, carte, zones, postes, compteurs, objectif, compte rendu), `getFarm` les ouvre encore, `getFarmsForImport` les donne à l'import (pas de doublon, pas de désarchivage, rapport « עודכנו ונשארו בארכיון ») ; `akpass` 43/43, `akui` A204 ; `persist` 109/109 (les deux mutations y sont conduites) ; porte A152 corrigée (clés au pluriel) |
| AK8 signature | ✅ le générateur xlsx maison écrit une PIÈCE image (`xl/media`, `drawing1.xml`, `twoCellAnchor editAs="oneCell"`) ancrée à la cellule de חתימה ; la cellule porte le `data:` (format `;;;` : rien ne s'affiche par-dessus) que le ré-import relit ; CSV idem ; `compactSignatures` redessine la signature sous 30 000 caractères (plafond Excel 32 767) sans toucher la fiche ; aller-retour vérifié (akpass A206) et fichiers téléchargés inspectés (akui) |
| AK9 | ✅ 30 captures du déployé (clair/sombre × iPad, iPad paysage, iPhone) + A202 mesurée 3/3 viewports sur le bundle servi ; ETAT.md en tête ; `uipass` 41/41 et `aitheme` 18/18 sur le déployé ; rouge d'avant la passe dans `docs/ak/ak-rouge-avant-akui.log` |

Décisions AK posées : (1) `type` reste la seule vérité de la nature, 'unknown' = rien coché ;
(2) שטחים שמירה = déclaré ou vide, jamais מעובד + מרעה (les portes AC/AD réécrites, pas supprimées) ;
(3) une fiche sans position n'a pas d'épingle (listes et compteurs oui) ;
(4) libellés de statut alignés sur l'association : טרם נוצר קשר · מוכן לחתימה · נחתם ;
(5) « פעילה » = la fiche achevée ; refusée tant que `awaitingDocuments` (transition bloquée, jamais de rétrogradation) ;
(6) le fond de carte choisi n'est écrit QUE par le geste du PO sur le bouton ; hors ligne la carte le DIT, elle ne bascule pas.

## Ce qui est fait dans AJ

| Bloc | État |
|---|---|
| AJ0.1 mesure | ✅ hypothèse « worker en attente » DÉMENTIE : `sw.js` identique entre déploiements + `skipWaiting` → jamais de `waiting` ; cause = une app reprise ne navigue pas et rien ne demandait ; Pages `max-age=600` ; écran des cartes lisait le contrôleur une seule fois |
| AJ0.2 retour en avant-plan | ✅ `ui/update.ts` (`startUpdateWatcher` dans `main.tsx`) lit `version.json` à chaque retour |
| AJ0.3 bandeau + bouton | ✅ `UpdateBanner` ; active le worker entrant puis recharge ; vérifie après coup |
| AJ0.4 version dans les réglages | ✅ `AppVersionSection` (groupe נתונים, en dernier) |
| AJ0.5 cartes depuis l'app installée | ✅ `useOfflineMaps` écoute `controllerchange`/`ready` ; bouton « הפעלה עכשיו » |
| AJ0.6 rouge avant | ✅ `DIST_A=dist-aj-before bun run ajupdate` : 2 PASS / 16 FAIL |
| AJ0.7 A189–A191 | ✅ local 38/38 (WebKit + Chromium) ; déployé 11/11 (`f94c32a` → `6e538ee`, app jamais fermée) |

## Décisions permanentes posées par AJ

1. **La version est une identité de build, pas un fichier de service worker.**
   `__BUILD_ID__` (bundle) contre `version.json` (servi). `sw.js` ne porte
   PAS l'identifiant et `SHELL_CACHE` ne change PAS de nom par build : un
   worker qui supprime l'ancien cache à l'activation casserait l'app hors
   ligne jusqu'au prochain chargement en ligne.
2. **La question « y a-t-il une nouvelle version » est posée par UN
   contrôleur démarré dans `main.tsx`**, à chaque retour en avant-plan —
   jamais par un composant.
3. **Appliquer = worker entrant amené à `activated`, puis rechargement, puis
   VÉRIFICATION** du bundle qui tourne contre la cible écrite avant. Un échec
   se dit (« העדכון לא נקלט »).
4. **Les navigations du worker contournent le cache HTTP** (`cache:
   'no-cache'`) : Pages sert `max-age=600`.
5. **Un état du service worker lu par un écran est réécouté**
   (`controllerchange`), jamais lu une seule fois au montage.
6. **`version.json` est lu en `no-store` + paramètre**, jamais depuis un cache.

## Décisions permanentes posées par AI (toujours valables)

1. ⛔ **Aucun calculateur d'itinéraire externe.** Le tracé vient de la couche
   `roads` de l'archive PMTiles embarquée. A179 observe le trafic.
2. **Le thème est appliqué par UN contrôleur démarré dans `main.tsx`**
   (`startThemeController`), jamais par un composant. `useTheme` ne fait que
   lire/écrire le choix.
3. **Le rattachement d'un point exige une composante FORTEMENT connexe**
   (pas seulement connexe) ; les bouts pendants à < 5 m sont reliés
   (`repairJunctions`) ; l'élargissement d'un couloir est borné à 160 tuiles.
4. **Le module de tracé est importé statiquement** : le service worker ne
   met en cache que ce qui a été chargé en ligne ; un `import()` paresseux
   échouait hors ligne.
5. **Les vitesses sont des constantes nommées dans `core/roadGraph.ts`** ; la
   piste roule à 20 km/h ; la marge (15 %, `ROUTE_MARGIN_INITIAL`) ne
   s'applique qu'au roulage.
6. **La suppression des données d'exemple vise `demo-` ET `test-`, passe
   directement par le serveur et RECOMPTE le serveur** ; jamais par la file
   d'envoi.
7. **Un champ de collage de liens est un `<textarea>`** (un `<input>` supprime
   les retours à la ligne) ; il ne se vide que de ce qu'il a su lire.
8. Les décisions permanentes d'AH restent valables (voir `ETAT.md`, passe AH),
   sauf la n°8 : le lecteur accepte désormais DEUX décimales.

## Les portes

```bash
# Pures
bun run akpass akdata                                 # AK : règles, et les 15 fiches
bun run akdata check docs/ak/ak1-prod-rows.json       # ce que la BASE a rendu
bun run accept dispatch persist mapping report deletion sync contrast
bun run aipass ahpass afpass agpass acpass assoc     # aipass lit basemap/*.pmtiles

# Navigateur, build local
bun run akui                                          # A196–A206, WebKit + Chromium (~8 min)
bun run akmap                                         # A203 ; DIST=dist-ak6-before SKIP_BUILD=1 = le ROUGE
bun run ajupdate                                      # A189–A191, deux builds A/B, WebKit + Chromium (~6 min)
DIST_A=dist-aj-before SKIP_DOWNLOAD=1 bun run ajupdate  # le ROUGE : `vite build --outDir dist-aj-before` sur ddd1fba
bun run offline                                       # 21 + SKIP ; vérifier d'abord qu'aucun preview ne tient 5197
bun run airoute aisettings aitheme ahroute ahsettings
VIEWPORT=all bun run layout                           # exige `vite --port 5173`

# Build RÉEL + fausse base
VITE_SUPABASE_URL=https://fake.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=x \
  bun x vite build --outDir dist-aireal
BASE_URL=http://localhost:5197 bun run demo zones agreement

# Le déployé
FROM=<commit servi> bun run scripts/ajdeployed.ts     # garde l'app ouverte, attend le déploiement SUIVANT
BASE_URL=https://azmer-fts.github.io/lo-yanum/ bun run aitheme
BASE_URL=https://azmer-fts.github.io/lo-yanum/demo bun run aisettings
bun run aicaptures
bun run akcaptures                                    # 30 captures + A202 mesurée sur le servi
```

## Échecs PRÉ-EXISTANTS, qui ne sont pas des régressions

- **`bun run afui` : 6 rouges** (A131 ×3 : la porte attend une barre
  `sticky` qu'AH2 a rendue `fixed` ; A138 ×3 : la bascule de rôle est dans un
  bloc replié depuis AH12) et **`bun run settings` : A54** (même cause).
  Vérifiés IDENTIQUES sur le commit 9451de3 (avant AI) dans un arbre séparé.

- **`bun run tokens` : 10 violations.** A28 (un `rounded-full`), A57 (six
  contours pleins sur des cartes), A29 (trois emplois d'`critical` hors liste).
  Elles précèdent AH ; mesuré sur le build d'avant.
- **`bun run write` en échec et `bun run offline` 19+SKIP** restent les
  résultats VERTS (voir `ETAT.md` §13) : il n'existe pas de compte de test sur
  cette machine.
- Les deux violations A57 de `AnchorMap.tsx` signalées en §36.6 ont été
  corrigées en U4 ; celles qui restent sont ailleurs.

## Questions ouvertes / ce qui attend le PO

0bis. **AK — les quinze fiches sont dans la base réelle.** Elles n'ont ni
   יישוב ni contour, et neuf n'ont pas de position : le formulaire de ferme
   EXIGE un יישוב et une épingle (règle A37, antérieure à AK), donc la première
   modification de l'une d'elles demandera ces deux valeurs. C'est voulu — une
   ferme sans épingle n'existe nulle part sur la carte — mais il faut le savoir
   avant d'ouvrir la première fiche.

0ter. **Les trois fiches « נחתם » n'ont pas encore de document DANS l'app** :
   leur signature est sur le papier de l'association. Le bandeau de leur fiche
   dit donc « טרם נחתם » tant que le PO ne les fait pas signer dans la fenêtre
   « הסכם התנדבות- ארצנו ». Les quinze sont « ממתינות למסמכים » : aucun document
   de droit sur la terre n'est encore reçu.

0. **AJ — sur SON iPad** : la première mise à jour vers `f94c32a` ne peut pas
   s'annoncer toute seule (l'ancienne version n'a pas le bandeau). Il faut UNE
   dernière fois fermer l'app (balayer dans le sélecteur d'apps) et la
   rouvrir ; ensuite « גרסת האפליקציה » dans הגדרות dit la version, et les
   suivantes arrivent par le bandeau. Le mode écran d'accueil iOS réel n'a pas
   été mesuré ici (simulateur sans accès à l'interface).
1. ✅ **CLOS (2026-09-16).** Plus aucune ligne `test-` ni `demo-` sur
   `lo-yanum-prod` (compté table par table). La base ne porte plus que les
   quinze exploitations d'AK1.
2. **Thème sur la PWA installée (écran d'accueil)** : mesuré dans Safari iPad
   (simulateur iOS 26.3), pas en mode autonome (accès au simulateur non
   accordé). La ligne « המכשיר · הבחירה · מוצג » dans תצוגה dit au PO ce qui se
   passe sur SON iPad.
3. **A177 sur iPad réel non mesuré.** Ici (Mac Intel) : chaud < 90 ms, ajout
   d'une étape < 1 s, froid 1,2–1,9 s pour huit étapes collées d'un coup avec
   départ Jérusalem ; en ligne sans archive téléchargée 2,1–4,1 s.
4. **La Ligne verte** : le tracé peut passer par des localités au-delà (OSM ne
   porte ni zones A/B ni points de contrôle). À décider : accepter, ou fournir
   un polygone d'exclusion.
5. Toujours ouverts depuis AH : va-et-vient réel des réglages sur Frankfurt ;
   mesures d'AG7 ; contrat de l'association non téléversé ; hygiène du dépôt
   (477 images dans `4bbf4c4`).

## Fichiers qui font autorité

- `ETAT.md` — le récit et les décisions, la passe la plus récente en tête.
- `src/core/**` — le domaine : pur, sans DOM ni React.
- `src/ui/**` — le rendu. `src/data/**` — Supabase.
- `scripts/**` — les portes. Une porte est la preuve, pas le commentaire.
- `supabase/migrations/**` — le schéma, additif, une migration par décision.

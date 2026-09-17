# PROJECT_STATE — Lo Yanum (לא ינום)

> Fichier de reprise. Une session neuve, sans mémoire de la conversation, doit
> pouvoir repartir d'ici sans poser de question. Le récit complet des décisions
> est dans `ETAT.md`, en tête (la passe la plus récente est la première).

## Où en est-on

- **Branche** : `main`. **Dernier commit** : voir `git log --oneline -1`
  (passe **AN**, 2026-09-17).
- **Passe AN TERMINÉE** (2026-09-17) — logique d'interface, contradictions,
  régressions. AN1 → AN13 poussés (`a0af144` … `cfb834a` + docs) ; déployé
  `cfb834a` : `anui` 155/155, 36 captures, 0 erreur (`ETAT.md` § AN13).
  Porte : `bun run anui` (A222–A237) + `bun run anpass` ; captures
  `bun run ancaptures`. Rouge d'avant : `DIST=dist-an-before SKIP_BUILD=1 bun
  run anui` (build de 1dacc2c + `basemap/` copié à la main).
- **Passe AM TERMINÉE** (2026-09-16) — le formulaire de ferme repris : יישוב et
  épingle facultatifs, 1 330 localités, personnes en une carte, édition dans
  l'ordre du détail, claviers partout, barre opaque, bandeaux empilés,
  épingles. Tableau : section « AM » juste dessous.
- **Passe AL TERMINÉE** (2026-09-16) — passe de FINITION : la surface gardée se
  propose, le clavier de l'iPad enfin mesuré, la dette `tokens` soldée, la revue
  des neuf écrans. Tableau : section « AL » juste dessous.
- **Passe AK TERMINÉE** (2026-09-16) — reprise des données, typologie,
  formulaire calqué, documents bloquants, carte, archivage, signature à
  l'export. Tableau : section « AK » plus bas.
- **Passe précédente** : AJ — AJ0 « la version installée ne se met jamais à
  jour » (bloquant, traité en premier). **Correctif livré et poussé**
  (`f94c32a`) ; `ajupdate` 38/38 en local ; **sur le déployé 11/11** avec un
  vrai déploiement pendant que l'app restait ouverte (`ETAT.md` §AJ0.4).
- **Déployé** : les deux URLs servent le dernier commit d'AN (`cfb834a` pour le code ; `anui` 155/155). Avant : `c1453d5` (AM) — `amui` 77/77 et 36 captures sur le déployé. Avant AM : les deux URLs servaient le commit d'AL. **Vérifié SUR LE
  DÉPLOYÉ** : `alui` 54/54 (le geste d'AL1 et l'écran de localisation) et
  `alcaptures` 330/330 avec 54 captures
  (`docs/screenshots/alpass/deployed/`).
  - App réelle : https://azmer-fts.github.io/lo-yanum/
  - Jumeau de démonstration : https://azmer-fts.github.io/lo-yanum/demo/
  - Le commit servi se lit dans `version.json` à la racine de chacune, et dans
    l'app : הגדרות › נתונים › « גרסת האפליקציה ».

## Ce qui est fait dans AN

| Bloc | État |
|---|---|
| AN1.1 thème | ⚠️ NON REPRODUIT. PWA autonome installée sur simulateur iPad (iPadOS 26.3) : bascule en direct, retour d'arrière-plan, déverrouillage → suit (captures `docs/an/an1-pwa-*`). Ceinture ajoutée : relecture de `prefers-color-scheme` toutes les 15 s + `resize` (`ui/theme.tsx`) |
| AN1.2 clavier | ✅ **L'iPad n'a PAS de pavé web** : numeric/tel/decimal/type=tel → clavier complet (mesuré). `ui/components/NumericPad.tsx` : iPad seulement, `inputmode=none` au toucher + pavé 3×4. Vu sur le déployé (`docs/an/an1-ipad-DEPLOYE-a0af144-tz-pave.png`) |
| AN1.3 téléphone | ✅ `052-0000049` (carte coordinateur) et `08-0000050` (urgence) retirés ; la carte s'enregistre à la frappe |
| AN2 sans position | ✅ `farmPoint()` (core/geo.ts) partout où une ferme est montrée/reliée ; planificateur : sélectionnable, « מיקום חסר », hors tracé ; import marque enfin `positionMissing` |
| AN2.4 regroupement | ✅ MapCanvas : disque avec le nombre, sur le centre du dessin |
| AN3 route | ✅ `ui/routing/useRoadRoute.ts` partagé (libre + planificateur) ; étapes tracées gardées pendant un recalcul. Agenda / ma journée : aucun tracé (repères seulement) |
| AN4 bordure | ✅ React effaçait `maplibregl-map` (position relative) au passage en plein écran → toile décalée de 12 px ; écrite dans la className (MapCanvas). Double trait carte/rail retiré en mode plein |
| AN5 signature | ✅ bouton « החתמה » (fiche + en-tête d'édition) → fenêtre pleine hauteur, signataire/date inscrits et modifiables sur place, aperçu sans papier vide (`drawAgreementPages(…,{preview:true})`), logo ≤ 46 pt, marges 34 pt. ⚠️ téléphone : corps ≈ 7 px |
| AN6 en-tête | ✅ `farm-edit-sticky` 65 px : photo, ferme, agriculteur, signature |
| AN7 doublons | ✅ « סוג המקום » (une liste, genre déduit) ; « אזור » (liste + אחר) ; « מועצה אזורית » (54 du למ״ס, `core/councils.ts`, `scripts/councils.ts`), remplie par le יישוב, proposée par l'épingle ; `regionOf` tolère 6 km de couture (ערד, כרם שלום, סדום) |
| AN8 dévoilement | ✅ tous les blocs repliables (`FormSection forceOpen` sur erreur) ; תוקף après le type ; date vide « בחירת תאריך » |
| AN9 photo | ✅ `usePhotoPicker` : un input sans `capture` ; avatar de la personne = le bouton. ⚠️ « Take Photo » non visible sur simulateur (pas de caméra) |
| AN10 contact | ✅ contact principal en résumé (nom · portable), ajout juste dessous (`order`) |
| AN11 motif | ✅ page partout : `screens/coordinator/FormPages.tsx` (volontaire, conducteur, visite, rencontre), `Modal presentation="page"`, `state.returnTo` |
| AN12 position | ✅ mesuré : 3 invites iOS au 1er usage, 0 ensuite (même relancé) ; relevé 10 min dans les réglages ; aide « Allow While Using App » après le geste |

Décisions AN posées :
1. **Une fiche sans position n'a pas de point** : toute lecture pour montrer, relier ou mesurer passe par `farmPoint(farm)`. Le repli en base (Jérusalem / NEGEV_CENTER) n'est jamais affiché.
2. **Un clavier se prouve sur un iPad, pas par ses attributs.** Nouveau champ numérique : `TextField kind` suffit, le pavé le prend.
3. **Aucune valeur de contact inventée** dans `config.ts`.
4. **Toute création et toute édition est une PAGE** (adresse, flèche retour
   commune `page-back`), jamais une fenêtre. Les fenêtres : confirmations,
   lectures, signature, signalement d'incident.
5. **Un champ n'existe qu'une fois par vérité** ; une valeur déductible de
   l'adresse (מועצה, région) est remplie par le geste qui choisit le יישוב, ou
   PROPOSÉE depuis l'épingle.
6. **Une personne = une photo (son avatar)** ; le contact principal connu se lit
   en résumé.

## Ce qui est fait dans AM

| Bloc | État |
|---|---|
| AM1 יישוב | ✅ gazetteer 1 330 (Survey + למ״ס `docs/data/cbs-bycode2021.xlsx`, codes + 29 alias ; `bun run scripts/gazetteer.ts`) ; `LocalityField` (proches de l'épingle à vide, 30 propositions tolérantes) ; יישוב ET épingle facultatifs (`positionMissing`) ; suggestion de la localité la plus proche (geste) ; `localityRelation` in/attached (migration `20260916000300`, **appliquée sur prod**) |
| AM2 personnes | ✅ `core/people.ts` : `splitPeople`/`mergePeople` — agriculteur (`farmer*`) + contact principal = UNE carte (nom, נייד, ת״ז, מייל, תפקיד) ; bloc « אנשים » ; ajout sous les cartes. Pas de changement de schéma |
| AM3 ordre | ✅ en-tête · סטטוס ושטחים · פרטים · אנשים · טלפוני חירום ותיק אתר · התחייבויות · הסכמים · הערות, des deux côtés (`data-block-title`) |
| AM4 claviers | ✅ `TextField kind=…` + `kindInputProps` ; `core/phone.ts` ; 16 px pour tout pointeur ; A218 balaie 28 écrans / 136 champs |
| AM5 barre | ✅ interstice 20 px (iPad installé) / 34 px (iPhone) → 0 (`.am-bar-foot::after`) |
| AM6 bandeaux | ✅ `useStackBelow` + `data-top-banner(-float)` ; confirmation de mise à jour 8 s puis lue ; « מסונכרן » sur changement d'état seulement |
| AM7 épingles | ✅ boîte `PIN_BOX` (tête entière), UN contour sombre `#141b26` (le blanc mesuré 1,2:1 et 1,8:1, refusé), pulsation circulaire |
| AM8 portes | ✅ `ampass` 50/50, `amui` 77/77 local ET **sur le déployé `c1453d5`** ; ROUGE avant 22/44 (`docs/am/am-rouge-avant.log`) ; `amcaptures` 36 captures du déployé (`docs/screenshots/ampass/deployed/`) |

Décisions AM posées :
1. **Le יישוב et l'épingle ne sont jamais obligatoires.** Seuls bloquent : un
   nom (n'importe lequel), un numéro/courriel TAPÉ mais impossible, un סמל
   יישוב déjà pris, « פעילה » sans documents. A214 compte cette liste.
2. **Une personne = une carte.** `farmer*` et le contact principal qui lui
   ressemble sont la même carte ; différents, deux cartes. Ne jamais réintroduire
   un second champ pour l'agriculteur ni un bloc « ajouter » au-dessus d'une
   personne connue.
3. **L'édition et le détail ont les mêmes blocs, dans le même ordre, sous les
   mêmes intitulés** ; un bloc ajouté d'un côté s'ajoute de l'autre (A217).
4. **Le clavier est une propriété du champ (`kind`)**, jamais `type="number"`.
   Tout champ neuf passe par `TextField kind` ou `kindInputProps` (A218).
5. **Un bandeau posé en haut porte `data-top-banner`** ; un flottant s'empile
   dessous. Une confirmation de routine ne se répète pas.
6. **La proposition se fait par un geste** (AL1 → AM1.3) : l'app ne remplit
   jamais seule un champ que le PO transmet.

## La commande pour reprendre

```bash
cd "/Users/clyoapple/Desktop/CLAUDE PROJECT/LO YANOUM"
bun install
lsof -nP -iTCP -sTCP:LISTEN | grep -E '519[0-9]|53[0-9][0-9]'   # aucun preview oublié
bun run typecheck && bun run anpass && bun run anui && bun run ampass && bun run alpass && bun run tokens && bun run akpass && bun run accept
```

## Ce qui est fait dans AL

| Bloc | État |
|---|---|
| AL1 surface gardée | ✅ `suggestedGuardedDunams` (core/fields.ts) PROPOSE מעובד + מרעה sous le champ, grisée, avec un bouton de 44 px ; rien n'est écrit sans geste ; une valeur acceptée n'est jamais recalculée ; sans geste la colonne sort vide. **Trou fermé au passage** : « שטחים שמירה » sortait du fichier de l'association et n'y rentrait pas (`parseAssociationRow`) |
| AL2 relief | ⛔ **CLOS, NE PAS ROUVRIR.** Aucun fond relief. A209 le tient (deux valeurs dans `BasemapBase`, aucune source d'élévation dans `src/`) |
| AL3.1 clavier iPad | ✅ **MESURÉ** sur iPad Air 11″ / iPadOS 26.3 / Safari, sur le déployé : ת״ז et נייד ouvrent le clavier numérique, le zéro de tête tient (`021985189`), la mise en forme vit (`(050) 891-2840`), aucun zoom. Captures `docs/al/ipad-reel-*.png`. **La ligne « accès refusé » de AG/AJ/AK ne vaut plus** : `xcrun simctl` répond sans autorisation |
| AL3.2 localisation | ✅ אבחון מיקום en place, une ligne PAR lancement (A210). **Et son bouton de copie mentait** : `CopyButton` disait « הועתק » même quand l'écriture échouait. Deux chemins + échec nommé |
| AL4.1 `tokens` | ✅ **9 violations → 0.** 4 corrigées (radius, 2 contours, l'orange de la ligne « maintenant »), 5 nommées avec leur raison et COMPTÉES (3 cadres de document, 2 écrans d'urgence) |
| AL4.2 rouges de porte | ✅ `settings` A54, `afui` A131 + A138, `pills` A71/A72 : quatre rouges « pré-existants » qui étaient tous des portes périmées, pas des défauts. `settings` 36/36, `afui` 72/72, `pills` 89/89 |
| AL5 revue | ✅ 54 captures du déployé puis du local, neuf écrans × 3 largeurs × clair/sombre. **Le rail de l'iPad : 9 entrées de 39 px à 4 px l'une de l'autre → 44 et 8.** Plus : en-tête de bloc 36→44, menu du téléphone 36→44, flèches du calendrier 28→44, légende 36→44, attribution 40→44, lien Waze 26→44, « ניקוי » 21×16→44, `.btn` (zone tactile via `::before`, l'encre ne bouge pas), `.input` 41→44, pastilles de carrousel. `alcaptures` 330/330 |

Décisions AL posées :
1. **`guardedDunamsOf` répond « que vaut la colonne »** (déclaré, ou rien) et
   c'est la SEULE que lisent l'export, la fiche et le compte rendu.
   **`suggestedGuardedDunams` répond « qu'est-ce que l'app propose »** et son
   unique lecteur est le formulaire. Ne jamais lire la seconde à la place de la
   première.
2. **Trois fichiers seulement posent `guardedDunamsManual`** — le formulaire,
   l'import de prospection, l'import du fichier de l'association — et chacun
   est un geste. A207 le compte.
3. ⛔ **Pas de fond relief.** Tranché, clos.
4. **Une zone tactile peut dépasser l'encre** (`::before`, AA1.1) et c'est le
   chemin par défaut pour atteindre 44 px sans refaire l'arithmétique d'une
   barre. Un `<input>` n'a pas de pseudo-élément : lui seul grandit vraiment.
5. **Une porte qui ne fait pas le geste du PO ne mesure pas ce qu'il voit.**
   Quatre rouges « pré-existants » venaient de là : un bloc non déplié (×2), un
   mot-clé CSS exigé à la place d'une propriété, une rangée défilante sommée de
   tenir entière dans l'écran.
6. **Une correction de finition se mesure avec les ANCIENNES portes aussi.**
   `.scroll-nudge` élargie à 44 px couvrait les pastilles qu'elle fait
   défiler ; ma sonde neuve ne l'a pas vue (elle cherche `fixed`, celle-ci est
   `absolute`), `bun run pills` l'a vue en deux minutes. Reprise à 32.

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
bun run ampass                                        # AM : A212–A216
bun run alpass                                        # AL : A207 · A208 · A209
bun run tokens                                        # zéro violation depuis AL4.1
bun run akpass akdata                                 # AK : règles, et les 15 fiches
bun run akdata check docs/ak/ak1-prod-rows.json       # ce que la BASE a rendu
bun run accept dispatch persist mapping report deletion sync contrast
bun run aipass ahpass afpass agpass acpass assoc     # aipass lit basemap/*.pmtiles

# Navigateur, build local
bun run amui                                          # AM : A212–A221, démo + build réel/base factice (~12 min)
DIST=dist-am-before DIST_REAL=dist-am-before-real SKIP_BUILD=1 bun run amui   # le ROUGE (builds de b7a9a1f) : 22 PASS / 44 FAIL
BASE_URL=https://azmer-fts.github.io/lo-yanum bun run amui                     # le DÉPLOYÉ
bun run alui                                          # AL : A207 · A210, WebKit + Chromium (~6 min)
DIST=dist-al-before SKIP_BUILD=1 bun run alui          # le ROUGE d'AL : 13 PASS / 13 FAIL
bun run alcaptures                                    # AL5 : 54 captures + la sonde des 3 accidents
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
BASE_URL=https://azmer-fts.github.io/lo-yanum/demo bun run alcaptures   # AL5, 54 captures
BASE_URL=https://azmer-fts.github.io/lo-yanum/demo bun run alui         # AL, A207 · A210
```

## Le simulateur iPad (AL3.1) — il RÉPOND, ne plus le reporter

```bash
xcrun simctl list devices available | grep iPad          # un iPad Air 11" reste démarré
UD=<udid>
xcrun simctl openurl $UD "https://azmer-fts.github.io/lo-yanum/demo/#/coordinator/farms/farm-07/edit"
xcrun simctl io $UD screenshot /tmp/x.png                # aucune autorisation demandée
```
Le pilotage (toucher, taper, balayer) passe ensuite par l'outil de simulateur.
⚠️ **Safari y sert un index en cache pendant 10 min** (`max-age=600`, la leçon
d'AJ0.1) : ajouter un paramètre à l'URL (`?al=1`) pour voir le build qui vient
d'être déployé.

## Échecs PRÉ-EXISTANTS, qui ne sont pas des régressions

> **Vérifiés identiques (ou pires) sur b7a9a1f pendant AM** :
> - `adui` A115 : la vignette « לתיחום » (3ᵉ de la rangée défilante des fermes)
>   ne vient pas entière à 1 376 px, même défilée (61 px coupés, un chevron
>   dessus). Défaut réel de la rangée, hors AM ; tâche séparée proposée.
> - `mapfirst` farmer-tonight : « no map found ».
> - `layout` réglages à 390 px : 6,5 écrans avant AM, 6,0 après (plafond 6).
> - **`aeui` A118 · A119 (4 rouges)** : le lien de garde d'un volontaire ne
>   s'ouvre pas sur sa garde dans la démo. **Vu identique sur `1dacc2c` le
>   2026-09-17** (31/4, avant toute modification d'AN) — probablement lié à la
>   date de la garde de démonstration. Non traité dans AN.

> ✅ **AL4 A SOLDÉ TOUTE CETTE SECTION SAUF LES DEUX DERNIÈRES LIGNES.**
> `afui` 72/72, `settings` 36/36, `pills` 89/89, `tokens` 0 violation.
> Les quatre rouges étaient des PORTES périmées, pas des défauts de l'app :
> deux cherchaient une commande dans un bloc replié depuis AH12, une exigeait
> `position: sticky` là où AH2 a délibérément ancré la barre en `fixed`, une
> sommait une rangée défilante de tenir entière dans l'écran. Récit complet :
> `ETAT.md`, passe AL, bloc AL4.

- **`bun run write` en échec et `bun run offline` 19+SKIP** restent les
  résultats VERTS (voir `ETAT.md` §13) : il n'existe pas de compte de test sur
  cette machine.
- Les deux violations A57 de `AnchorMap.tsx` signalées en §36.6 ont été
  corrigées en U4 ; celles qui restent sont ailleurs.

## Questions ouvertes / ce qui attend le PO

0bis. ✅ **CLOS PAR AM.** Le formulaire n'exige plus ni יישוב ni épingle : les
   quinze fiches d'AK1 s'enregistrent telles quelles. Sur celles qui ont une
   épingle, la localité la plus proche est PROPOSÉE (un geste l'accepte).

0ter. **Les trois fiches « נחתם » n'ont pas encore de document DANS l'app** :
   leur signature est sur le papier de l'association. Le bandeau de leur fiche
   dit donc « טרם נחתם » tant que le PO ne les fait pas signer dans la fenêtre
   « הסכם התנדבות- ארצנו ». Les quinze sont « ממתינות למסמכים » : aucun document
   de droit sur la terre n'est encore reçu.

0quater. **AL — la surface gardée des quinze fiches est à COMPLÉTER PAR LUI.**
   L'app propose désormais la somme מעובד + מרעה sous le champ, mais elle
   n'écrit rien : les quinze fiches sortent donc avec la colonne שטחים שמירה
   VIDE tant qu'il n'a pas touché le bouton (ou tapé un autre chiffre) sur
   chacune. C'est voulu — cinq d'entre elles seulement ont une surface, donc le
   bouton n'apparaît que sur celles-là. Vérifié sur la base après la passe :
   aucune des quinze n'a été modifiée (`docs/al/a208-base-reelle.json`).

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
2bis. ✅ **CLOS (AL3.1).** Le clavier d'un iPad RÉEL est mesuré (simulateur
   iPad Air 11″, iPadOS 26.3, Safari, sur le déployé) : ת״ז et נייד ouvrent le
   clavier numérique, le zéro de tête tient, aucun champ ne fait zoomer la
   page. `docs/al/ipad-reel-*.png`. **Le mode écran d'accueil autonome reste
   non mesuré** (le simulateur n'installe pas une PWA) — c'est la ligne 2
   ci-dessus, et elle reste ouverte.

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

# PROJECT_STATE — Lo Yanum (לא ינום)

> Fichier de reprise. Une session neuve, sans mémoire de la conversation, doit
> pouvoir repartir d'ici sans poser de question. Le récit complet des décisions
> est dans `ETAT.md`, en tête (la passe la plus récente est la première).

## Où en est-on

- **Branche** : `main`. **Dernier commit** : voir `git log --oneline -1`
  (fin de la passe **AI**, 2026-09-14).
- **Passe terminée** : AI — tracé sur route hors ligne, saisie des points,
  thème système, écran de réglages, données qui survivaient à la suppression.
  Les dix blocs AI1 → AI10 sont livrés et déployés.
- **Déployé** : les deux URLs, même commit.
  - App réelle : https://azmer-fts.github.io/lo-yanum/
  - Jumeau de démonstration : https://azmer-fts.github.io/lo-yanum/demo/

## La commande pour reprendre

```bash
cd "/Users/clyoapple/Desktop/CLAUDE PROJECT/LO YANOUM"
bun install
bun run typecheck && bun run aipass && bun run accept
```

## Ce qui est fait dans AI

| Bloc | État |
|---|---|
| AI8 données survivantes | ✅ c'était le jeu d'essai `test-` (vérifié en base + journaux) ; `SampleDataSection` : un bouton pour `demo-` ET `test-`, serveur recompté ; A187 dans `bun run demo` |
| AI6 thème | ✅ cause : aucun composant coordinateur n'appliquait le thème après « voir comme » ; `startThemeController` ; A184 `bun run aitheme` 18/18 sur les deux URLs |
| AI5 saisie | ✅ lecteur à 2 décimales, `parsePositionList`, textarea, champ vidé de ce qui est lu ; A180–A183 |
| AI1→AI4 tracé | ✅ `core/roadGraph.ts` + `ui/routing/*` ; aucun service externe ; `aipass` 32, `airoute` 51 |
| AI7 réglages | ✅ barre épinglée + section en cours ; « חיבור » fusionné ; clé `reminders` retirée ; `aisettings` 29 |
| AI9 non-régression AH9 | ✅ `ahroute` 15/15 + glisser-déposer dans `airoute` |
| AI10 | ✅ portes + `bun run aicaptures` sur le déployé |

## Décisions permanentes posées par AI (à ne pas défaire sans raison)

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
bun run accept dispatch persist mapping report deletion sync contrast
bun run aipass ahpass afpass agpass acpass assoc     # aipass lit basemap/*.pmtiles

# Navigateur, build local
bun run airoute aisettings aitheme ahroute ahsettings
VIEWPORT=all bun run layout                           # exige `vite --port 5173`

# Build RÉEL + fausse base
VITE_SUPABASE_URL=https://fake.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=x \
  bun x vite build --outDir dist-aireal
BASE_URL=http://localhost:5197 bun run demo zones agreement

# Le déployé
BASE_URL=https://azmer-fts.github.io/lo-yanum/ bun run aitheme
BASE_URL=https://azmer-fts.github.io/lo-yanum/demo bun run aisettings
bun run aicaptures
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

1. **Les six lignes `test-` sont toujours sur `lo-yanum-prod`** : le PO doit
   presser « מחיקת כל נתוני ההדגמה והבדיקה » (הגדרות › נתונים) — c'est aussi la
   preuve sur l'app réelle. Rien n'a été supprimé en production depuis ici.
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

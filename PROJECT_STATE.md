# PROJECT_STATE — Lo Yanum (לא ינום)

> Fichier de reprise. Une session neuve, sans mémoire de la conversation, doit
> pouvoir repartir d'ici sans poser de question. Le récit complet des décisions
> est dans `ETAT.md`, en tête (la passe la plus récente est la première).

## Où en est-on

- **Branche** : `main`. **Dernier commit** : voir `git log --oneline -1`
  (fin de la passe **AH**, 2026-09-10).
- **Passe terminée** : AH — formulaires, gabarit de signature, itinéraire
  libre, épingles. Les douze blocs AH1 → AH12 sont livrés et déployés.
- **Déployé** : les deux URLs, même commit.
  - App réelle : https://azmer-fts.github.io/lo-yanum/
  - Jumeau de démonstration : https://azmer-fts.github.io/lo-yanum/demo/

## La commande pour reprendre

```bash
cd "/Users/clyoapple/Desktop/CLAUDE PROJECT/LO YANOUM"
bun install
bun run typecheck && bun run ahpass && bun run accept
```

## Ce qui est fait dans AH

| Bloc | État |
|---|---|
| AH1 formulaire de ferme | ✅ 7 redondances recensées et traitées (`core/prefill.ts`) |
| AH2 barre d'actions | ✅ ancrée (`ui/components/anchoredBar.tsx`), A159 vue rouge d'abord |
| AH3 jeu d'essai | ✅ `core/testData.ts`, préfixe `test-`, exclu des compteurs |
| AH4 image d'exemple | ✅ supprimée du dépôt, de l'écran et de ses références |
| AH5 gabarit du document | ✅ `core/agreementTemplate.ts` + `ui/settings/AgreementDocSection.tsx` |
| AH6 formulaire à distance | ✅ case d'acceptation retirée ; le reste tenait déjà (AG4) |
| AH7 visualiseur | ✅ audit géométrique de toutes les vues plein écran ; envoi du lien en un geste |
| AH8 export | ✅ trois colonnes ajoutées à la fin (`core/association.ts`) |
| AH9 itinéraire libre | ✅ `core/freeRoute.ts` + `FreeRouteScreen.tsx`, aucun service externe |
| AH10 épingles | ✅ `MapCanvas.tsx` — `PIN_KINDS` élargi, halo sous le contour |
| AH11 dette | ✅ trois portes périmées réparées ; `user_settings` côté serveur |
| AH12 vérification | ✅ portes + 72 captures du déployé |

## Décisions permanentes posées par AH (à ne pas défaire sans raison)

1. **Une proposition de champ est un `placeholder`, jamais une valeur écrite
   dans l'état.** `inherited()` (`core/prefill.ts`) est le SEUL endroit qui
   décide que « ne rien taper l'accepte ».
2. **Une barre d'actions est `fixed`, sa boîte horizontale est MESURÉE sur un
   témoin resté dans le flux, et ce témoin réserve sa hauteur.** `sticky` ne
   colle qu'au bas du CONTENU.
3. **Deux contrôles épinglés au même coin d'un téléphone ne tiennent pas côte à
   côte.** Le second monte au-dessus du premier en lisant `--pinned-foot`.
   Ne pas revenir à un dégagement latéral chiffré.
4. **Le document de signature est UN gabarit de texte**, sept variables en
   hébreu, liste fermée dans `core/agreementTemplate.ts`. ⛔ Aucune surface.
   Une variable inconnue est refusée à l'enregistrement, en la nommant.
5. **Le logo de l'association est une valeur INITIALE, jamais imposée.**
   `null` = celui de l'association, `''` = aucun, sinon celui du PO.
6. **Signer VAUT acceptation** : pas de case à cocher au-dessus du pad.
7. **`test-` est le marqueur du jeu d'essai**, `demo-` celui du jeu de
   démonstration. Les deux ne se mélangent pas. L'exclusion des compteurs est
   dans `getCountableFarms`, jamais dans `getVisibleFarms`.
8. **Ce qui écrit une position dans une URL passe par `positionParam`**
   (six décimales). Le lecteur exige trois décimales et un point rond n'en a
   que deux.
9. **La liste des réglages qui voyagent d'un appareil à l'autre est FERMÉE**
   (`ui/settings/sync.ts`). Le laissez-passer de l'agriculteur et la mémoire
   de temporisation d'AG2 n'y sont pas et ne doivent jamais y être.
10. ⛔ **Aucun service de routage externe.** Voir l'en-tête de
    `core/freeRoute.ts` pour ce que coûteraient les trois candidats.

## Les portes

```bash
# Pures (rapides, aucun navigateur)
bun run accept dispatch persist mapping report deletion sync contrast
bun run ahpass afpass agpass acpass assoc

# Navigateur, build local
bun run ahbar ahui ahroute ahdoc ahpins ahsettings ahheight
VIEWPORT=all bun run layout
BASE_URL=http://localhost:5321 bun run uipass    # après un `vite preview`

# Build RÉEL + fausse base
VITE_SUPABASE_URL=https://fake.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=x \
  bun x vite build --outDir dist-ahreal
BASE_URL=http://localhost:5197 bun run zones agreement demo

# Le déployé
bun run ahcaptures
```

## Échecs PRÉ-EXISTANTS, qui ne sont pas des régressions

- **`bun run tokens` : 10 violations.** A28 (un `rounded-full`), A57 (six
  contours pleins sur des cartes), A29 (trois emplois d'`critical` hors liste).
  Elles précèdent AH ; mesuré sur le build d'avant.
- **`bun run write` en échec et `bun run offline` 19+SKIP** restent les
  résultats VERTS (voir `ETAT.md` §13) : il n'existe pas de compte de test sur
  cette machine.
- Les deux violations A57 de `AnchorMap.tsx` signalées en §36.6 ont été
  corrigées en U4 ; celles qui restent sont ailleurs.

## Questions ouvertes / ce qui attend le PO

1. **Le va-et-vient RÉEL des réglages (AH11.2) n'est pas prouvé.** La table
   `user_settings` existe sur `lo-yanum-prod` et l'application lit/écrit/
   restaure — vérifié contre une FAUSSE base. Personne ici n'a de session de
   coordinateur, donc la politique RLS de Frankfurt n'a pas été exercée. Le PO
   le verra à sa première ouverture : régler le gabarit, vider Safari,
   rouvrir.
2. **Les mesures de l'écran d'אבחון מיקום (AG7)** sont toujours attendues du
   PO ; l'écran reste en place dans les réglages.
3. **Le contrat de l'association** n'a toujours pas été téléversé. Le document
   en vigueur est celui du gabarit, ce qui est désormais dit à l'écran.
4. **Hygiène du dépôt** : 477 images non triées (32,9 Mo) dans l'historique du
   commit `4bbf4c4` (§37.10). Une réécriture d'historique a été refusée par le
   classificateur du mode auto ; elle reste à faire à la main.

## Fichiers qui font autorité

- `ETAT.md` — le récit et les décisions, la passe la plus récente en tête.
- `src/core/**` — le domaine : pur, sans DOM ni React.
- `src/ui/**` — le rendu. `src/data/**` — Supabase.
- `scripts/**` — les portes. Une porte est la preuve, pas le commentaire.
- `supabase/migrations/**` — le schéma, additif, une migration par décision.

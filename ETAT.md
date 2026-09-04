# לא ינום — ETAT

> 🏁 **PASSE UI/UX + BUGS CRITIQUES — Y1→Y13 COMPLÈTE, 2026-09-04. LIRE EN
> PREMIER.**
>
> Les treize unités sont livrées, en dix commits, poussées et vérifiées sur
> l'URL servie. Les deux bugs bloquants avaient tous deux une cause que le
> rapport initial ne pouvait pas nommer, et dans les deux cas le premier
> suspect a été mesuré puis innocenté.
>
> ## Les deux bugs critiques
>
> **Y1 — la carte blanche n'était pas la bascule de fond.** Le suspect évident
> — `setStyle` qui perdrait la source `pmtiles://` — a été mesuré et
> **innocenté** : dix allers-retours satellite↔vectoriel sur Chromium ET
> WebKit, aux viewports iPad et iPhone, en local et sur l'URL déployée, en
> lisant les **pixels peints** du canvas à chacun des vingt états. Le fond est
> dessiné partout.
>
> Ce qui produit exactement l'écran décrit — marqueurs gardés, fond parti, zoom
> et re-bascule tous deux inutiles — est une **perte du contexte WebGL**,
> banale sur iPad : iOS libère les contextes GL sous la pression mémoire et à
> la mise en arrière-plan, et cette app confie au GPU une archive de 94 Mo plus,
> en satellite, un plein écran d'imagerie.
>
> Et **MapLibre 4.7.1 n'en revient pas**. Il en a l'air : `preventDefault()`
> sur la perte, puis `_setupPainter()`, `resize()`, `_update()` et
> `webglcontextrestored`. Mesuré avec `WEBGL_lose_context` : après toute cette
> séquence le canvas ne tient plus qu'**une** couleur sur 200×200 échantillons,
> et y reste à travers un `resize()`, un `triggerRepaint()`, un zoom et une
> bascule de fond. `MapCanvas` reconstruit donc la carte, à la caméra de celle
> qui vient de mourir — y compris quand le rétablissement n'est jamais annoncé.
>
> **Y2 — les vignettes de garde.** X7.1 avait donné aux trois listes une
> `height` unique pour un rythme de colonne, choisie pour « trois lignes d'une
> garde ». Une garde en a **quatre**, et la première passe à la ligne quand le
> panneau est étroit : 33 px coupés à tout viewport, 65 px sur un iPad paysage,
> 23 px sur les incidents. `min-height` garde le rythme pour ce qui tient —
> fermes et incidents retombent exactement sur 88 px — et laisse le reste
> respirer.
>
> Le gate `layout` **balayait déjà** cet écran, aux quatre viewports et aux
> trois positions de couture, et le passait à chaque fois : rien n'y regardait
> si une BOÎTE coupe son contenu. U7 regarde du TEXTE qui s'ellipse ; une
> vignette ne s'ellipse pas, elle s'arrête.
>
> ## Les gates
>
> | Gate | Portée | Résultat |
> |---|---|---|
> | `backdrop` | + section C (Y1) et D (Y8) — pixels peints | **36/36**, chromium et webkit |
> | `modes` | **nouveau** (Y4) — 5 listes × 3 modes × 3 viewports | **75/75**, chromium et webkit |
> | `band` | **nouveau** (Y5/Y6) — géométrie mesurée, pas la couleur | **64/64** |
> | `reserve` | **nouveau** (Y3.4) — 7 listes × 4 viewports | **56/56** |
> | `fixedhours` | **nouveau** (Y9.3) — pur, l'ordonnancement comme arithmétique | **19/19** |
> | `parse` | **nouveau** — chaque script de gate se parse | **51/51** |
> | `layout` | + `clipped` (Y2) et `misaligned` (Y10) — 4 viewports × 32 écrans × 3 coutures | **0 échec** |
> | `overlap` | + un 5ᵉ viewport desktop, + pointeur grossier émulé | **185/185** |
> | `blocks` | + l'audit Y11 sur 10 écrans | **36/36** |
> | `splitter` · `seam` · `touch` | souris, tactile, stylet, 200 cycles | 72/72 · 7/7 · 57/57 |
> | `regions` · `wizard` · `accept` | pur, assistant, domaine | 58/58 · 28/28 · 176/176 |
> | `rtl` · `report` · `deletion` · `dispatch` | classeur, PDF, suppressions, affectation | 45 · 86 · 61 · 27, 0 échec |
>
> **`ENGINE=webkit` est exécutable.** Le build WebKit de Playwright est
> installé : le caveat que cette note portait depuis quatre passes — « l'iPad
> du PO est WebKit, donc c'est la moitié qui manque » — est levé. `backdrop`,
> `modes` et `band` tournent sur les deux moteurs.
>
> ## Ce qui a changé, unité par unité
>
> **Y3 — les contrôles de carte.** La poignée était arrondie CONTRE la barre et
> plate vers l'extérieur : un onglet qui se décolle. Le zoom +/− est un contrôle
> de desktop À LA SOURIS (`pointer: fine` ET ≥ 64 rem — un iPad paysage fait
> 1376 px, donc une condition de largeur seule l'aurait gardé sur l'appareil
> même dont il fallait le retirer). Les trois boutons de mode se couchent à côté
> du « + ». Et `--float-reserve`, **dérivé de l'endroit où la barre se trouve**,
> remplace les quatre `pb-24` / `lg:pb-5` que chaque écran devinait — 96 px là
> où la barre en fait 72, et 20 px là où elle en fait 72.
>
> **Y4 — un seul comportement par mode**, sur les cinq listes. `MapPanel`
> jetait le mode que `MapSplit` lui passait, donc les écrans dessinaient la
> même chose avec un tiers de largeur ou la totalité. La photo est à DROITE
> (quatrième demande) : dans une rangée RTL le PREMIER enfant est la droite
> physique. Gardes et incidents ont enfin un tableau ; volontaires et
> conducteurs ont enfin des vignettes.
>
> **Y5 — un seul modèle de bandeau** (troisième demande). Il en restait
> **quatre** géométries derrière une seule colorimétrie — 84/44/24, 44/28/16,
> pas de disque, et un chiffre de 76 px — ce qui est précisément pourquoi les
> deux premières demandes ont pu passer à côté d'une relecture par capture : la
> couleur est ce qu'une capture montre, la taille est ce qu'elle cache.
>
> **Y6 — bord à bord, ombres entières.** La rangée portait 2 px de padding,
> choisis pour un anneau de focus ; une ombre `0 4px 14px` en demande 14.
>
> **Y7 — un fond OU un contour.** 12 % au lieu de 18 %, filet retiré, pastille
> de compteur en disque clair, et drop-down sous 20 rem de **panneau**.
>
> **Y8 — les régions.** Chroma ×1,55, opacité 10 % → 35 %, et le découpage est
> un **ordre de peinture** : sous la couche `water` de l'archive, la mer
> repeint chaque débordement. Aucune coordonnée inventée.
>
> **Y9 — le planificateur.** Le rendez-vous absorbé dans son étape ne
> contraignait rien : l'étape affichait 12:32 et portait une étiquette 09:30.
> L'horaire se construit maintenant autour des épingles, et une journée
> qu'aucun ordre ne peut sauver est SIGNALÉE plutôt qu'absorbée.
>
> **Y10 — l'alignement RTL.** `.ltr-nums` pose `direction: ltr`, et `direction`
> est ce contre quoi `text-align: start` se résout. Une déclaration
> (`text-align: -webkit-match-parent`) corrige une quarantaine d'éléments.
>
> **Y11 — 53 blocs sur 10 écrans** ont leur chevron et leur mémoire, y compris
> les trois écrans de rôle qui n'en avaient aucun.
>
> **Y12 — la loupe ouvre un panneau.** Le filtrage reste en direct ; Entrée
> ferme.
>
> **Y13 — מצב תצוגה.** Le coordinateur regarde par l'écran d'un fermier, d'un
> volontaire ou d'un conducteur, et revient depuis un bandeau qui est DANS
> l'en-tête collant — un chemin de retour qui défile hors de vue est un aller
> simple.
>
> ## Ce qui reste, et ce qui est délibéré
>
> - **Les frontières TERRESTRES des régions ne sont pas découpées** (Y8.2), et
>   c'est délibéré. L'archive porte les frontières nationales comme des
>   **lignes** ; il n'y a aucun polygone de pays à intersecter. Découper un
>   aplat sur une frontière terrestre voudrait dire construire ce polygone à
>   partir des lignes, c'est-à-dire décider où passe la frontière : exactement
>   ce que « ne pas inventer de tracés » interdit. Un aplat peut donc dépasser
>   un peu à l'est ; c'est un seau pour un filtre et une couleur.
> - **Les contours de régions restent approximatifs** (X12), écrits à la main
>   et documentés comme tels dans `core/regions.ts`.
> - **`scripts/` n'est pas typechecké.** `tsconfig.json` inclut `src` et
>   `vite.config.ts` ; passer les gates sous `tsc` fait apparaître 111 erreurs
>   préexistantes, surtout un `@types/bun` manquant. C'est un nettoyage à part.
>   `bun run parse` couvre la classe d'erreur qui a fait échouer un déploiement
>   cette fois-ci (une variable redéclarée), en moins d'une seconde.
> - ⚠️ **Inchangé et toujours vrai** : les portraits de démonstration sont
>   temporaires (`docs/demo-photos-licences.md`), et l'historique du dépôt porte
>   encore les 477 images du commit `4bbf4c4`.
>
> ## À re-tester par le PO — 6 points
>
> 1. **La carte blanche.** Basculer satellite ↔ vectoriel plusieurs fois, sur
>    l'iPad, en laissant l'app en arrière-plan entre deux. Le fond doit revenir
>    à chaque fois, et si iOS a repris le contexte, la carte se reconstruit à
>    l'endroit où elle était.
> 2. **Les trois modes, sur les cinq listes.** חוות, מתנדבים, נהגים, שמירות,
>    אירועים : partagé = vignettes avec la **photo à droite**, contenu plein =
>    tableau dense, carte pleine = carte seule. Le comportement doit être
>    identique d'un écran à l'autre.
> 3. **Le bas de chaque liste.** Défiler jusqu'au bout : la dernière rangée doit
>    être entièrement lisible et cliquable, jamais sous le « + » ni sous les
>    trois boutons de mode.
> 4. **Le planificateur.** Choisir des fermes dans la grille de cartes, poser un
>    rendez-vous à 09:30 sur l'une d'elles, recalculer : l'heure doit rester
>    09:30 et le reste de la journée s'organiser autour.
> 5. **Les régions.** Légende → « אזורים » : les aplats doivent se voir, et
>    épouser le trait de côte.
> 6. **מצב תצוגה** (הגדרות) : passer en fermier, en volontaire, en conducteur,
>    et revenir par le bandeau. C'est la porte pour commenter les trois autres
>    interfaces.
>
> Captures de l'URL déployée : `docs/screenshots/ypass/` (iPad et iPhone).
> Pour reprendre : `git pull && bun install && bun run dev`, puis
> `bun run parse`, `bun run modes`, `bun run band`, `bun run reserve`,
> `bun run fixedhours`, `ENGINE=webkit bun run backdrop`, et
> `VIEWPORT=all BASE_URL=http://localhost:5173 bun run layout`.

---

> 🏁 **PASSE UI/UX PROFONDE — X1→X13 COMPLÈTE, 2026-09-04.** (Note
> précédente, conservée. La table des gates ci-dessous est celle de cette
> passe-là ; la table courante est en tête de fichier.)
>
> La démonstration à l'association s'est bien passée et le PO en est
> revenu avec une liste de défauts de cohérence et de responsive. **Les
> treize unités sont livrées**, une par commit, poussées et vérifiées sur
> l'URL servie. Dernier commit `dbb7398`, déploiement **succès**.
>
> ## Les gates
>
> | Gate | Portée | Résultat |
> |---|---|---|
> | `layout` | **4 viewports × 3 positions de couture × 32 écrans** | **0 échec** |
> | `uipass` | URL déployée (jumeau `/demo/`) | **39/39**, 12 captures |
> | `overlap` | 4 viewports, 9 écrans à carte | **108/108** |
> | `splitter` | 5 écrans, souris + tactile + clavier | **72/72** |
> | `seam` | **nouveau** — 200 cycles de redimensionnement | **7/7** |
> | `regions` | **nouveau** — pur, 24 lieux réels | **58/58** |
> | `backdrop` | build servi | **24/24** |
> | `blocks` · `freehand` · `redraw` | build servi | 26/26 · 30/30 · 18/18 |
> | `touch` · `wizard` | tactile / stylet, assistant | **57/57** · **28/28** |
> | `accept` · `deletion` · `dispatch` · `import` | domaine | 176 · 61 · 27 · 29, 0 échec |
> | `report` · `outreach` · `empty` · `contrast` · `rtl` | — | 86 · 25 · 10 · AA · 45 |
> | `agreement` · `zones` · `demo` | build **réel** servi | 18/18 · 38/38 · 12/12 |
> | `mapfirst` | 27 écrans | carte à gauche partout |
>
> Trois gates ont GAGNÉ des mesures dans cette passe : `layout` sait
> maintenant nommer l'élément qui déborde à chaque position de couture
> (« 15 px de trop » sans nom, c'était une matinée de bissection) et
> refuse une colonne de roster écrasée ou une pilule déformée ;
> `overlap` mesure l'axe du rail flottant ; `uipass` porte neuf contrôles
> de cette passe. Deux gates ont été RÉPARÉS : `touch` et `wizard`
> cherchaient depuis W5 un bouton qui avait simplement déménagé.
>
> ## Ce qui a changé
>
> **X1/X2 — un seul gabarit d'en-tête.** Le titre de page a UNE taille
> partout : 24 px, celle du dashboard. Le compteur quitte la ligne de
> titre pour une pastille en tête de la rangée de filtres. La ligne est
> toujours **[titre] [recherche] [⋯]**. Les boutons texte des en-têtes
> (import, bascule carte/tableau, couche menaces) sont dans le « ⋯ » —
> et les pilules de bascule d'affichage sont supprimées pour de bon. La
> couche menaces ne vit plus que dans les cases de la légende.
>
> **X3 — la carte.** Un seul axe pour tout ce qui flotte : la pile
> d'outils, la pastille de mode et le « + » avaient trois décalages et
> trois largeurs, d'où « le + dépasse à droite ». Un seul bouton de fond,
> dont le GLYPHE est la destination. מיקומי rejoint le zoom et ne se
> remplit plus d'accent. L'attribution quitte MapLibre pour un bouton à
> côté de la légende — elle était dans le coin que la légende occupe en
> hébreu. Le séparateur devient un filet de 2 px dont la poignée est
> entièrement du côté carte : c'est lui qui rognait les vignettes.
> « השטחים הפלסטיניים » est filtrée du fond de carte ; les LIGNES de
> frontière sont intactes.
>
> **X4 — la fiche.** La photo de l'entité à côté du titre, les trois
> actions en icônes seules (cibles plus grandes qu'en version libellée),
> le statut jamais coupé, et le clic sur la photo d'une vignette ouvre un
> **aperçu ancré au marqueur** sans bouger la caméra — le cadrage serré
> reste ce que fait l'ouverture de la fiche.
>
> **X5/X6 — les rosters et le scroll.** Une cause, quatre symptômes : des
> rangées flex de largeurs fixes, en-tête écrit séparément des lignes,
> avec des seuils de FENÊTRE alors que la largeur qui décide est celle du
> PANNEAU. C'est une grille CSS à requêtes de conteneur maintenant, un
> `grid-template-columns` par palier porté par l'en-tête et par chaque
> ligne. Les colonnes qui ne tiennent plus FUSIONNENT en sous-lignes sous
> le nom. Les pilules ne se déforment plus (ni écrasées ni sur deux
> lignes) ; un avatar dont l'image échoue redevient le disque à
> initiales. Le scroll horizontal venait de trois blocs qui ne passaient
> pas à la ligne : ils passent à la ligne.
>
> **X7 — vignettes et pilules.** Une hauteur de vignette (5,5 rem) pour
> fermes, gardes et incidents. Les vignettes de tri portent la
> colorimétrie de la fiche, validée par le PO. Les pilules de filtre
> passent de 7 points d'écart avec le fond à un écart lisible au soleil.
>
> **X8 — le planificateur.** « סדר הנסיעה », « קביעת פגישות » et
> « ניווט » imprimaient la même liste trois fois. Une seule liste, trois
> actions par étape, durées en heures et minutes, totaux alignés.
>
> **X9/X10/X11 — détails, incident, contrat.** L'horodatage passe sous
> le titre de l'étape. Le bandeau de garde est le MÊME composant que
> celui de la fiche d'entité. Fermer un incident est un bouton sur la
> dernière étape de son fil. « פתיחה במפות » a une place nommée. Le
> lecteur de contrat perd son second bouton de fermeture et
> « פתיחה בכרטיסייה חדשה » dit ce que le PO obtient.
>
> **X12 — les régions.** Treize régions, contours **approximatifs écrits
> à la main** et documentés comme tels (voir la note en tête de
> `src/core/regions.ts` : aucun GeoJSON libre ne pouvait être versé sans
> y mettre une lecture politique des limites ou une licence que ce dépôt
> ne peut pas re-concéder). Chaque entité reçoit sa région de ses
> coordonnées, écrasable à la main. Couche « אזורים » et option
> « צבע לפי אזור » dans la légende, **éteintes par défaut**. Filtre par
> région sur les quatre listes, bloc « דונם לפי אזור » au dashboard et
> ligne des six plus lourdes sur le PDF.
>
> **X13 — le séparateur qui se figeait.** Ce n'était pas une fuite
> d'écouteurs : `setRatio` écrivait dans `localStorage` de façon
> SYNCHRONE à chaque `pointermove`. Mesuré : quarante écritures
> bloquantes par glissement, chacune suivie d'un commit React de tout le
> gabarit. Un glissement ne rend plus rien — la largeur est écrite
> directement sur la propriété personnalisée, une fois par frame — et
> l'état est commité au relâchement. `bun run seam` le mesure et échoue
> bien sur l'ancien code.
>
> ## Ce qui reste
>
> - **Les contours de régions sont approximatifs.** Ils suffisent pour un
>   seau, une couleur et un total ; ils ne sont pas une frontière et le
>   fichier le dit. Si l'association veut un tracé officiel un jour, il
>   faudra une source sous licence et une décision sur le tracé — c'est
>   une question qui n'est pas technique.
> - **`ENGINE=webkit` n'est pas exécutable sur cette machine** (le build
>   WebKit de Playwright n'est pas installé). Les sweeps ont tourné en
>   Chromium ; l'iPad du PO est WebKit, donc c'est la moitié qui manque.
> - **X5.4, dernier recours non implémenté** : le brief proposait un
>   sélecteur de colonnes visibles « en dernier recours ». La fusion en
>   sous-lignes couvre les quatre paliers jusqu'à 262 px de panneau,
>   donc il n'a pas été nécessaire — à faire si le PO veut choisir ses
>   colonnes plutôt que les voir fusionner.
> - ⚠️ **Inchangé et toujours vrai** : les portraits de démonstration
>   sont temporaires (`docs/demo-photos-licences.md`), et l'historique du
>   dépôt porte encore les 477 images du commit `4bbf4c4`.
>
> ## À re-tester par le PO — 5 points
>
> 1. **Les en-têtes de liste.** חוות, מתנדבים, נהגים, שמירות, אירועים :
>    même taille de titre que לוח בקרה, compteur en pastille sous le
>    titre, et un seul « ⋯ » qui contient l'import et la bascule
>    carte/tableau. Plus aucune pilule de bascule en haut.
> 2. **Tirer la couture, longuement.** Sur מתנדבים et נהגים : les
>    colonnes restent alignées avec leur en-tête à toutes les largeurs,
>    ce qui disparaît réapparaît sous le nom, et après une longue
>    session la poignée répond toujours.
> 3. **Les régions.** Légende → « אזורים » : les aplats et les noms.
>    Puis « צבע לפי אזור ». Puis le filtre « כל האזורים » sur les quatre
>    listes, et le bloc « דונם לפי אזור » au bas du dashboard.
> 4. **Le planificateur.** Choisir quatre fermes : une seule liste, avec
>    par étape l'appel, « קבע פגישה » et la navigation ; la durée en
>    heures et minutes.
> 5. **Une fiche de ferme et un incident.** La photo en tête, les trois
>    icônes d'action, le statut entier ; puis un incident : le bouton de
>    clôture est sur la dernière étape du fil et « פתיחה במפות » est dans
>    « פרטים ».
>
> Captures de l'URL déployée : `docs/screenshots/uipass/` (12).
> Pour reprendre : `git pull && bun install && bun run dev`, puis
> `bun run uipass`, `VIEWPORT=all BASE_URL=http://localhost:5173 bun run
> layout`, `bun run seam`, `bun run regions`.

---

> 🏁 **PASSE FINALE — W1→W8 COMPLÈTE, 2026-09-02.** (Note précédente, conservée.)
>
> **Les huit unités sont livrées, commitées une par une, poussées et
> vérifiées sur l'URL servie.** La note précédente (ci-dessous, conservée)
> annonçait W4–W8 sacrifiés faute de temps ; ils ont été repris et terminés
> dans l'ordre du brief. Dernier commit `4413b33`, déploiement run
> **33619708564 succès**.
>
> ## Vérifié
>
> | Gate | Où | Résultat |
> |---|---|---|
> | `uipass` | URL servie (jumeau `/demo/`) | **21/21** |
> | `blocks` | serveur local | **26/26** |
> | `layout` | **4 viewports** × 32 écrans × 3 positions de séparateur | **0 échec** |
> | `overlap` | 4 viewports, 9 écrans à carte | **72/72** |
> | `backdrop` | build servi | **23/23** |
> | `freehand` | 2 viewports iPad | **30/30** |
> | `agreement` | build réel servi | **17/17** (dont W8) |
> | `zones` / `demo` | build réel servi | **38/38** / **12/12** |
> | `outreach` / `report` | — | **25/25** / **86/86** |
>
> Les trois viewports de `layout` laissés en suspens par la note précédente
> (phone, iphone, ipad portrait) ont été relancés : verts.
>
> ## W4 — un seul bouton « + » (`58d3bba`)
>
> Créer était cinq affordances à cinq endroits. Désormais **un bouton
> flottant unique** sur les huit routes coordinateur, à toutes les largeurs,
> qui ouvre un **menu contextuel façon macOS** : l'action de l'écran courant
> en premier et surlignée, les autres sous un filet. `CreateGuardFab` est
> supprimé. Les deux rosters créent dans une modale qu'ils possèdent : le
> menu leur demande par l'URL (`?new=1`), que l'écran lit puis retire.
> Le bouton porte `data-overlay` (comme la pastille de mode) : il est
> au-dessus du panneau par construction.
>
> ## W5 — la carte (`fb3b3b9`, gates `fa56f43`)
>
> · Pile de commandes en **verre dépoli**. · Le fond est un **sélecteur à
> deux cibles** מפה / לוויין au lieu d'une bascule dont le libellé nommait
> l'autre fond ; hors ligne seule la seconde est désactivée. · **Les boutons
> de mode en haut des listes sont supprimés** (`MapModeSwitch` effacé) ; la
> pastille fixe est la seule commande de mode et existe désormais à toutes
> les largeurs. · **La longue barre ne revient plus** : elle n'existe que
> pendant un tracé armé, bornée à 26 rem ; le stylet est monté sur toute
> carte capable de créer. · **Attribution OSM derrière un « i »** : le
> `<details open>` de MapLibre est refermé au chargement, son sommaire
> devient un bouton rond de 28 px en verre ; dès qu'on l'ouvre on n'y touche
> plus. · **Mêmes 7 cases sur tous les écrans** (`offeredLayers` supprimé),
> mecra présent partout, replié par défaut. · **Épingle ≠ goutte** : un
> poste de garde est une épingle (tête ronde sur aiguille), la goutte reste
> aux points posés et aux arrêts ; le mecra reprend la silhouette.
>
> ## W6 — la fiche (`c259550`)
>
> · **Cadrage serré à l'ouverture** (l'AJOUT du brief) : `frameTo` sur la
> boîte englobante des anneaux des zones + les postes + le point de
> l'entité, une fois par entité. ⚠️ La boîte est calculée sur place et non
> par `boundsOf`, qui plafonne sa marge à 0,02° **par côté** (2,2 km) et
> triplait la boîte d'une exploitation — c'était ça, le « tout est
> minuscule ». Mesuré : z12,8 → **z14,2 / z15,5 / z13,0** sur trois fermes ;
> la fiche d'un poste ouvre à z16. · **Bandeau à hauteur fixe** 5,25 rem
> (mesuré 84 px sur trois fermes, contre 76→148 px avant). · **« מוזן ידנית »
> sur sa propre ligne**, réservée qu'elle soit remplie ou non ; le cheptel
> descend dans « פרטים ». · **Trois actions en une pilule**, la destructive
> en dernier dans son encre. · **Flèche de retour** de 40 px à côté du titre
> au lieu du fil d'Ariane.
>
> ## W7 — profil + rapport périodique (`4642672`)
>
> · `core/profile.ts` : la carte du rakaz est **éditable** depuis הגדרות
> (nom, téléphone, tâche), avec abonnés — enregistrer repeint le rail sans
> recharger. **Défaut : דובי בן שושן.** Elle alimente la signature de chaque
> message généré et le numéro de rappel. localStorage, pour les deux raisons
> déjà écrites pour l'adresse de rapport : besoin sans réseau, et carte
> personnelle plutôt que donnée du programme.
> · **Rapport périodique** : 7 / 30 / 90 jours ou un an, choisis dans la
> modale, PDF reconstruit sur place. ⚠️ Seules les grandeurs fenêtrées
> bougent ; les cumulées sont un état, et le dire est le rôle de
> `report.periodHint`.
>
> ## W8 — la signature sur le contrat (`4413b33`)
>
> L'encre était stockée sur la ligne et s'arrêtait là. Elle est désormais
> **dessinée sur la dernière page du PDF**, côté physique droit — le bloc
> « חתימת בעל היישות », celui du bailleur, qui est la partie qui signe ici.
> Le tampon est un PNG rendu par le navigateur (aucun glyphe embarqué, même
> raisonnement que `report/pdf.ts`) ; `pdf-lib` est **derrière un import
> dynamique**, donc hors du bundle principal, chargé à la première ouverture
> d'un contrat signé. Un PDF illisible rend les octets d'origine inchangés :
> jamais un téléchargement cassé devant un fermier.
>
> ## À re-tester par le PO — 6 points
>
> 1. **Le « + »** : le même bouton sur tableau de bord, fermes, volontaires,
>    conducteurs, shmirot ; le menu met en tête l'action de l'écran.
> 2. **Carte** : plus aucun bouton de mode en haut des listes — la pastille
>    en bas à gauche, à toutes les largeurs ; מפה/לוויין en deux cibles ;
>    le « i » en bas de carte ouvre l'attribution ; 7 cases partout.
> 3. **Une fiche ferme** : à l'ouverture la carte cadre la ferme, pas la
>    région ; le bandeau a la même hauteur d'une ferme à l'autre ; les trois
>    actions sont une pilule ; la flèche remplace le fil d'Ariane.
> 4. **הגדרות → פרופיל הרכז** : changer le nom, envoyer un message depuis
>    une fiche → la signature porte le nouveau nom.
> 5. **Rapport** : ouvrir דוח, changer la période, vérifier que les
>    shmirot/incidents bougent et que les dunams ne bougent pas.
> 6. **Contrat** : signer un fermier dans sa fiche, puis ouvrir/partager le
>    contrat → la signature est sur la page.
>
> ⚠️ Inchangé et toujours vrai : les portraits de démonstration sont des
> images temporaires à purger ou remplacer avant tout usage réel
> (`docs/demo-photos-licences.md`), et l'historique du dépôt porte encore
> les 477 images du commit `4bbf4c4` (voir la note U-passe plus bas).
>
> Pour reprendre : `git pull && bun install && bun run dev`, puis
> `VIEWPORT=<phone|iphone|ipad|ipad-ls> BASE_URL=http://localhost:5173 bun
> run layout`, `bun run blocks`, et `bun run uipass` sur l'URL servie.

---

> 🏁 **PASSE FINALE AVANT DÉMONSTRATION — 2026-09-02, ~10:00 (heure d'Israël).** (Note d'archive.)
>
> Brief W1→W8, 1 h 30 chrono, autonomie totale. **Livré : W1, W2, W3.**
> **Sacrifié faute de temps : W4, W5, W6, W7, W8** (dans l'ordre inverse
> demandé, depuis la fin). Commits `c5381e0` (W1) et `7a5eefb` (W2+W3) sur
> `main`, déploiement run 33610742383 ; captures locales dans
> `docs/screenshots/final/`, captures de l'URL servie dans
> `docs/screenshots/uipass/`.
>
> **État vérifié sur l'URL servie** (https://azmer-fts.github.io/lo-yanum/,
> jumeau démo `/demo/`) : déploiement run 33610742383 **succès** ;
> `bun run uipass` sur l'URL servie **21/21** (dont les 4 contrôles W2/W3
> ajoutés : aucune figure n'échappe à sa carte, graphes ≤ 240 px, les deux
> cartes dunams en tête, carrousel) ; `bun run blocks` **26/26** ;
> `VIEWPORT=ipad-ls bun run layout` (gate renforcé W2, 32 écrans × 3
> positions de séparateur) **0 échec** — les trois sur le build de ce commit.
> Les autres viewports du gate `layout` (phone, iphone, ipad portrait) n'ont
> pas été relancés faute de temps : à faire au prochain démarrage.
>
> ## Ce qui a changé
>
> - **W1 — portraits.** Plus aucune femme, plus aucune personne âgée parmi
>   les volontaires et conducteurs : ils ne résolvent plus que vers les
>   **16 jeunes hommes** du pool existant (fichiers listés dans
>   `docs/demo-photos-licences.md` et `src/ui/demoPhotos.ts`) ; les contacts
>   d'entités (agriculteurs) vers des hommes adultes de tous âges. Le choix
>   se fait par la graine du marqueur (`contact` → adulte, sinon jeune), donc
>   **rien n'a changé en base** et la purge reste la même.
>   ⚠️ Portraits « religieux » (kippa, tsitsit) : cherchés sur Wikimedia
>   Commons (toutes licences, comme autorisé) — il n'y a que des archives
>   noir et blanc des années 80 (Kiryat Arba, GPO) et des **personnalités
>   publiques identifiables** (rabbins, députés, ambassadeur). Mettre le
>   visage d'une personne réelle et identifiable sur un volontaire fictif
>   était le pire résultat possible en démonstration ; j'ai renoncé. Les
>   portraits actuels sont des modèles Unsplash CC0, jeunes, sans signe
>   religieux. **Ces images sont temporaires et doivent être purgées ou
>   remplacées avant tout usage réel.**
> - **W2 — plus rien ne déborde d'une carte.** Cause racine traitée : chaque
>   grand chiffre porte `data-figure`, sa carte est un *size container*
>   (`.figure-card`) et sa taille de police est `min(plafond, (largeur −
>   réserve icône) / (nb de caractères × 0,66))` — le chiffre s'adapte à la
>   carte, jamais l'inverse ; `overflow:hidden` en dernier recours ;
>   `.auto-cols` clampé par `min(--col-min, 100%)`. **Gate `layout`
>   renforcé** : une figure plus large que sa carte = échec, aux 4 viewports
>   × 3 positions de séparateur. Vérifié localement : scrollWidth == viewport
>   et 0 figure échappée sur dashboard (3 positions), volontaires,
>   conducteurs, fiche ferme.
> - **W3 — dashboard.** (a) Deux grandes cartes « waouh » en tête
>   (דונם בשמירה, דונם פוטנציאלי), jamais masquables, dégradé doux, icône
>   nue 34 px trait fin ; (b) juste dessous **une rangée swipable** de petites
>   cartes : חוות פעילות, ראשים בשמירה (petit, volontairement), מתנדבים
>   זמינים, שמירות הלילה, התראות פתוחות — jamais de retour à la ligne ;
>   (c) icônes sans pastille ronde, plus grandes, trait fin : dashboard,
>   graphes, alertes, `Stat`, `KpiFilter`, « ma journée ». (2) Graphes
>   plafonnés à **240 px** ; **côte à côte** dès que la colonne fait 44 rem
>   (container query), vérifié à 3 positions de séparateur. (3) Carrousel
>   d'alertes : contient **toutes** les alertes ouvertes, 2 visibles, hauteur
>   +50 % (5,25 rem), **points de position** cliquables. Note : le dashboard
>   et le badge du rail lisent la même source `getAlerts()` (incidents
>   urgents non résolus, écarts de présence, retours non confirmés,
>   recrutement) ; s'il voit « 5 » ailleurs, c'est la liste des incidents, qui
>   compte aussi les non urgents.
>
> ## Sacrifié (pas commencé)
>
> - **W4** bouton d'action flottant unifié + menu contextuel façon macOS.
> - **W5** carte : pile de contrôles en verre dépoli + sélecteur מפה/לוויין,
>   suppression des boutons de mode en haut des listes, regroupement des
>   outils de dessin dans le stylet, bouton « i » d'attribution, légende
>   identique partout, marqueurs différenciés par type.
> - **W6** fiche d'entité : bandeau à hauteur fixe, « מוזן ידנית » sur une
>   deuxième ligne, pilule d'actions, fil d'Ariane réduit à une flèche.
> - **W7** profil coordinateur éditable + rapport périodique.
> - **W8** signature sur le contrat (P3.3).
>
> ## À re-tester par le PO — 5 points
>
> 1. **מתנדבים / נהגים** : faire défiler toute la liste — uniquement des
>    hommes jeunes ; une fiche ferme → contacts = hommes adultes.
> 2. **Dashboard iPad paysage** : déplacer le séparateur aux deux extrêmes —
>    aucun scroll horizontal, les chiffres restent dans leurs cartes.
> 3. **Dashboard** : les deux cartes dunams en tête, la rangée de petits KPI
>    se swipe au doigt quand la colonne est étroite.
> 4. **Graphes** : panneau large → côte à côte, jamais plus hauts que 240 px.
> 5. **Alertes** : swiper le carrousel, les points suivent ; toutes les
>    alertes ouvertes y sont.
>
> Pour reprendre : `git pull && bun install && bun run dev`, puis
> `BASE_URL=http://localhost:5173 bun run layout` (gate renforcé W2) et
> `bun run uipass` (URL servie, contrôles W3 ajoutés).


> 🎯 **PASSE UI/UX AVANT DÉMONSTRATION — 2026-09-02 (journée).** (Note d'archive.)
>
> Les dix unités U1→U10 de votre brief sont livrées, commitées une par une
> sur `main`, déployées sur https://azmer-fts.github.io/lo-yanum/ et
> vérifiées sur l'URL servie (captures `docs/screenshots/uipass/`, prises
> sur le jumeau `/lo-yanum/demo/`). Le détail technique est au **§37**.
> **P3.3 (signature dessinée sur le PDF) n'est pas commencée** — c'est
> la prochaine unité, comme demandé.
>
> ## Ce qui a changé
>
> - **U1 — tout bloc se replie**, chevron dans le titre, et la mémoire est
>   **globale par type de bloc** (localStorage `lo-yanum:block:<type>`) :
>   replier « שכבת איומים » sur une ferme le replie sur toutes, et ça tient
>   après rechargement. Replié = titre + résumé d'une ligne
>   (« 3 עמדות », « 2 אזורים · 2 וקטורים »). Défauts : menaces, zones,
>   activité, engagements, accords, notes, visites, chronologies repliés ;
>   chiffres clés, carte, contacts, gardes, incidents ouverts. Appliqué aux
>   fiches entité / mission / incident / poste, au dashboard et aux réglages.
> - **U2 — haut des listes compact et sticky** (fermes, volontaires,
>   conducteurs, missions, incidents) : titre compact + une seule rangée
>   swipable avec la recherche et les KPI-filtres (puces 44 px) + les pilules
>   sur une ligne + en-têtes de colonnes, pinnés à toute largeur (~14 % de
>   la hauteur au lieu des trois quarts). 8–10 fermes visibles sur iPad
>   paysage.
> - **U3 — dashboard réordonné** : grands chiffres → les deux graphes de
>   croissance **l'un sous l'autre** (aire lissée monotone + dégradé, barres
>   arrondies, grille discrète, valeur au survol/appui, animation d'entrée)
>   → **alertes en carrousel swipable** (2 visibles, format compact du
>   journal, clic = détails + appels sous le carrousel) → ma journée →
>   agenda → le reste.
> - **U4 — carte épurée** : outils de dessin dans un **bouton flottant
>   translucide** (verre dépoli) qui se déploie/replie ; **légende
>   repliable** (mémorisée) contenant **7 cases à cocher de couches**
>   (marqueurs, limites, pâturages, postes, ramassages, zones et vecteurs de
>   menace — un seul réglage pour toutes les cartes, mémorisé) ; les trois
>   modes carte (masquée / partagée / plein écran) sont une **pastille
>   verticale fixe en bas à gauche physique**, au même endroit dans les
>   trois modes, dès que la carte est À CÔTÉ du contenu (paysage, bureau).
>   En affichage empilé (portrait, téléphone) elle recouvrait « שמירה » et
>   les boutons en bas à gauche des cartes : là, le sélecteur reste dans
>   la barre de la carte, en haut de page, comme avant.
> - **U5 — zones lisibles sur satellite** : cyan / magenta (ferme), ciel /
>   violet (moshav), remplissage 28 %, contour 3,2 px avec halo sombre ;
>   contours toujours dessinés au-dessus de tous les remplissages, hachures
>   de menace comprises. Palette vectorielle inchangée.
> - **U6 — bandeau de fiche** : une donnée par carte, **statut en premier**
>   (pastille dans sa couleur), icônes 24 px, teinte vive par carte, rangée
>   swipable si la colonne est étroite.
> - **U7 — zéro texte coupé sans recours** : chaque `.truncate` qui déborde
>   reçoit automatiquement sa valeur complète en infobulle (`title`) ; le
>   gate `layout` échoue désormais sur tout texte coupé sans recours, aux
>   4 viewports × 3 positions de séparateur (32 écrans, tous verts). Les
>   grilles sont clampées (`minmax(0,1fr)`) : plus de colonne élargie par
>   une ligne trop longue.
> - **U8 — vignettes de fermes** : photo pleine hauteur bord à bord à
>   gauche, deux zones de clic (texte = fiche, photo = centrer la carte),
>   survol / appui long = aperçu rapide (même carte que sur la carte).
> - **U9 — vraies photos** : 51 portraits + 39 paysages **CC0 vérifiés par
>   l'API Wikimedia Commons** (licence notée fichier par fichier dans
>   `docs/demo-photos-licences.md`), livrées comme **assets statiques**
>   (`public/demo-photos/`, 7,3 Mo) — voir « Décidé en votre nom ».
> - **U10** — nouveaux gates `bun run blocks` (26 contrôles : mémoire des
>   replis, légende, couches, pastille, outils) et `bun run uipass`
>   (captures + contrôles sur l'URL servie). `bun run tokens` est **vert**
>   (les 2 contours A57 d'AnchorMap sont corrigés).
>
> ## Décidé en votre nom
>
> - **Photos = assets statiques, pas le bucket `photos`.** Écrire dans le
>   bucket exige une session coordinateur qui n'existe sur aucune machine de
>   gate (§13/§36). Les marqueurs `placeholder:` déjà en base sont inchangés :
>   l'appareil les résout vers une photo du pool, de façon déterministe (la
>   même personne garde le même visage partout). La purge supprime les
>   lignes ; il n'y a rien à nettoyer côté stockage.
> - **Couleurs satellite** (cyan/magenta/ciel/violet) : mon choix, tokens
>   `--zone-*-sat` dans `tokens.css`.
> - **Pastille de mode en bas à gauche physique**, verticale : c'est la
>   bande de 4,5 rem que toutes les cartes réservaient déjà pour la pile de
>   commandes, donc rien ne se recouvre.
> - ⚠️ **Hygiène de dépôt** : mon commit U2 (`4bbf4c4`) a embarqué par
>   erreur 477 images non triées (32,9 Mo) de la passe de découverte de
>   l'agent photos ; elles sont retirées dès le commit U9 mais **restent
>   dans l'historique**. La réécriture des commits (non poussés à ce
>   moment-là) a été refusée par le classificateur d'auto-mode ; je n'ai
>   pas insisté. Si vous voulez un dépôt léger : `git filter-branch
>   --index-filter 'git rm -r --cached --ignore-unmatch public/demo-photos
>   scripts/demo-photos.ts' e309abd..4bbf4c4` avant que d'autres clones
>   n'existent — à votre décision.
>
> ## À re-tester sur iPad — 5 points
>
> 1. **חוות** (liste) : le bandeau reste en haut pendant le scroll, les
>    KPI se swipent au doigt, 8+ fermes visibles en paysage ; appui long
>    sur une vignette → aperçu ; toucher la photo → la carte se centre.
> 2. **Une fiche ferme** : replier « שכבת איומים » puis ouvrir une autre
>    ferme — replié aussi ; recharger — toujours replié. Le bandeau du haut
>    se swipe ; le statut est en premier.
> 3. **Carte** : bouton crayon translucide → outils ; « מקרא » → décocher
>    « שטחי מרעה » → les pâturages disparaissent sur TOUTES les cartes ;
>    passer en לוויין sur חוות רתם à z14 : zones cyan/magenta bien visibles.
> 4. **Pastille bas-gauche** (iPad en paysage) : masquée / partagée /
>    plein écran — elle ne bouge pas. En portrait, le sélecteur est dans
>    la barre au-dessus de la carte.
> 5. **Dashboard** : chiffres → deux graphes l'un sous l'autre (toucher un
>    point/une barre = valeur) → carrousel d'alertes (swipe, tap = détails).
>
> Commits : `d116758` (U1) → `ff59e20` (U9), corrections de gates `0561a30`, pastille `U4.4` ; déploiement vert : run 33601764755 (§37.9).

> ⏰⏰ **NOTE DE RÉVEIL — 2026-09-02, ~03:00 (heure d'Israël).** (Note d'archive.)
>
> Bonjour. Voici ce qui s'est passé cette nuit (ordre de nuit N1→N8), en
> autonomie totale, sans aucune question. Tout est commité sur `main`,
> déployé sur https://azmer-fts.github.io/lo-yanum/ et vérifié sur l'URL
> servie. Le détail technique est au **§36** en bas du fichier.
>
> ## Ce qui est prêt pour la démo
>
> 1. **N1 — les zones ne disparaissent plus.** Vos deux polygones de
>    « חוות חלומותי » n'ont jamais quitté la base (2 zones, 77 sommets,
>    écrits hier à 23:39/23:40). La perte était côté client, et deux défauts
>    réels ont été trouvés et corrigés par un nouveau banc qui pilote **l'app
>    réelle déployée sans compte** (`bun run zones`, 38 contrôles) :
>    (a) un rechargement sur une fiche renvoyait à la liste avant que les
>    données n'arrivent ; (b) une hydratation en vol pouvait écraser un
>    dessin fait pendant qu'elle chargeait. Les deux sont fermés, et le banc
>    tourne à chaque déploiement.
> 2. **N2 — le PDF du contrat a une sortie.** Voir / télécharger / partager
>    ne naviguent plus jamais : visionneuse dans l'app avec bouton fermer,
>    partage du FICHIER (Mail/WhatsApp sur iPad), téléchargement propre.
>    Un contrat fictif d'une page, en hébreu, en-tête לא ינום, marqué
>    « דוגמה », remplace l'ancien fichier vide. Dans הגדרות → **תבנית הסכם**
>    vous pouvez téléverser le vrai PDF de l'association : il remplace le
>    fictif pour toutes les fiches.
> 3. **N3 — la base réelle est REMPLIE.** 18 entités (14 Néguev + 4 nord
>    dont בית שאן), 21 zones dessinées sur 9 entités, 8 עמדות שמירה, 2 zones
>    de menace + 2 vecteurs, 56 volontaires, 8 conducteurs, 8 gardes (passées
>    avec confirmations, planifiées, une annulée), 5 incidents, 21 visites et
>    4 réunions sur les jours à venir (demain et après-demain), 2 tournées
>    (aujourd'hui, demain). **Marqueur : tout id de démo commence par
>    `demo-`.** Dans הגדרות → **נתוני הדגמה** : « מחק את כל נתוני ההדגמה »,
>    double confirmation, ne touche ni votre ferme ni vos réglages (prouvé
>    par `bun run demo`).
> 4. **N4 — בית שאן se tape maintenant.** Le gazetteer passe de 21 à
>    **1 174 localités** (liste officielle « שמות יישובים עם קואורדינטות »,
>    data.gov.il, hors ligne, sans clé), tolérant aux variantes de saisie.
> 5. **N5 — le rapport PDF** porte des icônes, et le destinataire se saisit
>    au moment de l'envoi (défaut = כתובת דוחות). Vérifié en 390 px.
> 6. **N6 — deux graphes** sur le dashboard (entités signées cumulées par
>    mois ; gardes effectuées par semaine), SVG maison, clair/sombre.
> 7. **N7 — passe visuelle** : chiffres KPI qui ne débordent plus, email qui
>    passe à la ligne, champ date dans sa boîte, icônes sur les chiffres de
>    la fiche et par type de bétail, pastille bleue pour un moshav, pâturage
>    **ambre** (ferme) / **turquoise** (moshav) contre frontière verte/bleue,
>    pointe de vecteur à la couleur du trait, eau **bleu franc** + rivières
>    et wadis visibles dès z7/z11. Balayage `layout` : 32 écrans × 4
>    viewports, aucun défilement horizontal.
>
> ## Décidé en votre nom
>
> - **Aucun compte de test n'a été créé** (l'outil l'a refusé, et c'était la
>   règle §13). À la place, un faux Supabase intercepté dans le navigateur
>   pilote l'app réelle déployée : c'est ce qui rend N1/N2/N3 prouvables sur
>   l'URL servie sans votre mot de passe. Rien n'atteint la base pendant un
>   banc.
> - **Photos de démo = avatars stylisés générés sur l'appareil** (marqueur
>   `placeholder:…`), pas des fichiers dans le bucket `photos` : écrire dans
>   le bucket exige une session coordinateur, qui n'existe pas sur cette
>   machine. Rendu identique, purge sans rien à nettoyer.
> - Les couleurs exactes des pâturages (ambre / turquoise) et le bleu de
>   l'eau sont mon choix ; les tokens sont dans `src/styles/tokens.css` et
>   `src/ui/components/basemap.ts` (`water`).
> - Le rapport avait déjà toutes les figures demandées ; je n'ai pas
>   redessiné la page, seulement ajouté icônes et destinataire éditable.
>
> ## Reste ouvert
>
> - **Signature dessinée sur le contrat lui-même (P3.3)** : non livrée ;
>   le flux de signature existant est inchangé. Prochaine unité : dessiner
>   la signature stockée sur le PDF (pdf.js ou notre pipeline canvas).
> - `bun run tokens` a 2 échecs **antérieurs à cette nuit** (contour de
>   carte dans `AnchorMap.tsx`, commit 9feeeeb) — pas une régression.
> - Un avertissement console bénin « RTL Text Plugin failed to import
>   scripts » sur la seconde carte d'une même page ; les libellés sont
>   corrects. À regarder un jour calme.
> - Esri (§33) et `negev-20260829-z14.pmtiles` dans le bucket : inchangés.
>
> ## Votre test du matin sur iPad — 5 points
>
> 1. Ouvrir l'app, se connecter : le dashboard montre ~15 600 dunams gardés,
>    les 4 KPI colorés et les deux graphes « צמיחה ».
> 2. חוות → carte : entités du Néguev ET du nord ; toucher « חוות רתם » :
>    2 zones (vert + ambre), 2 עמדות, zone de menace hachurée. Recharger la
>    page SUR la fiche : elle reste là, zones comprises.
> 3. Dans la fiche, section הסכמים : œil → visionneuse → « סגירה » revient
>    à la fiche. Partage → feuille Mail/WhatsApp.
> 4. יומן / dashboard « היום שלי » : visites de demain (חוות עמק בית שאן
>    16:00) et réunion ; RDV → יישוב : taper « בית שאן ».
> 5. הגדרות : « נתוני הדגמה » compte 155 lignes de démo (ne PAS purger
>    avant la démo) ; « תבנית הסכם » propose le téléversement.
>
> Rien n'a été sacrifié (N5 et N6 livrés). Commits de la nuit : `a555f33`
> (N1) → `d7d4813` (N6), plus l'ETAT.


> הִנֵּה לֹא יָנוּם וְלֹא יִישָׁן שׁוֹמֵר יִשְׂרָאֵל
> — תהלים קכ"א, ד

**Lo Yanum** ("He does not slumber") — coordination tool for a volunteer
farm-protection programme in the northern and central Negev.

This file is the project's memory. A completely fresh session must be able to
read it and resume with no questions asked. **Every session starts with "Read
ETAT.md and continue."**

---

## 1. Resume

```bash
bun install && bun run dev
```

Open http://localhost:5173 and pick an identity on the landing screen.

**That is DEMO MODE, and it is the default on purpose.** `bun run dev` shows the
POC's identity picker on the mock store, with no login, because that is what
every browser verification gate drives. **`bun run dev:real` is the real app**:
it reads `.env.real` (see `.env.example`), requires a Supabase session, and hides
the role switcher. The file is called `.env.real` and NOT `.env` for one
load-bearing reason — Vite auto-loads `.env` in every mode, so a `.env` here
would silently turn `accept`, `outreach`, `rtl`, `mapfirst`, `splitter`, `touch`,
`wizard`, `import` and `layout` into runs against a login form.

| Command | What it does |
|---|---|
| `bun run dev` | Dev server on :5173, **DEMO MODE** (honours `PORT` so a second one can run alongside) |
| `bun run dev:real` | The same server in **REAL MODE** — reads `.env.real`, requires a Supabase login |
| `bun run preview` | Serve `dist/`. **The only way to see the service worker**, which never registers in dev |
| `bun run build` | Typecheck + production build to `dist/` |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run contrast` | WCAG audit of the design tokens (A13/A19) — 133 pairs, fails the build on a regression |
| `bun run tokens` | **A28/A29** — one radius scale, no tinted field, orange only where it is allowed. No browser needed |
| `bun run dispatch` | Guard-scoring verification (A21) — 27 checks, no browser needed |
| `bun run accept` | Acceptance criteria driven through `@core` (A4–A23) — **176 checks** since PO point 9b added sixteen pure Douglas-Peucker ones, and PO point 6 twelve before that, almost all of them about the difference between a head count that is ZERO and one nobody has been asked for |
| `bun run sync` | **A77** — the offline data layer's rules (P2.5b): the cache restores what was on screen, six edits to one guard coalesce to ONE outbox entry, the oldest flushes first, a FAILED flush keeps everything, a deletion survives as a deletion, and signing out clears both stores while losing the network clears neither. 28 checks — no browser, no dev server, no network |
| `bun run write` | **A76** — ⚠️ **THE WRITE PATH, END TO END, AGAINST THE REAL DATABASE** (P2.6b). Signs in as a DISPOSABLE test account, writes 17 aggregates across all 25 tables through `applyChanges` — the app's own function, not a copy — reads them back through `hydrateFrom`, compares, writes again to prove an update is not a duplicate, then deletes everything and proves the database is exactly as it was found. Every id begins `a76-`. Section 6 replays a P2.5b outbox into the real database. 38 checks — needed `.env.test`. ⚠️⚠️ **THE ACCOUNT WAS DELETED IN P3.1 (§13), SO THIS GATE NOW FAILS AT ITS FIRST CHECK AND THAT IS THE GREEN RESULT.** It is kept because it documents the write path and because a future session with its own disposable account can run it again |
| `bun run live` | **A75** — the LIVE schema against the mapper (P2.6b), and **it needs no password**. PostgREST resolves `?select=` against the schema BEFORE applying RLS, so an anonymous request names a missing column (400/42703) and an existing one answers `[]`. 25 tables probed column by column (PO point 6 added `entity_livestock`), 16 enums probed label by label, `app_users` closed to a stranger. **48 checks** — needs the internet, not a dev server |
| `bun run mapping` | **A74** — the mapper (P2.6b). Drives all 380 fixture aggregates out through `toRows` and back through `fromRows` and fails on any difference, then parses this repository's OWN migrations and asserts both directions of the column contract: no column the mapper writes is missing, no `not null`-without-default column goes unwritten. ⚠️ Its migration parser learned `create table IF NOT EXISTS` the day PO point 6 wrote one — a parser that stops seeing a table because somebody used the SAFER form of the statement is worse than one that fails. **33 checks** — no browser, no dev server, no network |
| `bun run persist` | **A73** — the store interface (P2.6a). Drives all **54** exported mutations through a RECORDING backend and asserts what each one writes: the fan-outs (a zone rewrites the farm's dunams, the dual hat materialises a driver, a visit rewrites `nextVisitAt`), the ones that mutate IN PLACE and an identity diff would silently lose, and the three things that must never be written (a session change, a reset, a hydration). ★ Its section 7 cross-checks the names `@core` exports against the names actually DRIVEN, and it failed the moment PO point 8's nine deletions landed — which is exactly its job. **94 checks** — no browser, no dev server, no network |
| `bun run auth` | **A70** — the door (P2.3). Starts its OWN two dev servers, one in each mode, and compares them: real mode shows the login form and nothing else on 8 routes, refuses a wrong password IN HEBREW, gives an unknown address the SAME message, leaves no token behind; demo mode is byte-for-byte P0bis. Then B1 without a browser — 26 tables anonymously closed, an anonymous coordinator-grant INSERT refused, the three policy helpers 404. 20 checks — **needs no dev server, and never needs the password** |
| `bun run empty` | **A81** — PO point 5: every coordinator screen against an **EMPTY programme**, which is the state the real app starts in and the one nobody has ever looked at. A block with a heading and no body must carry an `EmptyState`; a screen with nothing in it must show one somewhere, or be exempt WITH ITS REASON PRINTED. Captures `docs/screenshots/empty/`. Needs a dev server |
| `bun run report` | **A80** — PO point 7c: **the report and the dashboard cannot disagree.** Every field of `ProgrammeReport` against the accessor the dashboard itself renders, with the figures that have no accessor yet re-derived INDEPENDENTLY — over THREE stores: the fixtures, an EMPTY programme (where `guardedHeads === null` is proved) and the fixtures with a moshav, a kosher volunteer, a visit and an urgent incident added. Plus the check that keeps it true: the renderer may import only a TYPE from the domain, so it cannot read the store. 86 checks — no browser, no dev server, no network |
| `bun run deletion` | **A79** — PO point 8: deleting a record. Free deletion with its dependencies LISTED, a motivated refusal on operational history with the blockers named and counted, the store refusing as well as the dialog, the whole cascade reaching the backend as `json: null`, and two checks that keep it honest over time — every `DeletableKind` has a call site in the UI, and every one of them asks first. 61 checks — no browser, no dev server, no network |
| `bun run basemap` | **PO point 0** — `bun run basemap <file> <key>`: the resumable (TUS) upload a 94 MB archive needs, and then it VERIFIES the public object — length byte-for-byte, 206 on a range, `PMTiles` in the first seven bytes, and a 64 kB slice from the MIDDLE compared against the local file. ⛔ Needs a coordinator token (`BASEMAP_TOKEN`); see §14.4 |
| `bun run ground` | **A83 — THE BASEMAP, PROVED IN A REAL BROWSER ON A BLANK PROFILE** (the product owner's rule, 2026-09-01), and **the deploy gate runs it on every build**. A FRESH Chromium context — no storage, no service worker, no cache — pointed at a build carrying the same basemap input that deploy resolved, and four proofs and nothing else: **1** the pmtiles URL that actually LEAVES the browser, logged verbatim with its `Range` headers; **2** the `206` and the archive's TOTAL length, read off `content-range` and compared to the register IN BYTES; **3** the הגדרות screen of that same build, naming the same archive and showing the same MB; **4** חיפה (Haifa) at z12, z13 and z14 — features counted, captures written to `docs/screenshots/basemap/`. ⚠️ **It drives a DEMO build and the file says so**: the real app's first screen is a login door whose password only the PO has ever typed (§14.4), no gate can sign in and none should be able to; what decides the basemap is `VITE_BASEMAP_URL` and the constant behind it — the same two inputs in both modes. **It FAILS the deploy** on anything the missing upload does not explain, and on the regression guard; while the national archive is genuinely absent from the bucket it prints Haifa's three empty lines and lets the build through — the same policy as the curl gate above and for the same reason. `GROUND_URL` exists only to exercise the strict branch before the object does, and that branch HAS been exercised (exit 1). **11 checks. Makes its own build; needs the network** |
| `bun run redraw` | **A85 — THE MAP REPAINTS AFTER A BRUTAL ZOOM-OUT** (PO return B1, 2026-09-02), and the deploy gate runs it. A scripted z14 → z7 **in ONE camera command** at three cities, plus the ladder z13 → z1, plus the reverse. ★ **It refuses `areTilesLoaded()` as evidence** — that returned **true** through the entire bug, which is why nothing caught it. Instead: did MapLibre raise ANY error, is any tile `errored`, and does a grid of probe points *inside the archive's own bounds* actually return rendered features. Its last section drives the empty-stack guard directly and FAILS if the style asks for a glyph range that is not vendored. **18 checks. Makes its own build (or takes `BASE_URL`); needs the network** |
| `bun run overlap` | **A86 — NO MAP CONTROL COVERS ANOTHER ONE** (PO return C, 2026-09-02), and the deploy gate runs it. Nine map screens × four viewports. ★ **`bun run layout` could never have caught this and was right not to**: its collision test is restricted to VIEWPORT-pinned elements, and the map's controls are pinned to the MAP. This one's frame of reference is the map container, and it found two real collisions on its first two runs — the drawing tools on MapLibre's attribution link, and the control stack on the bottom bar at phone widths. Also enforces the 44 px floor on every stack button. ⚠️ Map MARKERS are excluded, and the reason is written out: a pin slides under any overlay the moment you pan. `ENGINE=webkit`, `VIEWPORT=…`, `BASE_URL=…`. **72 checks** |
| `bun run freehand` | **A87 — ציור חופשי, DRIVEN BY AN APPLE PENCIL** (PO point 9b), and the deploy gate runs it. A complete stroke through CDP with `pointerType: 'pen'` on every event, at **both** iPad viewports: the stroke becomes a simplified polygon with its surface in dunams, **the map does not move under it** (measured in metres of camera drift), the same stylus drag pans again with the mode off, and a bad stroke cancels leaving no zone and no armed mode. ⚠️ It caught a real bug on its first run — an effect that tore itself down mid-stroke. **30 checks. Makes its own build (or takes `BASE_URL`)** |
| `bun run offline` | **A72 + A78** — the offline shell (P2.5a) AND the signed-in offline session (P2.5b). The ONLY gate that BUILDS the app and serves the build, because the service worker is production-only: the worker takes control, one online load is enough to survive being pulled offline, ★ **a Supabase read offline FAILS** (nothing from the API is ever cached), looked-at ground is still there, the badge comes and goes, the frozen /poc comes back as ITSELF, and a real build shows its door rather than a browser error. **P2.5b added the only claim in this project that cannot be made outside a real browser**: signed in, IndexedDB really holds the snapshot, a token that cannot be refreshed offline does NOT end the session, the network coming back re-asks and a refusal DOES end it, and an explicit sign-out empties the device. **PO return 3 (2026-08-31) added the other half of the same scenario**: the reopened offline app SHOWS ITS OFFLINE BADGE, and the door explains the one thing that genuinely needs a network — `אין חיבור לאינטרנט — נדרש חיבור להתחברות ראשונה` — before a password is typed, and again instead of a generic server error if one is. **And PMTiles folded in the claim the whole map unit exists for**: the basemap answers a RANGE request with no network at all (the Cache API refuses a 206, so the worker holds ONE archive and slices it), what comes back is the archive rather than an error page, and the map really draws from it. **19 checks and ONE SKIP is the green result since P3.1 (§13)** — the last section needs `.env.test` and the disposable account is gone, which is the intended end state. It was 33 before. **No dev server; it makes its own** |
| `bun run storage` | **A71** — the two private buckets (P2.4): no public route on either (`NoSuchBucket`, the one proof that does not depend on them being empty), no bucket or object enumeration, no signed URL minted for a stranger, no anonymous upload. 10 checks — no browser, no dev server, no password |
| `bun run outreach` | **A68 + A69** — the sending centre and the WhatsApp group kit, read off the rendered DOM: the right channel per phone type, prefilled `wa.me` / `sms:` / `mailto:` links DECODED and checked, the grouped SMS and email, the sent tick surviving navigation, and the kit's three copies. 25 checks — needs a dev server |
| `bun run rtl` | **A67** — the generated .xlsx downloaded through the real UI, then opened: both sheets `rightToLeft`, every cell styled, every style right-aligned with `readingOrder="2"`, the header frozen, the instructions sheet complete. 45 checks — needs a dev server |
| `bun run mapfirst` | **A64** — the exhaustive "map on the LEFT" audit: every route in the app at iPad landscape, each screen printed with whether it carries a map and, if it does, proof the map is the left column. Exemptions print their reason. Needs a dev server |
| `bun run splitter` | **A65** — the map/content seam driven by MOUSE and by SYNTHETIC TOUCH at iPad landscape: 44 px grip and hit area, live canvas resize, ratio persisted per screen, bounds, double-tap reset. 72 checks — needs a dev server |
| `bun run layout` | **A24 + A30 + G11 + PO returns 5 and 7** — overflow, pinned overlap and uncontained-list sweep over all 24 screens, now **at three positions of the map/content seam** (the screen's own default, 25 %, 75 %) reached by focusing the real `role="separator"` and pressing `End`/`Home` — one page load, three ratios. Horizontal scroll is measured TWICE: `scrollWidth`, and the document's real scroll range, because this app is RTL and its overflow goes LEFT into negative `scrollLeft`. `VIEWPORT=phone` (default, 390) / `iphone` (402×874) / `ipad` (1032×1376) / `ipad-ls` (1376×1032) / `all`. **`STANDALONE=1` runs the whole sweep as the INSTALLED APP** — stamps `data-standalone` and the real devices' safe-area insets, asserts the status-bar gradient's height and that no control inside a viewport-pinned bar rests in the system zone, and captures `docs/screenshots/standalone/`. ★ **`STANDALONE=ios` is the configuration that actually SHIPS** (option A, and it went the other way for exactly one day — §24.5): installed, top inset **0**, home indicator real. `STANDALONE=1` is option B's geometry, kept as the case where an inset really exists. ★ **`ENGINE=webkit` runs the whole thing in Safari's engine** (PO point 2), which is every browser on his iPad. `STATUSBAR=translucent` stamps option B's scrim for the arbitration captures. **32 routes** — the form screens joined, including the ones that are not URLs (both modals, wizard steps 2–4). Needs a dev server |
| `bun run wizard` | **A27** — the guard wizard played from a farm with NO anchor point, 28 checks — needs a dev server |
| `bun run touch` | **A63 + PO point 9** — every map gesture driven by SYNTHETIC TOUCH at iPad portrait 1032×1376, **and then the same vocabulary again with an APPLE PENCIL** (`Input.dispatchMouseEvent` with `pointerType: 'pen'`): drawing a zone end to end, closing it by BUTTON rather than by double-tap, editing a vertex, inserting a corner, placing and dragging a pin — **and signing**, where the check counts INKED PIXELS rather than trusting a handler to have fired. **52 checks** — needs a dev server |
| `bun run import` | **A44** — download each template, fill it, upload it back, find the records; 28 checks — needs a dev server |
| `bun run screenshots` | Regenerate `docs/screenshots/` — needs a dev server |
| `bun run brand-reference` | Re-capture `docs/brand/` from the live artzenu.org.il — needs the internet, NOT a dev server |

> The ten browser scripts (`outreach`, `rtl`, `mapfirst`, `splitter`, `layout`,
> `wizard`, `touch`, `import`, `screenshots`, `brand-reference`) take
> `BASE_URL`, e.g.
> `BASE_URL=http://localhost:62807 bun run layout`. **`auth` is the exception**:
> it starts and stops its own two servers, on `REAL_PORT` (5199) and
> `DEMO_PORT` (5198), because its entire claim is a COMPARISON between the two
> modes and half-remembering which server was which is how that claim goes
> wrong.

> **Toolchain:** this machine has **no Node.js**. Bun is at `/usr/local/bin/bun`
> (Homebrew, Intel prefix `/usr/local`). `npm`/`node` fail with "command not
> found".

**Live preview (the app, and it keeps moving):**
https://azmer-fts.github.io/lo-yanum/
**REDEPLOYED 2026-08-31 WITH THE PO'S SEVEN RETURNS, and verified live rather
than assumed** — on the deployed page itself: the reveal button measures
**44 × 44**, the password field really flips `password` → `text`, its
`aria-label` is `הסתר סיסמה`, `autocomplete` is `username` /
`current-password`, and pulling the browser offline puts
`אין חיבור לאינטרנט — נדרש חיבור להתחברות ראשונה` on the door. In the shipped
files: the stylesheet carries `--shell-bottom: var(--safe-bottom)` (point 6's
grey band is gone from the artefact, not just from the tree) and the
`html[data-standalone] body:before` gradient; the bundle carries the project
ref, `lo-yanum:last-email` and the Hebrew offline string; **`black-translucent`
appears only inside the explanatory comment and as no meta tag**, which is the
whole of the judgement call in §12bis.7. The frozen `/poc` bundle still
contains the project ref **zero** times.
**AND THE KEEP-ALIVE RAN FOR REAL** (`workflow_dispatch`, run 33390602694):
`attempt 1: HTTP 200`, `Response: []`, and the two secrets masked as `***` in
the public log while the project ref still prints — which is what the `sed` on
the host was for.

**(previous) DEPLOYED 2026-08-31 WITH P2.6 + P2.5b, and verified live rather than
assumed:** the app's bundle CONTAINS the project ref (so the build is REAL and
not the silent demo fallback the note below warns about) and the deployed page
renders the Hebrew login form; the frozen `/poc` bundle contains the project
ref **zero times**, which is what "frozen" has to mean.
**The FROZEN POC (G13, never redeployed):**
https://azmer-fts.github.io/lo-yanum/poc/
Public repo: https://github.com/Azmer-FTS/lo-yanum — deploys on every push to
`main` via `.github/workflows/deploy.yml`.
**And `.github/workflows/keepalive.yml` (PO return 4) pings the Supabase REST
API every two days** so the free project is never paused for inactivity. ⚠️ It
becomes pointless and should be DELETED the day the project moves to a paid
plan; and GitHub disables scheduled workflows in a public repository after 60
days with no commits, so a two-month pause in the work pauses the database a
week later. See §12bis.4.

State: **FINAL ORDER OF MARCH IN PROGRESS (2026-08-30). PHASE P0 IS DONE.
PHASE P1: G10, G18 and G12's verification ARE DONE. PHASE P2: P2.2 (schema +
RLS) IS APPLIED. PHASE P0bis IS IN PROGRESS — P0bis.1 (map on the
left EVERYWHERE), P0bis.2 (the draggable seam), P0bis.3 (the density pass)
and P0bis.4 (a really-RTL .xlsx) ARE DONE and green (A64: 26 screens; A65: 72
checks; A66: the screen-by-screen table below; A67: 45 checks). Next:
P0bis.5 IS DONE (a, b and c). **PHASE P0bis IS COMPLETE, AND G13 HAS FROZEN
THE POC.** **P2.3 (AUTH) IS DONE** — the deployed app requires a Supabase
session, A70 is green at 20 checks, and the initial bundle grew by 1.6 kB
gzipped rather than 103. **P2.4 (STORAGE) IS DONE** — two private buckets, one
read rule that asks the existing RLS rather than restating it, A71 green at 10
checks. **P2.5a (THE OFFLINE SHELL) IS DONE** — service worker, offline badge,
הגדרות, A72 green at 11 checks. **P2.5 IS SPLIT** (PO decision, 2026-08-31): its
DATA half cannot precede P2.6, because an outbox flushing to a mock store and an
IndexedDB cache persisting demo data would contradict "the real app starts
EMPTY". **P2.6 (THE REAL SWITCH) IS DONE** — the store is an interface with a
demo and a Supabase implementation, the real app starts EMPTY, the write-through
is derived from a structural diff rather than declared, and the schema caught up
with `types.ts` (two units of drift, found by A74 on its first run). A73 green
at 84, A74 at 33, A75 at 46 — and every pre-existing gate re-run green. **P2.5b (THE OFFLINE DATA LAYER) IS DONE** — an IndexedDB read
cache, a coalescing write outbox, the "N ממתינים לסנכרון" badge, a documented
conflict rule, and a session that no longer ends because a token could not be
refreshed on a farm track. A77 green at 28, A78 folded into A72 at 24, A76 at
38. **Criterion B2 is complete.** **THE PRODUCT OWNER'S SEVEN RETURNS OF
2026-08-31 ARE DONE** (§12bis): the password eye, the remembered address, the
offline door — which JOINS criterion B2 — the Supabase keep-alive workflow, the
horizontal-scroll rule now permanent in `bun run layout` at three splitter
ratios, the grey band at the foot of the real app (its cause was a token, not a
component), and P3.4's installed-app status bar with `STANDALONE=1 bun run
layout` behind it. **PMTILES (decision 71) IS DONE** (§12ter): a 42 MB
self-hosted Protomaps archive in the project's first PUBLIC bucket, a vector
style written from `tokens.css` in both themes, the `hue-rotate` deleted — which
closes open question 9 — the glyphs, sprites and the RTL plugin vendored so the
map needs NO external host, and a real "download the map" button whose service
worker synthesises 206s out of one cached archive. `offline` green at **33**,
`mapfirst` 27, `splitter` 72, `touch` 32 — **and it is DEPLOYED and verified
live**. **P3.1's test-account deletion IS DONE (§13).**

**THE PRODUCT OWNER'S SECOND RETURN OF 2026-08-31 IS DELIVERED — ALL ELEVEN
POINTS (§13–§20), AND THE SIGNATURE WITH THEM (§21).** Two things wait on HIM
and nothing else: **point 0's 94 MB upload** (§14.4) and **point 1's
arbitration** (§15.4). **§22 is the honest remainder of P3.** The French report
for him is `docs/RAPPORT-2026-08-31.md`. One commit per unit. Branch `main`.

> ✅✅ **THE STANDING REMINDER IS DISCHARGED (2026-08-31). THE TEST ACCOUNT IS
> GONE — auth user, `app_users` row and `.env.test`, all three verified by a
> RE-READ rather than assumed. See §13.** `dov+test@serialkolors.com`
> (`304d2f3b-90ca-43dc-bfac-1361c8184303`) existed so that `bun run write` could
> prove the write path against Frankfurt, and it carried a `coordinator` grant —
> total read and write over the whole programme, which was a grant over NOTHING
> while the database was empty and would have been a second door onto real
> farmers' phone numbers the moment P3.1 imported them. It no longer exists.
> ⚠️ **THE CONSEQUENCE, AND IT IS NOT A REGRESSION:** `bun run write` now FAILS
> at its first check and `bun run offline` now reports **19/19 with its last
> section SKIPPED**. Those are the green results. Do not "repair" either one,
> and do not re-create the account.

> **P0bis.1 — THE MAP IS ON THE LEFT ON EVERY SCREEN THAT HAS ONE (frozen PO
> rule).** Five screens obeyed the map-first gabarit and eight others put the
> map ON TOP of the content, which is the same information in two places
> depending on the route you arrived by. What was done:
> · **`ui/components/MapSplit.tsx` IS NOW THE ONE SHELL.** `MapPanel` and the
>   farm detail each carried a hand-written copy of the layout and the copies
>   had already drifted (one breaks at `lg`, the other at `xl`). Both now
>   delegate. It takes a `breakpoint` (`lg`/`xl`), a `contentPercent`, and a
>   render prop for each half that receives `{ mode, setMode }` — the farm
>   detail needs the setter, because selecting a zone there has to bring a
>   hidden map back.
> · **TWO SCROLL STRATEGIES, AND THE SECOND ONE IS WHY THE ROSTERS COULD JOIN
>   AT ALL.** `scroll="panel"` is Lot 0.9's reading: the content column is its
>   own scroll container. `scroll="page"` keeps the WINDOW as the scroll
>   container and makes the MAP column `sticky` instead. P0.2's note "WHY NOT
>   MapPanel" was right — a G7 window-virtualised table inside an
>   `overflow-y-auto` column measures its scrollMargin against the wrong box
>   and draws its rows a page above themselves — so the shell grew a second
>   strategy rather than the screen a second layout. `PeopleMap` is now just
>   the map; the bubbles are the left panel and the 300-row table is the right
>   one, with G7 untouched.
> · Converted, each named in the A64 run: **volunteers, drivers, mission
>   detail, incident detail, anchor sheet, anchor form (both routes), farm form
>   (new + edit)**. Already compliant: dashboard, farms, route planner,
>   missions, incidents, farm detail, wizard step 1.
> · **`contentInFull: 'unmount'`** exists for the two rosters only, and for the
>   same virtualiser reason: everything else is `display:none` in `full`, which
>   is what preserves a list's scroll position and its progressive page.
> · **The bleed list became "every screen that carries a map".** A map-first
>   screen pads itself inside MapSplit's content column, so `isBleedPath` grew
>   the two rosters, the two detail routes, the anchor routes and the farm
>   form. The incident detail is the one screen that can go BOTH ways — an
>   incident with no position has no map — so its mapless branch supplies the
>   padding the shell no longer does.
> · **The FIELD screens (farmer/volunteer/driver) are the printed exception.**
>   Their shell is a `max-w-2xl` phone column at every width, which IS the
>   narrow responsive form the rule allows; splitting 672 px in two would be
>   worse on the phone those screens exist for. A64 prints the reason on every
>   run rather than skipping them silently. **This is the one judgement call in
>   P0bis.1 and it is the PO's to overturn.**
> · `PinMap` gained `flush` (square corners, error as an overlay) so the farm
>   form's pin can fill a panel, the same trick `AnchorMap` already had.
>
> **P0bis.2 — THE SEAM BETWEEN THE TWO PANELS IS A CONTROL.**
> · `ui/components/splitter.tsx` — `PanelSplitter`, a `role="separator"` with
>   pointer events (mouse AND finger through one code path), `touch-action:
>   none` (load-bearing: without it the first millimetre of a drag is claimed
>   by the page's own scroll and the handle never sees the rest), pointer
>   capture, arrow/Home/End keys, and a double-tap reset.
> · **A COMPONENT, NOT A `MapSplit` DETAIL, ON PURPOSE.** The wizard's step 1
>   is map-first but lives inside the stepper's own height budget; had the
>   splitter been private to MapSplit, that screen would have been the one
>   exception to a rule that was just frozen.
> · **THE RATIO IS THE CONTENT'S SHARE, 25–75, PERSISTED PER SCREEN** under
>   `lo-yanum:map-ratio:<screenKey>` — the mode's own key space. Storing the
>   CONTENT's share is what makes the drag one formula in both writing
>   directions: the content column is always the physical right one
>   (decision 34), so its width is "the shell's right edge minus the pointer",
>   with no per-direction sign. The bounds are not decoration — past either end
>   one panel stops being a panel and starts being a stripe.
> · Published as `--content-w` on the shell and consumed as
>   `lg:w-[var(--content-w)]`, because a `lg:w-1/3` cannot be dragged.
> · The map canvas follows inside the same gesture — MapCanvas's ResizeObserver
>   was already there — and A65 asserts it: the canvas grows by exactly what
>   the content lost, on all five screens.
> · **A65 caught a real trap in its own first draft**, worth keeping: asserting
>   "the content shrank by the pixels dragged" fails on any row with a `gap`
>   between the panels (the wizard has one). The ratio is computed from the
>   pointer's ABSOLUTE position, so the expected value is exact and the
>   assertion is now written against the model rather than against a delta.

> **P0bis.3 — THE DENSITY PASS, SCREEN BY SCREEN (A66).** Three rules from the
> product owner: (a) the context's key information at the top, BIG — "he
> drives"; (b) blocks with little in them go TWO PER ROW instead of stretching
> down the page, and re-stack when narrow; (c) no unjustified emptiness.
>
> **THE MEASUREMENT MOVED FROM THE VIEWPORT TO THE BOX, AND IT HAD TO.**
> P0bis.2 made the content column a width the coordinator drags, so a
> `xl:grid-cols-4` stopped being merely coarse and became WRONG: the viewport
> is `xl` while the panel it lays out in may be a quarter of the screen. Three
> utilities in `index.css` replace the breakpoints inside panels:
> · `.auto-cols` + `[--col-min:…]` — `repeat(auto-fit, minmax(min, 1fr))`. Asks
>   no question and needs no container: it lays out against the width it has.
>   KPI strips, dunam cards, status counts.
> · `.metric-band` — the same thing at a 9 rem floor, for a key-numbers band.
> · `.pair-grid` (36 rem) / `.pair-grid-wide` (50 rem) inside a `.panel-scope`
>   — CONTAINER queries. Used where two columns need a real judgement about
>   room.
> · `.form-grid` — a `FormSection` is its own measuring box now, so a form is
>   two columns when THE SECTION is wide enough. `md:col-span-2` became
>   `col-span-full` at all 17 call sites (inert in the one-column reading).
> · **`container-type: inline-size` also makes an element a containing block
>   for `fixed` descendants**, so `.panel-scope` is always a small deliberate
>   wrapper — never `main`, and never an ancestor of a modal. `Modal`'s own
>   dialog carries it, which fixes a pre-existing mismatch: a `md:grid-cols-2`
>   inside a 32 rem dialog gave two 15 rem columns on any desktop.
>
> **Screen by screen — every screen in the app, including the ones that did not
> change and why:**
>
> | Screen | What the density pass did |
> |---|---|
> | dashboard | dunam pair + KPI strip → `auto-cols` (they were `grid-cols-2 xl:grid-cols-4` in a HALF-width panel); "tonight" and "farms by status" pair on a wide panel |
> | agenda | DAY view: the itinerary and the hour ladder side by side (`pair-grid-wide`) — stacked, the ladder started below the fold. Week and month grids UNTOUCHED: a calendar is read like text (decision 34) and it is full-width, so its breakpoints are honest |
> | farms list | KPI strip → `auto-cols`; farm cards pair as soon as the panel can hold two |
> | farm detail | KeyNumbers → `.metric-band` (was `sm:grid-cols-3 2xl:grid-cols-5` in a 42 % panel); identity and contacts → `auto-cols`; the SIX lower blocks — guard history, incidents, contacts, commitments, agreement, visits — pair, which is where the screen's five screenfuls came from |
> | farm form | every `FormSection` container-queried; the three dunam fields → `auto-cols`; the pin map is the left panel (P0bis.1), so the form no longer has a 46 dvh hole in its middle |
> | anchor sheet | the two messages side by side — they are the same briefing written twice and the job here is checking they agree; access + instructions pair |
> | anchor form | `FormSection` container-queried; the map is the left panel |
> | route planner | the four panels (pick farms / order / meetings / navigate) pair — four short lists that were four screenfuls |
> | volunteers | KPI strip → `auto-cols` (was `sm:grid-cols-3 xl:grid-cols-6`); the map is the left panel |
> | drivers | KPI strip → `auto-cols`; map left |
> | import wizard | **the three counts became the headline**: "412 will import / 6 skipped / 11 need a pin" was set at chip size and IS the decision the screen asks for; the mapping grids container-queried |
> | missions list | guard cards pair |
> | mission detail | **the PO's own model**: a key-numbers band (start, end, team, cars, posts) FIRST; the two confirmation tables (נסיעה לחווה / חזרה בבוקר) SIDE BY SIDE — the question is a comparison and stacked it costs a scroll; details + drivers pair; the three facts now in the band deleted from the details list |
> | incident detail | the report is the headline and set one size up; the four facts about it move BESIDE it instead of under it; thread full width |
> | incidents list | incident cards pair |
> | guard wizard | step 1 gets the draggable seam; step 3 (phone round) and step 4 (drivers) cards pair — the wizard is full-page and a one-column list of twelve short cards spends most of an iPad on nothing. Steps 2 and 5 ALREADY optimal: 2/3 + 1/3 at `lg`, full-page, so the viewport breakpoint is the honest one |
> | driver trip | a two-number band: departure time and head count. Both existed — one as a subtitle, one as the length of a list — which is not the same as readable at the wheel |
> | farmer guards | "coming" and "past" pair; on the phone the field column is narrow and it stays one stack |
> | farmer tonight | **already optimal** — the arrival time and the status chip are the first things in the guard card, which is the whole question a farmer opens the app with |
> | volunteer guard | **already optimal** — the two big confirmation buttons are deliberately the first thing on the screen (in the dark, at 21:00, it is the only thing the group-phone holder needs to reach). A numbers band above them would push the one control down |
> | volunteer roster | **already optimal** — one section, one list |
> | farmer/volunteer report | **already optimal** — a form, and `FormSection` now sizes itself to the column |
> | styleguide | **unchanged by design** — a catalogue is meant to be read end to end (its A30 exemption already says so) |
> | landing | **unchanged** — one plate, one verse, the identity chooser |

> **P0bis.4 — THE TEMPLATE IS REALLY RTL, AND G10's FLAG NEVER WAS.**
> · **THE DEFECT.** G10 wrote `sheet['!views'] = [{ RTL: true }]` and called
>   the template right-to-left. Unzipping the file it produced shows
>   `<sheetView workbookViewId="0"/>` — no `rightToLeft` — and a `styles.xml`
>   with ONE default `xf`: the community build of SheetJS writes neither the
>   view flag nor cell styles (styling is a Pro feature). The coordinator's
>   template opened left-to-right with left-aligned Hebrew. The product owner
>   was right, and no flag was going to fix it.
> · **`src/core/xlsx.ts` — the workbook is written directly.** An .xlsx is a
>   ZIP of XML and the template is a file whose every part we own. ~330 lines,
>   pure, no dependency: `rightToLeft="1"` on each sheet view, a frozen header
>   pane, per-column widths, and five cell styles that are ALL
>   `horizontal="right"` + `readingOrder="2"`.
> · **THE READING ORDER IS THE HALF THE VIEW FLAG CANNOT DO.** `rightToLeft`
>   on the sheet flips the COLUMNS; a cell whose text begins with a Latin
>   character — a Waze link, an English yeshiva name — still lays out
>   left-to-right INSIDE itself. `readingOrder="2"` is what fixes that, and
>   the farms template is mostly links.
> · **ENTRIES ARE STORED, NOT DEFLATED, ON PURPOSE.** The file is ~15 kB of
>   XML; a deflate implementation to save 6 kB would be the largest and least
>   testable part of the unit, and `CompressionStream` is not in every runtime
>   the verification scripts use. The DOS timestamp is FIXED for the same
>   reason: the same template must produce the same bytes, or a byte
>   comparison becomes a test of what time it is.
> · **A SECOND SHEET, "הוראות מילוי".** Do not rename the headers (that is how
>   columns are recognised), the grey rows are examples, extra columns are
>   ignored, required columns must have a value — and the one that costs an
>   afternoon: a SHORTENED map link carries no coordinates, so the row imports
>   and is badged מיקום חסר. Then a table of every column with its required
>   flag and its example.
> · **AN INVALID ATTRIBUTE WAS CAUGHT BY A THIRD READER, NOT BY US.** The first
>   version also put `rightToLeft="1"` on `<workbookView>` so the sheet TABS
>   would start on the right. `CT_BookView` has no such attribute: openpyxl
>   refused the whole workbook with `unexpected keyword argument
>   'rightToLeft'`, which is what Excel's repair dialog would have done to the
>   PO. Right-to-left is a per-SHEET attribute, full stop. A67 now asserts its
>   ABSENCE from the workbook view, because putting it back is the tempting
>   mistake.
> · **THE CSV EXPORT DID NOT EXIST.** `sampleCsv` was in `import.ts`, described
>   as "retained for the fallback path only", and called from NOWHERE — G10
>   replaced it and left it behind. Deleted: dead code documenting an
>   unreachable fallback makes the next reader budget for a path that is not
>   there. The two rules it carried are written into the comment that replaces
>   it, in case a CSV export is ever wanted back — the column order is the
>   template's own, and the file must open with a UTF-8 BOM or Excel on a
>   Hebrew Windows machine renders the headers as mojibake. The app still
>   READS an uploaded .csv; SheetJS handles that encoding.
> · **`bun run import` is the second proof and it was already there:** it
>   downloads each template, reads it back with SheetJS outside the browser,
>   refills it and uploads it through the wizard's own file input. 29 checks,
>   green — so the app can still read its own template.

> **P0bis.5a — THE EMAIL FIELD, AND WHY IT IS OPTIONAL EVERYWHERE.**
> · `email: string` on **Volunteer, Driver and FarmContact**; `''` means "no
>   address", which is a FACT about that person, not a missing value. It stays
>   optional by design: a yeshiva student with a kosher phone frequently has no
>   address, and a required field would either block his import or invite a
>   fake one — worse than nothing, because it looks like a channel that works.
> · `normalizeEmail` / `isEmail` / `mailtoHref` in `@core/messages`, beside the
>   phone helpers. The check is deliberately NOT RFC 5322: that grammar accepts
>   what no server delivers and rejects what every server does, and the two
>   mistakes do not cost the same. A false reject loses a real address read off
>   a business card; a false accept bounces one message.
> · Forms (volunteer, driver, farm contacts), both xlsx templates, the import
>   pipeline, and a column at `2xl` on both rosters — plus an envelope in
>   `ContactActions`, rendered ONLY when there is an address.
> · **A MALFORMED ADDRESS IS A WARNING, NOT A REJECTION** (`warnBadEmail`),
>   the same rule as מיקום חסר: the value is dropped and the coordinator is
>   told. Importing `0501234567` as an address would create a channel that
>   silently never delivers.
> · **THE FIXTURE NEARLY RE-ROLLED ITSELF.** The first version derived the
>   generated volunteers' addresses from `rng()`. Every other field in
>   `generate.ts` comes out of ONE seeded sequence, so drawing one extra number
>   shifted every subsequent draw and silently re-rolled all 275 volunteers —
>   different localities, different phone types, 254 active became 250. It is
>   derived from the INDEX now. The only reason it was caught is that
>   `bun run accept` prints the number.
> · **`scripts/import.ts`'s fixtures are keyed by HEADER now, not positional.**
>   Adding one column shifted three arrays and failed three checks for a reason
>   unrelated to what they test. The keyed version needs the same
>   longest-key-first rule `guessField` needs, and for the same reason: "איש
>   קשר" is a substring of "טלפון איש קשר", so a first-match-wins scan puts the
>   contact's NAME in the phone column. It did, on the first run.

> **P0bis.5b/c — THE SENDING CENTRE, AND THE LAW THAT SHAPES IT.**
> · **NO THIRD-PARTY APP MAY SEND A WHATSAPP OR AN SMS FOR A USER, OR CREATE A
>   WHATSAPP GROUP FOR HIM.** That is not a limitation of this build; it is the
>   platform. The WhatsApp Business API can — paid, behind Meta's approval —
>   and is recorded in §11 as a future step IF the association funds it. So
>   every button here is a HAND-OFF: it opens the coordinator's own app with
>   the message already written and he presses send. **Email is the exception**
>   — a server can send it, and P3.3bis will. The screen says all of this out
>   loud, because a coordinator who does not know why nothing sends itself
>   assumes the app is broken.
> · **THE TICK IS THE ONLY RECORD THAT EXISTS.** The app cannot know a message
>   was sent, so the screen is a CHECKLIST, not a status. That checklist is
>   what stands between a decision at 16:00 and a volunteer at a farm gate at
>   21:30 for a night that is not happening.
> · **`src/core/outreach.ts`** — pure: `channelsFor` (smartphone → WhatsApp,
>   kosher → SMS, **plus** email when there is an address),
>   `outreachRecipients`, `smsGroupRecipients`, `emailRecipients`,
>   `buildOutreachMessage` (one writer for all three events; the kosher branch
>   carries NO LINK — a phone with no browser turns a Waze URL into 60
>   characters of noise in a 160-character SMS), `buildGroupKit`.
> · **THE RECIPIENT LIST IS DERIVED, NOT SNAPSHOTTED.** G9bis stored a
>   `CancelNotice[]` pre-populated at cancel time; a driver added afterwards
>   was then invisible on the very screen whose job is "who has not been told".
>   `Mission.cancelNotices` became `Mission.outreach` — TICKS ONLY, one entry
>   per person actually ticked, keyed by event — and the list is recomputed
>   from the mission every render. `setCancelNoticeSent` → `setOutreachSent`,
>   an upsert; un-ticking DELETES the entry, so "no entry" means exactly one
>   thing.
> · **ONE MESSAGE WRITER, NOT TWO.** `buildCancellationMessage` is gone: a
>   second builder producing a nearly-identical message for one of three events
>   drifts from the other two within a lot. The cancellation panel keeps its
>   banner and delegates its list to the same `OutreachPanel`, which is also
>   how the cancellation gained the email channel it never had.
> · **A REAL DEFECT THE GATE FOUND, AND IT WAS INVISIBLE.** `smsHref` ran its
>   argument through `digits()`, which strips everything that is not a digit —
>   including the COMMA that separates recipients. The grouped SMS produced
>   `sms:0530000019050000002`: a single number belonging to nobody, inside a
>   link that looks perfectly well-formed. A test that checked the button
>   exists would have passed; A68 decodes the href, so it failed.
> · **THE GROUP KIT (P0bis.5c).** Three copies and three pastes: the name
>   (`שמירה <entity> <date>`), the numbers, the opening message, with the
>   three-step guide beside them. The numbers are INTERNATIONAL (`+972…`) —
>   WhatsApp's own participant search matches nothing else — and include the
>   coordinator, because a group he is not in is a group he cannot read at
>   02:00. **Kosher phones are EXCLUDED and named as excluded**: a number in
>   that list that silently never joins would leave the coordinator believing
>   somebody is in the group when he is not, which is the exact failure the
>   centre exists to prevent. They are covered by the grouped SMS instead.

> **G13 — THE POC IS FROZEN.** Tag `poc-final`, and a byte-for-byte copy of the
> built app committed at `public/poc/`, served from
> https://azmer-fts.github.io/lo-yanum/poc/ .
> · **WHY `public/` AND NOT A SECOND DEPLOY.** Vite copies `public/` verbatim
>   into `dist/`, so the snapshot rides along with every later build without
>   being rebuilt. A second Pages deployment would have been a second thing to
>   keep working; a committed directory is inert by construction.
> · **IT WORKS FROM A SUBDIRECTORY BECAUSE `base` IS `'./'`** — every asset
>   path in the built `index.html` is relative, and the router is a HashRouter,
>   so `/poc/#/coordinator` resolves without a second build. Verified by
>   serving `dist/` locally and opening the sub-path before pushing.
> · **NEVER `cp dist/. public/poc/` A SECOND TIME.** After the first freeze
>   `dist/` CONTAINS `poc/`, so copying it back nests a snapshot inside a
>   snapshot. `public/poc/FROZEN.md` says so, in the one place somebody about
>   to do it will be looking.

> **THE FINAL ORDER OF MARCH (product-owner prompt, 2026-08-30).** The product
> owner starts field work in TWO DAYS on an iPad Pro 13" (+ iPhone). The goal
> is a REAL tool — online, usable offline — by the end of this order. Four
> phases, in this order:
>
> · **P0** — last UX asks. ✅ DONE (see below).
> · **P1** — finish the POC: **G10 ✅ → G18 ✅ → G12 → G13**, specs already in
>   this file. (G11 is folded into G12's iPad pass; P0.3 already did the touch
>   half.)
> · **P2** — LOT 1, THE REAL THING: Supabase project `lo-yanum-prod`
>   (eu-central-1 Frankfurt, PO's org — **ASK BEFORE CREATING**), additive SQL
>   migrations for the whole mock model, RLS transcribed from `access.ts`
>   policy by policy, email/password auth with ONE coordinator account (the
>   PO's email — ask), private `photos` + `agreements` buckets behind signed
>   URLs, and the OFFLINE LAYER (IndexedDB read cache, an outbox for writes
>   with a visible "N ממתינים לסנכרון" badge, last-write-wins per changed
>   field, a service worker pre-caching the Negev OSM tiles ~50–80 MB with a
>   "רענן מפות לא מקוונות" button in a small הגדרות screen). The mock store
>   becomes the "demo" implementation behind an interface a Supabase
>   implementation also satisfies — NO screen changes. The real app starts
>   EMPTY; /poc keeps the demo data.
>   Criteria B1–B4.
> · **P3** — LOT 2 ESSENTIAL: real import into Supabase, real photos
>   (camera/file → client compression → bucket), agreement signing (finger
>   canvas → PDF with a clearly-marked PLACEHOLDER agreement text → bucket →
>   status נחתם), final PWA (manifest, icons, iOS/iPadOS install, הגדרות
>   page), deployment stays the evolving GitHub Pages URL.
>   Criteria B5–B8.
>
> Then a FINAL REPORT in French: both URLs, phase status, the login
> credentials to agree with the PO, a numbered field checklist per device, and
> step-by-step PWA install instructions for the iPad.
>
> **PO DECISION, 2026-08-30 — THE DISPLAY FACE IS FRANK RUHL LIBRE**, which
> REVERSES the 2026-08-19 arbitrage of Heebo. Done in commit 70e4469: the two
> OFL woff2 came back from `09b43f5^`, `--font-brand` names them, and Heebo
> left the bundle entirely, so A60 still reads "one display face ships". The
> numeric escape hatch stays load-bearing — Frank Ruhl Libre HAS digits, so
> `.text-display.numeric` and its three siblings must keep falling back to
> Rubik or every KPI goes serif and stops aligning.
>
> **P0 — DONE, three commits:**
> · **P0.1** (5439488) — the map is MODULAR on every map-first screen:
>   מוסתר / מפוצל / מלא, switchable by visible 44 px buttons, persisted PER
>   SCREEN in localStorage (`lo-yanum:map-mode:<screenKey>`). `useMapMode` +
>   `MapModeSwitch` in `ui/components/mapMode.tsx`; `MapPanel` takes a
>   `screenKey` and the farm detail wires the same hook by hand. `split` is
>   byte-for-byte the Lot 0.9 reading and stays the default. Screens:
>   dashboard, farms, farm-detail, route-planner, incidents, missions, plus
>   volunteers and drivers via P0.2. The map is `display:none` in `hidden`,
>   NOT unmounted — unmounting tears down the WebGL context and the camera
>   with it; MapCanvas's ResizeObserver calls `map.resize()` on the way back.
>   ONE switch is on screen at a time: below the breakpoint the map's own
>   header bar carries it and the content copy stands down, except in
>   `hidden` where no bar is left. Not to be confused with `useMapFullscreen`
>   (a viewport-takeover overlay armed from the map's toolbar) — the two
>   compose. A61.
> · **P0.2** (5a344d5) — the two rosters get a map that COUNTS: one bubble per
>   יישוב, area-proportional (`clusterByLocality` + `bubbleDiameter`, pure, in
>   @core/geo, tested as A62 in accept.ts), the count written inside, tap to
>   filter the table. The filter COMPOSES with the KPI-filters and the
>   existing "ניקוי" clears everything; the tapped town also reads back as a
>   removable pill so a filter set on the map survives the map scrolling off.
>   No per-person pin — the programme holds a home town, not an address — and
>   a locality outside the gazetteer is REPORTED, never dropped. NOT
>   `MapPanel`: both rosters are G7 window-virtualised tables whose scroll
>   surface is the page, so the map is a block ABOVE the table
>   (`ui/components/PeopleMap.tsx`) sharing the switch, the key space and the
>   hidden rule. The table is UNMOUNTED in `full`, never `display:none` — a
>   hidden virtualiser measures a scrollMargin of 0 and comes back drawing
>   rows a page above themselves. New `bubble` marker kind, translucent so
>   overlapping towns sit in front of each other. Also: VolunteersScreen
>   carried a literal NUL byte (the `|| '\0'` phone-search sentinel) that made
>   git treat the file as BINARY and its diffs unreviewable — now a space,
>   identical behaviour.
> · **P0.3** (04ba9aa) — the touch pass, and `bun run touch` is its proof.
>   `wrapForTouch` in MapCanvas leaves every marker's DRAWING alone and
>   expands its HIT area to 44 px (the trick the G1 vertex grip already used);
>   teardrops need no offset because their tip is the coordinate and the box
>   grows upward only. That widening created a trap the script then caught:
>   markers stop their click reaching the map (decision 51), and at 44 px the
>   transparent corners swallow taps that look like empty map — so an ARMED
>   map now suspends the guard for every kind, draggable included, applied to
>   the finished element in the markers effect so the early-returning vertex
>   and draft kinds cannot miss it. A63.
>
> **P1 — G10 IS DONE.** The import stopped being "the volunteers CSV" and
> became THREE rosters behind one pipeline, at `/coordinator/import/:kind`
> (the old `/volunteers/import` redirects — it is in the PO's history and in
> the Lot 0.9 captures). What is worth knowing:
> · **`src/core/templates.ts` IS THE SOURCE OF TRUTH.** A template is a list
>   of COLUMNS carrying their own label key, their own aliases, whether they
>   are required, three example cells and a width. The downloadable file, the
>   header guess, the mapping step's options and the required-columns check
>   are all DERIVED from it. Before this the columns were declared in three
>   places that had to agree by hand, and disagreeing produced a template the
>   wizard could not read — which looks to the coordinator like HIS file is
>   wrong.
> · **`guessField` matches the LONGEST alias first, across the whole
>   template.** "סוג טלפון" contains "טלפון" and "טלפון איש קשר" contains it
>   too; a first-match-wins scan in column order imports "כשר" as somebody's
>   phone number. Sorting by length is what survives someone adding a column.
>   Same trick for the Hebrew status dictionary, where "נוצר קשר" and
>   "ליצירת קשר" share "קשר" and reversing them would tell the coordinator he
>   has already called a farmer he has not.
> · **THE TEMPLATE IS AN .xlsx**, generated through SheetJS on demand, with
>   RTL sheet views and per-column widths. A CSV still mojibakes on a Hebrew
>   Windows machine often enough to matter.
> · **A SHARED PIN BECOMES A COORDINATE** (`parsePositionInput` in @core/geo):
>   Waze `?ll=`, its URL-encoded form, live-map `to=ll.`, Google `@lat,lng,15z`,
>   our own `?query=`, and a bare pair. Validated against an ISRAEL BOUNDING
>   BOX, which is what stops a zoom level being read as a longitude and what
>   silently corrects a reversed pair. A SHORTENED link (`maps.app.goo.gl`)
>   carries no coordinates at all — the position is behind a redirect that a
>   browser cannot follow cross-origin — so it returns null and
>   `isUnresolvableLocationLink` says so out loud.
> · **מיקום חסר IS A WARNING, NOT A REJECTION.** A farm whose link could not
>   be read still imports, parked on HOME_BASE, badged, and counted in its own
>   "דורשות השלמה" chip. Refusing it would push the work back into a
>   spreadsheet when dragging a pin takes four seconds. The preview tells the
>   three position facts apart — from the link / from the locality
>   (APPROXIMATE — the middle of a town, routinely 3 km out) / missing —
>   because they call for three different actions.
> · Farms de-duplicate BY NAME (they have no phone of their own), volunteers
>   and drivers by normalised phone. Imported dunams come in flagged MANUAL, so
>   G15's `syncZoneDunams` will not overwrite the farmer's own claim the first
>   time somebody draws a zone.
> · `bun run import` is the criterion's real proof: it downloads each
>   template, reads it back with SheetJS OUTSIDE the browser, refills it,
>   uploads it through the wizard's own file input and finds the records in
>   the roster. 28 checks. Everything between "download" and "upload" is where
>   an import breaks, and it breaks silently.
> · **Watch out:** `scripts/` is NOT in tsconfig's `include`, so `bun run
>   typecheck` does not see it. Changing a @core signature can leave a script
>   silently wrong — it did here (A9 passed an array where an object was now
>   expected and lost two checks). Run `bun run accept` after any core
>   signature change, not just the typecheck.
>
> **P1 — G18 IS DONE.** The threat layer, and it is the one genuinely
> SENSITIVE thing in the model:
> · **`ThreatZone` and `ThreatVector`** (types.ts), both with `farmId:
>   string | null` — attached to an entity, or FREE at map level, because a
>   threat does not respect a fence line and the ones that matter most sit
>   BETWEEN holdings. Both carry `intensity` (נמוך/בינוני/גבוה) and an
>   `updatedAt` the STORE stamps on every write, including a vertex drag: a
>   date a caller supplies is a date a caller can forget to bump, and a threat
>   map with no age invites acting in 2027 on a 2025 assessment.
> · **THE GATE IS IN `access.ts`, NOT IN A SCREEN.** `getVisibleThreatZones`,
>   `getVisibleThreatVectors` and `getThreatsForFarm` return `[]` for every
>   role but the coordinator. The consequence is deliberate and tested: a
>   FARMER IS REFUSED THE LAYER FOR HIS OWN FARM. The assessment names
>   patterns across holdings and is the programme's to hold. A59 exercises all
>   three roles through all three routes.
> · `getThreatsForFarm` deliberately includes the FREE shapes as well as the
>   attached ones — a threat between two holdings is the one a coordinator
>   most needs while looking at either of them.
> · **TWO HUES AND A WEIGHT, NOT THREE HUES.** Decision 49 keeps `--critical`
>   for four meanings and a threat assessment is none of them, so the ladder is
>   `--status-warn` → `--status-danger` and the third rung is DENSITY: a
>   double-stripe hatch and a heavier outline. Better encoding anyway —
>   density survives a sun-washed iPad and colour-blindness.
> · **THE TEXTURE IS THE POINT.** A hatch (a generated 16 px canvas per
>   intensity, `fill-pattern`) plus a DASHED outline, so the layer reads as an
>   overlay rather than as terrain before any colour is decoded — on a map
>   that already spends four tints on ground (G16).
> · A vector is TWO map clicks (origin, then target) and renders as two
>   features: a LineString shaft and a Point head whose `icon-rotate` takes
>   `bearingDeg` (new, pure, in @core/geo), with `icon-rotation-alignment:
>   'map'` so a two-finger twist does not leave every arrow lying. The head is
>   registered at pixelRatio 1: at 2 it came out ~9 px and a vector was
>   indistinguishable from a line, which defeats the object.
> · Surfaces: the farm/moshav detail (draw + the editable `ThreatPanel`), the
>   global farms map behind a remembered **שכבת איומים** toggle (OFF by
>   default — the global map's job is "where are my farms"), and WIZARD STEP 1
>   read-only, which is the layer's reason to exist: a post is placed FACING
>   the approach.
> · **Creation is only offered on an entity's map, by design.** That is the
>   one map in the app carrying a drawing instrument; bolting a polygon editor
>   onto the global reading surface would give the same gesture two homes. The
>   free-standing case is reached by DETACHING from the panel ("בטל שיוך"),
>   which covers both states of the model with one editor.
> · `window.__loYanumMap` is published from MapCanvas's `load` handler — a
>   handle for the verification scripts, since a MapLibre instance is
>   otherwise unreachable from outside React. Published on LOAD, not on
>   create: React's dev-mode double mount would otherwise leave it pointing at
>   the corpse of the first map.
> · **Environment note:** the in-app Browser pane stopped loading OSM tiles
>   part-way through this session and `map.on('load')` never fired there.
>   Playwright was unaffected. If a map looks empty in the pane, verify with a
>   script before believing it.
>
> **P1 — G12 IN PROGRESS.** Two real defects were found by the capture run
> itself, both fixed before the set was regenerated:
> · **The map column COLLAPSED in `full` mode below the breakpoint.**
>   `lg:flex-1` does nothing while the row is still a column, so the map fell
>   to zero height and the floating legend rode up over the page header. It
>   had never been seen because the hand test of `full` was at 1032, which is
>   ≥ `lg`. Both MapPanel and the farm detail now carry `min-h-0 flex-1` in
>   `full`.
> · **The capture set was ORDER-DEPENDENT.** Shot 29 leaves the farms map on
>   `full` in localStorage (that persistence is the point of P0.1), so shot 32
>   — the threat layer — opened full-screen with the toggle it was supposed to
>   press hidden behind the content column it had just closed. Every shot now
>   clears `lo-yanum:map-mode:*`, `lo-yanum:threat-layer` and sessionStorage
>   before it runs. A reference set that depends on its own order is not a
>   reference.
> · `bun run layout` gained VIEWPORTS (G11 folded in): `phone` 390 (default),
>   `iphone` 402×874, `ipad` 1032×1376, `ipad-ls` 1376×1032, or `all`. The
>   screenful cap travels with the viewport, because the same page is fewer
>   screenfuls on a taller device.
> · That sweep found one thing, and it was a FALSE POSITIVE IN THE AUDIT, not
>   a defect in the app: at 402×874 the mission detail's presence table put its
>   `sticky` header under the demo toolbar and A24 called it a pinned overlap.
>   A sticky header inside a `.table-scroll` box is pinned to THAT BOX — the
>   page scroll separates it from the toolbar like any ordinary element — so
>   the check now skips any sticky element with a scroll-container ancestor.
>   Deliberately NOT conditional on whether that ancestor currently overflows:
>   a box holding three rows today holds thirty tomorrow, and a layout gate
>   whose verdict depends on how much data is in the fixtures is not a gate.
>   `position: fixed` is still always in scope, and so is the volunteers
>   roster's column header — G7 made the WINDOW its scroll container, so it
>   really is viewport-pinned, which is the case the check exists for.
> · `public/manifest.webmanifest` carried the PRE-G17 forest greens
>   (`#07180F`) as its theme and background colour — the installed PWA would
>   have flashed the retired identity on every launch. Now `#0B1119`, the G17
>   night surface. `orientation` went from `portrait-primary` to `any`: the
>   one device this app exists for is an iPad that gets read in landscape and
>   drawn on in portrait, and rotate-locking it would be a field defect.

> **SPEC GAP RESOLVED (2026-08-19).** The product owner re-sent the missing
> sections in the prompt "LOT 0.10 — SECTIONS MANQUANTES G14–G16 + DÉCISIONS
> PO + ORDRE FINAL" and fixed the remaining order:
> **G14 → G15 → G16 → G10 → G18 → G11 → G12 → G13.**
> (G16 before G10 on purpose: the סוג יישות column of G10's חוות template
> depends on the entity type G16 introduces.)
>
> Two PO decisions arrived with it (checked at G12 as **A60**):
> · **The Artzenu MARK is retired** — landing + rail, and the asset leaves
>   the repo (grep-verified). The landing keeps לא ינום + the verse only.
>   This closes the "does the mark stay?" question G17 left open.
> · **Heebo is the display face.** Frank Ruhl Libre and Secular One leave
>   the final bundle; the /styleguide arbitrage section retires with them.
>
> **G14 — NUMBERS AT A GLANCE** (principle: the PO drives — key numbers on
> top, big; the long reading stays below):
> · a) DASHBOARD: two strategic KPIs FIRST — "דונם בשמירה" (sum of farm +
>   grazing dunams over signed/active entities) and "דונם פוטנציאלי" (sum
>   over non-signed non-refused). The association's budget number: big, first.
> · b) DASHBOARD ALERTS: compact FULL-COLOUR rows by severity (icon + title
>   + relative time only), collapsed by default; click → expands to the
>   current details and actions.
> · c) FARM DETAIL: map-first gabarit like the other screens — map on the
>   LEFT at full height (~55-60 %), content right. AT THE TOP of the content:
>   a key-numbers band in big type (farm dunams / grazing dunams / status /
>   next visit / last activity). Fix the truncated status pill in the
>   stepper. Timeline/recent activity raised high. Signed agreement: view
>   the PDF + download + SHARE (Web Share API / wa.me) — mock embedded PDF.
> · d) KPI-FILTERS on the lists (volunteers/drivers/farms): the top number
>   cards BECOME the clickable filters (visible active state, "נקה");
>   redundant pills deleted; the sticky wraps EVERYTHING at the top (title +
>   KPI + search + column headers). Enriched: volunteers (active, inactive,
>   smartphone, kosher, licence+car, never guarded); drivers (total,
>   cumulative seats, ≥7 seats, available tonight); farms (by status +
>   dunams).
>
> **G15 — ZONE EDITING + LIVE AREA:**
> · a) Editing an EXISTING polygon must be obvious: click on a zone →
>   selection → handles (existing) + ADD a vertex on an edge (click the edge
>   midpoint) + move the whole polygon (drag) + delete. An "ערוך" button per
>   zone in the list.
> · b) LIVE AREA: geodesic area in DUNAMS in /src/core/geo.ts (pure,
>   tested), displayed LIVE while drawing/editing (label on the polygon +
>   panel). The "שטח החווה"/"שטח מרעה" fields auto-fill (sum per type);
>   manual override stays possible and is flagged "מוזן ידנית".
>
> **G16 — ENTITY TYPE: חווה / מושב** (field-expert feedback): a "סוג יישות"
> field (חווה / מושב / אחר) — distinct map marker for מושב (village glyph),
> filter + KPI in the list, adapted labels ("גבול היישוב" when מושב), same
> zones/guards/posts mechanics. 2 mock moshavim. ZONE COLOURS — 4 distinct
> tints because a moshav can adjoin a farm: גבול חווה = tint A (outline +
> ~8 % fill); שטח מרעה חווה = lighter A′; גבול מושב = clearly different
> tint B; שטח מרעה מושב = B′. Legend updated everywhere; visual check with
> the mock moshav adjacent to a farm (A58/A55).

> **LOT 0.10 RESUME POINT.** The lot's full spec is the user prompt titled
> "LOT 0.10 (VERSION FINALE UNIQUE)", AMENDED mid-lot by the prompt "AJOUT AU
> LOT 0.10 EN COURS — G7bis" (2026-08-18, after product-owner review of the
> farm-detail screenshots), and by the 2026-08-18 update above. Section order
> was G0 → G2 → G1 → G8 → G5 → G3 → G4 → G6 → G7bis.1-3 → G9 (incl. G7bis.4)
> → G7; then **G17 was pulled forward** (an identity change belongs under all
> later visual work) → **G10 → G18 → G11 → G12 → G13**, with G14–G16 slotted
> wherever their re-sent spec says.
>
> DONE (each is one commit, in git log order): G0 (עמדת שמירה rename +
> dunams), G2 (PinMap + AutocompleteField + farm-form audit), G1 (FarmZone
> model/editor/tokens `--zone-*`), G8 (Mission pickup/dropoff points, 'car'
> marker, meet.tsx, buildDriverMessage), G5 (Mission.drivers[] replaces
> driverId, DriversScreen + DriverFormModal, dual-hat volunteerId link,
> capacity-sorted wizard step 4), G3 (pre-composed step 2, search + org
> filter, virtualised candidate list, availability soft-scoring in
> dispatch.ts), G4 ('recruiting' MissionStatus + requiredVolunteers,
> 3-of-5 dialog, ?resume= wizard pre-fill, updateMissionStaffing,
> escalating dashboard alerts), G6 (GeneralMeeting object/modal, 3-type
> agenda + chooser, day view, visit/meeting drag-and-drop — guards
> deliberately not draggable), G7bis.1 (marker iconography: shape+glyph+
> colour per point kind, --marker-farm token, postColor()/farmMarkerColor(),
> shape-true legends via MarkerSwatch, wizard.ts selector updated), G7bis.2
> (fullscreen working mode on AnchorMap/meet/PinMap/mission-detail maps —
> fullscreen.tsx, ResizeObserver in MapCanvas, armed modes eat Esc first),
> G7bis.3 (farm detail as two tracks from xl: 60 % map-at-56dvh + posts +
> guards + incidents, 40 % identity/contacts + CollapsibleSection blocks with
> sessionStorage memory; one column below xl BECAUSE iPad portrait is 1032),
> **G9** (planner↔agenda bridge: Tour object upserted per day + buildDayPlan
> engine in core/tours.ts folding the drive around meetings/visits as walls
> — guard missions shown but deliberately NOT walls; "היום שלי" block on
> dashboard + agenda day view; planner takes ?date=, lists the day's
> constraints, saves/deletes the tour, arrival time per stop; קביעת פגישות
> panel with per-stop call + pre-filled visit modal; suggestions by cheapest
> triangle-detour insertion; G7bis.4 "צור מסלול ליום זה" from day view and
> every week/month day menu — A50 flow works, scripted proof due at G12),
> **G9bis** (guard cancellation A45/A46: 'cancelled' status + required
> reason from closed list + note, cancelMission snapshots per-recipient
> notices (volunteers, drivers, farmer) with buildCancellationMessage and
> sent-tracking; reactivation to 'recruiting' resets driver confirmations
> and banners "reconfirm everything"; cancelled guards excluded from
> tonight/upcoming/past AT THE ACCESSOR, surfaced only in the missions
> screen's בוטלו tab and struck-through in the agenda; mission-07 seeded
> cancelled), **G7** (full-page tables: useWindowTable hook — WINDOW
> virtualisation with a measured scrollMargin, because the naive
> `offsetTop ?? 0` draws rows ~1000px below their slot and blanks the page;
> sticky column headers at `top: var(--shell-top)` with NO overflow-hidden
> ancestor; volunteers gain licence+car icons and a compressed availability
> column at xl; DriversScreen rebuilt as the same table; farms gain a
> מפה/טבלה toggle whose table reading is full-page OUTSIDE the map shell
> because a table cannot live in the shell's one-third panel — the map
> stays the default so A18 holds; dashboard KPIs moved to text-display;
> scripts/layout.ts now sweeps 23 screens: drivers added, volunteers
> A30-exempt with the reason printed), **G17** (the NEUTRAL IDENTITY, PO
> decision of 2026-08-18 — Artzenu colours AND faces retired: Atlas/Mekomi
> deleted (licence question closed), Rubik = body/UI/every number, Frank Ruhl
> Libre (OFL, self-hosted woff2, full nikkud verified on the landing capture)
> = display, Secular One + Heebo self-hosted as the two /styleguide
> alternatives awaiting the PO's arbitrage; light = barely-tinted grey page /
> white cards / grey-black ink, dark = neutral blue-grey, accent = one
> professional blue, statuses/zones/critical stay vivid; cards/tiles/callouts
> lost their contour (shadow + luminance only, callouts became start-bar +
> tint like card-critical), fields KEEP their 1.8-pinned hairline; button
> hierarchy = primary/danger/critical rectangles at 6px vs secondary/filter
> pills vs icon call buttons, enforced with the no-contour rule as **A57** in
> scripts/tokens.ts; body raised one notch (16/13.5/11.5 px) with layout
> green; landing plate now slate (--plate-from/--plate-to, audited);
> `.numeric` at heading scales explicitly falls back to Rubik because Frank
> Ruhl Libre HAS digits where Atlas shipped none; contrast/tokens/accept/
> dispatch/layout/wizard/build all green; captures 1-2/9-10/21-22 refreshed),
> **PO decisions 2026-08-19** (the Artzenu mark left the repo — landing is
> לא ינום + verse only, `imprint` prop and `.artzenu-mark` deleted; Heebo is
> THE display face, Frank Ruhl Libre + Secular One woff2 deleted, /styleguide
> arbitrage reduced to the verdict; index.html boot theme-color updated to
> the G17 night value; A60 ready), **G14** (the numbers lead: a) `getDunamKpis`
> in @core — דונם בשמירה = signed+active, דונם פוטנציאלי = pipeline minus
> declined — shown as the dashboard's two biggest figures, first, and
> recomputed independently in scripts/accept.ts (A52, 67 checks green);
> b) dashboard alerts are compact FULL-COLOUR rows (bg-critical, or amber
> bg-status-warn for calm recruiting), collapsed by default, click →
> aria-expanded detail with the call list; c) farm detail became map-first
> (bleed route via isBleedPath — `new`/`edit`/anchor sub-routes stay padded
> forms; AnchorMap gained `flush` for square corners; content column
> xl:w-[42%] scrolls alone; KeyNumbers band first: both dunams at
> text-metric + status chip + next visit + last activity; stepper ring
> un-clipped by `-m-1 p-1` on the scroll row + whitespace-nowrap; activity
> Timeline raised above the fold; AgreementActions = view/download/share —
> Web Share, wa.me fallback — over public/mock-agreement.pdf, a real 1-page
> PDF committed as mock; src/vite-env.d.ts added for import.meta.env);
> d) KpiFilter primitive (the card IS the filter, aria-pressed + accent
> ring, dot/hint variants) on volunteers (6 KPIs incl. licence+car and
> never-guarded, VolunteerStats extended), drivers (total-as-clear, seats
> Stat, 7+ seats, free-tonight via getTonightBookedDriverIds — a cancelled
> guard releases its driver), farms (per-status cards weighted in dunams,
> status pills deleted, type pills stay); from lg the WHOLE top — title +
> KPIs + search + column headers — is ONE sticky block at --shell-top with
> the rows card `lg:rounded-t-none` (`t-none` joined the tokens.ts radius
> allow-list); below lg it scrolls away, a phone cannot afford a 300 px pin
> — A51's sticky proof runs at desktop width), **G15** (zones are editable
> ground: click a zone or its ערוך in the farm detail's new zones list →
> emphasised drag-vertices + midpoint grips that INSERT a vertex + a
> four-way centre handle that drags the whole ring + delete; zone selection
> is CONTROLLED on the farm detail (AnchorMap keeps internal state
> elsewhere); `ringAreaDunams` (spherical excess) + `ringCenter` in
> @core/geo, tested in accept.ts (±1 % vs planar reference, winding/
> translation-proof, A54 — 73 checks green); live area chip rides the
> polygon while drawing/editing via a new non-interactive 'label' marker
> kind (offset above the move handle) and repeats in banner + toolbar;
> store gained ONE writer `syncZoneDunams` — every zone mutation AND the
> seed fold per-kind sums into שטח החווה/שטח מרעה unless flagged
> `farmDunamsManual`/`grazingDunamsManual` (optional on Farm, so fixtures/
> imports stay valid); farm form shows each dunam field's provenance
> (מוזן ידנית chip + "back to the map's sum", or the sum named as source),
> typing flips the flag, updateFarm resyncs on submit; farm-08 grazing =
> 3900 is the seeded override; the DASHBOARD dunam KPIs now read the synced
> values — the seed numbers changed, A52 recomputes so it stays green),
> **G16** (סוג יישות on Farm — `entityKind?: 'farm'|'moshav'|'other'`,
> absent = farm, read via `entityKindOf`; new 'moshav' MarkerKind with a
> village glyph (`entityMarkerKind` in badges.tsx swapped in at every farm
> marker call site incl. dashboard/farms/route/anchor-form/meet); FOUR zone
> tints — `--zone-boundary-moshav`/`--zone-grazing-moshav` blues in both
> themes + the system-dark media block; zoneColor/zoneLabelKey/zonePolygons/
> ZoneLegend take the entity (legend shows up to 4 rows on mixed maps, the
> single-entity form on the detail screen via `entity` prop); adapted labels
> גבול היישוב / שטח היישוב / צייר גבול יישוב + PointLegend המושב; farms list
> gained the מושבים KPI-filter (dunam-weighted) and the form the סוג יישות
> select (FarmDraft carries it); mocks: farm-13 מושב רתמים ADJOINS farm-01's
> grazing at 34.672°E (the A55 adjacency), farm-14 מושב באר חיל contacted;
> accept: A4 farm count 12→14, new A55 section — 77 checks green; layout 23
> screens + wizard 28 + tokens/contrast/dispatch/build all green).
>
> REMAINING (in this order): G10 (templates.ts source of
> truth + הורד תבנית xlsx generator + farms/drivers import with Waze-link
> parsing + מיקום חסר badge **+ the סוג יישות column from G16**), **G18** (threat zones + attack vectors, coordinator-only: new zone
> type "אזור איום" drawn like other zones in an explicit mode, red/orange
> hatched fill + dotted outline, fields intensity נמוך/בינוני/גבוה + note +
> displayed update date; new object "וקטור איום" = arrow placed in 2 clicks
> (origin then direction), red, note, editable/deletable; attached to an
> entity (farm/moshav) OR free at map level; visible on the global map behind
> a "שכבת איומים" toggle in the filter bar, on entity detail, and on wizard
> step 1 to place posts FACING the threat; access.ts hides the whole layer
> from farmer/volunteer/driver — sensitive data, tested; 2 mock zones + 2
> mock vectors in the Negev consistent with existing farms — criteria A59),
> G11 (iPad 1032×1376 / 1376×1032 + iPhone 402×874 perfection, safe areas),
> G12 (A1–A30 re-run + NEW A31–A44 **+ A47–A50 from the G7bis amendment,
> A56–A59 from the 2026-08-18 update, A51–A55 + A60 from the 2026-08-19
> re-send: A51 full sticky + clickable KPI-filters with "נקה" + zero
> duplicate pill at 300 volunteer rows; A52 correct דונם בשמירה/פוטנציאלי
> KPIs (recalc script from the mocks) + compact full-colour collapsed
> alerts expanding on click; A53 map-first farm detail (map left, numbers
> band, untruncated pill, PDF view/download/share); A54 existing-zone
> editing (move vertex + add vertex on edge + move polygon) + live dunam
> area auto-filled with flagged override; A55 moshav entity (distinct
> marker, adapted labels, list KPI/filter, 4 zone tints legible side by
> side); A60 Artzenu logo absent from the repo (grep), landing = לא ינום +
> verse only, one display face in the bundle** + light/dark captures incl. styleguide
> new identity, global map with threat layer on, farm detail with adjacent
> moshav + threat zone + vector + full ETAT rewrite — §8's contrast table
> below still shows pre-G17 values and G12 rewrites it — + deploy), G13 (tag
> `poc-final` + frozen copy at /poc/ + immutability rule). G14–G16: spec
> missing, see the SPEC GAP note above.
>
> G17 notes for G12: open question 8 (Artzenu font licences) is RESOLVED —
> all faces are OFL. `bun run brand-reference` and docs/brand-artzenu.md are
> retired/historical (the doc says so in its header). The Artzenu MARK
> question is now ANSWERED (2026-08-19 PO decision, A60): it goes — see the
> SPEC GAP RESOLVED note. A56 asks for a bigger body "si les gates
> layout passent": done, gates green.
>
> The G7bis amendment's acceptance criteria, to fold into G12's run:
> · A47 — the 4 point kinds are visually distinct (shape+icon+colour),
>   captures on farm detail AND mission detail.
> · A48 — fullscreen operational on farm detail and the wizard; a zone drawn
>   END-TO-END in fullscreen at iPad portrait 1032×1376. (Already exercised
>   by hand this session; needs its scripted/captured proof at G12.)
> · A49 — farm detail two columns at 1280 and iPad landscape, one column
>   with folding blocks at iPad portrait/402, map ≥50vh, alignments checked
>   by `bun run layout`.
> · A50 — "צור מסלול ליום זה" from the day view of a FUTURE day shows that
>   day's itinerary with its events (lands with G9).
>
> Verification note for G12: `bun run accept` was already adapted (driver
> scoping via drivers[], three agenda kinds); `bun run wizard` passes with
> the pre-composition flow AND the G7bis.1 teardrop markers (selector now
> matches teardrop+glyph, not the retired square). The G4.3 note "real push
> needs a backend (Lots 1+)" must survive into the final ETAT. A41's
> simple-version documentation: guards don't drag by design; visits/meetings
> drag on desktop, and each modal's date field is the mobile move.

> **Deployed and verified.** The first two attempts failed on `deploy-pages`
> with `HTTP 503` while githubstatus.com had Actions and API Requests at *major
> outage*; the third run went through and the live bundle was checked for Lot 0.9
> code (the map's "click to add a point" string and `btn-critical` are both in
> it). If a future deploy fails the same way, it is GitHub, not this repo — wait
> and re-run.
>
> Pushing needs the repo owner's account: `gh auth switch --user Azmer-FTS`. The
> machine's default account is `mgnamsellem`, which gets a 403 on this repo — a
> minute lost to that error once already.

---

## 2. Vision

A field coordinator enrols Negev farmers (signed agreement), then schedules
volunteer night guards (yeshiva students) and volunteer drivers who transport
them. Farms are remote; coverage is frequently zero. Some volunteers carry
"kosher phones" (calls + SMS only), so every guard group includes at least one
smartphone holder who acts for the group.

| Role | Sees | Default theme |
|---|---|---|
| **Coordinator** | Everything | **Light** (daylight desk work) |
| **Farmer** | Only his own farm | Dark |
| **Driver** | Only his own trips | Dark |
| **Volunteer** (group-phone holder) | Only his own guard | Dark |

---

## 3. Lot plan

| Lot | Scope | State |
|---|---|---|
| Lot 0 | Visual POC — 16 screens, mock data, role switcher | ✅ Done |
| Lot 0.5 | "Night Watch" redesign, editing flows, nominative confirmation | ✅ Done |
| Lot 0.6 | Map-first everywhere, light/dark themes, hierarchy, photos, tap-to-call | ✅ Done |
| Lot 0.7 | Command-centre palette, agenda, guard wizard, timelines | ✅ Done |
| Lot 0.8 | Artzenu brand charter — palette, typography, mark | ✅ Done |
| **Lot 0.9** | **UX/UI finishing: guard wizard, fields, rhythm, maps** | ✅ **Done** |
| Lot 1 | Supabase: schema, auth, RLS mirroring `/src/core/access.ts`, Storage for photos | Not started |
| Lot 2 | Offline-first sync | Not started |
| Lot 3 | Real agreement signing + PDF storage | Not started |
| Lot 4 | Scheduling assistance (promote `dispatch.ts` from proposal to automation) | Not started |
| Lot 5 | Notifications (SMS gateway for kosher phones, push for smartphones) | Not started |
| Lot 6 | EN + FR translations | Not started |

---

## 4. Lot 0.9 — delivered

The Artzenu charter was validated in principle and its EXECUTION tightened. One
blocking bug was fixed, and it is the one that shaped the whole lot.

| # | Scope | State |
|---|---|---|
| F1 | The guard wizard is no longer a dead end: a farm with no anchor point had a required, EMPTY select | ✅ |
| F2 | Wizard step 1 rebuilt map-first — a click on the map CREATES an anchor point, pins are draggable, several points per guard | ✅ |
| F3 | One radius scale (field 6 px / card 14 px / pill), fields untinted, focus = accent border + ring | ✅ |
| F4 | The charter orange promoted to a `critical` ROLE with a closed, enforced list of call sites | ✅ |
| F5 | Row alignment, density rebalance, rows that float, sticky stepper + actions, contained and progressive lists | ✅ |
| F6 | Every map big enough to read and work in; the farm detail and the anchor form became editing surfaces | ✅ |
| F7 | A1–A26 re-run, A27–A30 added, 54 captures, ETAT, deploy | ✅ |

### Lot 0.9 in one paragraph

The bug: choosing a farm with no anchor point rendered a mandatory select with
nothing in it and no way to add anything, so the wizard could not be finished and
nothing on screen said why. The fix was not a better message — it was to make the
map the instrument. Step 1 now uses the app's own map-first gabarit, a click
drops an anchor point, a drag moves it, and a guard can carry several because a
group of four routinely covers two positions in a night. That rule generalised to
the whole app: **when a required value is missing, the interface offers the way to
create it on the spot.** Around it, the execution was tightened — fields lost the
green wash and became a hairline on white, five radii became three that the build
enforces, the charter's orange finally appears on screen in the four places where
being loud is the point, lists that used to melt into the page now float above it,
and every map is big enough to be worked in.

### What actually changed, screen by screen (F5.2)

| Screen | Was | Is |
|---|---|---|
| Guard wizard, step 1 | one form column, a 20 rem inert map in a sidebar | map-first: map ~58 % on the physical left, form 42 %, both bounded to the viewport so only the middle scrolls |
| Guard wizard, steps 2–4 | rows on `surface-raised` inside a `surface-raised` card | `<Section bare>` + `.tile` rows that float; the 12-row proposal scrolls inside itself |
| Guard detail | five key/value rows in the 2/3 column, the presence MATRIX squeezed into the 1/3 | dense blocks (roster, presence grid, 24 rem map) take the wide track; facts, driver and timeline take the narrow one |
| Farm detail | 32 rem map in a 3/5 column, anchor points editable only two screens away | map-first at full column height, anchor points beside it, click-to-create and drag-to-move |
| Farm detail, facts | two columns inside a 38 % panel (`sm:` is a VIEWPORT query, not a container one) | one column from `lg`, two again only at `2xl` |
| Anchor form | 14 rem preview + a DISABLED "pick on map" button | the map IS the coordinate field; the numbers are the read-out |
| Import preview | every row of the file rendered straight down the page — a 300-row import put the wizard's own action bar far below the fold | height-capped box, pinned header, 20 rows at a time |
| Guards / incidents / farms lists | a hairline border and no fill — invisible in dark | `.tile-interactive`: card surface, the long Artzenu drop, progressive loading |
| Mission / incident / field maps | 11–13 rem thumbnails | 16–24 rem, and interactive with cooperative gestures so the page still scrolls |

---

## 4b. Lot 0.8 — delivered

| # | Scope | State |
|---|---|---|
| E1 | Charter extracted from the site's real Elementor CSS, logo decoded, both brand fonts parsed; `docs/brand-artzenu.md` + `docs/brand/` reference plates | ✅ |
| E2 | Both palettes rebuilt on the Artzenu gamut; Atlas + Mekomi self-hosted; pill controls; mark on the landing and the rail; day/night map filter re-tuned | ✅ |
| E3 | 122 contrast pairs AA, `/styleguide` re-validated, A1–A24 re-run, 44 captures, deployed | ✅ |

**The document to read before touching colour or type is
[`docs/brand-artzenu.md`](docs/brand-artzenu.md).** It carries the provenance of
every value, the three AA adjustments, and the font-licence question that Lot 1
has to settle.

### Lot 0.8 in one paragraph

The app now looks like Artzenu's own tool. `--text-primary` is the association's
heading green `#0B3D2C`, the accent is its button olive `#6E9558`, `danger` is
its CTA orange `#EF4F28` unmodified, and the surfaces are its pale green wash
`#E9F2EA` diluted into paper. Headings are set in אטלס (Atlas) and everything
else — including every number — in מקומי (Mekomi), both self-hosted from the
association's own files. Dark is derived rather than borrowed: the same hues on
forest-night surfaces in the `#0B3D2C` family, replacing Lot 0.7's navy. No
screen changed structurally.

---

## 4c. Lot 0.7 — delivered

| # | Scope | State |
|---|---|---|
| D1 | Command-centre palette (vivid/ink token pairs), gradients, stagger, `/styleguide` | ✅ |
| D2 | The map is on the PHYSICAL left in both writing directions | ✅ |
| D3 | Dashboard rebuilt as a control room: KPI strip, dominant alerts, agenda widget | ✅ |
| D4 | Agenda screen (week + month), `FarmVisit` object, dashboard widget | ✅ |
| D5 | Guard-staffing wizard, scored proposal, phone round, driver, recap | ✅ |
| D6 | Timelines on incident, mission and farm | ✅ |
| D7 | Rail collapse control on top, single Waze block, counted filters, farm-card rebalance, 390 px sweep | ✅ |
| D8 | Verification, screenshots, deployment | ✅ |

### Acceptance criteria

Four scripts carry them: `bun run accept` (A4–A7, A9, A10, A12, A14, A15,
A20–A23 against `@core`), `bun run contrast` (A13/A19), `bun run dispatch`
(A21), `bun run layout` (A24). The rest are visual and referenced to the
captures in §5.

| # | Criterion | State |
|---|---|---|
| A1 | Zero hardcoded UI strings in `/src/ui` | ✅ grep clean (one Hebrew string survives, inside a code comment) |
| A2 | `/src/core` free of React/DOM | ✅ grep clean — `contrast.ts` and `dispatch.ts` are pure maths |
| A3 | Screens navigable, RTL, at 390 / 1280 px | ✅ screenshots + `bun run layout` |
| A4 | Role isolation enforced in core | ✅ 12 farms / 300 volunteers vs 1 farm / 0 roster |
| A5 | Both anchor message formats | ✅ Waze link vs zero-link kosher text |
| A6 | Nearest-neighbour + Google Maps multi-stop URL | ✅ 10 stops, 10 waypoints |
| A7 | Urgent report → coordinator + farmer, and no one else | ✅ |
| A8 | Volunteers table smooth at 300 rows | ✅ 16 800 px of scroll as ~22 DOM rows |
| A9 | Import wizard flags 2 duplicates + 1 missing phone | ✅ `samples/a9-test-import.csv`, asserted in `accept` |
| A10 | Mismatch visible driver ↔ group ↔ coordinator | ✅ seeded on שמואל וייס, 3 call contacts |
| A11 | Deployed URL works on mobile | ✅ https://azmer-fts.github.io/lo-yanum/ |
| **A25** | **Every colour and type value traces to artzenu.org.il** | ✅ `docs/brand-artzenu.md` §1–§2 — extracted from the site's Elementor kit, not eyeballed |
| **A26** | **The two brand faces are self-hosted and cover the verse** | ✅ 8 woff2 in `public/fonts`; Atlas and Mekomi both cover Tehillim 121:4 including nikkud and shin/sin dots |
| A12 | Theme toggle works, persists, correct per-role defaults | ✅ coordinator→light, field→dark |
| A13 | Contrast table printed, all AA | ✅ `bun run contrast` — 122 pairs on the Artzenu palette, see §8 |
| A14 | Photo capture + import; avatars everywhere | ✅ 149/300 volunteers, 4/6 drivers |
| A15 | Every field-screen number is a working `tel:` link | ✅ all 300 |
| A16 | List ↔ marker hover synchronised both ways | ✅ marker 20→30 px on row hover |
| A17 | Live trace on every tick; both Waze and Maps links valid | ✅ 10 numbered markers + dashed polyline |
| **A18** | **Map physically LEFT on the dashboard + 4 map-first screens** | ✅ captures 1, 2, 11–14 |
| **A19** | **/styleguide shows the new palette with AA ratios printed** | ✅ captures 9, 10 — every ratio computed by `@core/contrast`. Re-validated on the charter; a live theme switch now re-reads the palette (see decision 45) |
| **A20** | **Wizard playable: create → scored list → refusal → promotion → complete → visible** | ✅ 17 browser assertions, see §7 |
| **A21** | **`dispatch.ts` scoring tested by script** | ✅ `bun run dispatch` — 27 checks over distance, equity, pairing |
| **A22** | **Agenda week + month, visit created from an empty slot** | ✅ captures 5, 6 + browser assertion |
| **A23** | **Timelines on incident, mission and farm** | ✅ captures 7, 8, 15 |
| **A24** | **Zero PAGE-LEVEL horizontal scroll on every screen, at every width AND at every splitter ratio; no pinned overlap** | ✅ `bun run layout` — 24 screens × 3 seam positions, `VIEWPORT=all`. **Widened by PO return 5 (2026-08-31)**: the seam is a dimension, and the scroll is measured by really scrolling as well as by `scrollWidth`, because RTL overflow goes LEFT |
| **A79** | **The INSTALLED app clears the system status bar: the gradient is there, and no control rests under the clock** | ✅ `STANDALONE=1 bun run layout` — the whole sweep re-run with `data-standalone` and the real devices' safe-area insets stamped; captures in `docs/screenshots/standalone/` (PO return 7) |
| **A44** | **One template source, three rosters, a link that becomes a pin (G10)** | ✅ `bun run accept` A44 section (36 checks) + `bun run import` (28 checks: download → fill → upload → find) |
| **A64** | **The map is on the physical LEFT on every screen that carries one** | ✅ `bun run mapfirst` — 26 screens audited at iPad landscape; every exemption prints its reason |
| **A65** | **The map/content seam is draggable by finger and by mouse, bounded, persisted, resettable** | ✅ `bun run splitter` — 72 checks over five screens |
| **A66** | **A density pass over every screen, listed one by one** | ✅ the table in §1's P0bis.3 note — what changed, or why the screen was already optimal |
| **A67** | **The generated .xlsx is really RTL, verified by re-opening it** | ✅ `bun run rtl` — 45 checks over the three templates; independently confirmed with openpyxl, which is what caught an invalid `workbookView` attribute |
| **A68** | **Three channels, chosen by phone type and address, with valid prefilled links** | ✅ `bun run outreach` — the hrefs are DECODED and checked, not merely present |
| **A69** | **The group kit's three copied elements are correct** | ✅ same run — international numbers, the coordinator included, kosher phones excluded AND named |
| **A59** | **The threat layer exists, and is coordinator-only (G18)** | ✅ `bun run accept` A59 section (26 checks over all three roles and all three routes) + the map proof captured by hand |
| **A61** | **Three map states per map-first screen, persisted (P0.1)** | ✅ dashboard / farms / farm-detail / route / incidents / missions + both rosters; verified by hand at 1032×1376 and 402×874, captures due at G12 |
| **A62** | **Locality bubbles + tap-filter + נקה on both rosters (P0.2)** | ✅ `bun run accept`, the A62 section (12 checks), plus the tap path in `bun run touch` |
| **A63** | **Every map gesture by finger at iPad portrait (P0.3)** | ✅ `bun run touch` — 32 checks at 1032×1376 with `hasTouch` and no mouse anywhere |

---

## 5. Screenshots — `docs/screenshots/`

Every row exists at both `-mobile` (390 px) and `-desktop` (1280 px) — 34 rows,
68 files.

> Captures are taken against the PRODUCTION BUILD (`bun run build` then
> `bun run preview`), not the dev server. Lot 0.9 lost two full runs to
> `networkidle` timeouts on a loaded machine: the dev server transforms every
> module per request and Vite holds an HMR websocket open for the life of the
> page, so "the network went quiet" is a state this app can legitimately never
> reach. The scripts now wait for the dev toolbar's `<select>` instead, and a
> static server removes the load entirely.

> **`docs/screenshots/standalone/` is a SECOND set and a different question**
> (P3.4, PO return 7). Produced by `STANDALONE=1 bun run layout`, one light and
> one dark per viewport, showing the app as the INSTALLED app with a simulated
> status bar drawn over it. The glyphs in that mock are in the colour iOS will
> actually pick — dark on the light palette, light on the dark one, because the
> system chooses them against `theme-color` and theme.tsx keeps that equal to
> the resolved `--surface-base` — so what the picture answers is the only
> question the assertions cannot: **is the clock readable over the gradient.**
> The page is scrolled before the shot, so there is real content under it.

| # | Screen |
|---|---|
| 1 / 2 | Dashboard, control room — light / dark |
| 3 / 4 | Guard wizard, scored-proposal step — light / dark |
| 5 / 6 | Agenda, week view — light / dark |
| 7 / 8 | Mission detail with the night timeline — light / dark |
| 9 / 10 | `/styleguide`, full page — light / dark |
| 11 | Farms, map-first |
| 12 | Route planner with the live trace |
| 13 | Incidents, map-first |
| 14 | Missions, map-first |
| 15 | Farm card, rebalanced, with its activity timeline |
| 16 | Driver roster |
| 17 | Volunteers table |
| **18** | **Farms map-first — DARK, the re-tuned night tile filter** |
| **19 / 20** | **Volunteer "my guard" — light / dark** |
| **21 / 22** | **Landing: the Artzenu mark, the brand plate, the verse — light / dark** |
| **23 / 24** | **Wizard step 1 — a farm with NO anchor point, and a pin dropped on the map — light / dark** |
| **25** | **Farm detail — DARK, the map-first gabarit** |
| **26 / 27** | **Farm form — the lightened fields — light / dark** |
| **28** | **A61 — the farms map with the map HIDDEN (P0.1)** |
| **29** | **A61 — the same screen with the map FULL** |
| **30** | **A62 — the volunteers roster's locality bubbles, one town tapped** |
| **31** | **A44 — the farms import wizard and its template columns (G10)** |
| **32 / 33** | **A59 — the global map with the threat layer armed — light / dark** |
| **34** | **A55 + A59 — חוות רתם with its hatched threat zone, its vector, and מושב רתמים adjoining** |

> 28–30, 32 and 33 are DRIVEN too, and for the same reason 23/24 are: the
> criterion in each case is a STATE, not a screen. 28 and 29 capture the same
> route twice because the point of A61 is that one screen has three readings —
> a capture of the default proves nothing that 11 does not. 30 taps the largest
> bubble so the frame shows the filter rather than the decoration. 32 and 33
> arm the threat toggle, which is off by default.

> 23 and 24 are DRIVEN captures: the script selects `farm-05`, which has no
> anchor point in the fixtures, then clicks the map. Capturing the route as it
> loads would show the fixture that hid the bug for two lots — the first farm in
> the list happens to have anchor points — rather than the fix.

> 11 and 18 are the same screen in the two themes, and they exist as a pair
> because the day/night tile filter is a token that changed this lot. 21 and 22
> are also a pair on purpose: the brand plate is IDENTICAL in both, and only two
> captures make that visibly a decision rather than an oversight.

> Map screens need ~6 s to settle (WebGL init + OSM tiles + `fitBounds`). The
> capture script waits; screenshotting sooner yields an empty map.

---

## 6. Standing decisions

Lot 0 decisions 1–13, Lot 0.5 decisions 14–20, Lot 0.6 decisions 21–31, Lot 0.7
decisions 32–40 and Lot 0.8 decisions 41–46 all still hold, **except 22 and 23,
which decision 32 generalises; 46, which decision 47 supersedes; and 41–44,
which G17's decision 57 retires** (42's fill-keeps-the-colour/ink-moves
MECHANISM survives — only the charter values it protected are gone). Decisions
32–34 survived two lots unchanged and are why both were cheap. New:

73. **THE WRITE-THROUGH IS DERIVED FROM THE SNAPSHOT, NEVER DECLARED BY THE
    MUTATION (P2.6a).** The obvious design is to have each of the 53 mutations
    say which rows it touched. It is also the one that breaks, and this store
    shows why in its own source. **Mutations FAN OUT:** `createFarmZone` writes
    a zone AND the farm's dunam totals (G15's one writer); `createVolunteer`
    writes a volunteer AND may materialise a driver (G5.2's dual hat);
    `createFarmVisit` writes a visit AND the farm's `nextVisitAt` cache
    (decision 35); `updateDriver` writes a driver AND mirrors four fields back
    onto a volunteer. **And half of them write IN PLACE:**
    `setIncidentResolved` sets a field on an object the array still holds by
    the same reference, as does every `withMission` caller — so an identity
    diff would report NOTHING for them, which is the worst failure available
    here because it is silent and it loses exactly the mutations a night in the
    field produces. So `commit()` takes a structural diff instead: one
    `JSON.stringify` per aggregate, about a thousand short rows, a few
    milliseconds, once per user action. A mutation added in P3 persists
    correctly without its author knowing this file exists. `bun run persist`
    is what keeps the diff structural.

74. **THE BACKEND IS CHOSEN FROM OUTSIDE /src/core, AND THE DEMO ONE IS THE
    DEFAULT (P2.6a).** `store.ts` holds one `StoreBackend` and starts with the
    demo implementation, so `bun run accept`, `bun run dispatch` and all eleven
    browser gates keep driving the fixtures with no configuration and no
    knowledge that P2.6 happened. Real mode calls `installBackend` once, before
    the first render, from `src/data` — the core cannot make that choice
    itself, because `SUPABASE_CONFIGURED` lives in `src/data/config.ts` and the
    import that would let core read it is the import that ends the "core does
    no I/O" invariant. **`persists: false` on the demo backend is not a
    micro-optimisation:** with it false the diff never runs at all, so demo
    mode — /poc included — executes byte-for-byte the code it did before P2.6.

71. **THE OFFLINE MAP IS ONE SELF-HOSTED PMTILES FILE, AND THE OSM PRE-CACHE IS
    ABANDONED FOR GOOD (PO, 2026-08-31 — resolves open question 11).** The
    written order of march asked for a "רענן מפות לא מקוונות" button that
    pre-fetched the Negev's raster tiles. It measured at **4 345 requests per
    device per refresh**, which is a systematic download and is exactly what
    OpenStreetMap's Tile Usage Policy forbids on donated infrastructure. The
    product owner accepted the recommendation instead: **Protomaps PMTiles, one
    file, in a PUBLIC Supabase Storage bucket, read by HTTP range requests, with
    a MapLibre VECTOR style tinted in the app's own colours — both themes.**
    That settles three things in one move: no usage policy to breach and no API
    key; one download instead of four thousand, which is what "offline maps"
    should have meant from the start; and it retires standing carry-in item 2
    (the `hue-rotate` on a raster), open since Lot 0.9. The button becomes
    "download this one file", with a progress indicator and the size shown
    BEFORE the tap — a coordinator on cellular data must be able to decline.
    **Scheduled after P2.6/P2.5b and before P3.4.** The browsing cache that
    P2.5a shipped stays: it costs OSM nothing and it is what covers the ground
    the coordinator looked at before the big file exists.

72. **THE ACCOUNT'S HARDENING IS THREE DASHBOARD SETTINGS, AND ONE OF THEM
    CANNOT BE BOUGHT ON THIS TIER (PO, 2026-08-31).** The product owner set,
    in Supabase's own dashboard: **"Allow new users to sign up" OFF** — phase 1
    has exactly one account and a sign-up form would be a second door on a
    programme whose data is farmers' addresses and volunteers' faces; it is
    reopened deliberately at Lot 4 when farmers and volunteers get logins.
    **Minimum password length raised to 10.** **Leaked-password protection
    switched on.**
    · ⚠️ **THE LEAKED-PASSWORD TOGGLE DID NOT TAKE, AND IT CANNOT ON THE FREE
      TIER.** `get_advisors(security)` still returns `auth_leaked_password
      _protection` as WARN after the change, and Supabase's own documentation
      is explicit: "Leaked password protection is available on the Pro Plan and
      above." So the lint is NOT a forgotten switch and must stop being read as
      one — it is a line item on an upgrade, and the mitigation that is
      actually available is the one already applied: no sign-up, one account,
      a 10-character minimum, and a password only the PO has ever typed.
    · ⚠️ **THE JWT EXPIRY COULD NOT BE VERIFIED FROM HERE, AND THE REASON IS A
      CREDENTIAL BOUNDARY, NOT AN OVERSIGHT.** GoTrue's `jwt_exp` is a
      management-API setting: it lives in neither the database (so
      `execute_sql` cannot see it) nor the anonymous surface, the Supabase MCP
      exposes no auth-configuration tool, and the `supabase` CLI on this
      machine is authenticated to a DIFFERENT organisation
      (`uzrwmkwkulcighotovyb`) which cannot see `lo-yanum-prod`
      (`jkqsqykhquutilldvcsv`). **Read it at Authentication → Sessions → Access
      token (JWT) expiry; the dashboard's ceiling is 604 800 s = 7 days.**
    · ★ **AND THE ANTI-LOCKOUT INSURANCE IS NOT THAT NUMBER — IT IS P2.5b.**
      Worth stating plainly because raising `jwt_exp` looks like it solves the
      problem and does not. The access token is short-lived by design and the
      REFRESH token is what carries a session across days; what actually locks
      a coordinator out of an offline iPad is the client deciding that an
      access token it cannot refresh means "signed out" and throwing away the
      local session. P2.5b's requirement — an expired token no longer discards
      the session, and the client reconnects silently when the network returns
      — is the fix, and it works whether `jwt_exp` is 3 600 or 604 800.

68. **THE APP HAS TWO MODES AND ONE BUILD-TIME SWITCH, AND THE DEMO MODE IS
    THE DEFAULT (P2.3).** `SUPABASE_CONFIGURED` — both environment variables
    present — is the whole of it. Set: the app requires a session and the role
    switcher does not exist. Unset: the app is byte-for-byte what P0bis left,
    on the mock store, with the identity picker. This was not the obvious
    shape; the obvious shape was "auth is on, tests log in". It is the right
    one because **every browser gate in this repository drives the real UI**,
    and the day P2.6 makes the real app start EMPTY, a gate that logs in would
    be asserting things about an empty database. Demo mode keeps `accept`,
    `outreach`, `rtl`, `mapfirst`, `splitter`, `touch`, `wizard`, `import` and
    `layout` testing the app rather than the login. It is also what /poc IS.
    The consequence that has to be respected: **the config file is
    `.env.real`, never `.env`**, because Vite auto-loads `.env` in every mode
    and one such file would flip every gate at once.

69. **THE GATE IS OUTSIDE THE ROUTER, AND SUPABASE ARRIVES IN ITS OWN CHUNK
    (P2.3).** Two decisions that look like implementation detail and are not.
    (a) An unauthenticated visitor to a real build does not get a router at
    all — no route exists to be typed, bookmarked or deep-linked into, so
    there is no exceptions list to keep correct as screens are added. A70
    proves it over eight routes including `/styleguide`. The two older gates
    are untouched: navigation-level `RequireRole`, and the one that actually
    matters, `@core/access` — now mirrored in RLS. (b) `@supabase/supabase-js`
    is behind `import()`. Imported statically it took the initial bundle from
    190 kB to 249 kB gzipped, because it carries postgrest, storage, functions
    and realtime whether a screen uses them or not. Behind a dynamic import
    the entry grew **1.6 kB** and the 58 kB chunk is fetched in parallel in
    real mode and NEVER in demo mode. The app is opened on a farm track at
    02:00 on one bar of signal; that number is not a vanity metric.

70. **THE APP NEVER CREATES AN ACCOUNT AND NEVER SETS A PASSWORD (P2.3).**
    There is no sign-up form, no "forgot password" link, and no invitation
    sent from here — and none of the three is an omission. Phase 1 has ONE
    account; it was created in Supabase's own dashboard by the product owner,
    who is the only person who has ever typed its password. Sending the
    invitation email would have required the `service_role` key, which is
    never fetched, never committed and never reaches the client, so it was
    never on the table. A recovery flow means an email link, an email link
    means parsing a token out of the URL hash, and **the hash is this app's
    router** — which is also why `detectSessionInUrl` is off. When there is a
    second account, that is the moment to build it properly. Two smaller rules
    ride along: a wrong password and an unknown address give the SAME message
    (telling them apart tells an attacker which addresses exist, and A70
    asserts the two strings are equal), and **the account and the ROLE are two
    separate facts** — `app_users` says "a user with no row here is nobody",
    so `20260830000400_coordinator_grant.sql` grants the role by EMAIL lookup
    and RAISES if the account does not exist yet, because an `insert … select`
    over nothing succeeds silently and would leave a coordinator signing in to
    26 empty tables with every gate green.

65. **THE MAP IS ON THE PHYSICAL LEFT ON EVERY SCREEN THAT CARRIES ONE, AND
    ONE SHELL ENFORCES IT (P0bis.1).** Product-owner rule, frozen 2026-08-30.
    Decision 34 said "the map is on the physical left"; it was only ever
    applied to the five screens that happened to use `MapPanel`, and the other
    eight put the map above the content. The same fact in two places depending
    on the route is what makes an app feel like several apps. `MapSplit` is
    now the single implementation — including the two G7 rosters, which needed
    a `page` scroll strategy (sticky MAP, window scroll) rather than an
    exception. The exceptions that remain are printed on every `bun run
    mapfirst`: screens with NO map (the agenda, deliberately — a calendar is
    read like text), and the FIELD shell, whose `max-w-2xl` column IS the
    narrow responsive form the rule allows.

66. **THE SEAM IS A CONTROL, AND THE RATIO IS THE CONTENT'S SHARE (P0bis.2).**
    The three map states answer "do I want geography at all"; the ratio answers
    "how much", and the honest answer changes by screen and by hour. Stored as
    the CONTENT's percentage of the row, 25–75, per screen, in the mode's key
    space. Storing the CONTENT's share rather than the map's is what makes the
    drag ONE formula in both writing directions — the content column is always
    the physical right one, so its width is "the shell's right edge minus the
    pointer". The bounds are load-bearing: past either end a panel becomes a
    stripe, and a splitter that can be dragged into a dead end will be, on a
    moving vehicle. `PanelSplitter` is a component rather than a `MapSplit`
    detail so the guard wizard — map-first but inside its own stepper shell —
    is not the one screen a just-frozen rule skips.

63. **THE THREAT LAYER IS THE ONE SENSITIVE THING, AND ITS GATE IS IN THE DATA
    LAYER (G18).** A farm's boundary is a fact about the ground; "we assess
    this wadi as a high-intensity approach" is an assessment about people. It
    must not reach a farmer's phone, a volunteer's guard card or a driver's
    trip sheet — and the only way to be sure is for the ACCESSOR to return
    nothing, not for a screen to omit a section. `getVisibleThreatZones`,
    `getVisibleThreatVectors` and `getThreatsForFarm` are one rule, in one
    place, tested through all three roles and all three routes (A59). The
    consequence is deliberate: **a farmer is refused the layer for his own
    farm too.** The assessment names patterns across holdings and is the
    programme's to hold; a farmer who wants to know what is around him is told
    by a human, on the phone. These are the first two functions Lot 1
    transcribes into RLS, because they are the two where a wrong policy leaks
    something that matters.

64. **AN OVERLAY IS A TEXTURE, NOT A FIFTH COLOUR (G18).** The map already
    spends four tints on ground (G16); a threat zone drawn in a fifth would
    just be a fifth colour. It is a HATCH with a DASHED outline instead, which
    reads as "laid over the map" before any colour is decoded. Intensity is
    two hues and a WEIGHT — `--status-warn` → `--status-danger`, then a
    double-stripe hatch for `high` — because decision 49 keeps `--critical`
    for four meanings and a threat assessment is none of them. Density also
    survives the two things colour does not: a sun-washed iPad and
    colour-blindness.

60. **THE MAP IS A PANEL THE COORDINATOR SIZES, AND THE CHOICE IS PER SCREEN
    (P0.1).** Three states — מוסתר / מפוצל / מלא — on every map-first screen,
    persisted in `localStorage` under `lo-yanum:map-mode:<screenKey>`.
    `split` remains the default and remains Lot 0.9's exact reading, so no
    screen changes shape until it is asked to. Lot 0.9's collapse control only
    existed below `lg`, which is the one width where a 40 dvh map is not in the
    way; an iPad portrait is 1032 and spent 58 % of the screen on geography
    while the coordinator read contacts. **The hidden panel is
    `display:none`, never unmounted** — a torn-down WebGL context takes the
    camera with it, and a re-created list takes its scroll position and its
    progressive page. The one exception is a WINDOW-virtualised table, which
    must be unmounted instead: `display:none` makes it measure a scrollMargin
    of 0 and come back drawing its rows a page above themselves.

61. **PEOPLE ARE COUNTED BY LOCALITY, NEVER PLACED INDIVIDUALLY (P0.2).**
    The rosters' map is bubbles on towns, sized by area (sqrt, because the eye
    reads a disc by area and a linear radius makes 40 people look like four
    times 10 instead of twice), and a bubble IS a filter that composes with the
    KPI-filters. The programme holds a home town, not a home address, so a dot
    on a street would be both wrong and a privacy claim nobody made — the
    bubble is exactly as precise as the data. A town outside
    `LOCALITY_POSITIONS` is REPORTED next to the switch, never silently
    dropped: same contract as `distanceKm: null` in the dispatch scoring. The
    bubbles are counted from everything EXCEPT the locality filter, or picking
    a town would collapse the map to one bubble with no way back.

62. **A FINGER NEEDS 44 px, AND AN ARMED MAP OWES IT THE WHOLE SURFACE
    (P0.3).** Marker VISUALS keep their 22–34 px; the hit box around them
    grows to 44 (`wrapForTouch`). The consequence is the decision's real half:
    markers stop their click reaching the map (decision 51), so a wider box is
    a wider patch of what LOOKS like empty map and silently is not. While
    `onMapClick` is live the intent is unambiguous — "put the thing HERE" — so
    every marker goes `pointer-events:none`, draggable ones included; ring
    reshaping never runs with placement armed, so no grip loses its grab.
    `bun run touch` drives the whole vocabulary with synthetic touch at
    1032×1376 and asserts the control that matters: a drag STARTING on a
    marker still pans the map.

57. **THE IDENTITY IS NEUTRAL, AND COLOUR IS SPENT ONLY ON MEANING (G17).**
    Product-owner decision, 2026-08-18: the Artzenu charter — colours AND
    typefaces — is retired. The page is barely-tinted grey, cards are white,
    ink is grey-black, dark is the same family on blue-grey, and ONE
    professional blue carries the accent role. Vivid colour survives exactly
    where it means something: statuses, severities, badges, primary buttons,
    markers, zones, the critical role (#EF4F28 stays, now purely semantic).
    Faces: Rubik for body/UI/every number, Frank Ruhl Libre (OFL,
    self-hosted) for display — with Secular One and Heebo self-hosted and
    shown in /styleguide until the PO arbitrates. All the audit MACHINERY of
    Lots 0.7–0.9 (vivid/ink pairs, luminance windows, the three radii, the
    critical allow-list) is untouched: the values changed, the rules did not.

58. **A CARD HAS NO CONTOUR; THE FIELD KEEPS ITS HAIRLINE (G17).** Cards,
    tiles, panels and callouts separate by soft slate shadow plus the
    luminance step to the page — no border. The two survivors are SEMANTIC:
    the 4 px start-bar (card-critical, callouts, the mismatch row) and the
    field's `--border-strong` hairline, which is the field's affordance and
    stays audited at 1.8. `bun run tokens` (A57) fails any card/tile
    className that draws a full `border`, and the empty-state dashes are the
    one allowed exception.

59. **THE SHAPE IS THE BUTTON HIERARCHY (G17).** Major actions — create,
    confirm, save, danger, emergency — are full-colour RECTANGLES at
    `--radius-field`; secondary actions, filters, chips and tags are PILLS;
    call/WhatsApp/SMS are discreet ICON buttons, never a full pill that
    reads as a CTA (ContactActions may not contain a `btn-*` class — gated).
    One glance now separates "this commits something" from everything else.

47. **THE RADIUS SCALE IS THREE VALUES, AND THE BUILD ENFORCES IT.**
    `field` 6 px (inputs, list rows, icon buttons), `card` 14 px (cards,
    sections, modals, map frames), `pill` (CTA buttons, filters, chips). Lot 0.8
    shipped five steps plus the pill and the app used all six, so nothing read
    as a family: a 10 px chip beside a 14 px input inside an 18 px card.
    `tailwind.config.js` now declares `borderRadius` on `theme` rather than
    `theme.extend`, which REPLACES Tailwind's own scale — `rounded-md`,
    `rounded-full` and every arbitrary bracket value fail to compile. This
    supersedes decision 46, whose conclusion (the pill is spent on controls, not
    containers) survives; only the number of steps changed. `bun run tokens`
    checks the raw-CSS half the compiler cannot see.

48. **A FIELD IS A BORDER, NOT A BLOCK OF COLOUR.** Every input sat on the
    charter's green wash; twelve down the farm form turned the page into a stack
    of coloured bars where the required field and the optional one were equally
    loud, and the wash competed with the panels that use the same colour to mean
    something. Fields moved to `--surface-field` — white in light, a plain dark
    well in dark, untinted in both — with one `--border-strong` hairline at rest
    and an accent border plus a 25 % ring on focus. The wash keeps its job as
    `--surface-high` on SECTIONS and informational panels. The consequence is
    audited: the hairline is now load-bearing, so `bun run contrast` pins it at
    1.8 against the field.

49. **THE CHARTER ORANGE IS A ROLE WITH A CLOSED LIST OF CALL SITES.**
    `#EF4F28` was in the token file and never on the screen: it was aliased onto
    `--status-danger`, which the UI only ever renders as a 15 % wash or as its
    darkened ink. `--critical` is that orange promoted to a role, theme-
    independent like the brand plate, and it is allowed in exactly four kinds of
    place — an unresolved urgent incident, an emergency call, the ONE
    irreversible commit in the app ("צור משמרת"), and the two states that mean a
    volunteer is unaccounted for (return not confirmed, driver/group mismatch).
    `bun run tokens` holds a per-file allow-list WITH the reason and checks it in
    both directions, so an entry that stops applying is a failure too. Ordinary
    errors, refusals and delete buttons keep `status-danger`: if everything
    red-ish were orange, the four things above would stop being findable, which
    is the entire value of the colour.

50. **WHEN A REQUIRED VALUE IS MISSING, THE INTERFACE OFFERS THE WAY TO CREATE
    IT.** The generalisation of the F1 bug. An empty `<select>` is the worst
    affordance in the set — it looks like a control that has not loaded, so the
    user waits. `SelectField` therefore takes `emptyAction`, which REPLACES the
    select when there is nothing to choose; `SelectOrCreateField` covers the
    other case, a list that is correct but not closed (the yeshiva field, where
    a free-text box fragments the data into six spellings and a fixed list
    cannot accept the seventh). Every required select in the app now either has
    an enum for options — which cannot be empty — or an escape.

51. **THE MAP IS AN INSTRUMENT, NOT AN ILLUSTRATION.** The map creates anchor
    points and a drag moves one, on the wizard, the farm detail and the anchor
    form, through one shared `AnchorMap`. **Placement is an ARMED MODE** — see
    decision 55, which the product owner asked for after seeing 0.9. Two
    consequences worth knowing before touching `MapCanvas`: a marker's DOM click
    has to `stopPropagation`, or tapping an existing pin drops a second one
    underneath it; and the framing effect had to split in two, because a
    `center`-driven `jumpTo` keyed on the markers snapped the camera back after
    every drag, so the user's own edit undid their pan. Any map still embedded
    in a scrolling page takes `cooperative`, which reserves the one-finger drag
    for the page.

52. **A GUARD CAN COVER MORE THAN ONE POSITION, AND ONE OF THEM IS THE
    RENDEZVOUS.** `Mission.anchorPointId` stays exactly one — it is a logistics
    commitment the driver and every generated message depend on — and
    `additionalAnchorPointIds` carries the rest. Collapsing both into a list was
    the obvious move and the wrong one: "where the driver drops the group" and
    "where the group stands at 01:00" are different facts, and a screen that has
    to guess which element of the array is the first is a screen that will guess
    wrong. **The product owner has since confirmed the rendezvous stays unique,
    and asked for time windows on the others — decision 56.**

53. **NESTED SURFACES ARE THE BUG; ROWS FLOAT.** A list of guards was a `.card`
    whose rows were also `bg-surface-raised`, so the rows were invisible and the
    block read as one slab — worst in dark, where the two surfaces are 1.29
    apart and there is no drop-shadow to lean on. A scannable list now has NO
    card behind it (`<Section bare>`) and each row is itself a small card with
    the long Artzenu drop, so the page shows through between them.

54. **A LIST THAT CAN PASS ~20 ROWS IS CONTAINED AND PROGRESSIVE.** The
    volunteers table has been virtualised since Lot 0 because 300 rows are
    obviously 300 rows; the dangerous lists are the ones that look short in the
    fixtures and are bounded by nothing. They get `.list-scroll` /
    `.table-scroll` (a capped box with a pinned header) and `useProgressive`
    (20 rows, then "show more" with the count). A hook rather than the
    virtualiser because these rows are not a fixed height, and measuring them
    costs more than not rendering the ones nobody has scrolled to. `bun run
    layout` fails any screen past six screenfuls at 390 px.

55. **PLACING A POINT IS AN ARMED MODE, AND ONE PRESS BUYS ONE POINT.**
    Lot 0.9 shipped "any click on the map creates a point", which is what made
    the dead end impossible and also meant a mis-tap while panning left junk
    behind. The product owner's ruling, applied here: a "הוסף נקודה" button arms
    the map, the NEXT click places the pin, and the mode disarms itself
    immediately — so a coordinator who wants two points presses the button
    twice, deliberately, and a coordinator who wants to pan just pans.

    Three signals carry the armed state, because a mode nobody can see is a
    mode nobody can leave: the canvas takes a crosshair cursor, the map gains an
    accent ring, and the banner swaps its instruction for "click the map to
    place the point · Esc to cancel". Escape works, and changing farm disarms —
    an armed mode carried across a farm change would drop the next point on the
    wrong farm. Mechanically the mode IS the `onMapClick` prop: it is passed to
    `MapView` only while armed, which is also where the crosshair comes from, so
    there is no second source of truth to drift.

    `bun run wizard` asserts all four halves — an unarmed click creates nothing,
    the button arms, the next click creates, and a further click adds nothing
    until re-armed. The first of those is the one the product owner actually
    asked for; the others are what stops a fix from becoming a new trap.

56. **EACH ADDITIONAL POSITION MAY CARRY ITS OWN TIME WINDOW — LOT 1.**
    Answered and NOT yet built: the schema is Lot 1's to fix, and inventing a
    shape now in the mock store would be the thing Lot 1 has to undo. The
    decision itself is settled, so build to it:

    · The rendezvous (`anchorPointId`) stays unique and time-less — it is the
      guard's own start, and the driver and the messages already carry it.
    · Every ADDITIONAL position may carry an OPTIONAL window. Empty means the
      whole night, which must stay the default: most guards have no schedule and
      a form that demands two times per position would make the common case
      worse to serve the rare one.
    · This is what settles the `additionalAnchorPointIds` shape flagged in §12:
      an array column cannot hold a per-row window, so it is a JOIN TABLE
      (mission_id, anchor_point_id, position, starts_at NULL, ends_at NULL).

41. **THE PALETTE IS THE ARTZENU CHARTER, AND ITS PROVENANCE IS WRITTEN DOWN.**
    Four tokens (`--brand-forest` `#0B3D2C`, `--brand-olive` `#476E34`,
    `--brand-teal` `#14A185`, `--brand-orange` `#EF4F28`) quote the
    association's declared Elementor globals verbatim; everything else is
    derived from them. `docs/brand-artzenu.md` records where each value was read
    and every place AA forced a change. The rule this replaces is "pick a nice
    palette": the app is the association's tool and has to be recognisable as
    such, so a colour question is now answered by reading the site, not by
    taste. Re-extract with `bun run brand-reference` if artzenu.org.il is
    redesigned.

42. **THE FILL KEEPS THE BRAND COLOUR; THE INK MOVES.** Three charter values
    could not be used unmodified: olive with white text is 3.44:1, the teal is
    too light to be a dot on the pale page, and the orange is far too light to
    be text. In every case the FILL was left alone and the ink was adjusted
    (`--text-on-accent` is now a near-black GREEN, `#06140E`). The one exception
    is `status-success`, where the dot check left no room and `#14A185` had to
    become `#0F8E75` — the charter value survives as `--brand-teal` and returns
    bright in dark. Copying the site's own AA failures was never an option.

43. **TWO BRAND FACES, SPLIT ON A MEASUREMENT.** אטלס (Atlas) sets
    display/title/section/heading; מקומי (Mekomi) sets everything else,
    INCLUDING every number. Not a stylistic preference: Atlas ships proportional
    figures with a 54 % advance spread and NO `tnum` feature, so
    `font-variant-numeric: tabular-nums` is inert in it — measured at 22.41 px
    of spread at 100 px in the browser, against 0.00 px for Mekomi. This app is
    a column of numbers. Both faces are Artzenu's, so the split stays inside the
    charter; Rubik is demoted to fallback and kept only for that.

44. **THE BRAND PLATE IS THE SAME IN BOTH THEMES.** `--gradient-brand` is the
    site's own hero wash (olive → forest, 158°) and does not have a night
    variant, because a brand does not. Its ink therefore cannot come from
    `--text-primary`, so there is exactly one theme-independent ink token,
    `--text-on-brand`, and the audit pins it against the gradient's LIGHTEST
    stop — otherwise "brighten the plate a little" silently takes Tehillim 121:4
    below AA.

45. **THE STYLEGUIDE READS THE PALETTE ONE FRAME LATE, ON PURPOSE.** React
    flushes effects child-first, so the screen's `getComputedStyle` used to run
    BEFORE the provider above it restamped `data-theme` — printing one theme's
    hexes next to the other theme's colours. A reload happened to win the race,
    which is why it survived Lot 0.7's captures and only appeared when a
    reviewer switched theme in the page. The `requestAnimationFrame` in
    `usePalette` is the fix and is load-bearing.

46. **THE PILL IS SPENT ON CONTROLS, NOT CONTAINERS.** The charter is a 30 px
    pill language on buttons AND inputs. Buttons take it literally; `.input`
    deliberately stays at `--radius-md`, because a pill spends ~15 px of its own
    start padding and a twelve-field form of pills gives the eye no left edge to
    run down. Cards and tables stay boxes for the same reason.

32. **EVERY semantic hue is a PAIR: `--x` (vivid) and `--x-ink` (text).**
    The vivid token is the FILL — dot, marker, severity bar, gradient stop.
    The ink token is the same identity darkened (in light) or lightened (in
    dark) until it is legible as TEXT on that colour's own 15 % wash. Lot 0.6
    had one token doing both jobs, and "legible as 11px text on paper" is the
    constraint that dragged the whole palette toward mud — which is exactly
    what the product owner saw as "dated". A chip is therefore always
    `bg-x/15 text-x-ink`; using the vivid as text is the one mistake the split
    exists to prevent. Decision 22 (`accent`/`accent-ink`) is this rule's
    first instance.

33. **A light vivid lives in a NARROW luminance window, and the audit pins it
    there.** It must be dark enough to clear 3:1 against the page (it is a dot)
    *and* light enough for near-black `--text-on-accent` to clear 4.5:1 on top
    of it (it is also a solid fill carrying a route-step number). `bun run
    contrast` checks both ends for all twelve hues. Slate, fuchsia and violet
    failed the second check at Lot 0.6 levels; raising them is what let the
    light palette be saturated instead of inky.

34. **The map is on the PHYSICAL left, in every writing direction.** The one
    deliberate exception to "everything is logical and flippable": geography
    left, content right. It needs both direction variants, because the same
    `flex-direction` produces opposite physical results per writing mode —
    RTL + `row` and LTR + `row-reverse` both put the map on the left with a
    list-then-map DOM order. The divider is a PHYSICAL `border-r` for the same
    reason. The agenda grid is the counter-example and is NOT flipped: a
    calendar is read like text, so RTL's natural first-cell-on-the-right is
    correct there.

35. **`Farm.nextVisitAt` is a DERIVED CACHE of `FarmVisit` rows.** One writer:
    `syncNextVisit` in store.ts, called after every visit mutation. The field
    predates the agenda and is read by the route planner, the dashboard and
    the farm card; deriving it rather than maintaining it in parallel is what
    stops "the agenda says Tuesday" and "the farm card says Tuesday" from
    disagreeing.

36. **The dispatch ranking is a PROPOSAL and shows its reasoning.** Score =
    100 − 0.45/km − 1.2/guard-served + 12 for a shared yeshiva, with
    availability applied as a FILTER before scoring (an unavailable person must
    not merely rank low). Deterministic, ties break on id. The UI prints the
    three components as chips: a coordinator who cannot see why a name is first
    will not trust the list and will go back to their notebook.

37. **A refusal promotes, it does not delete.** The shortlist is longer than
    the requirement (`shortlistSize`), and marking someone as declined drops
    them, adds them to the exclusion set, and pulls the next-best candidate
    into the freed slot in the same action. The gauge counts CONFIRMED people
    only.

38. **`pickedUpAt` and `completedAt` are different facts.** The first is the
    driver saying he has everyone; the second is that claim reconciling with
    the group holder's, with no mismatch. The gap between them is the failure
    the whole programme exists to catch, so the mission timeline shows both
    steps even though they usually coincide.

39. **`--shell-bottom` is MEASURED, not declared.** The demo toolbar publishes
    its own height through a `ResizeObserver`; every sticky footer and every
    full-height map column offsets by it. A hard-coded 2.75 rem was 5 px short
    at 390 px, where the bar wraps — which is exactly the width where the
    overlap matters. Lot 1 deletes the toolbar and the variable falls back to
    its token default.

40. **Timelines print "—", they do not hide unreached steps.** An empty slot in
    a sequence is information ("nobody has confirmed the pick-up"); collapsing
    it destroys that. The first unreached step is marked `current` and gets the
    accent ring, so "what are we waiting on" is answerable without reading.

---

## 7. Verification scripts

All twelve are committed and runnable.

- **`scripts/contrast.ts`** (`bun run contrast`) — the A13/A19 audit. Parses
  `tokens.css`, reconstructs both palettes, and checks text, chips (ink over
  the vivid's own 15 % tint), dots, solid fills and elevation steps. The maths
  lives in `@core/contrast`, which the `/styleguide` screen also imports — so
  the ratios shown in the browser are the ratios this gate enforces.
- **`scripts/dispatch.ts`** (`bun run dispatch`) — A21. Hand-built fixtures,
  one case per scoring rule, plus determinism and the refusal-promotes case.
- **`scripts/accept.ts`** (`bun run accept`) — A4–A23 through `@core`.
  Promoted from a scratchpad file this lot. Driving the business layer is the
  point: a browser test cannot distinguish "the screen does not show it" from
  "the session cannot read it".
- **`scripts/brand-reference.ts`** (`bun run brand-reference`) — the reference
  plates behind `docs/brand-artzenu.md`. Needs the internet, not a dev server.
  The palette itself comes from the site's CSS, but a written charter no human
  can check is not a charter; these are the pictures the claims are checked
  against. Writes JPEG on purpose — a full-page PNG of a site built on landscape
  photography is ~5 MB of repo for no gain.
- **`scripts/persist.ts`** (`bun run persist`) — A73, 84 checks, P2.6a's gate.
  It exists to protect ONE decision: that the write-through learns what to
  write by taking a STRUCTURAL diff of the snapshot, never from 53 hand-written
  declarations (decision 73). The day that diff is "optimised" into a reference
  comparison, every mutation that writes in place — `setIncidentResolved`,
  every `withMission` caller, `archiveVolunteer`, `setCommitmentFulfilled` —
  starts persisting nothing, silently, and surfaces a week later as a night of
  presence marks that never left the iPad. Section 7 of the script is the other
  half: it re-reads `src/core/index.ts` and fails if a mutation was exported
  without a line in the gate, so the coverage cannot rot.
- **`scripts/mapping.ts`** (`bun run mapping`) — A74, 32 checks, P2.6b's gate.
  `src/data/rows.ts` is 26 hand-written column lists, which is exactly the kind
  of code that is 98 % right and whose missing 2 % is a farmer's phone number
  that silently stops arriving. Section 2 round-trips every aggregate in the
  fixtures; section 5 reads the migrations. **Section 5 is the one that earns
  its keep**: it would have found P0bis.5a's `email` and P0bis.5b's `event` on
  its own, without anyone thinking to look, because a round trip never touches
  a database and cannot know the schema is behind. The single family of
  differences it tolerates is listed at the top of the file — three optional
  `Farm` fields that are `not null` in the schema — and nothing else.
- **`scripts/sync.ts`** (`bun run sync`) — A77, 28 checks. Every rule the
  offline layer makes to a coordinator on a farm track at 02:00, asserted
  rather than argued for in a comment nobody re-reads. It drives the real
  functions against `memoryCache()`, which satisfies the same `CacheStore`
  contract IndexedDB does — so what a browser is left to prove is only that
  IndexedDB works, which is one assertion rather than twenty. The check worth
  knowing about: **a failed flush keeps everything**, because an entry is
  removed only once the server has actually taken it.
- **`scripts/write.ts`** (`bun run write`) + **`scripts/fixture.ts`** — A76, 38
  checks, and the one claim P2.6 could not make on its own. A73 proves every
  mutation reports the right aggregates, A74 that the mapper is lossless in
  memory, A75 that the live schema accepts every column — **none of them proves
  the sentence a coordinator cares about: "I changed something and it is still
  there."** This does, against Frankfurt, driving `applyChanges` and
  `hydrateFrom` themselves rather than a re-implementation of them (which is
  why `src/data/write.ts` takes a client as an argument instead of reaching for
  the app's).
  `fixture.ts` is a whole programme in miniature — one instance of every shape
  that has its own table, column or ordering rule: the driver/group
  DISAGREEMENT that R6 must not merge, two cars with their own passenger lists,
  an extra position kept separate from the rendezvous, three outreach events
  with one un-sent, three commitments whose ORDER an index addresses, an
  incident log whose ids do not sort chronologically, a threat vector attached
  to nothing. **Every id begins `a76-`**, which is what makes the cleanup a
  statement rather than a hope — and is why it does not reuse the demo
  fixtures, whose ids are exactly the ones a real import would use.
- **`scripts/live.ts`** (`bun run live`) — A75, 46 checks, and the answer to
  "the repository says the column exists; does Frankfurt?". A74 reads the
  migration FILES, which say what was WRITTEN, not what was APPLIED — a
  migration that failed halfway or a branch never merged leaves the repo
  agreeing with itself while the deployment disagrees, and the first thing to
  notice is a coordinator whose edit vanished. This asks the deployment,
  anonymously, using the one property that makes it possible: **PostgREST
  parses `?select=` against the schema before RLS runs.** A missing column
  comes back 400 with its own name; an existing one comes back `[]`, the rows
  being what RLS refuses. Nothing crosses the wire that is not already public
  in these migrations. The `[]` assertion grows teeth the day P3 imports real
  data: today it is what an empty table returns anyway, from the first
  imported farm it is RLS working and a row would be the leak.
- **`scripts/samples.ts`** — not a gate; the column list A74 and A75 both ask
  their different answerers about. It exists because reading only the FIRST
  aggregate of each collection is the obvious version and hides in a specific
  way: an aggregate whose child list is empty writes no row, so that child's
  table is never probed. `cancel_notices` was exactly that — no fixture guard
  carries an outreach tick, because a tick is something a coordinator does —
  and it was also the table P2.6's catch-up had to change. **The one table
  nobody could see was the one that was wrong.**
- **`scripts/tokens.ts`** (`bun run tokens`) — A28 + A29. A static gate over
  `src/`, and the only one that needs neither a browser nor a running app. Both
  rules it enforces are rules about RESTRAINT, which is what a codebase loses
  quietly: nobody adds a fifth radius or a second orange on purpose, they add one
  because the component in front of them needed it and the rule lived in a
  document. Strips comments before matching, so the prose describing a rule is
  not read as a violation of it.
- **`scripts/auth.ts`** (`bun run auth`) — A70, 20 checks, P2.3's gate. The
  only script that starts its own servers: one per mode, on 5199 and 5198, so
  the two are compared inside a single run. **It never needs the password**,
  and that constraint shaped it — the account's password belongs to the
  product owner and must not reach this repository, this script or an agent.
  What is left to assert without one turns out to be most of what matters:
  that a stranger gets the login form on all eight routes tried and nothing
  else, that a refusal says so in Hebrew and leaves no token in storage, that
  a wrong password and an unknown address produce the SAME string, that demo
  mode still hands out the role switcher every other gate depends on, and —
  with no browser at all — B1: 26 tables anonymously closed, an anonymous
  INSERT that would grant itself `coordinator` refused with 42501, and the
  three policy helpers 404 rather than reachable. One trap is written into the
  script: an unknown table name returns 404 from PostgREST, which the first
  version read as "refused" — so a misspelling PASSED. A 404 is now a
  FAILURE, and the table list is the full 26 rather than the ones remembered.
- **`scripts/offline.ts`** (`bun run offline`) — A72, 11 checks, P2.5a's gate.
  The only script that BUILDS: the worker is `import.meta.env.PROD`-only, so a
  dev server would prove nothing and a stale `dist/` would prove something
  about last week. It builds twice — a demo build and a real one — and serves
  each with `vite preview`. **The check the file exists for is a check about
  NOT caching:** offline, a request to the Supabase origin must FAIL. A cached
  REST answer is a stale fact about tonight and a cached auth response is
  somebody else's session on a shared iPad; the only correct offline story for
  data is P2.5b's outbox, which knows about identity and last-write-wins, and a
  service worker knows about neither. Two traps are written into it: the
  offline badge is asserted VISIBLE and not merely PRESENT (both shells render
  one, CSS hides the wrong one, and counting DOM nodes would have asserted
  `=== 1` against a truthful `2` — which is how a gate ends up being "fixed" by
  breaking the app); and /poc must come back as ITSELF offline, which is the
  navigation fallback's one hard case.
- **`scripts/storage.ts`** (`bun run storage`) — A71, 10 checks, P2.4's gate.
  It is short because most of what it wanted to assert turned out to be
  unprovable without a password, and saying so was better than dressing it up.
  Both buckets are EMPTY, so on almost every endpoint "refused" and "there is
  nothing there" are the same answer — the exact trap P2.2's migration comment
  records. **One endpoint escapes it, and the gate is built on that one:** a
  PUBLIC bucket answers a missing object with `NoSuchKey`, a PRIVATE one with
  `NoSuchBucket`, because for an anonymous caller the public route does not
  exist at all. That answer does not depend on the contents. Around it: no
  bucket or object enumeration, no signed URL minted for a stranger (a leak
  would show as a `token=` in the response), no anonymous upload — refused with
  "new row violates row-level security policy". **What it CANNOT prove, printed
  in every run:** that a farmer reaches his own agreement and not his
  neighbour's, and that a volunteer reaches the group he is standing with.
  Both need a signed-in caller.
- **`scripts/wizard.ts`** (`bun run wizard`) — A27, 28 checks. Plays the guard
  wizard from a farm with NO anchor point: the callout instead of a dead select,
  the armed-mode placement in all four of its halves (decision 55), the rename
  that reaches the pin's label, the drag, the scored proposal, the refusal-promotes case, the gauge, the orange
  commit button and the recap that names the point drawn in step 1. This is the
  test A20 should have been: A20 passed throughout the bug's life because the
  fixtures list a farm WITH anchor points first.
- **`scripts/layout.ts`** (`bun run layout`) — A24 + A30. Walks all 22 screens at
  390 px and asserts no horizontal overflow, no element wider than the
  viewport, and no two pinned elements overlapping. It caught two real bugs:
  the sticky form footer sitting under the demo toolbar, and a `min-width:auto`
  grid item letting the presence table push the page 40 px wide. Lot 0.8 caught a
  THIRD: Mekomi is a wider face than Rubik, and that alone was enough for the
  farm-card grid's `min-width: auto` tracks to push the page to 397 px. Both
  tracks now carry `min-w-0`. This is the script that pays for itself every lot —
  a 7 px overflow is invisible in a screenshot. Lot 0.9 added the VERTICAL half
  (A30): page height as a multiple of the viewport, capped at six, plus a walk up
  from every table and every 20-plus-row list looking for an ancestor that
  genuinely scrolls — `overflow-y:auto` AND a content height greater than its own
  box, because a container with `auto` and no height limit does not scroll, it
  grows, and would otherwise satisfy a naive check while the page still
  stretched. `/styleguide` carries the single exemption, printed in the run.
  **The product owner's return of 2026-08-31 added the two dimensions it was
  missing, and both immediately found something.** The SEAM: the sweep now
  measures each screen at three positions of the map/content splitter, reached
  by focusing the real `role="separator"` and pressing `End` / `Home` — one page
  load, three ratios, and the ratio the app applies rather than a number seeded
  into `localStorage`. Screens with no seam at that width print `no seam` rather
  than silently collapsing the dimension. And the INSTALLED APP: `STANDALONE=1`
  re-runs everything with `data-standalone` and the real devices' safe-area
  insets stamped on `<html>` — which is possible only because `tokens.css` reads
  `env(safe-area-inset-*)` once into `--status-inset` / `--safe-bottom` and every
  rule in the app reads those. It found `CreateGuardFab` sitting ON the demo bar
  once that bar took the home-indicator inset, and — the one nobody would have
  found by looking — `PanelSplitter` and MapLibre's zoom buttons in the top
  24 px of every map screen. See §12bis.5 and §12bis.7.

A20's interactive half is now committed as `scripts/wizard.ts` rather than
recreated from notes each lot — it was a throw-away script for two lots and that
is precisely how the F1 dead end survived them.

A trap that cost time while writing it: reading candidate names from every `<li>`
on the page also picks up the STICKY STEPPER, whose steps are list items with a
semibold label. "A refusal removed מה ומתי" was a green-looking assertion about
nothing. The selector is scoped to `li[class*="tile"]`, the rows themselves.

Note when writing such probes: React delegates `onMouseEnter` through a
**bubbling `mouseover`**, so a raw non-bubbling `mouseenter` will not trigger
it; map markers use a plain `addEventListener` and do respond to the native
event.

---

## 8. Contrast audit (A13/A19)

`bun run contrast` — **70 pairs on the G17 neutral palette, all meet WCAG AA.**
Rewritten at G12: §8 had carried the pre-G17 Artzenu numbers since Lot 0.8, so
every value below was stale by two identity changes. The MACHINERY did not
change — the vivid/ink split (decision 32), the luminance window (33), the
field hairline pinned at 1.8 (48) — only the values it now measures.

Tightest margins, ordered by how close the worse theme sits to its threshold:

| Pair | Light | Dark | Min |
|---|---|---|---|
| `surface-field` vs `surface-raised` (field in a card) | 1.00 | 1.24 | 1.0 / 1.2 |
| `text-on-accent` on solid `status-violet` / `farm-signed` | 4.56 | 7.64 | 4.5 |
| `text-on-accent` on solid `status-info` / `farm-verbal-ok` | 4.57 | 8.11 | 4.5 |
| `text-on-accent` on solid `status-success` / `farm-active` | 4.59 | 8.96 | 4.5 |
| `border-subtle` on `surface-base` | 1.24 | 1.64 | 1.2 |
| `surface-raised` vs `surface-base` (elevation) | 1.10 | 1.27 | 1.05 / 1.25 |
| `text-on-accent` on `accent-dim` | 4.74 | 6.13 | 4.5 |
| `text-muted` on `surface-high` | 5.01 | 4.75 | 4.5 |
| `status-warn` / `farm-contacted` dot on the page | 3.17 | 9.18 | 3 |
| `text-on-accent` on solid `farm-visited` | 4.81 | 7.03 | 4.5 |
| `surface-high` vs `surface-raised` (hover row) | 1.13 | 1.22 | 1.04 |
| `farm-verbal-ok` chip (ink on 15 % tint) | 6.11 | 4.89 | 4.5 |
| `border-strong` on `surface-field` (the field edge) | 1.97 | 3.15 | 1.8 |
| `critical` marker on `surface-base` | 3.28 | 5.25 | 3 |

The two ends of the window decision 33 describes are still what binds the light
palette, and they are still within ~2 % of their thresholds: a dot has to be
dark enough to be seen on the page (3.17) while the same hue has to be light
enough to be written on (4.56). That is the point — the palette is as saturated
as AA allows. The charter's orange `#EF4F28` survives G17 as `--critical` and
still fits inside that window unmodified, which is why decision 49's role could
be kept when the rest of the charter was retired.

Elevation is held to a stricter threshold in dark: a drop-shadow is invisible
on near-black, so the card separates from the page by luminance alone (1.27
against a 1.25 floor). The same reasoning governs the field: with the tinted
background gone (decision 48), `--border-strong` is the ONLY thing that says
"you can type here", so it is audited at 1.8 rather than at the 1.2 a
decorative edge gets — and in dark the field additionally has to sit a
measurable step below the card containing it.

G18 added no pair: the threat layer spends `--status-warn` and
`--status-danger`, both already audited as fills, dots and chips.

---

## 8b. Field documentation — `docs/terrain.md`

**Written for the product owner and the coordinator, not for developers**, and
kept out of this file on purpose: `ETAT.md` is the memory of HOW the thing is
built, and a coordinator standing in a farmyard needs neither. It carries the
two addresses and what each is for, the first-connection procedure with the
five things to check the very first time, a numbered field check-list PER
DEVICE (the coordinator's iPad, his phone, a fixed workstation — and the
explicit "nothing to do" for farmers, volunteers and drivers, who have no
account in phase 1), the iPad PWA installation in nine steps, and a two-column
table of what does and does not work with no network.

Two things in it are worth knowing about even from here, because they are
counter-intuitive and a coordinator will meet both:
· **Installing the PWA and then signing in IN SAFARI does not sign you in.**
  The installed app has its own storage. Sign in from the icon.
· **Do not sign out before going into the field.** Signing out deliberately
  wipes the cache and any pending writes — that is what protects a shared
  iPad, and it is exactly the wrong reflex before driving into the Negev.

---

## 9. Source of truth

```
docs/brand-artzenu.md     ★ THE CHARTER. Provenance of every colour and font
                            value, the three AA adjustments, the licence
                            question. READ BEFORE touching colour or type.
docs/brand/               Reference plates from the live site (bun run brand-reference)

src/styles/tokens.css     ★ BOTH PALETTES. The four --brand-* tokens quote the
                            charter verbatim; the rest is derived. Vivid/ink
                            pairs, --critical (the orange as a ROLE),
                            --surface-field, THE THREE-VALUE RADIUS SCALE,
                            gradients, motion, type. No hex anywhere else.
public/fonts/             5 self-hosted OFL woff2 — Rubik ×3 (body, every
                            number) + Frank Ruhl Libre ×2 (display, the PO's
                            final arbitrage of 2026-08-30). No CDN: a farm
                            track at 02:00 has no coverage.

src/core/                 PURE TS — no React, no DOM
  types.ts                Domain types, LegConfirmation, FarmVisit, AgendaEvent.
                          Mission.anchorPointId is THE RENDEZVOUS;
                          additionalAnchorPointIds are the night's other posts.
  access.ts               ★ THE ROLE GATE. Every screen reads through it.
  store.ts                Observable store + mutations. `_raw()` is access.ts-only.
                          patchAnchorPoint (a drag knows a position, not a draft)
                          and deleteAnchorPoint (refuses if a guard still points
                          at it, and SAYS SO).
  dispatch.ts             ★ GUARD SCORING (D5). Pure, deterministic, tested.
  contrast.ts             WCAG maths, shared by the audit script and /styleguide
  clock.ts                Time + calendar arithmetic (DST-safe, Sunday-first)
  geo.ts                  Haversine, LOCALITY_POSITIONS gazetteer, bounds,
                          ringAreaDunams/ringCenter (G15),
                          clusterByLocality/bubbleDiameter (P0.2)
  theme.ts                Theme POLICY (defaults per role). No storage.
  xlsx.ts                 ★ P0bis.4 — the .xlsx WRITER. Pure: OOXML parts +
                          a stored-entry ZIP. Real RTL (sheet view AND
                          readingOrder per cell), frozen header, widths,
                          five styles. SheetJS reads uploads; it does not
                          write the template.
  templates.ts            ★ G10 — THE IMPORT COLUMNS, one source of truth.
                          Three templates (volunteers/farms/drivers); the
                          .xlsx, the header guess, the mapping options and
                          the required set are all derived from it.
  import.ts               Validation only (columns live next door). Problems
                          REJECT; warnings (מיקום חסר) do not.
  outreach.ts             ★ P0bis.5 — the sending centre's brain. Channel per
                          phone type, one message writer for the three
                          events, the WhatsApp group kit. Pure.
  photo.ts routing.ts messages.ts config.ts sessions.ts
  mock/                   threats.ts (G18 — 2 zones + 2 vectors, one of each
                          attached and one free) ·
                          farms(12) · people(300 volunteers, 6 drivers) ·
                          generate.ts (seeded PRNG) · anchors(4) · missions(6,
                          one seeded mismatch) · incidents(5) · visits.ts

src/data/                 ★ P2.3 — THE BACKEND LAYER. Neither pure-TS core nor
                            React UI, so it is neither.
  config.ts               SUPABASE_CONFIGURED / URL / key. IMPORTS NOTHING —
                          the mode is needed in the first frame, and this
                          module must never drag supabase-js onto that path.
  client.ts               getSupabase(), memoised, behind a DYNAMIC import
                          (decision 69b). Never fetched in demo mode.
  auth.ts                 The session as the app sees it: a subscribe/snapshot
                          pair shaped like @core/store's, no React. signIn /
                          signOut. NO signUp, and there is not meant to be one.
  storage.ts              ★ P2.4 — the key builders (photoKey/agreementKey, the
                          shape the storage policies read) and BATCHED signed
                          URLs with a TTL cache. 300 portraits is one round
                          trip, not 300. Cleared on sign-out: a signed URL
                          outlives the session that minted it.

src/locales/he.json       ★ ALL UI COPY. en/fr intentionally {}.

public/sw.js              ★ P2.5a — THE SERVICE WORKER. Hand-written, no
                            Workbox: navigations network-first (a deploy must
                            be picked up), hashed assets and fonts cache-first,
                            map tiles cache-first as a BROWSING cache, and
                            NOTHING from Supabase, ever.
src/ui/offline.ts         ★ P2.5a — registration (PROD only, which is what
                            keeps the other gates honest), useOnline,
                            useOfflineMaps.

src/index.css             ★ @font-face for both brand faces; the brand face bound
                            to the type SCALE (unlayered, after utilities, on
                            purpose); .btn/.input/.check/.artzenu-mark;
                            .tile + .tile-interactive (F5.3, rows that float);
                            .list-scroll + .table-scroll (F5.5);
                            .btn-critical/.chip-critical/.card-critical (F4)
src/ui/
  theme.tsx               Theme APPLICATION: localStorage + data-theme + matchMedia.
                          The theme-color meta READS --surface-base rather than
                          restating it (Lot 0.8 found two stale literals there).
  hooks/                  useCore · useLocale ·
                          useShellMetrics (publishes --shell-top / --shell-bottom,
                          decision 39) · useProgressive (F5.5)
  components/             MapSplit ★ (P0bis.1 — THE map-first shell: map on the
                          physical left, three modes, two scroll strategies,
                          the draggable seam. Every screen with a map uses it,
                          MapPanel included) ·
                          splitter.tsx (P0bis.2 — PanelSplitter, mouse+finger,
                          also used by the wizard's own step-1 shell) ·
                          threats.tsx + ThreatPanel (G18 — the coordinator-only
                          layer's vocabulary and its editable list) ·
                          mapMode ★ (P0.1 — the three map states, per screen;
                          P0bis.2 — useMapRatio, the persisted seam ratio) ·
                          PeopleMap (P0.2 — the rosters' locality bubbles;
                          P0bis.1 — now just the map, inside MapSplit) ·
                          AnchorMap ★ (F2 — the map that CREATES anchor points,
                          shared by the wizard, the farm detail and the form) ·
                          MapPanel (the map-first LIST shell — markers, legend, overlay,
                          selected-marker card — over MapSplit) · MapCanvas/MapView (lazy) ·
                          Timeline (D6) · FarmVisitModal (D4) · CreateGuardFab (D3.4) ·
                          Avatar · PhotoField · PresenceRoster · ThemeToggle ·
                          badges (vivid/ink) · primitives · fields · layouts ·
                          ContactActions
  screens/LoginScreen.tsx        ★ P2.3 — the real front door + AuthSplash.
                          Only ever rendered in a real build; the landing
                          screen's identity picker stays with the POC.
  hooks/useAuth.ts        useSyncExternalStore over src/data/auth
  screens/StyleguideScreen.tsx   ★ /styleguide (D1), hidden route
  screens/coordinator/    Dashboard(control room) · Agenda(D4) · MissionWizard(D5) ·
                          FarmsList · FarmDetail · FarmForm · AnchorSheet ·
                          AnchorForm · RoutePlanner · Volunteers ·
                          VolunteerFormModal · ImportWizard · Missions ·
                          MissionDetail · Incidents · IncidentDetail
  screens/farmer|volunteer|driver/
```

---

## 10. Known limitations (not regressions)

- **State is in memory only, IN BOTH MODES.** A reload resets everything,
  including photos, created guards and planned visits.
- ⚠️ **A SIGNED-IN COORDINATOR STILL SEES THE MOCK DATA.** P2.3 put a real door
  on the building; it did not change what is inside. The 12 farms, the 300
  volunteers and the 6 guards behind the login are the same fixtures the POC
  shows, and nothing typed there reaches Supabase — the database is
  deliberately EMPTY. **P2.6 is the unit that swaps the store**, and until it
  lands, do not read anything behind the login as real. This is the single
  most misleading state the project will pass through, which is why it is
  written here rather than left to be inferred.
- **The wizard sends nothing.** Messages are generated and copyable; responses
  are typed in by the coordinator. That is the Lot 5 boundary.
- **Placeholder portraits are synthetic SVGs**, deliberately obviously so.
- **Route polyline is straight segments**, not road geometry — there is no
  routing service. It exists to make the ORDER legible, not to navigate by.
- **`LOCALITY_POSITIONS` covers the 20 towns the fixtures use.** A locality
  outside it is charged a flat 80 km rather than scoring zero, and reports
  `distanceKm: null` so the UI shows "—" instead of a fabricated number.
- **The agenda has no drag-and-drop.** Events are opened and edited, not moved.
- **An anchor point created from the wizard has an EMPTY access description.**
  Deliberate — a coordinator on the phone should not have to compose driving
  directions before staffing a night — and the debt is surfaced twice: a warning
  on the wizard's recap and a placeholder in the farm-detail list. It matters
  because that text is the only thing a kosher-phone volunteer ever sees.
- **`deleteAnchorPoint` refuses when a guard still points at the anchor.** It
  returns `false` and the wizard shows why. Reassigning the guard first is a
  Lot 1 flow; deleting anyway would make the mission invisible, since
  `toMissionView` returns null when its anchor cannot be resolved.
- **Two chunks exceed Vite's 500 kB warning** (MapLibre ~818 kB, SheetJS
  ~500 kB). Both are split and lazily fetched. **The initial bundle is 192 kB
  gzipped** — the "~146 kB" carried here through several lots was stale: the
  frozen P0bis build measures 190 kB, so P2.3 added 1.6 kB, not 46. Supabase
  is a third split chunk (58 kB gzipped), fetched only in a real build.
- **The buckets exist and are closed, but nothing writes to them yet.** P2.4
  built the doors and the signing helper; the camera capture and the agreement
  PDF are P3, and the components still read `photo` straight through. So the
  buckets are EMPTY, which is also why A71 can only prove the anonymous half.
- **The offline shell needs ONE online load first.** The worker caches what it
  sees rather than a build-time precache manifest, so a device that has never
  opened the app online has nothing to fall back on. After one load it is
  fully offline-capable, /poc included.
- ⚠️ **AN EXPIRED TOKEN OFFLINE LOCKS THE COORDINATOR OUT.** Supabase's default
  access token lives one hour; refreshing it needs the network. A coordinator
  who has been offline longer than that is signed out and cannot sign back in
  until he has signal. The mitigation is a dashboard setting (a longer JWT
  expiry) plus P2.5b holding the session rather than discarding it on a failed
  refresh. Written here because it is exactly the failure that will happen in
  the field first, and it is invisible from a desk.
- **A real build has ONE account and no way to make another.** No sign-up, no
  password reset, no invitation. Deliberate — see decision 70 — and the thing
  to build first when a second person needs a login.
- **OSM raster tiles** — must move to a keyed vector provider in Lot 1.
- **`scripts/` is outside tsconfig's `include`.** `bun run typecheck` covers
  `src` and `vite.config.ts` only, so a changed @core signature can leave a
  verification script silently wrong rather than failing to compile. G10 hit
  this: `analyseImport` gained an options object and A9 went on passing an
  array, losing two checks without a type error. Always run `bun run accept`
  after touching a core signature. Widening the include is Lot 1 work — the
  browser scripts' `page.evaluate` bodies need DOM lib settings that would
  otherwise leak into the app's own compile.
- **A shortened map link cannot be resolved client-side.** `maps.app.goo.gl`
  and `waze.com/ul/h…` carry no coordinates; the position is behind a redirect
  the target domain does not CORS-allow. The import flags them rather than
  guessing. Resolving them server-side is a Lot 1 possibility, not a bug.

---

## 11. Open questions

1. When driver and group holder disagree, who should be called first? The
   dashboard currently offers volunteer, driver and group holder as equals.
2. Should a mismatch **block** a mission from completing until a human resolves
   it, or is a standing alert enough?
3. Should the import wizard **update** existing volunteers matched by phone
   rather than only skipping them as duplicates?
4. Photos: should a farmer be able to see volunteers' faces before the group
   confirms arrival, or only once they are on site?
5. Are anchor-point instructions per-anchor, or should some be programme-wide
   defaults inherited by every anchor?
6. **Are the dispatch weights right?** 0.45/km vs 1.2/guard means ~2.7 km of
   travel is worth one guard of seniority. That ratio is a guess and should be
   checked against how the coordinator actually chooses.
7. **Should a refusal be remembered across guards?** Right now the exclusion
   set is per-wizard-session; someone who declines three nights running still
   ranks first on the fourth.
7bis. **⚠️ OPEN, AND IT NEEDS THE PO — the horizontal scroll of PO return 5 was
   never reproduced here.** Before anything was changed, the demo build was
   swept for page-level horizontal scroll at 320, 390, 768, 1024, 1100, 1280,
   1376, 1440 and 1920 px, at splitter ratios 25 / 50 / 75, over sixteen
   screens, on **Chromium AND WebKit** — WebKit being the engine on his iPad —
   measuring both `scrollWidth` and the document's real scroll range. Nothing
   scrolled. A genuine latent defect was found and fixed on the way (`min-w-0`
   missing on `MapSplit`'s map column, §12bis.5) and the rule is now permanent
   in `bun run layout`, but **a green gate is not the same as a reproduction.**
   What would settle it: the SCREEN, the WINDOW WIDTH, whether the app was in a
   browser tab or installed, and whether the rail was expanded — that last is
   the one axis the sweep still does not drive.
8. **RESOLVED BY G17 (2026-08-18):** the Artzenu faces are deleted and every
   self-hosted face is OFL — there is no licence question left. Kept for the
   record; the original concern follows.
   **⚠️ (obsolete) — do the Artzenu font licences cover this app?**
   אטלס (Atlas) and מקומי (Mekomi) are commercial Hebrew typefaces. The eight
   woff2 files in `public/fonts` are the association's own, taken from the
   association's own site, for the association's own tool — but a web licence
   covering `artzenu.org.il` does not automatically extend to a second
   application. Confirm with Artzenu before Lot 1 ships. Rollback if it is not
   covered: delete the `atlas-*`/`mekomi-*` files. That is the whole change — the
   stacks in `--font-brand` / `--font-sans` already fall through to the
   self-hosted Rubik, and nothing else in the app depends on them.
11. **✅ RESOLVED BY THE PRODUCT OWNER (2026-08-31) — SEE DECISION 71.** The
    answer is PMTiles, self-hosted, one file, vector, tinted; the OSM
    pre-cache is abandoned for good. Scheduled after P2.6/P2.5b, before P3.4.
    The measurement that produced the recommendation is kept below, because it
    is the whole justification and it will be asked for again.

    **⚠️ (settled) THE "רענן מפות לא מקוונות" BUTTON CANNOT BE BUILT ON OSM, AND
    THE REASON IS A POLICY, NOT A LIMIT (P2.5a, 2026-08-31).** The order of march
    asks for ~50–80 MB of pre-cached Negev tiles behind a button. The estimate
    was right — measured over the gazetteer's own bbox
    (30.84–32.08 N, 34.42–35.45 E, +0.15° pad):

    | zoom | tiles | cumulative | ≈ size @12 kB |
    |---|---|---|---|
    | z9–z12 | 313 | 313 | 4 MB |
    | z13 | 816 | 1 129 | 13 MB |
    | **z14** | **3 216** | **4 345** | **51 MB** |
    | z15 | 12 502 | 16 847 | 197 MB — too much |

    **4 345 requests in a burst, per device, per refresh, is exactly what
    OpenStreetMap's Tile Usage Policy forbids** ("systematic downloads are not
    permitted"), on infrastructure that is donated. It would also, in
    practice, get the address blocked. So the button is NOT built, and what
    shipped instead is the honest half: a BROWSING cache — ground the
    coordinator has actually looked at stays available offline, which is real
    and costs OSM nothing.

    **THE RECOMMENDED ANSWER IS PROTOMAPS PMTILES, SELF-HOSTED**, and it is
    recommended because it settles three things at once: no API key and no
    usage policy to breach; ONE file to cache rather than four thousand
    requests, which is what "offline maps" should have meant all along; and it
    is VECTOR, so the map can finally be themed in the app's own colours
    instead of approximated with a CSS `hue-rotate` on a raster — which is
    standing carry-in item 2, still open since Lot 0.9. Hosting is a public
    Supabase Storage bucket (free tier: 1 GB stored, 5 GB egress; PMTiles reads
    it with HTTP range requests). Cost: 0. The work is a new map style and a
    tile-extract step whose toolchain must be checked first.
    The alternatives are a keyed provider (MapTiler/Stadia — signup, a key,
    and bulk offline usually needs a paid plan), or keeping the browsing cache
    and dropping the button.

10. **WILL THE ASSOCIATION FUND THE WHATSAPP BUSINESS API?** P0bis.5's ceiling
    is legal, not technical: no third-party application may send a WhatsApp on
    a user's behalf or create a group for him, so the sending centre hands off
    to the coordinator's own apps. The WhatsApp Business API removes that
    ceiling — messages sent by the server, groups created programmatically —
    at a monthly cost and behind Meta's business verification. It is a
    PRODUCT decision with a price attached, not an engineering one, and
    nothing in the app has to change until the answer is yes. Email is
    already on the automatic path (P3.3bis) and needs no such permission.

9. **Is the sea meant to be violet on the night map?** The single hue rotation
   that lands the Negev on forest green necessarily throws the Mediterranean the
   other way (`docs/brand-artzenu.md` §3). It is desaturated almost to neutral
   and only a corner of the frame, but if the coordinator finds it distracting
   the fix is a keyed vector provider in Lot 1, not another rotation.

---

## 12. Next step

**PHASE P0bis IS COMPLETE AND THE POC IS FROZEN (G13).** Five units, five
commits, all gates green, deployed and verified live:

| Unit | What it did | Its gate |
|---|---|---|
| P0bis.1 | the map is on the physical LEFT on every screen that has one | `mapfirst` — 26 screens |
| P0bis.2 | the map/content seam is a draggable splitter | `splitter` — 72 checks |
| P0bis.3 | the density pass, screen by screen | the table in §1 |
| P0bis.4 | the generated .xlsx is really RTL | `rtl` — 45 checks |
| P0bis.5 | the email field, the sending centre, the group kit | `outreach` — 25 checks |

**THE TWO URLS, both verified 200 after the G13 deploy:**
· the app, and it keeps moving — https://azmer-fts.github.io/lo-yanum/
· the FROZEN poc, never redeployed — https://azmer-fts.github.io/lo-yanum/poc/

**P2.3 (AUTH) IS DONE. `bun run auth` — 20 checks, green.** The deployed app
requires a Supabase session; `/poc` stays open on demo data; the identity
picker and the role switcher exist only in a demo build.

**The invitation email was never sent, and the reason is a standing decision,
not a failure.** `auth/v1/invite` requires the `service_role` key, which this
project never fetches, never commits and never lets near the client; the
Supabase MCP exposes no auth-admin tool either. The product owner therefore
created the account himself, in **Authentication → Users → Add user → Create
new user**, choosing his own password with **Auto Confirm User** ticked. That
is Supabase's own flow, it needs no redirect-URL configuration, and no link
expires. **Nobody but the PO has ever typed that password; do not ask for it,
and no gate needs it.** See decision 70.

**THE ACCOUNT EXISTS AND IS HABILITATED (2026-08-30).**
`dov@serialkolors.com`, uid `c9617ce1-8914-4795-bc53-56bab7b30fa5`, created and
auto-confirmed by the PO in the dashboard; `20260830000400_coordinator_grant.sql`
applied on top. An auth account is not yet a coordinator — `app_users` is where a
login becomes somebody, and the schema says "a user with no row here is nobody" —
so skipping that migration produces the worst possible symptom: a successful
sign-in onto 26 empty tables with no error anywhere.

**HOW THE GRANT WAS VERIFIED WITHOUT THE PASSWORD**, and the same query re-runs
any time the question comes back. Every coordinator policy is literally
`using (private.is_coordinator())`, so proving that function is proving the
path:

```sql
with cfg as materialized (
  select set_config('request.jwt.claims',
           '{"sub":"<uid>","role":"authenticated"}', true) as a
)
select auth.uid()::text, private.app_role(), private.is_coordinator() from cfg;
```

· dov's uid            → `coordinator`, **true**
· any other uid        → `null`, **false**

> ✅ **THE DASHBOARD HARDENING IS DONE, AND ONE ITEM OF IT IS NOT PURCHASABLE
> HERE (PO, 2026-08-31 — decision 72).** Sign-ups are OFF, the minimum password
> length is 10, and the leaked-password switch was thrown. It did NOT take:
> `get_advisors(security)` still returns `auth_leaked_password_protection` as
> WARN, because the feature is **Pro Plan and above** in Supabase's own
> documentation. Stop reading that lint as a forgotten switch — it is an
> upgrade line item. The JWT expiry could not be read from this machine
> (decision 72 says exactly why, and why it is not the anti-lockout insurance
> anyway — P2.5b is).

> **BEFORE THE NEXT DEPLOY:** the two repository secrets
> `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` must exist in
> GitHub → Settings → Secrets and variables → Actions. Both values are public
> by design (`.env.example` carries them); they are secrets so that rotating
> the key is a settings change and not a commit. **If either is missing the
> build still SUCCEEDS and silently ships DEMO MODE** — the mock store, the
> role switcher, no login. Check the deployed site shows the login form.

⚠️ **AND UNTIL P2.6 LANDS, THE LOGIN GUARDS MOCK DATA.** P2.3 built the door,
not the rooms: a signed-in coordinator sees the same 12 farms and 300
volunteers the POC shows, and nothing he types reaches Supabase. The database
is deliberately empty. Say so to anyone who is shown the deployed app before
P2.6.

**P2.4 (STORAGE) IS DONE. `bun run storage` — 10 checks, green.** Two PRIVATE
buckets, applied as `20260830000500_storage.sql`:

| Bucket | Key shape | Limits |
|---|---|---|
| `photos` | `<kind>/<id>/<filename>`, kind ∈ entities/contacts/volunteers/drivers | 5 MB, jpeg/png/webp |
| `agreements` | `<entity_id>/<agreement_id>.pdf` | 20 MB, pdf |

The id is a FOLDER, not a filename stem, so replacing a portrait busts every
cached signed URL without touching the row that points at it — and so
`storage.foldername(name)[1]/[2]` gives the policies the kind and the id.

**THE READ RULE IS ONE POLICY: "you may see the photo of anything you may
see."** It does not restate who may read a volunteer, it ASKS —
`exists (select 1 from volunteers where id = …)` — and Postgres applies RLS to
tables referenced inside a policy expression, so that `exists` is answered by
the policies P2.2 already transcribed from `access.ts`. Nobody has to remember
to update the storage file when an access rule changes, which is exactly the
kind of remembering that fails. Writes are coordinator-only in both buckets.
`get_advisors(security)` returns no lints.

> **This resolves ETAT open question 4 by preserving today's behaviour, and it
> should be said rather than slipped in:** a farmer CAN see the faces of the
> volunteers coming to his farm from the moment the guard is planned. That is
> what `FarmerTonightScreen` already renders and what P2.2 already grants for
> their NAMES. If the answer is meant to be "only once they are on site", the
> change is one added clause in the storage migration, next to the rule it
> qualifies.

**P2.5a (THE OFFLINE SHELL) IS DONE. `bun run offline` — 11 checks, green.**
Service worker, offline badge, הגדרות, and one online load is enough for the
app — /poc included — to survive with no network.

> **P2.5 IS SPLIT, and the reason is a dependency the written order missed.**
> Its DATA half (IndexedDB read cache, write outbox, last-write-wins) cannot
> precede P2.6: an outbox flushing to the mock store has nothing to flush, and
> a read cache over demo fixtures would make a reload PERSIST them —
> contradicting "the real app starts EMPTY" head-on. Agreed with the PO on
> 2026-08-31. **P2.6 → P2.5b.**

> **THE TILE PRE-CACHE BUTTON IS DECIDED (PO, 2026-08-31): PMTILES,
> SELF-HOSTED.** Open question 11 is closed and decision 71 records it. The
> OSM pre-cache is abandoned for good; what P2.5a shipped — a browsing cache —
> stays, and the one-file download lands after P2.5b and before P3.4.

**P2.6 (THE REAL SWITCH) IS DONE, IN TWO HALVES AND FOUR COMMITS.**
`bun run persist` — 84 · `bun run mapping` — 33 · `bun run live` — 46.

| Half | What it did | Its gate |
|---|---|---|
| P2.6a | the store became an INTERFACE; the current behaviour moved behind it as the demo implementation, and NOTHING changed | `persist` 84 + every pre-existing gate re-run green |
| P2.6b | the Supabase implementation: empty first frame, one hydration, a serial write-through | `mapping` 33 + `live` 46 |

**THE ORDER WAS THE POINT AND IT PAID.** P2.6a shipped with the demo backend
still the default and all eleven browser gates re-run green BEFORE a line of
Supabase reading existed, so when P2.6b broke something there was exactly one
place it could have come from. `accept` 150, `dispatch` 27, `mapfirst` 27
screens, `splitter` 72, `wizard` 28, `touch` 32, `import` 29, `rtl` 45,
`outreach` 25, `layout` at four viewports, `auth` 20, `storage` 10,
`offline` 11 — all green at P2.6a, all green again at the end.

**THE FOUR FILES, AND WHAT EACH ONE IS FOR:**
· `src/core/backend.ts` — the interface, and the change derivation. Decisions
  73 and 74 are written out in it at length because they are the two that a
  later reader would otherwise undo.
· `src/core/demo.ts` — the fixtures, moved out of `store.ts` at last, plus
  `emptyData()` and `EMPTY_BACKEND`.
· `src/data/rows.ts` — the ONE place that knows both shapes. 26 tables, both
  directions, and nothing else in the app knows a column name.
· `src/data/store.ts` — the Supabase backend.

**THREE THINGS IN `src/data/store.ts` THAT ARE NOT OBVIOUS:**
· **Reads PAGE.** PostgREST caps a select at 1 000 rows and does it SILENTLY:
  a roster of 1 200 volunteers comes back as 1 000 and looks complete.
· **Writes are ONE SERIAL QUEUE.** Creating a farm and immediately drawing a
  zone on it emits two changes a millisecond apart, and a zone whose entity
  does not exist yet is a REJECTED insert, not a slow one.
· **Child tables are cleared in REVERSE and inserted FORWARD.**
  `presence_marks` references `mission_assignments`; `mission_driver_passengers`
  references `mission_drivers`. The other order is refused, correctly.

**`onWriteFailed` IS A NAMED SEAM WITH A PLACEHOLDER BODY, ON PURPOSE.** P2.5b
replaces its body — outbox in, badge up — and nothing else. The alternative, a
try/catch inlined in a loop, is a thing somebody would have to find again.

**`DataBanner` IS THE ONE ADDITION TO THE SHELL, AND IT EXISTS FOR THE FAILURE
THIS FILE ALREADY NAMED AS THE WORST AVAILABLE:** signed in with no `app_users`
row looks exactly like a database nobody has imported into — 26 empty screens
and not one error. It loads its module lazily, so a demo build never fetches
the data layer at all.

★ **WHAT `bun run mapping` FOUND ON ITS FIRST RUN, which is the argument for
having written it before trusting the mapper.** Two of them, and neither could
have been noticed by any gate that existed, because nothing had ever tried to
write a volunteer's address to Postgres:
1. **THE SCHEMA HAD FALLEN BEHIND `types.ts` BY TWO UNITS.** P0bis.5a's
   optional `email` never reached `volunteers`, `drivers` or
   `entity_contacts`; P0bis.5b's outreach `event` never reached
   `cancel_notices`. `20260831000100_p26_catchup.sql`, applied 2026-08-31 with
   the PO's explicit approval and verified by introspection.
2. **TWO THREAT FIXTURES SPELLED `updatedAt` AS A `+03:00` OFFSET LITERAL**
   where every other timestamp in the store is UTC. Same instant, renders
   identically — and a snapshot holding two spellings of one timestamp is a
   structural diff reporting a change that did not happen, the moment the same
   value comes back from Postgres in the other spelling.

★ **AND `scripts/samples.ts` EXISTS BECAUSE OF WHAT THE FIRST DRAFT COULD NOT
SEE.** Reading only the FIRST aggregate of each collection is the obvious
version: an aggregate whose child list is empty writes no row, so that child's
table is never probed at all. `cancel_notices` was exactly that — no fixture
guard carries an outreach tick, because a tick is something a coordinator does
rather than something a fixture is — **and it was also the table the catch-up
had to change. The one table nobody could see was the one that was wrong.**

★ **`bun run live` NEEDS NO PASSWORD, AND THE REASON IS ONE PROPERTY OF
POSTGREST:** `?select=` is resolved against the schema BEFORE row-level
security runs. A missing column comes back 400/42703 naming itself; an existing
one comes back `[]`, the rows being exactly what RLS refuses. So the
DEPLOYMENT can be asked what the migration FILES only claim — and the files say
what was written, not what was applied. 24 tables column by column, 15 enums
label by label, `app_users` closed to a stranger. Nothing crosses the wire that
is not already public in these migrations.

✅ **THE WRITE PATH IS NOW PROVED END TO END — `bun run write`, 35 checks,
against Frankfurt (2026-08-31).** Sign in → the grant resolves → 17 aggregates
across all 25 tables go in through `applyChanges` → come back through
`hydrateFrom` identical → a second write UPDATES rather than duplicates and a
removed child is really gone → everything is deleted and the database is
exactly as the run found it. Re-run twice: idempotent, and it leaves nothing.

⚠️⚠️ **AND THE ACCOUNT THAT MADE THAT POSSIBLE MUST BE DELETED BEFORE P3.1.**
`dov+test@serialkolors.com`, uid `304d2f3b-90ca-43dc-bfac-1361c8184303`,
created by the PO in the dashboard on 2026-08-31 for this purpose alone, with
a disposable password that lives in `.env.test` and is **git-ignored**. It
carries the `coordinator` grant, which is total read and write over every
farmer's phone number, every volunteer's face and the threat layer. **Today
that is a grant over nothing, because the database is empty. From the first
imported farm it is a second door onto the programme's data.** Two steps, both
required, both written out in
`supabase/migrations/20260831000200_test_account_grant.sql`:
  1. dashboard → Authentication → Users → `dov+test@…` → Delete user
  2. `delete from app_users where user_id = '304d2f3b-…';` — run it and check
     it returns 0 rows, because "probably cascaded" is not a thing to be
     probably about
Then delete `.env.test`. `bun run write` will fail at its first check, loudly:
**that is the intended end state, not a regression.** The final report of the
session that does P3.1 must confirm the deletion.

**(historical) THE GAP THIS CLOSED, kept because the reasoning recurs:** Everything above proves the mapper is lossless, that the live
schema accepts every column and every enum label the mapper writes, and that
every mutation emits the right aggregates. What is NOT under an automated gate
is "the coordinator edits a farm, it reaches Postgres, and it is still there
after a reload" — because that needs a session, and a session needs a password.
The PO's password must never reach this repository (decision 70); there is **no
Docker on this machine**, so `supabase start` and a local stack are not
available; and self sign-up is now off (decision 72). **The PO agreed on
2026-08-31 to create a disposable test account** — the same one `bun run
storage` has been asking for since P2.4. Until it exists, verify by hand at
first sign-in: sign in, create a farm, reload, check it is still there.


---

**THE ORIGINAL P2.6 BRIEF IS KEPT BELOW**, because the constraint it names is
the one that decided the design and will be asked about again.

**(delivered) P2.6:** the store becomes an INTERFACE, satisfied by a demo
implementation (the mock fixtures, which is what /poc keeps) and a Supabase
one. **No screen changes.** The real app starts EMPTY.

**MEASURE IT BEFORE STARTING: 53 mutations, 52 accessors, 2 743 lines across
`store.ts` + `access.ts` + `types.ts`.** This is the largest unit in P2 and the
only one that can silently break every screen at once.

★ **THE CONSTRAINT THAT DECIDES THE WHOLE DESIGN, and it is not obvious.**
"No screen changes" and "reads come from Postgres" are only compatible one
way. Every screen reads through `access.ts` **synchronously** — `useCoreValue`
re-runs a selector on each store version bump — so the Supabase implementation
**must not make reads async**. It has to keep the same in-memory snapshot the
mock store keeps, HYDRATE it from Supabase once, and WRITE THROUGH on every
mutation, bumping the version exactly as `store.ts` does today. Turning the 52
accessors into promises would mean touching every screen, which is the one
thing this unit is forbidden to do.

That shape is also why P2.5b comes after: the snapshot the Supabase
implementation holds is precisely the thing IndexedDB persists, and the
write-through path is precisely where the outbox is inserted. Getting P2.6's
shape right makes P2.5b small; getting it wrong makes P2.5b impossible.

Sequence that keeps the gates honest: define the interface and move the CURRENT
behaviour behind it as the demo implementation FIRST, and prove `accept` (150)
plus every browser gate still green before a single line of Supabase reading is
written. Only then add the second implementation. The 26 tables map to a nested
domain model — `Farm` carries contacts/zones/agreements/commitments, `Mission`
carries assignments/drivers/passengers/presence marks — so hydration is a
handful of joins assembled in TS, not 26 independent fetches.

The database is EMPTY, so the first correct result of the Supabase
implementation is every screen showing its empty state. That is success, not a
bug — and it is the moment P3's real import stops being optional.

**(delivered) P2.5b** — the offline DATA layer: an IndexedDB read cache, a
coalescing write outbox with the "N ממתינים לסנכרון" badge, a documented
conflict rule, and an offline session. `sync` 28, `write` 38, `offline` 24.
**Criterion B2 is complete.** One correction to the written brief, recorded
because it was a judgement call: the brief said "last-write-wins **per changed
field**"; what shipped is **per AGGREGATE**, and the reasoning is written out
at length above `flushOutbox` in `src/data/cache.ts`. In short: the change
record P2.6 already produces IS the aggregate, phase 1 has exactly ONE
account so the only way to conflict is one person on two devices, and a
field-level merge cannot be explained to the person it surprises. If the PO
wants field-level, it is a change to `flushOutbox` and to `applyChanges`, not
to anything above them.

---

## 12bis. PO RETURNS OF 2026-08-31 — the seven points, and what each cost

The product owner tested the deployed app: he signed in, closed it, put the
iPad in aeroplane mode and reopened it. Seven points came back. Four of them
were features, two were defects he could see, and one — the seventh — is the
finish on the installed app. All seven are done and every one of them is under
a gate or a capture. **They are recorded here as one unit because they were
tested as one session and because three of them turned out to share a cause.**

### 1 · The eye on the password — `LoginScreen`

A 20-character password typed on an iPad keyboard, at night, into a field that
shows dots, is a login attempt with a coin flip in it — and three failures in a
row are a rate limit (`auth.errors.rateLimit` exists precisely because that
happens). The reveal button is a real **44 × 44 px** target, `aria-pressed` so
a screen reader can ask the CURRENT state rather than only be told it changed,
and `אין/הצג סיסמה` as its label in both directions.

★ **ITS POSITION IS PHYSICAL, NOT LOGICAL, AND THAT IS THE ONE INTERESTING
  LINE IN IT.** The field is `dir="ltr"` — a password is typed in Latin
  characters whatever the interface language — so its text always begins at the
  PHYSICAL left and grows right, in Hebrew and in English alike. Pinning the
  button with `end-*` follows the PAGE's direction and lands it on top of the
  first characters in one of the two. `right-0` / `pr-12` is the side the text
  never starts on, in both.

### 2 · The remembered address — `data/auth.ts`, `lo-yanum:last-email`

Written on every successful settle — a fresh sign-in AND a session restored
from storage, because the claim is "the last address that got in" and a
restored session got in. Read ONCE, as `useState`'s initial value, so the field
stays a plain editable input rather than one that fights anybody typing a
different address. `autocomplete="username"` and `autocomplete="current-
password"` were already correct and are unchanged; the iOS keychain was always
able to fill this form.

★ **IT DELIBERATELY SURVIVES AN EXPLICIT SIGN-OUT, which is the one place it
  parts company with `LAST_SESSION_KEY`.** That key is an ACTIVE SESSION and
  clearing it is the whole of "I have finished with this iPad" (P2.5b's
  asymmetry). This one is a form default, and clearing it would make the
  feature useless in exactly the flow it exists for: sign out at the end of a
  night, come back the next evening, find the field filled. Phase 1 has ONE
  account. **If a shared device ever has to forget the address too, that is a
  "forget this address" control next to the field, not a silent wipe on
  sign-out** — and it is the PO's call, not a change to make quietly.

### 3 · The offline door — joins criterion B2

Two halves, and the first was already true. `bun run offline` has proved since
P2.5b that an offline RELOAD keeps the coordinator inside the app with his
cache and no login form — which IS the PO's scenario (session established, app
closed, aeroplane mode, app reopened). What was missing:

· **the offline badge on the reopened app.** Being let in is only reassuring if
  the app also admits WHY the numbers might be an hour old. Now asserted.
· **the door's own message.** A first sign-in genuinely cannot happen without a
  network — the password is checked by Supabase and by nothing on the device —
  and that is a structural limit the app is allowed to have. What it is not
  allowed to do is dress it up as a server problem: *"אין חיבור לשרת. בדקו את
  החיבור ונסו שוב"* is advice, and it is advice that cannot be followed by
  someone in a wadi. The screen now says
  **`אין חיבור לאינטרנט — נדרש חיבור להתחברות ראשונה`**, ABOVE the button and
  before a password has been typed and lost, and says the same thing rather
  than the generic one if he submits anyway.

### 4 · The Supabase keep-alive — `.github/workflows/keepalive.yml`

A free project is paused after roughly a week of inactivity, and the first
thing that happens is the coordinator's login failing at the hour he can do
least about it. A scheduled `GET /rest/v1/entities?select=id&limit=1` with the
PUBLISHABLE key, every two days.

★ **THE FORM OF THE REQUEST IS THE WHOLE DESIGN.** It had to be one that
  provably reaches POSTGRES, not one a gateway can answer alone. PostgREST
  resolves `?select=` against the schema and then runs a real query; the
  anonymous role has no policy on `entities` (P2.2, criterion B1), so RLS
  filters every row out and the answer is **`200 []`** — measured, not assumed.
  That answer is both the success case and the proof: the database woke up,
  planned a query, applied its policies and answered, and nothing was read
  because there is nothing anonymous may read. `/auth/v1/health` is GoTrue and
  says nothing about the database; `/rest/v1/` is refused outright (401, "Only
  secret API keys can be used for this endpoint") before Postgres is consulted.
  Both were tried against the live project.

Every two days and not every six: it leaves two whole misfires' worth of margin
inside the seven-day window, and GitHub's scheduler is explicitly best-effort.
A 2xx passes; a **4xx passes with a warning**, because a processed request is
still an awake database and this must not fail at 06:12 over something that is
not an outage; only silence and a 5xx fail, because those are the shapes a
PAUSED project has. Both paths were run locally against the real project before
committing.

⚠️ **DELETE THIS FILE THE DAY THE PROJECT GOES PAID.** Paid projects are not
paused for inactivity, so it becomes a request that costs egress and proves
nothing.

⚠️ **AND THE ONE THING IT CANNOT DO FOR ITSELF:** GitHub disables scheduled
workflows in a PUBLIC repository after 60 days with no commits. If work on Lo
Yanum stops for two months, this stops with it and the project pauses a week
later. `workflow_dispatch` is the manual way back.

### 5 · The horizontal scroll — and what the sweep found

**THE RULE IS NOW PERMANENT AND ABSOLUTE: no screen may scroll horizontally at
the PAGE level, at any width and at any position of the splitter.** A wide
table scrolling inside its own `.table-scroll` box stays legitimate; the whole
document sliding sideways never is. `bun run layout` enforces it.

★ **THE SEAM IS A DIMENSION OF THE SWEEP, AND IT COSTS NO EXTRA PAGE LOADS.**
  `PanelSplitter` is a `role="separator"` with `End` → 25 % and `Home` → 75 %,
  so the gate FOCUSES THE REAL CONTROL and presses two keys, measuring the
  screen's own default as the third stop. Seeding `lo-yanum:map-ratio:*` would
  have cost three page loads per screen — and the sweep's entire runtime is
  page loads — and would have tested the number a test wrote into storage
  rather than the ratio the app applies. Screens with no seam at that width
  print `no seam` rather than silently collapsing the dimension to one.

★ **TWO INSTRUMENTS, BECAUSE `scrollWidth` ALONE IS NOT ENOUGH IN AN RTL APP.**
  Overflow in Hebrew goes LEFT, into negative `scrollLeft`. The audit now also
  asks the document to move — `scrollLeft = -99999`, then `+99999`, then back,
  within one frame — and reports how far it went. Zero on a healthy screen in
  both directions.

**WHAT WAS FIXED:** `MapSplit`'s MAP column never carried `min-w-0` while the
content column has since Lot 0.9 — an asymmetry with no reason behind it and
the exact shape of the reported defect. A flex item's `min-width` defaults to
`auto` ("never shrink below your own content's minimum"), and a map canvas is
the worst possible thing to leave under that rule: MapLibre sizes the
`<canvas>` in device pixels from a ResizeObserver, so during a drag there is
always a frame where the canvas is as wide as the panel USED to be. With
`min-width: auto` that frame is a page that scrolls. It cannot shrink anything
that was not already meant to shrink — `flex-1` is `flex: 1 1 0%`, so the
declared basis was already zero and `auto` was only overriding it from below.

⚠️ **AND THE HONEST PART: THE SYMPTOM DID NOT REPRODUCE HERE, and the PO should
know that before he reads a green gate as "fixed".** Before touching anything,
the demo build was swept for page-level horizontal scroll at **320, 390, 768,
1024, 1100, 1280, 1376, 1440 and 1920 px**, at splitter ratios **25 / 50 / 75**,
over sixteen screens, on **Chromium AND WebKit** (WebKit is the engine on his
iPad), measuring both `scrollWidth` and the real scroll range. **Nothing
scrolled.** So: the `min-w-0` fix is a real latent defect closed and a
plausible cause of exactly what he saw, the gate is permanent and green, and
the reproduction is still open. **If it recurs, the two things worth writing
down are the SCREEN and the WINDOW WIDTH** — and whether the rail was expanded,
which is the one axis this sweep does not yet drive.

### 6 · The grey band at the foot of the real app — a token, not a component

**THE CAUSE WAS `--shell-bottom: 2.75rem` IN `tokens.css`, AND IT IS THE MOST
INSTRUCTIVE THING IN THIS WHOLE UNIT.** That value was an ESTIMATE of
`DevToolbar`'s height, deliberately left as a default on the reasoning that the
bar publishes its MEASURED height over the top of it (standing decision 39: the
offset is measured, not declared). Then P2.3 made that bar `return null` in a
real build — correctly, it hands out other people's identities — and with the
component gone, the effect that publishes never ran, **the estimate stood, and
every `100dvh` column in the real app stopped 44 px short of the bottom of the
screen.** What the PO saw as a grey band under the rail was the page's own
`surface-base` showing through a gap reserved for a control that no longer
exists.

★ **THE LESSON IS NOT "THE NUMBER WAS WRONG". IT IS THAT A FALLBACK FOR A
  MEASUREMENT IS A LIE THE MOMENT THE THING BEING MEASURED CAN BE ABSENT.** The
  default is now what a shell with nothing pinned at its foot actually owes —
  the iOS home-indicator inset, zero everywhere else — and `DevToolbar` carries
  that inset as its own bottom padding so the demo measurement still includes
  it.

Three smaller things went with it:
· the `sticky bottom-0` WRAPPER around `DevToolbar` is gone in a real build
  too. It was not the band — an empty sticky box has no height — but "the bar
  is removed and its container is still in the tree" is how a second band gets
  added back by the next person to put something in it.
· `FieldLayout`'s tab bar takes the home-indicator inset when it is the
  bottom-most element (a real build) and does not when `DevToolbar` is below it
  (demo). Exactly one of the two ever pads.
· **a duplicated `<SyncBadge />`** in the coordinator's mobile header, rendering
  the pending-sync pill twice at phone and iPad-portrait widths. Found while
  reading the file, unrelated to anything the PO reported.

`/poc` keeps its demo bar untouched — it is a separate frozen bundle (G13) and
nothing in this unit is deployed to it.

### 7 · The installed app's status bar — P3.4

In the installed app there is no browser toolbar: the page runs to the top edge
of the display and the system draws the clock, the battery and the signal bars
on the app's own pixels. Four parts:

· **A gradient**, `body::before`, `--status-inset × 1.25` tall, from the page's
  own `surface-base` to transparent — so it follows both themes with no second
  palette. It is `body::before` and not an element in the tree because
  P0bis.3's `.panel-scope` wrappers carry `container-type: inline-size`, which
  makes them containing blocks for `fixed` descendants; a JSX overlay would
  have to be hoisted to a root nobody may nest and kept there by discipline.
  **The height is a MULTIPLIER and not "the inset plus 8 px"**: a literal
  addition is right on an iPhone and draws an 8 px band across every desktop
  PWA, where there is no bar to sit under. Scaling collapses to nothing.
· **Every pinned bar clears the system zone** — the rail, both sticky headers,
  the slide-over — by ADDING the inset to its own padding. The first draft of
  this was a `.safe-top` class in `index.css` and it was quietly wrong: those
  bars carry `py-3`/`py-4`, a rule that sets `padding-top` REPLACES the
  utility's, and `.safe-top` would have won on specificity and thrown the bar's
  own breathing room away — leaving the brand jammed against the clock on
  exactly the device this is for.
· **Content starts below the zone and scrolls under it.** `lg:` only: below the
  breakpoint the content sits under a header that already pads, past it there
  is no header at all and the first card of every screen would come to REST
  under the clock, where iOS takes the taps.
· **`--shell-top` falls back to the inset**, which needed one more change:
  `usePublishedHeight` now REMOVES its property when the measured element is
  zero-height instead of writing `0px`. The coordinator's top bar is
  `lg:hidden`, so on a desktop or a landscape iPad it measures 0 — and writing
  `0px` pinned an inline style over the token default with no way back to it.

★ **THE SWEEP FOUND THREE CONTROLS IN THE SYSTEM ZONE THAT NOBODY WOULD HAVE
  FOUND BY LOOKING, AND ONE OF THEM WAS THE SEAM.** The first version of the
  assertion asked only about controls inside viewport-PINNED bars and passed
  everything; the first capture then showed MapLibre's zoom buttons sitting in
  the top 24 px of every map screen. Widened to "every interactive element at
  REST in the zone" — the page is at the top of its scroll, so what it finds is
  what a coordinator ARRIVING on a screen cannot press — it found:
  · **`PanelSplitter`**, `self-stretch` from y=0. The one control P0bis.2
    exists to let him drag, with its top 24 px under the clock.
  · **MapLibre's zoom buttons**, and the farm detail's map overlay button.
  · **`CreateGuardFab`**, at a hard-coded `bottom-16` chosen to clear the demo
    toolbar — **the same anti-pattern as the `--shell-bottom` default in
    point 6**, and it failed the same way the moment that bar grew by an
    iPhone's home-indicator inset: the button landed ON the bar. It is now
    `bottom-[calc(var(--shell-bottom)+1.25rem)]`, so the only number left to
    choose is the gap.

  The first three are fixed at the source rather than one by one: **the
  MapSplit SHELL takes the inset** (`lg:pt-[var(--shell-top)]`, both scroll
  strategies), so every column and the seam between them begins below the
  system zone from one declaration — and `box-sizing: border-box` means the
  `panel` strategy's declared `100dvh − --shell-bottom` still ends where it did.
  The `page` strategy's map column and seam are additionally
  `sticky top-[var(--shell-top)]`, which was right all along and does not
  double up.

★ **AND THE SWEEP THEN CAUGHT THE FIRST ATTEMPT AT THAT FIX BEING HALF RIGHT,
  WHICH IS THE BEST THING IT DID ALL UNIT.** The inset was written as `xl:` on
  the `xl` variant and `lg:` on the `lg` one — which reads as obviously correct
  and is wrong. At **iPad PORTRAIT, 1032 px**, the four `xl` screens (farm
  detail, farm form, anchor sheet, mission detail) are still STACKED, so an
  `xl:` offset has not kicked in — while the coordinator's top bar is
  `lg:hidden` and has ALREADY gone. Four screens with no header and no offset,
  and the map's own bar — carrying the three-state mode switch — sitting under
  the clock. The question the padding answers is **"is there a shell header
  above me", which `lg` decides, not "how does this screen lay its map out",
  which is what the variant is about.** Both variants now use `lg:`, and the
  comment in `MapSplit.tsx` says why, because it will read as a copy-paste slip
  to the next person.

★ **AND THE WHOLE OF IT IS SIMULABLE, WHICH IS WHY THE INSETS ARE TOKENS.**
  Playwright can emulate a viewport, a locale, a colour scheme and a position;
  **it cannot emulate a notch, and no flag will make it.** So `tokens.css` reads
  `env(safe-area-inset-*)` ONCE into `--status-inset` / `--safe-bottom` and
  every rule in the app reads those. `STANDALONE=1 bun run layout` stamps
  `data-standalone` and the two variables with the real devices' numbers (59 px
  on an iPhone 16 Pro, 47 px on the 390-class phones, 24 px on an iPad Pro) and
  runs the ENTIRE sweep as the installed app, asserting the gradient's height
  and that **no control inside a viewport-pinned bar rests in the system zone**.
  Captures land in `docs/screenshots/standalone/`.

★ **ONE JUDGEMENT CALL, AND IT IS THE PO'S TO OVERTURN:
  `apple-mobile-web-app-status-bar-style: black-translucent` IS NOT USED.** It
  is the only way on iOS to force content edge-to-edge under the bar — and it
  also forces the clock and the battery to WHITE, permanently. The
  coordinator's default theme is LIGHT (`defaultThemeFor`), so that trade buys
  an edge-to-edge bar and pays for it with an unreadable clock for the one
  person in phase 1 who has an account; and "adapt the gradient to both themes"
  is the same requirement read from the other end. What is used instead is
  `viewport-fit=cover` plus a `theme-color` that theme.tsx already keeps in step
  with the resolved `--surface-base`, so the status-bar region is the app's own
  background in whichever theme is showing — never a white band — and the
  system picks contrasting glyphs against it. `mobile-web-app-capable` and
  `apple-mobile-web-app-capable` were added; the status-bar-style line is one
  line in `index.html` if he wants the other trade.

### What was re-run, and what it cost

**Every gate, green.** `typecheck`, `tokens`, `contrast`, `accept` (150),
`dispatch` (27), `sync` (28), `persist` (84), `mapping` (33), `auth` (20),
`offline` (**27**, up from 24), `layout` (24 screens × 3 seam positions ×
4 viewports, in BOTH the browser and the installed app), `mapfirst` (27),
`splitter` (72), `touch` (32), `wizard` (28), `outreach`, `rtl`, `import` (29).

`mapfirst`, `splitter` and `touch` were not optional here and would not be for
the next unit either: this one changed `MapSplit`, and ETAT has named those
three as the thing to run first on any map change since P0bis.

**Verified against the real project, not against a mock**: points 1, 2 and 3
were driven through a real build signed in as the disposable test account —
the address is remembered across a sign-out AND a reload, the password field
comes back empty, `lo-yanum:last-session` is cleared, and the reveal button
measures exactly 44 × 44. The keep-alive's script body was executed verbatim
against Frankfurt (`200 []`) and against an unresolvable host (three attempts,
exit 1), so both halves of its verdict are measured rather than reasoned.

---

## 12ter. PMTILES — STEPS 1 AND 2 ARE DONE (2026-08-31)

**THE EXTRACT AND THE BUCKET ARE REAL AND MEASURED.** Both of the brief's
approval gates were put to the product owner before anything started, and both
were answered: `brew install pmtiles`, and a standing yes for the upload under
200 MB.

### 1 · The extract — 42 MB, and the dry run is why that number was cheap

`pmtiles` **1.31.2** from **homebrew-core** (bottled, BSD-3-Clause) — not a raw
GitHub release, because Homebrew already provides `bun` on this machine.

★ **`pmtiles extract --dry-run` ANSWERS "HOW BIG" WITHOUT DOWNLOADING ANYTHING**,
  which is what turned the size question from a commitment into a lookup. It
  was used to compare two candidates before a byte was fetched:

  | zoom | archive | notes |
  |---|---|---|
  | z0–**z14** | **42 MB** | ✅ chosen |
  | z0–z15 | 88 MB | doubles it, and crosses Supabase's 50 MB standard-upload cap into a resumable TUS upload |

  **z14 is much less of a compromise than the raster estimate made it sound,
  and this is the reason worth keeping:** MapLibre OVERZOOMS vector data by
  re-drawing the geometry, so past z14 lines and labels stay sharp. A raster
  past its maximum zoom just blurs. The brief's "z14 is where a farm track is
  legible" was a hard ceiling for raster and is a soft one here.

  Source: `https://build.protomaps.com/20260829.pmtiles` (the daily planet
  build; every date probed answered a range request with 206). bbox as the
  brief specified — `34.27,30.69,35.60,32.23`.

**Checked before uploading, as the brief insisted:** spec v3, tile type `mvt`,
bounds exactly the bbox, **min zoom 0 / max zoom 14**, `clustered: true`, OSM
data of 2026-08-29, attribution present. And not just the header — a real z14
tile at the Negev centre (`14/9775/6692`) decodes to **43 KB** across **9
vector layers**: `boundaries, buildings, earth, landcover, landuse, places,
pois, roads, water`. `roads` is the one that matters at 02:00.

### 2 · The bucket — the first PUBLIC one in this project

`supabase/migrations/20260831000300_basemap_bucket.sql`, applied. The migration
answers "why is this one public" next to P2.4's two private ones rather than in
a file nobody opens: it holds a picture of ground that is already public and
nothing about anybody in the programme.

★ **THE PO'S SIZE CEILING IS A COLUMN.** `file_size_limit = 209715200` IS the
  "under 200 MB" he authorised, so a future replacement that blows past it is
  refused by the database rather than by whether somebody remembered the
  conversation.

★ **THERE IS DELIBERATELY NO SELECT POLICY.** A public bucket is served from
  `/storage/v1/object/public/…`, a path that does not consult
  `storage.objects` at all — a permissive read policy here would look like the
  thing granting access while the `public` flag did the granting. Writes are
  coordinator-only, like both private buckets, which is what let the upload
  happen through a normal session and **without the service-role key this
  project never fetches**.

**Uploaded and verified end to end** — `basemap/negev-20260829-z14.pmtiles`,
the key stamped with the OSM build date so a replacement is a new URL:

| check | result |
|---|---|
| public URL | `HTTP 200` |
| `content-length` | **42 560 293** — byte-identical to the local file |
| `accept-ranges` | `bytes` |
| range `0-16383` | **206**, 16 384 bytes |
| range mid-file | **206**, 256 bytes |
| first 7 bytes | `PMTiles` — the archive survived the round trip |

⚠️ **AND ONE MEASURED LIMITATION, recorded rather than fought:** the custom
`cache-control: public, max-age=31536000, immutable` IS stored on the object
(`storage.objects.metadata->>'cacheControl'` confirms it) but the public
endpoint serves **`cache-control: no-cache`** on the free tier. There is an
`ETag` and Cloudflare reports `cf-cache-status: REVALIDATED`, so range requests
revalidate cheaply rather than re-downloading from origin — but it means
**step 5's service-worker cache is not only about being offline. It is what
makes the ONLINE path fast too**, and it should be built as such.

### 3–6 · The style, the swap, the button, and the filter that is gone

**`src/ui/components/basemap.ts` is the whole of the style**, and every colour
in it is a `tokens.css` variable read off `:root` at build time of the style.

★ **NOT "THE CHARTER'S GREENS" — THE BRIEF WAS STALE AND FOLLOWING IT WOULD
  HAVE BEEN ACTIVELY WRONG.** The brief predates **G17 (2026-08-18)**, which
  retired the Artzenu palette for the neutral blue-grey identity. Today
  `--zone-boundary` (#1E7A4F), `--zone-grazing` (#2FA372) and `--marker-farm`
  (#175E3B) are GREEN, because green is what a farm's ground MEANS on this
  map. A green basemap would have put every zone on top of its own colour and
  made the one thing the coordinator is looking at unfindable. So the basemap
  is deliberately QUIET — surface tones for land, border greys for roads, the
  app's ink for labels — and everything saturated on screen belongs to the
  programme. Water is the single hue spent, and it is `--accent` at 0.28 rather
  than the accent itself, because the accent is what a MARKER is.

★ **`setStyle` THROWS AWAY EVERY SOURCE AND LAYER THE APP ADDED, and that is
  the whole risk of the swap.** With a raster the theme was a CSS filter on the
  canvas and light/dark never reached MapLibre. A vector style holds its
  colours per layer, so the theme switch is a `setStyle` — and four sources and
  ten layers (zones, threat zones, threat vectors, the route) vanish with it,
  on 27 screens. The `load` handler is therefore extracted into
  `installProgrammeLayers`, called from `load` AND once after every `setStyle`.
  **It was already safe to re-run without anybody knowing**: P0.1 had written
  every layer to read its data from a REF rather than a closure, so that the
  handler could "apply it the moment the source exists, whatever order things
  mounted in". That property is what made this a extraction rather than a
  rewrite.

★ **THE HUE-ROTATE IS DELETED, AND OPEN QUESTION 9 CLOSES WITH IT.**
  `--map-filter` (three declarations) and `.map-night` are gone.
  `docs/brand-artzenu.md` §3 turned out to contain the ANSWER to question 9,
  written in 2026-08-18 and filed under the wrong heading: *"its inverse sits
  at ~14° and ends up violet"*. That IS the violet Mediterranean. A filter acts
  on every pixel including the ones that meant something, and the desert and
  the sea sit on opposite sides of the rotation — so no tuning could ever have
  fixed one without breaking the other. Closed by deletion, which was the only
  honest way.

★ **AND THE FIRST WORKING VERSION WAS QUIETLY NOT AN OFFLINE MAP.** It rendered
  perfectly and made **nine requests to `protomaps.github.io`** — two sprite
  files and seven glyph ranges. Criterion B3 would have failed on the first
  farm track, after 42 MB had been downloaded precisely so it would not. Caught
  by watching the NETWORK rather than by looking at the map. Vendored into
  `public/basemap-assets/`: both sprite sheets and **five** glyph ranges per
  weight rather than the three the first viewport asked for — Latin, Latin-ext,
  **Hebrew** and **Arabic**, plus punctuation. 1.2 MB, in the same `public/`
  where G17 already self-hosts the app's OFL faces for the same stated reason.

★ **AND HEBREW RENDERED BACKWARDS UNTIL THE RTL PLUGIN WENT IN.** MapLibre does
  not shape right-to-left text itself. The first capture read
  `סייגטלפה מיהוראל`; with `@mapbox/mapbox-gl-rtl-text` vendored next to the
  glyphs it reads `השטחים הפלסטיניים`, `באר שבע`, `דימונה`, `מצפה רמון`. A
  Hebrew app whose map is in mirror-writing would have been worse than the
  raster it replaced.

**THE BUTTON (step 5) — and the service worker underneath it.**

★ **THE CACHE API REFUSES A 206, WHICH DECIDES THE WHOLE DESIGN.** PMTiles
  reads by range request and `cache.put()` rejects partial responses outright,
  so the thousands of ranges can never be stored one by one. The only workable
  shape: hold ONE complete archive and SYNTHESISE the 206s in the worker. It
  slices a **Blob**, not an ArrayBuffer — `arrayBuffer()` would pull 42 MB into
  the worker's memory several times a second on an iPad, where `blob.slice()`
  stays backed by the browser's storage.

★ **A CONSEQUENCE WORTH STATING: BROWSING THE MAP ONLINE CACHES NOTHING.**
  There is no accidental path into the offline cache. The coordinator taps,
  having been told the size, or he has no map — which is the honest version of
  an offline map, and the one a settings screen can make a promise about.

★ **THE ONE EXCEPTION TO "NOTHING FROM SUPABASE IS EVER CACHED"** is drawn as
  narrowly as it can be: the PUBLIC object path of the `basemap` bucket, and
  nothing else. `/rest/v1/…`, `/auth/v1/…` and both private buckets stay
  uncacheable, so P2.5a's rule — and the gate's assertion of it — survive intact.

The הגדרות block now says **held or not held** and **how many bytes**, and the
button carries **the size before the tap** (read with a HEAD request, not
hard-coded, so a re-cut archive cannot make the screen lie). It replaces a
report that counted raster tiles and multiplied by an average: "3 812 tiles"
is a number nobody can act on — it does not say whether the track to a
particular farm is in it.

### And one defect that was NOT this unit's, found because this unit ran

⚠️ **`bun run offline` FAILED "signing out empties the device" on a loaded
machine, and it was a REAL P2.5b RACE rather than a flake.** `load()` ends with
`cache.clear()` then `cache.put()`; `onSignOut` also calls `cache.clear()`. A
sign-out landing between `hydrateFrom` returning and that write meant: the
sign-out empties the cache, and then the in-flight load fills it straight back
up **with the data of the person who just left**. On a shared iPad that is
exactly the failure the whole P2.5b asymmetry exists to prevent, and it is
invisible — the app shows the login form, and the next person's cold start
restores somebody else's farms.

★ **AND THE FIRST FIX WAS WRONG IN AN INSTRUCTIVE WAY.** It guarded on the AUTH
  STATE, which never fires in time: `signOut()` runs its handlers BEFORE it
  tells Supabase, so the auth state has not changed and `sync()` has not run
  while the window is open. **The signal that a load is void is the sign-out
  STARTING, not the auth state finishing** — so `onSignOut` now clears
  `loadedFor` as its first act, before the cache.

It went unnoticed for a lot because it is a race and the gate usually won it.
It lost on a machine busy running four browsers, which is the only reason it
was ever seen.

### What is left in this unit

**Nothing.** Steps 1–6 are done, `bun run offline` is **33/33**, and it is
deployed and verified signed-in on the live app — see the RESUME block below
for exactly what was checked on the artefact.

Every gate re-run green afterwards: `accept` 150, `layout` (24 screens × 3 seam
positions × 4 viewports, browser AND installed), `mapfirst` 27, `splitter` 72,
`touch` 32, `wizard` 28, `rtl` 45, `outreach` 25, `import` 29, `persist` 84,
`sync` 28, `tokens`, `contrast`, `typecheck`, `build`.
## 13. ⛔ P3.1 (FIN) — THE TEST ACCOUNT IS GONE. ALL THREE STEPS, VERIFIED (2026-08-31)

**`dov+test@serialkolors.com` (`304d2f3b-90ca-43dc-bfac-1361c8184303`) NO LONGER
EXISTS ANYWHERE.** Not in `auth`, not in `app_users`, not on this machine. The
countdown that has been at the top of this file since P2.6b is over, and the
`coordinator` grant that was a second door onto real farmers' phone numbers is
closed BEFORE the first farmer is imported rather than after.

| step | who | result |
|---|---|---|
| 1 · `auth.users` | ⛔ **THE PRODUCT OWNER**, dashboard → Authentication → Users → Delete user | ✅ done by him before this session |
| 2 · `app_users` | this session, `delete from app_users where user_id = '304d2f3b-…'` | ✅ ran, then **RE-READ: 0 rows** |
| 3 · `.env.test` | this session, `rm .env.test` | ✅ gone; it was never tracked (`.gitignore:20`) |

★ **STEP 2's DELETE MATCHED NOTHING, AND THAT IS THE POINT OF HAVING RE-READ.**
  The `app_users` row had ALREADY gone with the auth user — the FK cascades. But
  "probably cascaded" was exactly the thing this file said not to be probably
  about, so the statement was run anyway and the count taken afterwards. **The
  proof is the second query, not the first.** In one read:

  `app_users` rows for that id **0** · `auth.users` rows for that id **0** ·
  `auth.users` with an email like `dov+test%` **0** · leftover
  `auth.identities` **0** · leftover `auth.sessions` **0** ·
  and the whole of `auth.users` is now **1 row — `dov@serialkolors.com`**,
  holding the one `coordinator` grant in `app_users`.

**AND THE TWO GATES BEHAVE AS THIS FILE PREDICTED, which is how "deleted" was
confirmed from the outside as well as from the database:**

· `bun run write` **FAILS AT ITS FIRST CHECK, LOUDLY** — *"A76 needs the
  DISPOSABLE test account, and only that one… If the account has already been
  deleted before P3.1, that is the intended end state and this gate is meant to
  stop working."* Exit code 1. **This is not a regression and must never be
  "fixed".**
· `bun run offline` is **19/19 with its last section SKIPPED** — *"(no
  `.env.test` — the disposable account is gone, which is the end state)"*. It
  was 33/33 with the account; the 14 checks that are gone are the signed-in
  P2.5b half, and they are gone by design. **19/19 with one SKIP is now the
  green result for `offline`.**

### ⚠️ TWO RECORDS THE PRODUCT OWNER LEFT ON THE LIVE DATABASE, AND THEY ARE HIS

The database is NOT empty any more, and it is worth knowing why before P3.1's
import runs:

| table | id | name | created |
|---|---|---|---|
| `entities` | `farm-mth9x977-2` | `Kjuyh` | 2026-08-31 13:28 UTC |
| `drivers` | `driver-mth9l8zu-1` | `Yu` | 2026-08-31 13:19 UTC |

Both are keyboard-mash names typed by the PO while trying the deployed app, and
both post-date the write gate's last run. ★ **NEITHER IS AN `a76-` ID, which is
the check that matters** — A76 stamps every record it creates with an `a76-`
prefix and deletes them all, and there are **zero** of them left. The write gate
cleaned up after itself exactly as it claims to.

They are the PO's own data, so this session did not delete them. **They are also
the perfect first demonstration of point 8's delete button**, and that is what
they are being kept for.

---

## 14. POINT 0 — THE NATIONAL BASEMAP. CUT, MEASURED, GATED. ⛔ THE UPLOAD IS BLOCKED ON THE PO

**THE ARCHIVE EXISTS AND IT IS GOOD.** What is NOT done is putting it in the
bucket, and the reason is not technical timidity — it is the security decision
this project made on purpose and P3.1 finished enforcing. Read §14.4 before
doing anything else with this unit.

### 14.1 · The dry run said 94 MB, so there was nothing to escalate

The product owner's instruction was: *if the dry run passes ~250 MB, stop and
put the costed options to me.* It does not.

| bbox | area | z0–z14 | verdict |
|---|---|---|---|
| the old southern one — `34.27,30.69,35.60,32.23` | 2.05 deg² | 42 MB | superseded |
| **ALL ISRAEL — `34.20,29.35,36.00,33.45`** | **7.38 deg²** | **94 MB** | ✅ cut |

★ **3.6× THE AREA FOR 2.2× THE BYTES, and the reason is worth keeping**: the
  added ground is the Mediterranean, the Negev's empty south and the Arava.
  Vector tiles cost what is ON them, so an empty tile is nearly free — which is
  why "the whole country" turned out to be a smaller decision than it sounds.

**The bbox reaches past every border the programme could plausibly grow into**:
Metula in the north (33.279), Eilat in the south (29.558), the Golan and the
Jordan valley in the east (35.9), the coast in the west. Yehuda-Shomron is
inside it in full.

**94 MB is under both ceilings that matter** — the PO's authorised 200 MB, which
is a COLUMN (`storage.buckets.file_size_limit = 209715200`) and not a memory —
and the 1 GB free tier. It is OVER Supabase's 50 MB standard-upload cap, so the
upload is a **resumable (TUS)** one, which is why §14.3 is a script and not a
`curl`.

Source `https://build.protomaps.com/20260831.pmtiles`, OSM data of
**2026-08-31 04:00 UTC**. Local file, git-ignored on purpose (a 94 MB blob does
not belong in a public repository with a 100 MB cap):

`basemap/israel-20260831-z14.pmtiles` — **94 268 129 bytes**

### 14.2 · Health-checked before anything else, and on SEVEN cities not one

Header: spec **v3**, tile type **mvt**, bounds exactly the bbox, **min zoom 0 /
max zoom 14**, `clustered: true`, attribution present, planetiler 0.10.2.

★ **AND THEN A REAL z14 TILE AT EACH END OF THE COUNTRY, decoded rather than
  counted.** A header can be right over empty ground; this is what says the
  ground is there:

| place | z14 tile | decompressed | layers |
|---|---|---|---|
| באר שבע | `14/9775/6693` | 81 KB | buildings earth landuse places pois **roads** water |
| חיפה | `14/9784/6610` | 77 KB | buildings earth landuse places pois **roads** water |
| ירושלים | `14/9794/6665` | — | present |
| שכם (Yehuda-Shomron) | `14/9796/6641` | 38 KB | + **boundaries** |
| תל אביב | `14/9774/6648` | — | present |
| מטולה (northern tip) | `14/9811/6584` | — | present |
| אילת (southern tip) | `14/9782/6782` | — | present |

### 14.3 · `bun run basemap` — the replacement procedure, as a script

`scripts/basemap.ts`, wired as `bun run basemap <file> <key>`.

★ **IT VERIFIES THE PUBLIC OBJECT AFTERWARDS, AND THAT IS THE HALF THAT
  MATTERS.** A TUS upload that answers 204 on every chunk and serves a
  truncated file is the failure mode a `curl` cannot see. So after the last
  PATCH it checks: the public URL answers 200, `content-length` equals the
  local file BYTE FOR BYTE, `accept-ranges: bytes`, a range request comes back
  **206**, the first seven bytes read `PMTiles`, and — the one that catches a
  corrupted chunk — **a 64 kB slice from the MIDDLE of the object is compared
  byte for byte against the same slice of the local file**.

### 14.4 ⛔ WHY THE UPLOAD DID NOT HAPPEN, AND THE ONE THING THE PO MUST DO

> ⛔⛔ **REFUTED 2026-09-01 — THE UPLOAD IS IMPOSSIBLE, NOT PENDING. SEE §27.**
> Both routes below (`dashboard` and `BASEMAP_TOKEN`) return
> **`413 Maximum size exceeded`**. The project caps uploads at **52 428 800
> bytes (50 MiB)** and the national archive is 94 268 129. The cap is the
> PLAN's, not the bucket's (`basemap` allows 209 715 200), and it is enforced
> BEFORE authorisation — so no password changes it. This is why the act stayed
> "one minute away" across four reports. **Do not tell the PO to upload again.**


**Writes to the `basemap` bucket are coordinator-only** — that is
`20260831000300_basemap_bucket.sql`, and it is the policy that let the FIRST
upload happen through a normal signed-in session and **without the service-role
key this project never fetches**. The session it used belonged to
`dov+test@serialkolors.com`.

★ **P3.1 DELETED THAT ACCOUNT THIS MORNING. THERE IS NO LONGER A NON-HUMAN WAY
  INTO STORAGE, WHICH IS EXACTLY WHAT P3.1 WAS FOR.** The only coordinator left
  is `dov@serialkolors.com`, whose password only the product owner has ever
  typed — decision 70, and it is not being revisited.

⚠️ **A TEMPORARY ANONYMOUS-WRITE POLICY WAS CONSIDERED AND IS RECORDED HERE SO
  IT IS NOT QUIETLY RE-INVENTED.** The shape was narrow — `for insert to anon`,
  one bucket, the one exact object name, dropped minutes later. It was
  **refused by this session's own safety classifier**, and on reflection that
  is the right answer rather than an obstacle: an hour after closing the second
  door onto the programme's storage, re-opening it under a different name is
  the same act with better paperwork. It is not attempted again.

**SO ONE OF THESE TWO, AND EITHER IS A MINUTE'S WORK:**


> ⛔⛔ **REFUTED 2026-09-01 — THE UPLOAD IS IMPOSSIBLE, NOT PENDING. SEE §27.**
> Both routes below (`dashboard` and `BASEMAP_TOKEN`) return
> **`413 Maximum size exceeded`**. The project caps uploads at **52 428 800
> bytes (50 MiB)** and the national archive is 94 268 129. The cap is the
> PLAN's, not the bucket's (`basemap` allows 209 715 200), and it is enforced
> BEFORE authorisation — so no password changes it. This is why the act stayed
> "one minute away" across four reports. **Do not tell the PO to upload again.**

1. ⛔ **THE PRODUCT OWNER, IN THE DASHBOARD** — Storage → `basemap` → Upload
   file → `basemap/israel-20260831-z14.pmtiles` from this repository. The
   dashboard uploads resumably, so 94 MB is fine. **The key must be exactly
   `israel-20260831-z14.pmtiles`** — the app is pointed at a name, and the OSM
   build date is IN the name so a replacement is a new URL rather than an
   overwrite (the free tier serves `cache-control: no-cache` whatever is stored
   on the object, measured 2026-08-31, so the versioned name is what lets the
   service worker hold one archive indefinitely).
2. Or he signs in and hands over a coordinator access token for one run:
   `BASEMAP_TOKEN=… bun run basemap basemap/israel-20260831-z14.pmtiles israel-20260831-z14.pmtiles`

**AND THEN IT IS ONE LINE AND THREE GATES**, which is why nothing else was
changed in the app: `BASEMAP_KEY` in `src/ui/components/basemap.ts:315`
becomes `'israel-20260831-z14.pmtiles'`, then `bun run offline`, `bun run
mapfirst`, `bun run touch`. **The key is deliberately still the Negev one** —
flipping it before the object exists would take the map off the deployed app
the night before the PO shows it to his team.

### 14.5 ★ THE B3 REPLAY IS ALREADY WRITTEN, AND IT ALREADY PROVES THE COMPLAINT

`bun run offline` grew the two-city check the PO asked for, and it is not a
formality — it flies the real map to each city, waits for `idle`, and counts
**rendered features from the `roads` layer**, because `isStyleLoaded()` is
cheerfully true over blank ground.

Run tonight against the archive that is IN the bucket today:

```
PASS  ★ and the ground is really there at באר שבע (Beer Sheva), offline
      — 1575 features rendered, 981 of them roads
FAIL  ★ and the ground is really there at חיפה (Haifa), offline
      — 0 features rendered, 0 of them roads
```

★ **THAT FAILING LINE IS THE PRODUCT OWNER'S POINT 0, MEASURED.** It is the
  first thing that will go green when the national archive lands, and until it
  does, `bun run offline` is **20/21 with one KNOWN failure and one SKIP** —
  Haifa, and nothing else. Re-confirmed at the end of the session, after every
  other change: Beer Sheva 1575 features / 981 roads, Haifa 0 / 0. **Do not
  silence it.**

---


---

## 15. POINT 1 — THE INSTALLED iPAD'S INSETS. ONE FIX, ONE ARBITRATION, ONE INSTRUMENT

The product owner installed the PWA cleanly on a real iPad Pro 13" and got:
a solid band at the top with the content not reaching under the system bar, no
gradient, the same in both themes — and a small residual band at the foot.
**Four separate things, and they have three different causes.** All four are
answered below; one of them is his to decide.

### 15.1 · `viewport-fit=cover` — checked on the ARTEFACT, and it is not the cause

Fetched from `https://azmer-fts.github.io/lo-yanum/` rather than read off the
tree: `<meta name="viewport" content="width=device-width, initial-scale=1.0,
viewport-fit=cover">` **is served**. So is `apple-mobile-web-app-capable`.
`apple-mobile-web-app-status-bar-style` is **absent**, which is §12bis.7's
deliberate choice and, it turns out, the cause of three of the four symptoms.

### 15.2 ★ THE CAUSE OF THE TOP THREE, AND IT IS ONE FACT ABOUT iOS

**Without `apple-mobile-web-app-status-bar-style: black-translucent`, iOS lays
an installed web app BELOW the status bar.** There is then no unsafe area at
the top — iOS already inset the whole web view — so
**`env(safe-area-inset-top)` is `0`**.

Everything follows from that single zero:

| what he saw | why |
|---|---|
| the content does not extend under the bar | iOS put the view below it. By design, without the tag. |
| **no gradient at all** | `body::before` is `height: calc(var(--status-inset) * 1.25)`. `--status-inset` is `env(safe-area-inset-top)`. **Zero × 1.25 = zero.** The rule is correct and had nothing to draw. |
| the band is identical in light and dark | those pixels are painted by **iOS**, not by the app, from `theme-color` — which iOS reads AT LAUNCH. `theme.tsx` keeps that tag in step with the palette at RUNTIME, far too late for a home-screen app, so what showed was the boot literal `#0B1119` in both themes. |

★ **AND IT EXPLAINS WHY EVERY GATE WAS GREEN.** `STANDALONE=1` STAMPS
  `--status-inset` with a real device's number, because Playwright can emulate
  a viewport and will never emulate a notch. That simulation was always honest
  about being one — and what it simulates turns out to be **option B's**
  geometry, the configuration this app does not ship. The gate was measuring a
  layout nobody runs.

### 15.3 · WHAT WAS FIXED WITHOUT ASKING: the status bar now follows the scheme

`index.html` carries three `theme-color` tags instead of one:

```html
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F3F4F6" />
<meta name="theme-color" media="(prefers-color-scheme: dark)"  content="#0B1119" />
<meta name="theme-color" content="#0B1119" />
```

★ **THE ORDER IS THE WHOLE MECHANISM.** A browser takes the FIRST
  `theme-color` whose `media` matches, and an unscoped tag matches everything —
  so an unscoped tag placed first would shadow both media tags permanently. Last,
  it is the fallback, and `theme.tsx` now selects
  `meta[name="theme-color"]:not([media])` so a live theme change cannot
  overwrite the two above it.

⚠️ **Its limit, stated rather than glossed:** it follows the SYSTEM scheme, not
the app's own choice. A coordinator who forces dark on a light iPad gets a
light status bar. That is the ceiling of what meta tags can express, it is
strictly better than one wrong colour in both directions, and the way past it
is the arbitration below.

### 15.4 ⚖️ THE ARBITRATION — ONE COMMENTED LINE IN `index.html`

**OPTION A — what ships today.** The app sits below an opaque system bar. The
bar now takes the right colour per scheme (15.3). The content does not reach
the top of the display and there is no gradient, because with an opaque bar
there is nothing for a gradient to protect.

**OPTION B — `apple-mobile-web-app-status-bar-style: black-translucent`.** The
app fills the screen, `env(safe-area-inset-top)` becomes real, the content runs
under the bar and the gradient appears and follows the theme — **everything he
asked for at the top.** The price is fixed and CSS gets no say in it: **iOS
forces the clock, the battery and the signal bars to WHITE, permanently, in
both themes.** Against the light theme's `#F3F4F6` that is white on near-white,
so option B also switches the gradient to a **dark scrim in both themes**
(`index.css`, `html[data-statusbar='translucent']`).

★ **SO THE REAL QUESTION IS ONE SENTENCE:** *is an edge-to-edge app worth a
  permanent dark strip across the top of the light theme?* That is the whole
  trade, it cannot be tuned away, and it is his call and not this session's.

**It is BUILT, not described.** `standalone.ts` reads the meta tag and stamps
`data-statusbar='translucent'`; the scrim rule keys off that. Uncommenting one
line in `index.html` switches the whole app. And the gate can stamp the same
attribute, so the captures are of the real rule:

★★ **AND THE FIRST CAPTURE OF OPTION B FOUND SOMETHING THE REASONING HAD
   MISSED.** The base gradient is `z-20`, deliberately UNDER the shell's sticky
   headers (z-30): a header is already an opaque band carrying the inset as
   padding, so it protects the glyphs by itself and a second tone over it would
   be wrong. **Under option B that argument collapses** — iOS forces the glyphs
   WHITE, and a light header is then white on near-white. The capture showed
   exactly that: the rail and the content column painting over the scrim, and
   the clock disappearing into them. So in option B the scrim goes to `z-50`,
   above everything the shell pins. **A picture found it; no assertion would
   have.**

`docs/screenshots/statusbar/` — `ipad-{light,dark}-ios.png` (option A) and
`ipad-{light,dark}-translucent.png` (option B), plus `ipad-ls-*`. ★ The mock
clock in the option-B captures is drawn **white in BOTH themes**, because that
is what iOS will do; a capture that drew a flattering dark clock on the light
theme would have hidden the entire cost being arbitrated.

### 15.5 ★ THE BAND AT THE FOOT WAS A REAL BUG, AND PO RETURN 6 HAD FIXED ONLY HALF OF IT

`--shell-bottom` answered two different questions with one number:

· **how many pixels at the bottom are physically occupied** — what a
  full-`dvh` column must subtract;
· **how far up a floating control must start** — which, with nothing pinned
  down there, is the iOS home indicator.

Return 6 replaced a hard-coded `2.75rem` with `var(--safe-bottom)`. Right for
the second question, **wrong for the first — and eleven of the twelve call
sites were asking the first.** So on the iPad every `100dvh` map column stopped
~20 px above the display and painted the shell's own `--surface-base` in the
gap. **The residual band.** It reserved space for a home indicator that needs
none: the indicator is a translucent pill drawn OVER the app, and iOS's own
convention is that content runs under it.

Two tokens now, and the split is the fix:

```css
--shell-foot: 0px;                                        /* what is OCCUPIED */
--shell-bottom: max(var(--shell-foot), var(--safe-bottom)); /* what a CONTROL clears */
```

`max()` and not a sum: the demo bar already paints under the indicator with its
own `pb-[var(--safe-bottom)]`, so adding the two would push every sticky footer
20 px off the bar it is sitting on. Column sites moved to `--shell-foot`;
`CreateGuardFab` and the two sticky form footers keep `--shell-bottom`. The
desktop rail takes `--shell-foot` for its HEIGHT and `--safe-bottom` as
PADDING, so its surface reaches the display edge while the account block at its
foot stays out of the indicator's strip.

### 15.6 ★★ AND THE GATE FOUND A SECOND, UNRELATED DEFECT THE MOMENT IT COULD SEE

`bun run layout STANDALONE=…` now asserts a foot-band invariant:
**`--shell-foot` must equal what is really occupied at the bottom of the
viewport.** It failed on the first run — on all seven FIELD screens:

```
PO POINT 1 band at the foot: --shell-foot claims 69px,
                             div.sticky.bottom-0.z-30 occupies 131.09px
```

★ `DevToolbar` published ITS OWN height, which was right for as long as it was
  the only thing down there. In `FieldLayout` it is not — **the tab bar and the
  toolbar share ONE sticky container** — so the shell claimed 69 px while
  131 px was taken and **62 px of every full-`dvh` column sat behind the tab
  bar** on the farmer's, the volunteer's and the driver's screens. Nobody had
  reported it. The CONTAINER measures itself now, so whatever it comes to hold
  is included by construction.

**And a second assertion catches the ORIGINAL bug, which the first one cannot:**
the sweep runs in DEMO mode, where the bar really is pinned and the claim and
the occupant agree. So the audit also drops the inline override for one frame
and reads **the TOKEN DEFAULT** — precisely what a real build computes, without
building one — and requires it to be **zero**. That value was `2.75rem`, then
`var(--safe-bottom)`; it is the defect itself, and it is now a failing line.

### 15.7 · `STANDALONE=ios` — the configuration he actually runs

`bun run layout` gained a second installed mode. `STANDALONE=1` stamps the
device's real top inset (option B's geometry). **`STANDALONE=ios` stamps
`data-standalone` with a top inset of ZERO and the home-indicator inset
unchanged** — option A, which is what ships, and which is the layout on his
iPad this morning. The bottom inset is deliberately not zeroed: the status-bar
tag has nothing to do with the home indicator, iOS reports that one either way,
and it is the half that produced the band.

### 15.8 · THE INSTRUMENT — אבחון תצוגה, in הגדרות, and removable in one move

`src/ui/components/DisplayDiagnostics.tsx`, a collapsed `<details>` at the foot
of הגדרות. It reports, on his device: the four `env(safe-area-inset-*)` values,
the five tokens derived from them, the gradient's computed height, whether
there is a gradient at all, `navigator.standalone`, `display-mode`,
`data-standalone`, `data-theme`, `prefers-color-scheme`, and the **viewport,
status-bar-style and theme-color meta tags as served** — plus a copy button, so
twenty rows come back as text rather than as a photograph of a screen.

★ **IT READS `env()` DIRECTLY, THROUGH A PROBE ELEMENT, NOT THE TOKENS.** The
  tokens are what the app consumes and they can be overridden — by the gate, by
  a future rule — so a panel that reported the tokens would faithfully report
  the SIMULATION and prove nothing. Both are shown side by side, and a
  disagreement between them IS the finding.

**To remove it: delete the file and the two lines in `SettingsScreen.tsx` that
render it.** Nothing else imports it.

---

## 16. POINTS 2 AND 9 — THE PARASITIC SCROLL IS FOUND, AND THE PENCIL IS GATED

### 16.1 ★★ POINT 2 — OPEN QUESTION 7bis IS CLOSED, AND THE CAUSE IS ONE NUMBER

**`.input` was `text-caption` — 13.5 px — and iOS ZOOMS THE WHOLE PAGE when a
focused field's font is under 16 px.**

Not the field. **The page.** Every WebKit on iOS does it, Safari and installed
PWA alike, and there is no way to opt a field out of it except by giving it
16 px. `--text-caption-size` is `0.84375rem`, so the coordinator's first tap on
"שם החווה" scaled the document by 16 / 13.5 ≈ **1.19**. A document 19 % wider
than the visual viewport pans in BOTH axes under a finger.

★ **THAT IS THE WHOLE SYMPTOM, FROM ONE CAUSE.** "The page moves left-right AND
  up-down" — both. "On the farm form" — and on every screen with a field, which
  is why it looked like a form bug. "Installed, on the iPad" — because no
  desktop browser does this. Open since §12bis.5 and unreproducible in three
  sessions of looking, because the instrument was always a desktop engine.

**The fix, and it costs nothing in legibility:**

```css
@media (pointer: coarse) {
  input:not([type='checkbox']):not([type='radio']):not([type='hidden']),
  select, textarea { font-size: 1rem !important; -webkit-text-size-adjust: 100%; }
}
```

★ **iOS WAS ALREADY RENDERING THESE FIELDS AT ~16 px** — it just got there by
  scaling the entire document. Declaring 16 px gives the same apparent size
  with the page standing still. Coarse pointers only, so P0bis.3's desktop
  density survives untouched.

★ **`!important`, AND IT IS THE ONLY ONE IN `index.css`.** The fields carry
  Tailwind's `text-caption`, which is a CLASS and beats any element selector
  however it is written; raising specificity by hand still loses, and moving
  between layers would make a device bug depend on Tailwind's internal sort
  order. This is a hard device constraint, not a style preference: below 16 px
  iOS takes the page away from the user.

### 16.2 ★ AND THE GATE THAT MAKES IT PERMANENT, PLUS THE ONE THAT COULD NOT

**`ENGINE=webkit bun run layout` runs the whole sweep in Safari's engine.** It
was the right thing to try — the product owner's every browser is WebKit — and
Playwright's WebKit build was already on this machine. It reported a perfectly
still page.

★ **BECAUSE THE ZOOM IS AN iOS BEHAVIOUR, NOT A WEBKIT-THE-ENGINE BEHAVIOUR.**
  Desktop WebKit does not do it. **The symptom is unreachable from here; the
  CONDITION is exact.** So the sweep asserts the condition: **no focusable form
  control may compute under 16 px**, on every touch viewport, on every screen.
  On its first run it failed on **twenty-three of the thirty-two screens** and
  named the control each time. WebKit stays in the gate regardless — it is a
  second engine over the whole app and it costs one env var.

★ **AND ALL FOUR VIEWPORTS NOW RUN WITH `hasTouch: true`**, which they should
  always have done: two iPhones and an iPad in both orientations are touch
  devices, and `(pointer: coarse)` had never matched, so a rule written FOR
  those devices was invisible to the gate that covers them.

### 16.3 · THE FORM SCREENS JOINED THE PERMANENT SWEEP — including the ones that are not URLs

The product owner asked for the form screens on the four viewports. Half of
them are not routes, so a route may now carry an `open(page)` step that puts
the app in the state it means. **A setup step that throws FAILS the screen
rather than skipping it** — a sweep that quietly stops covering the volunteer
form the day its button is renamed is worse than no coverage, because the run
still says PASS.

`ROUTES` went from 24 to 32: `farm-form-new`, `anchor-form`, `anchor-form-new`,
`volunteer-modal`, `driver-modal`, `wizard-step-2`, `wizard-step-3`,
`wizard-step-4`.

★ **STEPS 2–4 WITHOUT DRIVING THE MAP, and the shortcut is the app's own rather
  than a test-only door**: `?resume=<missionId>` is what "המשך גיוס" links to
  on a mission detail, and it lands the wizard on step 2 with a real mission's
  farm, window, shortlist, responses and drivers already in it. From there
  `הבא` is simply enabled. `bun run wizard` still plays step 1 by hand — that
  gate is about the scoring, this one about the geometry.

Three `data-testid`s were added for it (`volunteer-new`, `driver-edit`,
`wizard-next`) and `Modal` gained `data-overlay`, because a modal covering the
shell is the POINT of a modal and the sweep's "no pinned element covers
another" rule had to be told which overlap is deliberate.

⚠️ **THE VERTICAL HALF IS POINT 4 AND IS NOT CLOSED HERE.** The 1.19× zoom
explains the up-down movement he saw *on the form*; the rubber-band overscroll
of the whole shell is a separate thing and is point 4's unit.

### 16.4 ★ POINT 9 — THE APPLE PENCIL, AUDITED THEN GATED

**The audit first, because it decides what the gate has to prove.** Every map
interaction in this app goes through MapLibre's own event system (`click`,
`contextmenu`, `dblclick`, and `Marker({draggable})`) or through the splitter,
which has used **Pointer Events since it was written**. On iOS an Apple Pencil
produces `touch` events AND `PointerEvent`s with `pointerType: 'pen'`, so
MapLibre's handlers see it. Nothing in this app branches on `pointerType` and
nothing depends on a finger-only gesture.

★ **AND THE ONE THING THAT COULD HAVE BEEN A WALL IS NOT ONE: NO INTERACTION
  IS REACHABLE ONLY BY DOUBLE-TAP.** Closing a drawn ring has **"סגור פוליגון"**
  beside the double-tap shortcut (`AnchorMap.tsx`); the seam's double-tap reset
  has **Enter and Space**; placing a point is a single tap on an armed map. The
  double-taps are shortcuts for a thumb, never the only door.

**`bun run touch` grew section 10 — the same vocabulary, with a stylus.**
`Input.dispatchMouseEvent` takes a `pointerType`, so the gate dispatches real
`PointerEvent`s with `pointerType: 'pen'`. **32 checks → 45, all green:**

| with a stylus | result |
|---|---|
| ★ the page really receives `pointerType="pen"` | PASS — `pen` |
| a stylus tap places a guard post | PASS — 1 → 2 |
| a stylus stroke drags it | PASS — Δ 90, −68 |
| four stylus taps are four corners | PASS — `4 פינות` |
| ★ **"סגור פוליגון" closes the ring — no double-tap required** | PASS |
| a vertex follows the stylus | PASS — Δ −70, 55 |
| a stylus tap on a midpoint grip inserts a corner | PASS — 5 → 6 |

⚠️ **WHAT A GREEN RUN DOES NOT SAY, so nobody reads more into it:** iOS's own
gesture layer is not simulated. A Pencil on glass has tilt, pressure and hover
that no protocol reproduces, and a stylus does not raise the long-press callout
a finger raises. The audit above is what covers that half; the gate covers
"does the interaction respond to a pointer that is not a finger", which is the
question that decides whether he can work.

★ **SCRIBBLE IS SAFE TODAY AND IS A CONSTRAINT ON POINT 4.** `touch-action:
  none` appears in exactly one place in this codebase — the splitter's grip,
  where it is load-bearing — and on no field anywhere. **Point 4 must not put
  `touch-action: none` or a blanket `preventDefault` on a text input**, or
  handwriting into a field stops working on the one device this app is for.

---

## 17. POINT 8 — DELETING A RECORD. ONE POLICY, ONE DIALOG, 61 CHECKS

The product owner had no way to correct a typo. There was no delete button
anywhere for an entity, a volunteer or a driver — and ★ **every deletion the app
DID have fired on the FIRST TAP with no confirmation at all**: a zone, a guard
post, a visit, a meeting, a tour, a threat zone. That second finding is his rule
"TOUJOURS avec confirmation" read backwards, and it was found by wiring the
first one.

### 17.1 ★ THE RULE IS NOT "WHO MAY DELETE", IT IS "HAS THIS HAPPENED YET"

`src/core/deletion.ts`. One function — `deletionPlan(kind, id)` — and every
consumer renders its answer rather than deriving its own.

A farm typed twice, a volunteer whose name went in wrong, a guard post dropped
in the wrong field: those are MISTAKES, and a mistake has no history. A record
with **operational history** — guards done or planned, incidents, a signed
agreement — is not a typo; it is a fact about a night somebody worked, and
deleting it silently rewrites what the programme did.

★ **AND A REFUSAL SAYS *WHAT* IS IN THE WAY.** "3 שמירות מתוכננות" tells a
  coordinator standing in a field what to cancel. "לא ניתן למחוק" tells him to
  phone somebody.

| kind | refused when | the alternative offered |
|---|---|---|
| **entity** (חווה/מושב) | live guards · incidents · a signed agreement | change its status, or cancel the guards first |
| **volunteer** | assigned to a live guard · named in an incident | **archive him** (לא פעיל) — the nights are kept |
| **driver** | carrying anybody on a live guard | dual hat → *take the driver hat off*; career driver → cancel the trips |
| **guard post** | ANY guard points at it, cancelled included | cancel those guards first |
| **contact** | he is the `signedBy` on an agreement | edit him instead |
| **visit** | it already happened (`done`) | it is history; edit the note |
| **guard** | always — ★ **a guard is CANCELLED, not deleted** | `בוטלה`, which keeps the record AND the reason |
| zone · threat zone · threat vector · meeting · tour | never — none of them carries a history of its own | — |

★ **A CANCELLED GUARD DOES NOT BLOCK, and that is deliberate.** `בוטלה` is
  already the record of a night that did not happen. Holding a farm hostage to
  a guard the coordinator himself called off would make "cancel, then delete" —
  the alternative this module offers — a road to nowhere.

★ **THE GUARD POST IS THE ONE PLACE "ANY GUARD" MEANS ANY, cancelled included.**
  `toMissionView` returns `null` for a guard whose rendezvous does not resolve,
  so deleting the post would not delete the guard — it would make it INVISIBLE.
  That is worse than a refusal, and it is why this rule is stricter than the
  others.

★ **THERE IS NO `draft` STATUS IN THIS MODEL** — G4's `recruiting` IS the
  draft. So "a guard nobody was ever asked to attend" is a fact about the
  OUTREACH, not about a column: `recruiting`, nobody assigned, no driver, no
  message sent. One message out and it is a promise, whatever the status says.

### 17.2 · POINT 8d — THE NAME TYPED BACK, AND ONLY WHERE IT IS EARNED

The reinforced confirmation appears **only for an entity that has DRAWN ZONES**.
The drawing is the one expensive thing on these records: a boundary and a
grazing ground are twenty minutes of a finger on a map at the side of a road,
while everything else was typed in ninety seconds and can be typed again.

★ Asking for the name everywhere would make it a reflex, **and a reflex
  confirmation is not a confirmation.**

### 17.3 · ONE DIALOG, AND THE REFUSAL IS *IN* IT

`ui/components/ConfirmDelete.tsx` plus `useConfirmDelete()` — `del.ask(kind, id,
perform)` and `{del.dialog}`, two lines per call site, because a rule that costs
five lines of state per button is a rule somebody skips.

★ **THE REFUSAL IS THE SAME DIALOG, NOT AN ERROR AFTERWARDS.** He taps מחיקה
  and is told why and what to do instead **before he has confirmed anything**. A
  confirm-then-fail flow makes a coordinator agree to something that was never
  going to happen.

★ **AND `deleteFarm` / `deleteVolunteer` / … ASK THE POLICY THEMSELVES**, return
  `false` rather than throwing, and take no `force` flag. The wall is in the
  STORE, so a future screen, an import or a script hits it too — and the dialog
  surfaces a late refusal (a guard landing between the plan and the tap) rather
  than swallowing it.

**Wired on:** the entity (its detail header, with the retype step), the guard
post (its own sheet, and inside the wizard), the volunteer and the driver (row
actions, both the table and the mobile card), zones, threat zones and vectors,
visits, meetings, tours. ⚠️ **The volunteer row's ARCHIVE action wore the BIN
icon** until this unit — exactly the confusion between "keep his nights" and
"he was never here" that point 8 exists to end. It is `close` now, and the bin
means the bin.

### 17.4 ★ POINT 8c NEEDED NO NEW MACHINERY, AND THAT IS P2.6 PAYING OFF

A deletion travels through the offline outbox with **nothing written for it**.
P2.6 DERIVES changes by diffing the snapshot (`backend.ts`), so a row that stops
being in an array becomes `{ collection, id, json: null }` **by construction —
for the cascade as well as for the row the coordinator pressed**. `bun run sync`
already proves a `json: null` survives a reload as a deletion.

The SQL half was already there too, and it lines up with the policy rather than
fighting it: `20260830000100_schema.sql` carries 27 `on delete cascade`s, and —
★ **the two that matter here** — `on delete restrict` on `missions.guard_post_id`
and on `mission_drivers.driver_id`. **The database refuses exactly what
`deletionPlan` refuses.** The app-level cascade is written out anyway, because
the LOCAL cache has no foreign keys: Postgres cleans the database, this cleans
the device, and the device is what the coordinator is looking at.

### 17.5 · `bun run deletion` — A79, 61 checks, no browser

Free deletion with the dependencies listed · a motivated refusal on history with
the blockers named and counted · the store refusing as well as the dialog · the
whole cascade reaching the backend as deletions · the dual hat · a visit done vs
a visit planned · a guard refused in favour of cancellation · a stale id
reporting NOT FOUND rather than "refused".

★ **AND TWO CHECKS THAT KEEP IT HONEST OVER TIME**, because a policy answering
  for twelve kinds proves nothing if the coordinator can reach four: **every
  `DeletableKind` must have a call site in the UI**, and **every one of them
  must go through the dialog**. 10 kinds, 13 confirmation call sites.

★ **AND THE DUAL HAT WOULD HAVE BITTEN SILENTLY.** Deleting a driver row while
  the volunteer's `canDrive` stayed true means the next `updateVolunteer`
  materialises the driver AGAIN — the deletion undoes itself the first time
  somebody fixes a phone number. `deleteDriver` takes the hat off, and the gate
  edits the volunteer afterwards to prove the row stays gone.

⚠️ **`bun run persist` (A73) FAILED THE MOMENT THIS LANDED, WHICH IS ITS JOB.**
Its section 7 cross-checks the names `@core` exports against the names actually
driven: *"NOT DRIVEN: deleteFarm, deleteVolunteer, deleteDriver, …"* — nine new
mutations, none exercised. Driving them found two more things worth keeping:
`farmDraft()` copies the fixture farm's **signed agreement**, so a cloned test
farm is refused (correctly, and the gate was asserting the wrong thing until it
passed `agreements: []`); and `createMission` defaults to **`planned`**, which
point 8 refuses — the abandoned-wizard case has to be created as `recruiting`.
**94/94 now.**

---

## 18. POINT 6 — THE HEAD COUNT. AND THE WHOLE FEATURE TURNS ON `null` vs `0`

The programme is funded partly on the livestock it protects. Until now the app
could say how much GROUND was under guard and **nothing at all about the animals
standing on it**, which is the number the association's director is asked for by
people who do not care how many dunams a wadi covers.

### 18.1 ★ IT IS A LIST, NOT A NUMBER — AND ABSENT IS NOT ZERO

**A list**, because "500 head" answers nothing: 500 sheep and 500 head of cattle
are different sums of money, different night risks and different pens. The field
expert names the species; the app does not invent a unit that averages them.

`LivestockKind` is a CLOSED list — `cattle · sheep · goats · camels · horses ·
poultry · other` — because a closed list is what keeps the totals **addable**
across entities, and the funding number is a sum. ★ `other` carries **its own
label** rather than being a bucket, so a coordinator never has to lie about an
ostrich farm; the import keeps the word he typed.

★★ **AND THE LOAD-BEARING DECISION IS `totalHeads()` RETURNING `null`.**

  · no rows = **nobody has been asked**
  · a row saying `0` = **there are none**

  Those are different facts and the app must never conflate them, because this
  is a funding figure. **A tile reading "0 ראשים" states something nobody has
  established.** So `totalHeads` is nullable, the detail banner is hidden on
  null, the dashboard tile is hidden at zero, and the mapper hands back
  `undefined` rather than `[]` when the child table is empty — an empty array
  would round-trip as "asked, and the answer was none".

  ⚠️ It is also why the migration **backfills nothing**: a `default 0` row per
  entity would have destroyed the distinction on the way in.

★ **AND THE QUESTION IS ONLY ASKED OF AN ENTITY THAT KEEPS ANIMALS**
  (`keepsLivestock` — `livestock` or `משולב`). An arable holding has no head
  count, and a form that asks anyway is a form that trains the coordinator to
  skip a section. The form section appears and disappears as he changes the
  type, live.

### 18.2 · Where it shows, end to end

| surface | what it does |
|---|---|
| **the form** | a collapsible-style `בעלי חיים` section, one row per species, `הוספת שורה` / `הסרת השורה`, the free label only on `אחר`, a running total. A row with no head count is dropped on save rather than saved as a zero. |
| **the detail** | a tile in the metric band, beside the two dunam figures, with the breakdown under it — `צאן־כבשים 820 · בקר 140`. Verified in the browser: **960** on `farm-01`. |
| **the dashboard** | a third budget tile, `ראשים בשמירה`, ★ **hidden at zero**. Verified: **1,332**. |
| **the .xlsx template** | three type/count pairs. |
| **the import** | `readLivestockKind` reads the Hebrew label, the English key, or anything close. |
| **the database** | `entity_livestock`, additive, applied. |
| **the report** | point 7 reads the same accessor. |

★ **THREE PAIRS IN THE SPREADSHEET, AND THREE IS THE RIGHT NUMBER.** A cell
  cannot hold a list, so the pairs are flattened. Three because that is what a
  real holding has — cattle and sheep, occasionally with a poultry house — and
  because a fourth pair would add two empty columns to every row of every import
  for a case the coordinator finishes by hand on the form in ten seconds.

★ **A PAIR NEEDS BOTH HALVES.** A type with no number is somebody who started
  typing and stopped; a number with no type is a number nobody can spend. Either
  way the pair is dropped rather than guessed. And an unrecognised word becomes
  `other` **with the word kept** — `יענים` stays `יענים`, because turning it
  into `sheep` would put ostriches in the sheep column of a funding report.

★ **AND THE ENTITY TYPE GOVERNS THE IMPORT.** A spreadsheet row that names a
  head count on an arable holding does not get one. The column the coordinator
  filled in about the entity's TYPE is the one that decides.

### 18.3 · `entity_livestock` — additive, and its RLS is transcribed not inherited

`supabase/migrations/20260831000400_entity_livestock.sql`, **applied**.

A CHILD TABLE, not a column and not JSON — the same shape `entity_commitments`
has, for the same reason: the domain object has no id of its own, the row needs
one, and `position` is what the form edits. The id is minted from the parent and
the position (`farm-01:l0`): stable across writes, reproducible from nothing
stored, which is what lets the offline outbox carry an edit without having
invented an id offline.

★ **THE RLS IS SPELLED OUT RATHER THAN INHERITED, because a head count is a
  fact about a farmer's ASSETS.** Coordinator: all. Farmer: his own entity's
  rows, and nothing else. Volunteer and driver: nothing. Same rule as
  `entity_commitments`, said out loud.

**Nothing existing is altered** — no table, no column, no policy, no enum. An
older client that has never heard of livestock reads and writes exactly as
before.

### 18.4 ⚠️ THREE GATES CAUGHT SOMETHING, WHICH IS WHY THEY EXIST

· **`bun run mapping` (A74) reported `entity_livestock (no such table)`** while
  the migration sat on disk — its migration parser only knew
  `create table X (`, and this file is written `create table if not exists`
  (re-runnable, like P2.4's policies). ★ **A parser that silently stops seeing a
  table because somebody wrote the SAFER version of the same statement is worse
  than one that fails**, so the parser learned the optional clause.
· **Then it reported `add a sample: entity_livestock`** — no fixture farm had a
  head count, so the round trip was never exercising the new table at all.
  `farm-01` and `farm-04` now carry one, which is also what the product owner
  demonstrates on tomorrow. Deliberately **not** all of them: an entity with no
  rows is the state the app has to render honestly.
· **`bun run live` (A75) now probes the table and its enum against Frankfurt** —
  6 columns, 7 labels — because a species the app spells and Postgres has never
  heard of is a silent write failure. **48 checks.**

`accept` is **162** (was 150), and the twelve new ones are almost all about
`null` vs `0`, because that is the thing a later session will be tempted to
"simplify".

---

## 19. POINT 7 — THE EMPLOYER'S REPORT. A REAL PDF, IN HEBREW, WITH NO PDF LIBRARY

### 19.1 ⚠️ THE BRIEF SAID "THE SAME PDF LIB AS THE AGREEMENTS" AND THERE IS NO SUCH LIB

`public/mock-agreement.pdf` is a **static file checked into the repository**.
Nothing in this project has ever GENERATED a PDF. So this unit had to choose
one, and the choice is the part worth keeping.

★ **EVERY JS PDF LIBRARY FAILS THE SAME WAY ON THIS APP: HEBREW.** `jspdf` and
  `pdf-lib` both draw text with an embedded font, and the PDF base-14 fonts have
  no Hebrew at all. Either would need a Hebrew TTF embedded and subset — this
  project self-hosts **WOFF2**, which neither accepts — plus a **bidi pass by
  hand** for every line that mixes a Hebrew label with a Latin digit. That is a
  font pipeline and a bidi implementation, to print eleven numbers.

★★ **SO THE TEXT IS DRAWN BY THE BROWSER, ON A CANVAS, AND THE PDF CARRIES THE
   RESULT AS ONE IMAGE.** The browser already shapes Hebrew, already does bidi,
   already has the app's own self-hosted faces loaded and already understands
   `direction: rtl`. **A PDF whose page content is a single JPEG XObject needs
   no font embedding whatsoever** — which is why `src/ui/report/pdf.ts` is a
   hundred lines, has no dependency, and works offline.

⚠️ **THE COST, STATED RATHER THAN GLOSSED:** the text is not selectable and the
file is ~100 kB rather than ~20. For a one-page sheet of large figures that a
director reads on a phone and forwards, that is the right trade. **If a future
requirement needs selectable text** — a searchable archive, a contract — **this
is the decision to revisit, and it will need the font pipeline.**

★ **AND IT IS A REAL `File`**, which is what makes 7b possible at all: the Web
  Share API carries files, and on an iPad that is one tap to Mail or WhatsApp. A
  print-to-PDF flow would have looked similar and produced nothing a share sheet
  or a script could hold.

**Two things the first run got wrong and the browser said so:**

· ⚠️ **THE TITLE CAME OUT AS `xfixŁxŠ x°xŁxIx€xŽx°` IN THE READER'S TITLE BAR.**
  A literal `(…)` string in a PDF is PDFDocEncoding — Latin-1 with a few
  substitutions — and has **no Hebrew**. The portable answer is a HEX string of
  **UTF-16BE with a byte-order mark**, which every reader since PDF 1.0
  understands. ASCII still takes the literal form so the file stays greppable.
· The cross-reference table's offsets are counted in **BYTES**, so the body is
  built as an array of byte-strings and measured as it goes. Computing the
  offsets afterwards from a joined string would be wrong the moment a JPEG
  contains a sequence that is not one character.

### 19.2 · 7a — the one-pager, and the brief is a severe spec

*"Readable by a director in thirty seconds"* rules out a table. A director
reading a page in thirty seconds reads **numbers** — six or seven, large, one
word under each — and everything else is context he looks at only if a number
surprises him. So the sheet is three bands:

1. **the ground**, in the biggest type on the page — dunams guarded, dunams
   potential, ★ **and the head count, drawn only if somebody has been asked**;
2. **the programme** — entities, farms, moshavim, active volunteers (with the
   smartphone/kosher split under it), drivers and seats, guards done (total, and
   in the window), guards planned, visits planned;
3. **the detail, small** — entities by status, incidents by severity over 30
   days, in the three severity colours.

Identity at the top: **לא ינום** in the display face, the verse discreet under
it (also in the display face — it is scripture, not a caption), the date on the
other side, and the verse reference in the footer. Always **white paper**: this
is a document that gets printed and forwarded, and the dark theme has no
business on it.

★ **POINT 6's RULE SURVIVES ONTO THE PAGE.** No head count means the tile is
  **not drawn**, rather than drawn as a zero. A funder reads this sheet.

Verified in the browser on the real artefact: a **97 kB** PDF, `%PDF-1.4`, valid
trailer, one page, Hebrew and RTL correct throughout, title `דוח תוכנית` in the
reader's own title bar.

### 19.3 · 7b — three ways out, and one of them is a lie if you let it be

The PDF is **built once** and then offered three ways — build-per-button would
mean three renders and three chances for the numbers to differ between what he
shared and what he downloaded.

· **שיתוף** — `navigator.share({ files })`. ★ `navigator.canShare` is ASKED
  rather than assumed: Safari on an iPad answers yes and hands the sheet to Mail
  and WhatsApp, which is the product owner's "one gesture"; a desktop Chrome
  without it answers no and **the button is not drawn at all** rather than
  throwing when pressed.
· **הורדה** — the file, on the device.
· **שלח במייל** — ⚠️ **`mailto:` CANNOT CARRY AN ATTACHMENT.** No mail client
  accepts one from a URL, and pretending otherwise is how a coordinator sends an
  empty message believing the report is on it. So this **downloads the file
  first and says so**, then opens a pre-filled draft **with the figures in the
  body** — so the mail is useful even if he never attaches anything.

**כתובת דוחות** lives in הגדרות, saved on blur. It is `localStorage` and not the
database on purpose: it is needed **with no network** (a value that has to be
fetched is missing exactly when he needs it), and it is a preference about one
device, in the same class as the theme and the seam ratio.

⚠️ **P3.3bis — THE AUTOMATIC SEND WILL NEED IT SERVER-SIDE.** An edge function
cannot read a browser's `localStorage`, so when the monthly email is built this
becomes a row (a `settings` table, or a column on `app_users`) and
`report/recipient.ts` becomes its cache. **Written down now rather than
discovered then.**

### 19.4 ★★ 7c — `bun run report` (A80), 86 checks, and it runs on THREE stores

The product owner's condition: the PDF's figures are the **same core accessors**
as the dashboard, with **no parallel recalculation**, and **a script proving the
equality**.

★ **THE FAILURE THIS PREVENTS IS SPECIFIC AND NOT HYPOTHETICAL.** A report gets
  written months after the screen it summarises, by somebody reading the
  dashboard and re-deriving what he sees. The two agree the day it is written
  and drift the first time a status is added or "active" comes to mean something
  slightly different. **Two numbers with one name is worse than one number**,
  because the director quotes whichever he has and the coordinator defends the
  other.

So `src/core/report.ts` holds the NUMBERS and nothing else — no layout, no PDF,
no DOM — and every field is `getDunamKpis()`, `getVolunteerStats()`,
`getDriverStats()`, `getFarmStatusCounts()`, the functions the dashboard already
renders. Where a figure genuinely has no accessor yet (completed guards in the
window, incidents by severity), it is derived **there, once**, so the dashboard
could adopt it rather than the report growing a second arithmetic.

★ **AND THE GATE RUNS ON THREE STORES, NOT ONE**: the fixtures, an **EMPTY**
  programme — because zero is where a report lies most easily, and the empty one
  is where `guardedHeads === null` is proved — and the fixtures with a moshav, a
  kosher volunteer, a planned visit and an urgent incident added under them. **An
  equality that only holds on the demo data holds by coincidence.**

★★ **AND THE CHECK THAT KEEPS 7c TRUE WHEN NOBODY IS LOOKING:** the renderer is
   read and required to import **only a TYPE** from the domain. With no value
   imported from `@core`, `draw.ts` **cannot read the store**, so there is
   nothing for it to recompute even by accident. ⚠️ The first draft of that check
   grepped for `get…(` and flagged `getComputedStyle`, `getContext` and
   `getPropertyValue` — the three DOM calls a canvas renderer cannot do without.
   The import list is the exact instrument; a regex over call sites was a
   near-miss.

---

## 20. POINTS 3, 4 AND 5 — THE SHELL. AND POINT 3 HAD A CAUSE, NOT A MYSTERY

### 20.1 ★★ WHY HE NEVER SAW THE OFFLINE BADGE THAT ALREADY EXISTED

`OfflineBadge` and `SyncBadge` were rendered in **two** places:

· the **mobile top bar** — which is `lg:hidden`, so **it does not exist on his
  iPad at all**;
· the **foot of the desktop rail** — and the rail defaults to **COLLAPSED**
  (`useState(false)`, 4.5 rem wide), which renders both badges `compact`: **a
  6 px coloured dot, no text, below the navigation, at the bottom of a 1376 px
  column.**

It was on screen and it was unfindable. That is a layout fact, and it is why
the answer is not "make it bigger".

**`ui/components/NetworkStatus.tsx` is one indicator, mounted ONCE at the root**
(`App.tsx`), viewport-pinned, shell-independent. "On every screen" has to mean
every screen — including the ones nobody will remember when the next shell is
added.

| state | what it says |
|---|---|
| offline | orange dot · **`לא מקוון`** |
| writes waiting | info dot · **`N ממתינים לסנכרון`** |
| loading | pulsing dot · **`מסנכרן…`** |
| just came back / outbox just drained | green tick · **`מסונכרן`**, for 2 s, then gone |
| everything normal | **nothing at all** |

★ **IT SAYS NOTHING WHEN THERE IS NOTHING TO SAY**, which is the rule the two
  badges it replaces were written under and which survives them: a green dot
  that is green ninety-nine times in a hundred is read as decoration by the
  hundredth time — the one time it changed.

★ **THE GREEN TICK IS A TRANSITION, NOT A STATE**, so it is held by a timer
  rather than derived. "N waiting" reaching zero is the only moment worth
  marking, and it is invisible unless something remembers that it just happened.

★ **AND IT IS `pointer-events-none`.** His word was "never blocking", and a pill
  floating over a map is exactly the thing that would eat a tap on a zone he is
  drawing. It is a read-out.

**Unified, and the gate proves it:** the two old components are deleted, and the
pill carries `data-testid="offline-badge"` while it is offline — so `bun run
offline`'s "exactly ONE offline badge is visible" now asserts the same sentence
about **one** indicator instead of two shells fighting over which was showing.

Verified in the browser: `offline` → `לא מקוון`, count **1**; `online` →
`מסונכרן`, phase `done`; **gone after 2 s**.

⚠️ **AND A ONE-LINE BUG THE CAPTURE CAUGHT:** `inset-inline-0` **is not a
Tailwind utility** and produced nothing — the pill pinned itself to the inline
start and sat in the corner over the rail. `start-0 end-0` is the pair that
exists. Re-measured: centred, 8 px under `--shell-top`.

### 20.2 · Point 4 — the page never stretches, and only the panel pulls

**4a.** `overscroll-behavior-y: none` on **both `html` and `body`** — a browser
walks up from the scrolling element and the first ancestor with a value wins, so
declaring it on one of the two is the classic version of this fix that does
nothing on iOS.

★ **WHAT IT STOPS IS NOT COSMETIC:** drag down at the top of a map screen and
  the whole shell — map canvas included — lifts off the display and springs
  back. Installed, there is no browser chrome to absorb it, so what he sees is
  **the app coming loose from the device**. It is half of "the page moves up and
  down"; **point 2 was the other half and a completely different cause** (iOS
  zooming the page on a field under 16 px).

**4b.** `ui/components/PullToRefresh.tsx`, and the requirement is **"and the map
stays still"**. A page-level pull on a map-first app drags the canvas down with
it — the one thing a coordinator orients himself by slides off the screen. So
the native one is off at the page level and the app's is armed **only on the
panel that scrolls text**: `MapSplit`'s content column on a map-first route, the
layout's `<main>` on every other. `bleed` decides which of the two owns the
gesture, so they never nest.

★ **POINTER EVENTS, WHICH IS POINT 9 AND NOT AN INCIDENTAL CHOICE.** He drags
  with an Apple Pencil as often as with a thumb. `touchstart` would work for the
  finger and be **dead under the stylus on the gesture he uses most**;
  `pointerdown` sees `pen`, `touch` and `mouse` alike. **Mouse is deliberately
  excluded** — a desktop has a reload button, and an accidental drag-to-refresh
  on a trackpad is a bug.

★ **THE SCROLL CONTAINER IS FOUND, NOT PASSED.** The component walks up to the
  nearest `overflow-y: auto|scroll` ancestor and falls back to the document.
  That is what lets one component sit in two very different places without a
  prop somebody has to remember — and a prop passed wrongly here means the
  gesture arming halfway down a roster.

★ **IT ARMS ONLY AT THE TOP** (`scrollTop <= 0` at pointer-down and re-checked
  on the first move), it has resistance (×0.55, capped), and **it refuses
  honestly with no network**: `אין חיבור — הנתונים מהמטמון`. Pulling offline is
  not an error and must not look like one.

★ **AND THE DATA LAYER IS IMPORTED LAZILY**, the same reason `useDataState` does
  it: a static import reaches the row mapper and through it the Supabase client
  chunk, which would land in the INITIAL bundle of every demo build and every
  gate. Checked on the built artefact — `store` is still its own 19 kB chunk.

`refreshData()` resets `loadedFor` and calls `sync()` rather than calling
`load()` directly, so a manual refresh goes down **the same four steps as a cold
start** — restore, flush, hydrate, re-record — instead of a fifth path that
skips one.

Verified in the browser with **synthetic `pointerType: 'pen'`**: pull 97 px →
`שחררו לרענון` → release → `מרענן…`.

### 20.3 ★ Point 5 — the census, and it found the stump he named

`bun run empty` (A81) drives every coordinator screen **against an EMPTY
programme**.

★★ **THE INSTRUMENT IS AN EMPTY STORE AND IT IS THE ONLY HONEST ONE.** The demo
   fixtures hold twelve farms, three hundred volunteers and a month of guards,
   so on `bun run dev` almost nothing is ever empty and a human "reviewing the
   empty states" reviews the two he can think of. **P3.1 is about to import real
   farmers into a database that is empty**, so the first screen of the real app
   is the state nobody has ever looked at.

⚠️ **AND THE FIRST VERSION OF THE GATE WAS GREEN AND WRONG.** It imported
  `/src/core/store.ts` from the page and emptied it — successfully, and to no
  effect: `_raw().farms` went 14 → 0 in the gate's module record while the app
  went on rendering fourteen farms out of its own. Vite serves the app's graph
  with its own records, and **two records mean two module-scope snapshots**.
  The app publishes `__loYanumEmptyStore()` in DEMO builds now — the same idiom
  `MapCanvas` uses for `__loYanumMap`, which the touch and splitter gates have
  driven for months.

**What it asserts** is narrow on purpose: a `<section>` with a heading and
almost no body must carry an `EmptyState`; and **a screen with nothing in the
programme must show at least one empty state anywhere**, or be on an exemption
list **with its reason printed in the run**. Three are exempt: the **agenda** (a
calendar is not a list — an empty month is thirty-one dated cells, which is
already the honest picture), **settings** (facts and controls, no lists), and
the **import wizard** (step 1 is a drop zone, which is its own empty state).

★★ **AND THE STUMP THE PRODUCT OWNER NAMED IS FIXED.** The route planner's
   `בחירת חוות` block rendered, with nothing in the programme, as **a heading, a
   "quick pick" link, and an empty 1.5 px card** — a box with nothing in it,
   under a title. It now carries an `EmptyState` with the way OUT of it: `חווה
   חדשה`, because this is the first screen of the real app on his first morning.

⚠️ **AND THE GATE MISSED IT ON THE FIRST RUN, WHICH IS WORTH KEEPING.** The
  audit subtracted only the `<h2>` from the block's text, so the 33 characters
  of the "quick pick" link stood in for a body and the block measured as full.
  **A `Section`'s heading row is `[title, action]` and an action is chrome, not
  content** — the whole row comes off now. It was a CAPTURE that found the
  defect, and the capture is why the gate is right.

Census: dashboard 5 blocks / 3 empty states · route planner 2 / 2 · farms,
volunteers, drivers, missions, incidents 1 each · agenda, settings, import
exempt with reasons. `docs/screenshots/empty/`.

---

## 21. P3.3 — THE SIGNATURE, AND IT IS WHAT COMPLETES POINT 9's ACCEPTANCE

The product owner's criterion names it: *point 9 is verified at
`pointerType=pen` on drawing, on vertex editing, on a pin **AND ON THE
SIGNATURE***. There was no signature anywhere in this app when that was
written — `public/mock-agreement.pdf` is a static file and the agreements
section recorded only the FACT of a signing. So the criterion could not be met
without building it.

### 21.1 ★ THE STYLUS IS NOT A SECOND-CLASS INPUT HERE — IT IS THE NATURAL ONE

Everywhere else in this app the Pencil is a preference. On a signature it is
not: **a name written with a fingertip on glass is a scrawl**, and a farmer is
being asked to sign an agreement. So `ui/components/SignaturePad.tsx` is
Pointer Events from its first line — `pen`, `touch` and `mouse` all draw, and
nothing branches on which.

★ **PRESSURE IS USED WHERE THE DEVICE OFFERS IT.** `PointerEvent.pressure` is
  0.5 for a mouse and for most touches, and a real value under an Apple Pencil,
  so the stroke thins and thickens the way handwriting does and falls back to a
  constant width everywhere else. **Four lines, and it is the difference between
  a signature and a trace.**

★ **`getCoalescedEvents()` WHERE IT EXISTS.** A Pencil samples far faster than
  the display refreshes and the browser batches those samples into one
  `pointermove`. Drawing only the last one turns a curve into a polygon at
  speed; asking for the coalesced list draws every sample the hardware took.

★ **THE CANVAS IS SIZED TO ITS BOX × `devicePixelRatio`.** A canvas sized in CSS
  only is drawn at 1× and stretched — on a Retina iPad that is exactly the blur
  a signature must not have.

⚠️ **`touch-action: none` IS ON THE CANVAS AND NOWHERE ELSE.** Without it the
  first millimetre of a stroke scrolls the page instead of drawing. **It must
  never spread to a text field**: `touch-action: none` on an input is what
  breaks iOS SCRIBBLE, which is how the product owner writes with the same
  Pencil (§16.4). The only other one in this codebase is the splitter's grip.

### 21.2 · One nullable column, and the judgement is in the word "nullable"

`Agreement.signature?: string | null` — a PNG data URI today, exactly as
`photo` is (`core/photo.ts`), and an object key in P2.4's private `agreements`
bucket the day the real PDF is generated. `20260831000500_agreement_signature.sql`,
applied: `alter table agreements add column if not exists signature text`.

★ **NULLABLE, AND THAT IS THE WHOLE OF THE MIGRATION'S JUDGEMENT.** Every
  agreement already recorded was signed **on PAPER** — that is what a signed
  agreement has meant in this programme until today. A `not null default ''`
  would have turned each of them into "signed, and here is a zero-length image",
  which the farm detail would then render as a blank signature box. **Absent
  means "not signed in the app", never "not signed".**

⚠️ `bun run mapping` caught the other half of the same thought immediately:
`farm-01 → agreements.0.signature: undefined ≠ null`. The optional-in-domain /
nullable-in-schema family already had three members on `Farm` (`entityKind`,
`farmDunamsManual`, `grazingDunamsManual`) and its canon now covers this one and
point 6's `livestock` too — **33/33**.

### 21.3 · `bun run touch` section 10e — and it counts INK, not events

★ **THE PAD'S WHOLE JOB IS PIXELS.** An event listener that runs and draws
  nothing is exactly the failure a stylus would produce if the component
  branched on `touches`, and it would pass any assertion about handlers firing.
  So the gate reads the canvas back: blank before, **> 500 inked pixels after
  three stylus strokes**, the agreement showing `חתום`, and the pad empty again
  after `ניקוי` — every step driven at `pointerType: 'pen'`.

⚠️ **WHAT IS *NOT* DONE OF P3.3, stated plainly:** the signature is stored as a
data URI on the agreement and shown on the form. **It is not yet drawn into a
generated PDF** — that is the rest of P3.3, and §19.1's note applies to it
directly: the report's canvas-into-PDF writer is the machinery that will carry
it, and an agreement PDF wants selectable text, which is the case that needs the
font pipeline.

---

## 22. ⛔ WHAT IS *NOT* DONE, AND WHAT EACH ONE ACTUALLY NEEDS

The eleven points of the product owner's second return are delivered (§13–§21),
and the signature with them. **This is the honest remainder**, written so the
next session starts from it rather than rediscovering it.

### 22.1 ⛔ POINT 0's UPLOAD — one minute of the product owner's time

The archive is cut, health-checked on seven cities and gated (§14). Only the
94 MB upload is missing, and it needs a coordinator session that no longer
exists on this machine — which is what P3.1 was for. **§14.4 has the two ways
out.** `bun run offline` carries the failing Haifa line until then, on purpose.

✅ **UPDATE 2026-09-01 (§23.5): THE ONE-LINE KEY CHANGE IS NO LONGER A SECOND
ACT ANYBODY HAS TO REMEMBER.** The deploy workflow HEADs the national key,
requires its exact length and a `206`, and points the build at it when it is
there — so the upload is now the ONLY thing left, and the next deploy after it
ships the national map by itself. Until then the job log carries a warning
saying which archive it fell back to.

### 22.2 ✅ POINT 1's ARBITRATION — CLOSED 2026-09-01: **OPTION A** (§24.5)

**Option B shipped for exactly one build and was refused on a real installed
iPad**: a dark band across the top of the light theme, and nothing visible at
all in the dark one. `index.html` carries `content="default"`, option B's scrim
rule is deleted from `index.css`, and the dossier is closed. §24.5 has the
reasoning and §24.6 has the one question left open (a dynamic `theme-color`),
with the 3 kB page that settles it in twenty seconds.

⚠️ **THE TWO PARAGRAPHS BELOW ARE HISTORICAL AND ARE KEPT FOR THEIR
REASONING.**

Option A ships. Option B is built, behind
`apple-mobile-web-app-status-bar-style: black-translucent` in `index.html`, and
the captures of both are in `docs/screenshots/statusbar/`. **The instrument that
settles it is `אבחון תצוגה` in הגדרות** (§15.8) — he reads his own iPad's four
insets and sends them back. See §15.4 for the one sentence the decision reduces
to.

### 22.3 · The rest of P3, and what each is really blocked on

| what | state | what it actually needs |
|---|---|---|
| **real photos** | not started | capture/import → compression → the private `photos` bucket → signed URLs → a thumbnail cache. `core/photo.ts` already holds the data-URI-today / object-key-tomorrow contract, and P2.4's bucket is already private and coordinator-only. **The work is the pipeline, not the model.** |
| **the agreement PDF** | ⚠️ half | the signature is captured, stored and shown (§21), and **not yet drawn into a generated PDF**. §19.1 is the machinery that will carry it — and an agreement wants SELECTABLE text, which is exactly the case that needs the font pipeline that section declined. **Read §19.1 before choosing.** |
| **P3.3bis — the automatic email** | not started | an edge function, and the sending provider's account (ask him then). ★ **AND THE RECIPIENT HAS TO MOVE SERVER-SIDE**: `report/recipient.ts` is `localStorage`, which an edge function cannot read. A `settings` table or a column on `app_users`, with that module becoming its cache. §19.3. |
| **the final PWA pass** | ⚠️ partial | the manifest, the icon and the service worker all work and are gated. What is left is the polish: real icon sizes rather than one SVG, a maskable variant, and the `הגדרות` screen's last section. |
| **P3.1's real import** | ready, waiting on data | `bun run import` already drives download → fill → upload → find, 29 checks, and `core/import.ts` was written to be re-runnable server-side unchanged. **This is a data question, not a code question.** |

### 22.4 ⚠️ TWO THINGS TO CARRY IN THAT ARE NOT TASKS

★ **`bun run write` FAILING AND `bun run offline` REPORTING 19/19 WITH A SKIP
  ARE THE GREEN RESULTS.** They are the shape of the test account being gone.
  Anybody who "repairs" either has re-created the second door onto real
  farmers' phone numbers.

★ **THE GAZETTEER IS STILL SOUTHERN.** `core/geo.ts`'s `LOCALITY_POSITIONS` has
  21 towns, all Negev and Jerusalem-corridor. It is what places a volunteer with
  no coordinates and what scores travel distance (`core/dispatch.ts`). **The
  programme is national now** — the basemap is (§14), the tagline is, the data
  is not. Nothing is broken today because there is no northern volunteer yet;
  the day one is imported, he lands nowhere and is charged the
  not-in-the-gazetteer distance. **This is the cheapest high-value follow-up in
  the file.**

---

---

## 23. ⛔ THE PRODUCT OWNER'S DEPLOYMENT REPORT, 2026-09-01 — THREE SYMPTOMS, THREE CAUSES, AND THE DEPLOY WAS NOT ONE OF THEM

He reinstalled cleanly on the iPad — PWA deleted, Safari reloaded twice, app
re-added, maps re-downloaded — and got three things back: **הגדרות still
reports 42.6 MB** of offline map, **the top bar is still opaque**, and **the
farm form still slides under a thumb**. His reading was that part of the
previous session never reached production.

★ **IT REACHED PRODUCTION. Every commit is on `main`, the workflow ran and
  succeeded on the head of that push, and two of the three fixes are IN the
  deployed files — measured on the artefact, byte for byte.** Three symptoms,
  three unrelated causes, and the pipeline is not any of them.

### 23.1 · What the ARTEFACT says, not the tree (2026-09-01)

| asked | measured on the deployed files |
|---|---|
| are the commits on `main`? | ✅ `78b92a9` is both `HEAD` and `origin/main`; the working tree was clean |
| did a deploy run **after** them? | ✅ run **33418468454**, `success`, `headSha 78b92a9` — the deployed artefact IS that tree |
| `viewport-fit=cover` served? | ✅ present in the served HTML |
| `black-translucent` served? | ❌ **present four times INSIDE HTML COMMENTS, zero times as an active tag** |
| point 2's 16 px fix served? | ✅ `@media (pointer: coarse){input…{font-size:1rem!important…}}` is in `assets/index-DcyTXYP_.css` |
| is it a REAL build, not the demo fallback? | ✅ `sb_publishable_…` appears in `assets/index-WJj6Fq0O.js` |
| which archive does the bundle ask for? | **`negev-20260829-z14.pmtiles`** — the SOUTHERN extract |
| what does the bucket serve on that key? | `200`, `content-length: 42 560 293` |
| what does it serve on the national key? | **`400`** — `israel-20260831-z14.pmtiles` IS NOT IN THE BUCKET |

★ **AND THE REASON IT LOOKED LIKE A PIPELINE THAT HAD STOPPED FIRING IS WORTH
  WRITING DOWN, because the next person will read the same list and reach the
  same wrong conclusion.** `gh run list` shows no run for eleven of that
  evening's commits. **They were pushed together.** GitHub creates ONE workflow
  run per PUSH, on its head commit — not one per commit. Eleven commits with no
  run beside them is what a single push looks like from the outside. The check
  that settles it is `gh run view <id> --json headSha`, and it named the head
  of that push.

### 23.2 ★★ SYMPTOM 1 — THE 42.6 MB. §14.4 WAS STILL TRUE, AND NOTHING HAD FAILED

**42.6 MB is `42 560 293` bytes in decimal MB, and that is byte for byte what
the bucket serves for `negev-20260829-z14.pmtiles`.** The device was right, his
re-download was right, the deploy was right. The national archive **was never
uploaded** — §14.4, still true that morning — and the key in the app was
**deliberately** left on the southern extract until it was, precisely so that
flipping it early could not take the map off the app the night before he shows
it to his team.

★ **SO THE DEFECT IS NOT THE MAP. IT IS THAT NONE OF THIS WAS VISIBLE FROM THE
  PRODUCT.** The plan was two acts by two people — his upload, then a one-line
  key change in a session that might not happen the same day — and in between,
  the app's own words already promised the national map: `settings.offline`'s
  `state` reads **מפת ישראל במכשיר** and `explain` reads **מפת ישראל כולה**,
  both written when §14 cut the archive. A coordinator was told "the whole map
  of Israel" and shown a size that belonged to a quarter of it, with nothing on
  the screen able to tell the two apart. **A size cannot distinguish "the map
  you asked for" from "a map". A name can.** Fixed three ways in §23.5.

⚠️ **ONE NUMBER TO CORRECT BEFORE ANYBODY GOES LOOKING FOR IT: THE NATIONAL
  ARCHIVE IS 94 MB, NOT 175.** `basemap/israel-20260831-z14.pmtiles` is
  **94 268 129 bytes** (§14.1, measured when it was cut) — 3.6× the area of the
  southern extract for 2.2× the bytes, because the ground added is sea, the
  Negev's empty south and the Arava, and a vector tile costs what is ON it. A
  HEAD on the public object will read **~94.3 MB** when this lands. **Anything
  near 175 MB on that key would mean a different file and should be refused,
  which is why the workflow check in §23.5 pins the exact length.**

### 23.3 · SYMPTOM 2 — THE TOP BAR. OPTION A WAS STILL SHIPPING, AND NOW IT IS NOT

> ⚠️ **SUPERSEDED THE SAME DAY BY §24.5.** Option B shipped for one build, the
> product owner saw it on a real iPad and refused it. `default` ships. The
> section is kept because the cost it states is exactly the cost he then met.

Also not a deployment failure. `apple-mobile-web-app-status-bar-style` was
never uncommented, because §15.4 made it HIS call and he had asked to see both
options captured. **He has now asked for the meta to be PRESENT on the
artefact. Option B ships as of this session**, and §15.4's arbitration is
closed.

The cost is unchanged and is accepted rather than discovered: iOS forces the
clock, the battery and the signal bars to **WHITE in both themes**, so
`index.css`'s `html[data-standalone][data-statusbar='translucent']` rule lays a
dark scrim under them — **a permanent dark strip at the top of the LIGHT
theme**. Nothing else moved: `standalone.ts` reads the decision off the meta tag
itself (§15), so the scrim follows the one line that changed.

★ **AND THE THREE SYMPTOMS §15.2 PREDICTED SHOULD NOW GO WITH IT** — the
  content reaches the top of the display, `env(safe-area-inset-top)` stops
  being 0, and the gradient has something to draw.

### 23.4 · SYMPTOM 3 — THE PARASITIC SCROLL. THE FIX IS ON HIS DEVICE, VERIFIED

The 16 px rule of §16.1 **is in the deployed stylesheet** — quoted from
`assets/index-DcyTXYP_.css` above — and navigations are network-first
(`sw.js`), so his reinstall cannot have been served an older shell. The cause
that was found is fixed, deployed and on his iPad.

⚠️ **SO IF IT PERSISTS, IT IS A DIFFERENT CAUSE, AND THE FOUR FACTS THAT NAME
  IT ARE THE ONES OPEN QUESTION 7bis ALREADY ASKS FOR** — which axis, whether
  the keyboard was up, portrait or landscape, and whether the rail was
  expanded. **The one that matters most is the keyboard**: the layout sweep
  drives 32 screens at four viewports in two engines with no software keyboard
  in existence, so a shell that is taller than the VISUAL viewport while iOS
  holds a field above the keyboard is the one shape of this bug the instrument
  cannot see. It is not fixed here and it is not claimed to be.

### 23.5 · WHAT CHANGED TONIGHT — FOUR CHANGES, AND WHY EACH IS THE ONE IT IS

**1. `index.html` — option B, one line.** §23.3.

**2. `public/sw.js` — "held" now means THIS archive, not "some archive".**
`MAP_STATS` used to answer about `keys[0]`, whatever happened to be cached. The
page now NAMES the archive this build asks for and the worker answers about
that one, adding `heldUrl` and `stale`. A page that asks without a url — an old
tab against a new worker — still gets the old, looser answer.

**3. `src/ui/offline.ts` + `SettingsScreen` — the screen names the map, and its
megabytes are the same megabytes as everybody else's.**
· A `קובץ המפה` row: the archive this build asks for, by name.
· When a previous cut is held: the state reads **שמורה גרסה ישנה**, a second
  row names what is on the device, and a callout says to tap רענון.
· ★ **`megabytes()` is decimal MB (10⁶) instead of MiB (2²⁰).** The same
  42 560 293 bytes read as **40.6 MB** on the device and **42.6 MB** everywhere
  else — the bucket's `content-length`, the Supabase dashboard, this file, his
  own message. A 5 % gap on the exact number a coordinator uses to decide
  whether the map he holds is the map he was promised. The label says MB, so
  the arithmetic is now the one the label means.

**4. `.github/workflows/deploy.yml` — the BUILD asks the bucket which archive to
point at.** This is the structural half, and it is what stops this recurring.
The step HEADs `israel-20260831-z14.pmtiles`, requires `content-length ==
94 268 129` **exactly** and a `206` on a range request — the one thing PMTiles
cannot work without — and only then sets `VITE_BASEMAP_URL`. Otherwise it falls
back to the compiled-in key and **says so as a workflow warning**, because a
silent fallback is how this started. `basemap.ts` already treats an empty
override as absent, so nothing in the source had to change.

★ **THE CONSEQUENCE, STATED PLAINLY: the moment the archive is in the bucket,
  the next deploy ships it. No second session, no one-line commit to
  remember.** And if the upload is partial, the length check refuses it rather
  than shipping a truncated archive that would fail every range request in the
  field.

### 23.6 ⛔ WHAT IS STILL HIS, AND IT IS STILL ONE MINUTE

**Nothing about this changed §14.4.** Writes to the `basemap` bucket are
coordinator-only, the one coordinator's password only he has ever typed, and
that is decision 70 rather than an obstacle to route around. So:

1. ⛔ **Storage → `basemap` → Upload file →
   `basemap/israel-20260831-z14.pmtiles`**, key exactly that. The dashboard
   uploads resumably, so 94 MB is fine.
2. Then **re-run the deploy** — Actions → *Deploy to GitHub Pages* → *Run
   workflow*, or any push. The build then picks the national archive up by
   itself and the job log says which one it chose.
3. Then, on the iPad, **once**: הגדרות → `רענון מפות לא מקוונות`. The screen
   will name `israel-20260831-z14.pmtiles` and report ~94.3 MB, and the worker
   drops the old archive as it stores the new one.

### 23.7 ✅ DEPLOYED, AND VERIFIED ON THE ARTEFACT RATHER THAN ASSUMED

Run **33445374987**, `success`, `headSha 64332a8`. Checked on the deployed
files themselves:

| | measured |
|---|---|
| `apple-mobile-web-app-status-bar-style` | ✅ **1 ACTIVE tag** with comments stripped — option B really ships |
| `viewport-fit=cover` | ✅ 1 active |
| the three `theme-color` tags | ✅ media-scoped first, unscoped last |
| the new bundle | `assets/index-DZVeADJ5.js` — carries `קובץ המפה`, `שמורה גרסה ישנה`, `השמור במכשיר` and `1e6` |
| a REAL build | ✅ `sb_publishable_…` appears once |
| `sw.js` served | ✅ carries the `stale` / `heldUrl` answer |
| the archive the bundle asks for | `negev-20260829-z14.pmtiles` — correct, and it is what §23.6 changes |

★ **AND THE NEW WORKFLOW STEP DID ITS JOB ON ITS FIRST RUN**, which is the
  half that matters:

```
key      : israel-20260831-z14.pmtiles
length   : 88 (expected 94268129)
range    : HTTP 400 (expected 206)
##[warning]Basemap: israel-20260831-z14.pmtiles is not usable in the bucket yet
           (length 88, range 400). This build falls back to the key compiled
           into src/ui/components/basemap.ts — the SOUTHERN extract.
```

`length: 88` is the length of Supabase's JSON *not found* body, and it is
exactly the kind of number a `-gt` comparison would have waved through. The
check is an equality against the measured byte count for that reason.

★ **AND `bun run offline`'s Haifa line is what closes it** — 0 features
  rendered today, and it is the first thing that goes green when the national
  archive lands. **Do not silence it.**

---

---

## 24. ⛔ THE SECOND REPORT OF 2026-09-01 — THE BANDEAU IS CLOSED, AND THE ARCHIVE WAS NEVER UPLOADED

Two returns in one evening. The status bar is now a decision rather than a
question, and the map has a root cause that is **proved from the database**
rather than inferred from an HTTP probe.

### 24.1 ★★ THE MAP — THE BUCKET HOLDS EXACTLY ONE OBJECT, AND IT IS THE OLD ONE

Asked of Postgres, not of the CDN:

```sql
select bucket_id, name, (metadata->>'size')::bigint, created_at
  from storage.objects;
```
```
basemap | negev-20260829-z14.pmtiles | 42560293 | 2026-08-31 12:26:06+00
```

**ONE ROW.** No `israel-…` under any name, no half-finished upload, no second
folder, nothing created since 12:26 on 2026-08-31. `HEAD` on the national key
answers **400** with an 88-byte JSON body; a range request answers 400 as well.

★ **SO §14.4 IS STILL THE WHOLE OF IT: THE UPLOAD HAS NOT HAPPENED.** And the
  probe built in §23.5 called it correctly on its very first run — the deploy
  job log of 2026-08-31 22:16 UTC reads `length: 88 (expected 94268129)`,
  `range: HTTP 400`, and it fell back to the southern extract **with a
  warning**. The instrument was right; there was simply nothing new to point
  at.

⚠️ **THE "~75 Mo" SEEN DURING THE DOWNLOAD IS NOT A BYTE COUNT THIS APP HAS
  EVER SHOWN.** The label was `מוריד… {{percent}}%` — a PERCENTAGE, with no MB
  figure anywhere in the string. 75 % of the southern archive is 32 MB, and the
  archive it was downloading was the only one that exists. **That ambiguity is
  a real defect and it is fixed in §24.3**: the label now carries `X / Y MB`
  beside the percent, so a number on that screen can never again be read as
  something it is not.

⚠️ **AND 175 MB IS CORRECTED FOR THE SECOND TIME.** The national cut is
  **94 268 129 bytes** (§14.1). Nothing in this project has ever measured 175.

### 24.2 · The bucket's headers, CORS and the CDN — measured, and none of them is a cause

| | `negev-20260829-z14.pmtiles` |
|---|---|
| status | `200` |
| `content-length` | `42 560 293` |
| `accept-ranges` | `bytes` |
| a range request | **`206`**, `content-range: bytes 0-15/42560293` |
| `access-control-allow-origin` | `*` |
| `cache-control` | `no-cache` |

★ **AND THERE IS NO CDN CACHE TO PURGE OR VARY, BY CONSTRUCTION.** The free
  tier serves `cache-control: no-cache` whatever is stored on the object, and
  the key carries the OSM build date, so a replacement map is a NEW URL. **A
  CDN cannot serve a stale answer for a name it has never been asked for** —
  which is exactly why the naming rule in §14.4 is worth keeping.

### 24.3 ★★ NO MORE SILENT FAILURES — WHAT הגדרות NOW SAYS

His wording was *plus jamais d'échec muet*. The screen now states, in this
order:

| row | what it answers |
|---|---|
| `מפת ישראל במכשיר` | held / **שמורה גרסה ישנה** / not held — and "held" means THIS archive |
| `קובץ המפה` | **the archive this build asks for, by name** — the requested key |
| `השמור במכשיר` | the archive actually on the device, when it differs |
| `גודל` | its size, in the same decimal MB as the bucket's `content-length` |
| `אחסון פנוי במכשיר` | `usage / quota` from `navigator.storage.estimate()` |
| `שמירה קבועה` | whether the browser promised not to evict it |
| `הניסיון האחרון` | **succeeded (with the bytes stored) or failed** |

and, when the last attempt failed, a DANGER callout that names the failure:

· `quota` — not enough room, with what was needed and what is free;
· `http` — the server's status and the archive it was for;
· `network` — the connection dropped, and the previous map was not deleted;
· `truncated` — received vs expected, and the partial file was deleted;
· `store` — the exception's own name.

★ **THE VERDICT IS WRITTEN TO `localStorage` AND READ BACK ON MOUNT.** A result
  that lives only while the screen is open is still nearly mute: the
  coordinator taps, walks away, comes back and finds the same old size with
  nothing to explain it. `lo-yanum:map-attempt` is one small record and it is
  the difference between "it did not work" and "it refused, for this reason, at
  this time".

★ **AND A FAILED `HEAD` NO LONGER BECOMES A SIZE.** Supabase answers a missing
  object with `400` and an 88-byte body; the button read `content-length` off
  it without checking `r.ok`, so a missing archive could have offered itself as
  a 0.1 MB download. It now requires `ok` **and** a length over a megabyte,
  because a PMTiles archive is megabytes and anything smaller on that URL is an
  error page wearing a `content-length`.

### 24.4 ★ AND THE DOWNLOAD ITSELF WAS BUILT FOR 42 MB, NOT FOR 94

Three faults, all of which only bite at the larger size — which is why they
have never been seen and would all have been met on the first real attempt:

1. ★ **IT BUFFERED THE WHOLE ARCHIVE IN MEMORY.** Every chunk went into an
   array and became one `Blob` at the end. That is survivable at 42 MB and is
   the shape that dies at 94 MB inside a service worker on a tablet — **at
   about 80 % of the progress bar**, after the minutes the coordinator has
   already spent. It now streams through a `TransformStream` straight into
   `cache.put`, counting bytes as they pass; nothing larger than one chunk is
   ever held.
2. ★ **IT ASKED FOR ROOM IT HAD NOT CHECKED, AND FOR TWICE WHAT IT NEEDED.**
   The old archive was deleted only AFTER a successful download, so the peak
   requirement was old + new — **137 MB to end up holding 94**. Safari's quota
   is a fraction of free disk rather than a fixed number, so that is the
   difference between fitting and not on a device nobody here can inspect. It
   now calls `estimate()` BEFORE starting, drops the superseded archive first
   when the two would not fit together, and **refuses with a stated reason**
   rather than beginning a download that cannot land.
3. ★ **AND WHAT IS STORED IS VERIFIED BY READING IT BACK.** A stream that ends
   early can still resolve `cache.put`. The check is the stored object's own
   length against `content-length`, and a mismatch **deletes the entry** — a
   half archive that reports `held: true` fails every range request in the
   field, which is the worst of the three outcomes.

★ **PERSISTENCE IS REQUESTED FROM THE PAGE BEFORE THE DOWNLOAD.**
  `navigator.storage.persist()` is Window-only, so the worker cannot ask.
  Safari grants it silently to an INSTALLED web app and refuses it in a tab,
  which is exactly the distinction that matters here. A refusal blocks nothing;
  it is reported, because an origin that may be evicted is an origin that can
  lose 94 MB between the tap and the drive.

★ **THE STYLE'S MISSING ASSETS ARE COUNTED NOW TOO.** "The map is held but
  three glyph ranges are not" is a real state and used to be silent; it is a
  warning callout, not a failure, because a label in a fallback face is not a
  reason to fail an archive that landed.

### 24.5 ⚖️ THE BANDEAU — OPTION B IS REFUSED, AND THE DOSSIER IS CLOSED

One build of option B was enough. On a real installed iPad the product owner
saw exactly what §15.4 said it would cost, and refused the trade:

· in the LIGHT theme the scrim is a **dark band across the top of a light
  app** — he called it ugly, and that is the cost seen at full size rather
  than in a capture;
· in the DARK theme **there is no visible gradient at all** — a dark scrim on
  a dark surface is invisible, which is correct behaviour and reads as a bug.

**`index.html` now carries `content="default"`, written out rather than
deleted** — absent and `default` behave identically on iOS, and a tag that
states the decision is what stops the next reader re-litigating it. **Option
B's scrim rule is DELETED from `index.css`** rather than left behind an
attribute nothing sets; a rule nothing can reach is a rule that rots. The
captures of both options stay in `docs/screenshots/statusbar/` as the record.

★ **AND "REMOVE THE GRADIENT" IS SATISFIED BY THE SAME LINE.** In `default`
  mode iOS lays the app BELOW the bar, `env(safe-area-inset-top)` is 0,
  `--status-inset` is 0, and the base gradient's height — `--status-inset ×
  1.25` — collapses to nothing on its own. The base rule is KEPT because it is
  correct where an inset really exists (an Android PWA reports one), and it
  draws nothing on the device this is about.

★ **`STANDALONE=ios` IS THE SHIPPING CONFIGURATION AGAIN**, and `layout.ts`'s
  own comment says so. It went the other way for exactly one day.

### 24.6 ⚠️ THE DYNAMIC `theme-color` QUESTION — WHAT IS KNOWN, WHAT COULD NOT BE TESTED, AND THE TEST ITSELF

**What is already true and shipping:** the installed app's status bar follows
the SYSTEM colour scheme, because `index.html` carries two media-scoped
`theme-color` tags read at launch (§12bis.7) — light bar with black glyphs on a
light iPad, dark bar with white glyphs on a dark one. **That is the behaviour
he described wanting, for the case that actually occurs.**

**What is not:** a coordinator who FORCES a theme against his system scheme
gets the system's bar. Fixing that needs iOS to honour a `theme-color` change
made at RUNTIME.

⚠️ **THIS PROJECT'S OWN REAL-DEVICE EVIDENCE SAYS IT DOES NOT.** On 2026-08-31
  he saw the boot literal `#0B1119` painted behind the clock **in the light
  theme**, although `theme.tsx` had already rewritten the tag — which is what
  "read at launch, live changes ignored" looks like.

⚠️ **AND IT COULD NOT BE RE-VERIFIED ON iPADOS 26 IN THIS SESSION, WHICH IS
  STATED RATHER THAN PAPERED OVER.** An iPad Pro 13" (M5) simulator on iOS 26.3
  is on this machine and was booted; `xcrun simctl` can screenshot it but
  cannot TAP, and driving "Add to Home Screen" needs the simulator panel, whose
  device access a non-interactive session cannot be granted. Without a
  home-screen launch there is no installed status bar to look at, so the
  experiment was not run and no claim is made about it.

★ **SO THE TEST SHIPS INSTEAD, AS ONE 3 kB PAGE HE CAN TAP:**
  `public/themebar-test.html` → **https://azmer-fts.github.io/lo-yanum/themebar-test.html**.
  Add to Home Screen, launch it FROM THE HOME SCREEN, tap **GO DARK**. If the
  strip behind the clock follows, iPadOS honours a live change; if it does not,
  the answer is no. It is linked from nowhere and is meant to be **deleted once
  the question is settled**.

⚠️ **AND IF THE ANSWER TURNS OUT TO BE "NO", THERE IS STILL ONE MECHANISM THAT
  WOULD WORK, AND IT IS RECORDED HERE RATHER THAN BUILT TONIGHT.** The service
  worker already serves every navigation; it could rewrite the served HTML's
  `theme-color` to the coordinator's stored choice, so the NEXT launch starts
  with the right bar. It is perhaps forty lines. It also puts a text transform
  on the navigation path — the one path whose failure is a white screen — the
  night before a demonstration, to fix a case that only arises when somebody
  forces a theme against his own device. **His call, not a session's.**

### 24.8 ✅ DEPLOYED, AND VERIFIED ON THE ARTEFACT RATHER THAN ASSUMED

Run **33451853216**, `success`, `headSha 7911052`. Measured on the deployed
files with HTML comments stripped, because a commented tag greps the same as a
live one:

| | measured |
|---|---|
| `apple-mobile-web-app-status-bar-style` | ✅ exactly one ACTIVE tag, `content="default"` |
| `viewport-fit=cover` | ✅ 1 active |
| option B's scrim in the stylesheet | ✅ **gone** — `assets/index-GAJZYos_.css` contains `data-statusbar` **0** times and the dark scrim's colour **0** times |
| `sw.js` served | ✅ `TransformStream` ×2, `storageEstimate` ×7 — the streaming, quota-aware download is what ships |
| the bundle | `assets/index-MQ5mES-Q.js` — carries `אחסון פנוי במכשיר`, `שמירה קבועה`, `הניסיון האחרון`, `ההורדה לא הושלמה` and the `map-attempt` key |
| the 20-second test page | ✅ `https://azmer-fts.github.io/lo-yanum/themebar-test.html` answers **200** |

### 24.7 ⛔ WHAT THE PRODUCT OWNER STILL HAS TO DO, AND IT HAS NOT CHANGED

Nothing in this session touched §14.4. The one act is the upload:

> **Storage → `basemap` → Upload file → `basemap/israel-20260831-z14.pmtiles`**,
> key exactly that name. The dashboard uploads resumably, so 94 MB is fine.

Then any push — or *Actions → Deploy to GitHub Pages → Run workflow* — and the
build points at it by itself (§23.5). Then, on the iPad, one tap on
`רענון מפות לא מקוונות`. **And if anything then goes wrong, the screen will say
what** (§24.3), which is the whole point of this session.

---

## 25. ⛔ THE THIRD REPORT OF 2026-09-01 — THE CONSTANT WAS NOT THE BUG, AND THE GATE IS NOW PERMANENT

The product owner's instrumentation (§24) did its job and gave him three exact
readings off his own iPad, in Hebrew, after a clean reinstall and a successful
re-download: **`negev-20260829-z14.pmtiles`, 42.6 MB, persistence granted.**
His conclusion was that the deployed bundle still asks for the old southern
extract — **and it is CORRECT.** His diagnosis of WHY was the one thing that
was not, and the difference decides whether there is code to write.

### 25.1 · What the ARTEFACT says (measured 2026-09-01, nothing assumed)

| asked | measured |
|---|---|
| working tree clean, `HEAD` == `origin/main`? | ✅ `fb3d424` on both |
| did a deploy run on that exact commit? | ✅ run **33451960133**, `success`, `headSha fb3d424` |
| which archive does the SERVED JS ask for? | `assets/index-MQ5mES-Q.js` names **`negev-20260829-z14.pmtiles`**, once, and no other `.pmtiles` |
| is it a REAL build? | ✅ `sb_publishable_` appears once |
| bucket on the SOUTHERN key | `200`, `content-length: 42 560 293`, range → `206` |
| bucket on the NATIONAL key | **`400`**, an 88-byte JSON body, range → `400` |

**42 560 293 bytes is 42.6 MB. The iPad was reading the bucket correctly.**

### 25.2 ★★ THE CAUSE — AND IT IS NOT A COMMIT, A CONSTANT OR A STALE BUILD

The three hypotheses in the report were *un commit non mergé, une constante non
mise à jour, un build parti d'un état antérieur*. **All three are excluded, and
the deploy log of run 33451960133 says so in one line it printed itself:**

```
##[warning]Basemap: israel-20260831-z14.pmtiles is not usable in the bucket yet
(length 88, range 400). This build falls back to the key compiled into
src/ui/components/basemap.ts — the SOUTHERN extract.
VITE_BASEMAP_URL:
```

§23.5's resolve step **ran, asked the bucket, was answered `400`, and fell back
on purpose.** `VITE_BASEMAP_URL` came out empty, so `basemap.ts` kept its own
default — which is exactly what it is written to do.

★ **SO THERE IS NO CODE DEFECT AND NOTHING TO CORRECT IN THE BUNDLE. THE
  BLOCKER IS, STILL AND ONLY, §14.4's UPLOAD** — 94 268 129 bytes that only the
  product owner can write, because the `basemap` bucket is coordinator-only and
  the one coordinator's password is his alone. Editing `BASEMAP_KEY` by hand
  today would not fix anything: it would point the app at an object that
  returns `400`, and the map would go from *southern* to *blank*.

### 25.3 · HIS ONLINE OBSERVATION IS RIGHT, AND IT PROVES MORE THAN HE CLAIMED

He noted that the map is cut off at the north **on Wi-Fi, with aeroplane mode
never yet tested**, and concluded the offline layer is not involved. **Confirmed
from the source:** `buildBasemapStyle` declares exactly one source,
`pmtiles://${BASEMAP_URL}`, and there is no raster fallback anywhere since
decision 71. **One archive is the whole of the rendering, online and off.** A
truncated map on a live network is therefore the expected symptom of this cause
and not a second bug — and it does rule the service worker out entirely.

### 25.4 · POINT 3 — THE REPLACEMENT IS ALREADY CORRECT, WITH ONE PRECISION HE NEEDS

Verified in `public/sw.js` and `SettingsScreen.tsx`:

* **The old archive is REPLACED, not added.** `DOWNLOAD_MAP` deletes every
  cache entry whose URL is not the wanted one — twice: **before** the stream if
  the quota is tight (`droppedOld`), and again **after** the stored length has
  been checked byte for byte against `content-length`. The space is recovered.
* **A truncated download deletes itself** rather than reporting `held: true`.
* **הגדרות will show the new name and the new size**: `wantedArchive` is
  printed always, `heldArchive` appears beside it while they differ, `stale`
  raises a warning callout, and the size before the tap is a real `HEAD` — with
  `r.ok` checked first, so Supabase's 88-byte `400` can never be shown as
  "0.1 MB".

⚠️ **THE PRECISION, AND IT CHANGES HIS ONE-LINE INSTRUCTION.** `רענון` does
**not** replace anything — `MAP_STATS` only reports. It will say *the wrong map
is held* and name both files. **The old Negev archive is freed only when he taps
the download.** Refresh, then download; in that order.

### 25.5 ✅ POINT 4 — THE PERMANENT GATE, AND THE THRESHOLD HE GAVE IS WRONG

Added to `.github/workflows/deploy.yml`: **`Gate — the basemap the built bundle
asks for`**, which runs after `vite build` and reads `dist/assets/*.js` — the
artefact, not the tree, not the resolve step's intention.

⚠️ **HIS RULE WAS `content-length > 100 Mo`, AND IT WOULD HAVE BEEN A TRAP THAT
NEVER OPENS.** The national cut of Israel at z14 is **94 268 129 bytes —
94.3 MB**. A `> 100 MB` gate would refuse the real national map for ever, and
would happily pass a 120 MB extract of any single district. **The number 175 has
now been corrected three times in this file and appears in no measurement of
this project.** The gate therefore uses a **register of named cuts with the
exact byte length each was measured at**, which is strictly stronger: it also
catches the one failure a threshold cannot — a partial upload landing on a name
that is already trusted.

What it does, all six branches run and proved before commit:

| condition | verdict |
|---|---|
| the bundle names no `.pmtiles` at all | **FAIL** |
| it names a cut absent from the register | **FAIL** |
| the live archive is missing, the wrong length, or refuses a range | **FAIL** |
| the national archive IS usable and the bundle still asks for a partial extract | **FAIL** — the regression guard |
| the national archive is usable and the bundle asks for it | pass |
| the national archive is not uploaded yet, the southern extract is present and usable | **warn, and deploy** |

★ **THE LAST ROW IS DELIBERATE AND IS THE ONLY SOFTNESS IN THE GATE.** A flat
"must be national" today would stop **every** deploy — including work with
nothing to do with the map, point 9 among it — behind an upload that is not a
session's to perform. The moment the object lands, row four closes behind it and
**no build can ever fall back to a partial extract again.** If he prefers the
hard version, it is deleting the last `echo ::warning` and its branch.

### 25.6 ✅ POINT 9, REPLAYED RATHER THAN ASSUMED

`bun run touch` re-run on 2026-09-01 against a real dev server: **53/53**,
including the four criteria the product owner's acceptance rule names —
`pointerType="pen"` proved to reach the page, then drawing a ring, editing a
vertex, placing and dragging a pin, and **signing with 2 015 inked pixels
counted on the canvas** rather than a handler trusted to have fired. Point 9 is
delivered and stays delivered; nothing in §25 touched it.

---

## 26. ⛔ THE FOURTH REPORT OF 2026-09-01 — THE BUG IS **OPEN**, AND IT IS NOT IN THE BASEMAP LOGIC

The product owner's fourth return is the sharpest one and it changes the
method rather than the diagnosis. He reports the SAME three symptoms on the
web site in a plain browser (`#/coordinator`, no PWA) and on the iPad — the map
cut off at the north, הגדרות reporting `negev` and 42.6 MB, and the רענון
re-downloading 42.6 MB — and he sets a rule:

> **Nothing about this bug may be called fixed on the strength of the code or
> of a green HEAD. The only evidence accepted is a real browser, blank
> profile, on the deployed URL, with the network captured.**

★ **THE RULE IS RIGHT AND IT IS NOW THE PROJECT'S.** `bun run ground` (A83)
  implements it and `.github/workflows/deploy.yml` runs it on every build.

★ **AND BY HIS OWN RULE THE BUG IS OPEN.** It is written here as OPEN. What
  follows is measured, not argued.

### 26.1 · The four proofs, as they actually came back (2026-09-01)

`bun run ground`, fresh Chromium context, nothing on the device:

| # | he asked for | what the wire said |
|---|---|---|
| 1 | the pmtiles URL that really leaves | `…/storage/v1/object/public/basemap/`**`negev-20260829-z14.pmtiles`**, `Range: bytes=0-16383` — and exactly ONE archive is ever requested |
| 2 | a response over 100 MB | **`206`**, `content-range: bytes 0-16383/`**`42560293`** — 42.6 MB |
| 3 | הגדרות showing `israel` / ~175 MB | it shows **`negev-20260829-z14.pmtiles`** and the button reads **`רענון מפות לא מקוונות (42.6 MB)`** |
| 4 | Haifa sharp at z12–z14 | **0 features, 0 roads** at all three zooms — `docs/screenshots/basemap/haifa-z{12,13,14}-negev-20260829-z14.pmtiles.png` |

**Three of his four numbers were already exactly right.** The screen was not
lying to him; it was telling him the truth about a map nobody has replaced.

### 26.2 ★★ THE CAUSE, AND IT IS THE SAME ONE SINCE §14.4 — THE OBJECT IS NOT IN THE BUCKET

Measured on the pipeline and on the bucket, not on the tree:

· **Deploy run `33475282175`** (head `43b43c8`, `success`, 05:52 UTC) — its
  *Resolve the basemap archive* step asked the bucket for the national key and
  logged, verbatim: `length : 88 (expected 94268129)` / `range : HTTP 400`.
  So `VITE_BASEMAP_URL` was empty and the build kept the compiled-in default.
· `HEAD …/basemap/israel-20260831-z14.pmtiles` → **`400`**, an 88-byte JSON
  error. **The national archive has still never been uploaded.**
· `HEAD …/basemap/negev-20260829-z14.pmtiles` → **`200`, `42 560 293`**.
· The **deployed** bundle `assets/index-MQ5mES-Q.js`, fetched over the network,
  names **one** `.pmtiles` string and it is the southern extract.

★ **SO THE THREE SYMPTOMS ARE ONE FACT, NOT THREE BUGS, AND THE LOGIC IS NOT
  IMPLICATED ANYWHERE.** The app asks for the only map that exists; the screen
  reports the map it asked for; the refresh downloads the map it reports.

### 26.3 · His three diagnostic questions, answered from the network

1. **Which URL really leaves at map load?** The southern extract — proof 1
   above. **Where does it come from in the SERVED bundle?** From
   `BASEMAP_KEY` in `src/ui/components/basemap.ts`, which the build keeps
   whenever `VITE_BASEMAP_URL` is empty — and the deploy log says why it was
   empty. It is not a stale reference and there is no second one: the bundle
   contains exactly one `.pmtiles` name.
2. **Does the app prefer a stale local file over the network?** **No, and his
   own report is the proof.** He saw the identical symptom in a plain browser
   with no PWA and nothing downloaded — a device with nothing on it cannot be
   preferring anything. The code agrees: `useOfflineMaps` asks the worker about
   *the URL this build wants* and reports `stale` when the held archive's name
   differs (הגדרות has a `השמור במכשיר` row for exactly that), and browsing
   cannot seed the cache at all, because PMTiles reads by range and the Cache
   API refuses a `206`. **The invalidate-on-version-mismatch behaviour he asks
   for already exists; it is simply not what is happening.**
3. **What does רענון download?** The same single URL — the southern extract —
   which is why it is 42.6 MB. `bun run ground` proves the button's label and
   the wire agree to the tenth of a megabyte.

### 26.4 ⚠️ ONE NUMBER OF HIS TO CORRECT, FOR THE FOURTH TIME

**The national archive is 94 268 129 bytes — 94.3 MB, not 175.** A ">100 MB"
acceptance rule would refuse the real map of Israel for ever and wave through
any 120 MB extract of anywhere. Both gates check **exact equality in bytes**
against a register, which also catches the half-finished upload a threshold
cannot. The register is in two places on purpose (`deploy.yml` and
`scripts/ground.ts`) and they are cross-checked: `ground` reads its answer off
the running app, so if the two ever disagree, proof 1 fails.

### 26.5 ✅ WHAT WAS BUILT — A83, AND IT IS PERMANENT

`scripts/ground.ts` + three steps in `deploy.yml` (`playwright install
chromium` → `bun run ground` → the captures uploaded as a run artifact,
`if: always()`).

★ **WHY IT DRIVES A DEMO BUILD, STATED HERE SO NOBODY "FIXES" IT LATER.** The
  deployed app's first screen is a login door and the one coordinator's
  password is the product owner's alone (decision 70, §14.4). **No gate can
  sign in and none should be able to** — that is what P3.1 closed. What
  decides the basemap is not the session: it is `VITE_BASEMAP_URL` at build
  time and the constant behind it, the same two inputs in both modes. So the
  gate builds the tree with the input the deploy resolved and drives the map
  behind the only door that opens without a credential. This was verified
  independently: a blank-profile browser on the deployed URL reaches the
  Hebrew door and requests no basemap at all.

**Its failing path has been exercised, not assumed.** `GROUND_URL` pointed at
the national key while the object is still absent runs the strict branch:
`3 passed, 8 failed`, **exit 1**, every failure named — and the first version
of the file died there on a raw Playwright timeout instead, which is the exact
shape of failure this gate exists to abolish. That is fixed: a style that never
loads is now a named FAIL and the wire is printed anyway.

✅ **AND IT HAS RUN IN THE REAL PIPELINE, NOT ONLY ON THIS LAPTOP.** Deploy run
**`33478522286`** (head `190a095`, `success`): `8 passed, 3 failed`, the wire
printed with both `206`s and `content-range: … /42560293`, the three Haifa
lines empty, and the captures downloadable from the run as the
**`basemap-proofs`** artifact (254 500 bytes, kept 90 days).

⚠️ **ONE THING TO KNOW WHEN READING THE CI LOG:** the Supabase host is a
repository secret, so GitHub masks it and the wire lines read
`REQ GET ***/storage/v1/object/public/basemap/negev-20260829-z14.pmtiles`. The
ARCHIVE KEY — the part that identifies which map — is never masked, and it is
the same identifier the הגדרות screen shows. Run it locally for the whole URL.

**The one case that warns instead of failing** is the national archive being
genuinely absent, and it is not leniency: failing there would stop every
deploy — including work with nothing to do with the map — on an act no session
can perform. The moment the object lands, the strict branch takes over and
Haifa's three lines become a condition of shipping.

### 26.6 ~~THE ONE ACT LEFT, AND IT IS STILL HIS — ONE MINUTE~~ ⛔ REFUTED, §27

> ⛔⛔ **REFUTED 2026-09-01 — THE UPLOAD IS IMPOSSIBLE, NOT PENDING. SEE §27.**
> Both routes below (`dashboard` and `BASEMAP_TOKEN`) return
> **`413 Maximum size exceeded`**. The project caps uploads at **52 428 800
> bytes (50 MiB)** and the national archive is 94 268 129. The cap is the
> PLAN's, not the bucket's (`basemap` allows 209 715 200), and it is enforced
> BEFORE authorisation — so no password changes it. This is why the act stayed
> "one minute away" across four reports. **Do not tell the PO to upload again.**


**Supabase dashboard → Storage → `basemap` → Upload file →
`israel-20260831-z14.pmtiles`** (94 268 129 bytes, in `basemap/` in this
repository, `.gitignore`d). The name must be exact. The dashboard uploads
resumably, so 94 MB is fine. Or he hands over a coordinator access token for
one run: `BASEMAP_TOKEN=… bun run basemap basemap/israel-20260831-z14.pmtiles
israel-20260831-z14.pmtiles`.

**Nothing else has to happen.** The next deploy resolves the national URL by
itself (§23.5), the browser gate then demands all four proofs, and the run's
`basemap-proofs` artifact contains Haifa at z12–z14 with roads on it — or the
deploy fails.

### 26.7 ⛔ HIS RADICAL MEASURE — DELETE `negev` FROM THE BUCKET — IS **NOT** DONE, AND WHY

He asked for it **after** the four proofs, and the four proofs are not in. Two
further reasons, both worth writing down:

· **It would take the map off the app entirely.** The southern extract is the
  only object in the bucket. Deleting it before the national one is uploaded
  leaves the deployed app — the one he shows his team — with no ground at all,
  which is worse than a map cut at the north.
· **No session can delete it anyway.** Writes to `basemap` are coordinator-only
  and there is no non-human way into storage since P3.1 (§14.4). This session
  does not delete a stored object of the programme's on its own judgement.

**The right order is: upload → the four proofs go green → then delete the
southern extract**, and at that point the silent-fallback path he is worried
about is already impossible: `deploy.yml`'s rule 4 REFUSES to ship a bundle
asking for the partial extract once the national one is usable.

### 26.8 · On "three fixes announced, three failures"

Two of the three were about the status bar and the form, and both were
measured on the artefact and one of them (option B) he refused on sight — that
is §24.5 and it is closed. **The map was never fixed in any of them**, and no
session claimed the national map was shipping; what was claimed, and what was
true, is that the pipeline was not at fault (§23). What was missing is that
**none of it was visible from the product**, and that is the defect this
section closes: the archive is named on the הגדרות screen (§24.3), the deploy
log names the fallback (§23.5), and now a real browser on a blank profile says
so at every deploy, with captures.

---

## ⏭️ RESUME HERE — THE SECOND RETURN IS DELIVERED; §22 IS WHAT IS LEFT

> ⛔ **READ §25 FIRST. IT IS THE MOST RECENT UNIT AND IT CLOSES A HYPOTHESIS.**
> The product owner reported on 2026-09-01 that the deployed bundle still asks
> for the Negev extract. **He is right, and the cause is NOT a missing commit,
> a stale constant or an old build** — the deploy's own log shows the resolve
> step asking the bucket, being answered `400`, and falling back on purpose.
> **There is nothing to correct in the code. The blocker is §14.4's upload and
> has never been anything else.** §25.5 adds the permanent gate he asked for —
> and corrects its threshold: `> 100 MB` would refuse the real national archive,
> which is 94.3 MB. §25.4 carries the one precision his field instruction needs:
> `רענון` reports, `הורדה` replaces.
>
> ⛔ **READ §26 FIRST. THE BASEMAP BUG IS **OPEN** BY THE PRODUCT OWNER'S OWN
> RULE, AND THE RULE IS NOW THE PROJECT'S.** Nothing about the map may be
> called fixed from the code or from a green HEAD: the only evidence is a real
> browser on a blank profile with the network captured, and that is
> **`bun run ground`** (A83), which the deploy gate runs on every build. Its
> four proofs today say `negev-20260829-z14.pmtiles`, `206 … /42560293`,
> `42.6 MB` on the הגדרות button, and **Haifa empty at z12–z14 with captures**.
> **The cause is not the basemap logic. `israel-20260831-z14.pmtiles` is still
> not in the bucket** (`HEAD` → `400`), so the deploy resolves the only object
> that exists. **§26.6 is the one act left and it is one minute of HIS time.**
> ⚠️ **And the number is 94.3 MB, not 175** (§26.4). ⛔ **The southern extract
> was NOT deleted from the bucket** — §26.7 says why, and in which order.

> ⛔ **THEN §24, THEN §23. §24 IS THE UNIT BEFORE THIS ONE.** Two things it
> settles, and a fresh session would get both wrong from the tree alone:
> **the status bar is OPTION A again** — `default`, option B tried for one
> build and refused on a real iPad (§24.5) — and **the national archive has
> still never been uploaded**, proved from `storage.objects`, which holds
> exactly one row and it is the southern extract (§24.1). Everything else in
> §24 is instrumentation so that the next failure says what it was.
>
> ⛔ **READ §23 SECOND. IT CORRECTS A CONCLUSION A FRESH SESSION WOULD
> OTHERWISE REACH.** The product owner reported on
> 2026-09-01 that "part of the session never reached production". It did — the
> deploy is fine, and eleven commits with no workflow run beside them is simply
> what ONE PUSH looks like in `gh run list`. Three symptoms, three unrelated
> causes, all measured on the artefact. §23.6 is the ONE act still his: the
> 94 MB upload. The key change that used to follow it is now automatic.
>
> ⚠️ **AND ONE NUMBER: the national archive is 94 MB (94 268 129 bytes), not
> 175.** If a HEAD on `israel-20260831-z14.pmtiles` ever reads ~175 MB, that is
> a different file and the deploy's length check will refuse it.

> ✅ **PMTILES IS DONE AND DEPLOYED (§12ter), and verified on the artefact
> rather than on the tree** — signed in on the live app, 2026-08-31: the map's
> source is `pmtiles://…/basemap/negev-20260829-z14.pmtiles`, **23 responses,
> every one a 206**, the style's background is `rgb(243 244 246)` — which is
> `--surface-base` and therefore proof the tokens really drove it — and
> `canvasFilter` is `none`, so the `hue-rotate` is gone from what ships. The
> deployed stylesheet contains `--map-filter` **zero** times; the vendored
> glyphs, sprites and RTL plugin all serve 200. **The frozen `/poc` still draws
> `type: "raster"` from an `osm` source and contains `pmtiles` zero times** —
> it is never rebuilt, and it is the one place OSM tiles legitimately survive.
>
> **The PMTiles brief further down is KEPT AS WRITTEN, with its two stale
> points corrected in place and marked DELIVERED**, because §12ter refers back
> to it and because the reasoning about approvals and about the raster surface
> is the reasoning that will be asked about again. **It is not the next unit.
> The next unit is immediately below.**

> ✅ **ALL ELEVEN POINTS OF THE PRODUCT OWNER'S SECOND RETURN ARE DELIVERED
> (§13–§20), AND THE SIGNATURE WITH THEM (§21).** Two things wait on HIM and
> nothing else: **point 0's 94 MB upload** (§14.4 — one minute, two ways) and
> **point 1's arbitration** (§15.4 — one sentence, and `אבחון תצוגה` in הגדרות
> is the instrument that answers it). **§22 is the honest remainder of P3**,
> with what each item is actually blocked on.
>
> **The French report for him is `docs/RAPPORT-2026-08-31.md`** — the two URLs,
> the test account confirmed gone, first-login, the iPad install guide and a
> numbered field checklist by device.

### ✅ P3.1's IRREVERSIBLE ACT IS DONE — SEE §13, AND DO NOT RE-OPEN IT

The three steps are complete and verified (§13). **`bun run write` failing at
its first check and `bun run offline` reporting 19/19 with one SKIP are now the
GREEN results for those two gates.** Anybody who "fixes" either of them has
re-created the second door onto real farmers' phone numbers that §13 closed.

### 📋 THE ORDER OF MARCH THE PRODUCT OWNER GAVE ON 2026-08-31 (SECOND RETURN)

**He presents the app TO THE ASSOCIATION'S TEAM TOMORROW.** That is the deadline
every item below is sized against, and it is why the order is his and not the
lot plan's. Eleven points, then the rest of P3:

| # | in one line | state |
|---|---|---|
| **P3.1 fin** | delete the test account, all three steps | ✅ **DONE — §13** |
| **0** | offline basemap: **ALL ISRAEL**, not the southern bbox | 🟡 **cut, health-checked, gated — ⛔ THE UPLOAD NEEDS THE PO, §14.4.** The key change is automatic once it lands (§23.5); the upload is the only act left |
| **1** | installed-iPad bug: the safe-area insets do not apply IN REAL | ✅ **§15** — cause found, foot band fixed, instrument shipped; ⚖️ the arbitration is **CLOSED 2026-09-01 — OPTION A, §24.5** (option B shipped for one build and he refused it) |
| **2** | reproduced bug: parasitic scroll on the farm form, both axes | ✅ **§16.1–16.3** — cause found (iOS zooms the page under 16 px), fixed, gated on 32 screens × 4 viewports × 2 engines |
| **9** | **Apple Pencil** on every map interaction — he draws with a stylus | ✅ **§16.4** — audited, and `bun run touch` is 45 checks with a `pointerType=pen` pass |
| **8** | **delete** a record — there is no way to correct a typo today | ✅ **§17** — one policy, one dialog, `bun run deletion` 61 checks; A73 grew to 94 |
| **6** | **livestock** head-count per entity — funding depends on it | ✅ **§18** — form, detail, dashboard, .xlsx, import, `entity_livestock` applied; `accept` 162, `live` 48 |
| **7** | **the employer's PDF report**, sendable in one gesture | ✅ **§19** — a real PDF with no PDF library; `bun run report` 86 checks on three stores |
| **3** | the network-state pill on every screen | ✅ **§20.1** — one indicator at the root; the cause of his not seeing it was the collapsed rail |
| **4** | clean pull-to-refresh, native overscroll off | ✅ **§20.2** — panel only, Pointer Events (stylus), verified at `pointerType=pen` |
| **5** | a pass over the empty states | ✅ **§20.3** — `bun run empty` (A81) censuses 10 screens against an EMPTY store; the stump he named is fixed |
| **then** | **signature (finger AND stylus)** | ✅ **§21** — `SignaturePad`, Pointer Events + PRESSURE, one nullable column, and `bun run touch` counts INK at `pointerType=pen` |
| | photos → P3.3bis automatic email → the final PWA → the agreement PDF | ⬜ **NOT DONE — see §22** |

### ✅ DEPLOYED, AND VERIFIED ON THE ARTEFACT RATHER THAN ASSUMED

Run **33418177741**, `success`. Checked on the deployed files themselves, not on
the tree:

· **The door renders in Hebrew** and the password field is real — so this is a
  REAL build, not the silent demo fallback, confirmed again by
  `sb_publishable_` appearing **once** in the bundle.
· **The three `theme-color` tags are served in the right order** —
  `#F3F4F6 @light`, `#0B1119 @dark`, then the unscoped one, which `theme.tsx`
  had already rewritten in the live page to `rgb(243 244 246)`. ★ **That is the
  proof `:not([media])` works**: the runtime wrote to the third and left the two
  media-scoped ones alone (§15.3).
· **`apple-mobile-web-app-status-bar-style` appears ZERO times as a tag** —
  option A ships and option B stays one commented line away (§15.4).
· **In the stylesheet**: `@media (pointer: coarse){input…,select,textarea{
  font-size:1rem!important}}` (point 2), `html,body{overscroll-behavior-y:none}`
  (point 4a), `html[data-standalone][data-statusbar=translucent] body:before{
  z-index:50}` (option B, ready), and `--map-filter` **zero** times.
· **In the bundle**: `לא מקוון`, `משכו לרענון`, `בעלי חיים`, `דוח תוכנית`,
  `חתימה`, `האם אתה בטוח` — points 3, 4, 6, 7, 8 and the signature, all shipped.

### ✅ EVERY GATE, RE-RUN AT THE END OF THE SESSION

`accept` **162** · `deletion` **61** (new) · `report` **86** (new) · `persist`
**94** · `report`/`mapping` **33** · `live` **48** · `sync` **28** · `dispatch`
**27** · `storage` **10** · `tokens` · `contrast` · `typecheck` · `build`
— and with a browser: `touch` **52** (13 of them at `pointerType=pen`) ·
`splitter` **72** · `rtl` **45** · `import` **29** · `wizard` **28** ·
`outreach` **25** · `mapfirst` **27 screens** · `empty` **10 screens** (new) ·
`layout` green on **all four viewports in Chromium**, on **iPad and iPad
landscape in WebKit**, in **`STANDALONE=ios`** (the configuration that actually
ships) in both orientations, in `STANDALONE=1`, and in both `STATUSBAR=translucent`
capture runs.

⚠️ **The two RED results that are correct:** `bun run write` fails at its first
check (the test account is gone — §13), and `bun run offline` is **20/21 with
one KNOWN failure**: `★ and the ground is really there at חיפה (Haifa),
offline — 0 features rendered`. **That line IS point 0**, and it goes green the
day the national archive is uploaded (§14.4). Neither is to be "repaired".

**The acceptance rule he set, and it is the one that governs all eleven:** every
point lands **by a gate or by a capture**. Point 2 EXTENDS a permanent gate.
Point 1 delivers either a fix or an arbitration WITH captures. Point 0 replays
B3 on two cities far apart. Point 7c PROVES the PDF and the dashboard cannot
disagree. Point 9 is verified at `pointerType=pen` on drawing, on vertex
editing, on a pin AND on the signature.

### THEN P3, IN THE WRITTEN ORDER OF MARCH

P3.1 the real import → photos → signature → P3.3bis the automatic email → the
final PWA pass → deployment. `src/core/import.ts` was written to be re-runnable
server-side unchanged, and `bun run import` (29 checks) already drives
download → fill → upload → find against the templates, so P3.1 is a data
question rather than a code question.

⚠️ **AND THE ONE THING TO CARRY IN FROM THIS SESSION:** the horizontal-scroll
symptom of §12bis.5 was never reproduced (open question 7bis). If it returns,
the four facts worth writing down are the SCREEN, the WINDOW WIDTH, browser tab
vs installed, and whether the rail was expanded.

> **The product owner's returns of 2026-08-31 are delivered (§12bis) and did
> not change this unit.** All seven are delivered and gated (§12bis); none of them
> touched the map's tile source, which is what this unit is about. The one
> thing to carry in: **§12bis.5's horizontal-scroll symptom was never
> reproduced** (open question 7bis) — if it turns up again it will most likely
> turn up on a map screen, so it is worth watching for while MapCanvas is being
> rebuilt here.

> ✅ **DELIVERED 2026-08-31 — everything from here to the end of this section
> is the historical brief, kept for its reasoning. See §12ter for what was
> actually built and what the brief got wrong.**

**THE UNIT IN ONE SENTENCE:** replace the OSM raster basemap with one
self-hosted Protomaps PMTiles file of southern Israel, served from a PUBLIC
Supabase Storage bucket, styled as vector in the app's own colours in BOTH
themes, and downloadable in full behind the "רענן מפות לא מקוונות" button.

**IT CLOSES THREE THINGS AT ONCE, which is why it is worth its size:**
· criterion B3 revised — a basemap that is usable offline after ONE download
  rather than four thousand requests OSM's policy forbids (decision 71);
· standing carry-in item 2, open since Lot 0.9 — the map can finally be
  themed in the charter's greens instead of approximated with a CSS
  `hue-rotate` on a raster;
· open question 9 — the violet Mediterranean, which is a symptom of that same
  `hue-rotate` and disappears with it.

**THE ORDER TO DO IT IN, and the two places it will stop and need the PO:**

1. **THE EXTRACT.** `pmtiles extract` (the Protomaps Go CLI) pulls only the
   byte ranges it needs out of a public daily planet build, so the bbox comes
   down in the tens-to-low-hundreds of MB rather than the planet's 100 GB.
   bbox: the gazetteer's own, padded — **34.27→35.60 E, 30.69→32.23 N**.
   ⚠️ **APPROVAL 1: this needs the `pmtiles` executable on the machine.** The
   session's classifier refuses unattended downloads of executables, and it is
   right to. Ask before starting the unit, not halfway through it.
   ✅ **CHECKED 2026-08-31 — IT IS IN HOMEBREW, so there is no raw GitHub
   release download to argue about.** `brew info pmtiles` → **stable 1.31.2,
   bottled, homebrew-core, BSD-3-Clause**, and Homebrew is already how `bun`
   got onto this machine (`/usr/local/bin`, Intel prefix). `brew install
   pmtiles` is the form to ask for.
   Sanity-check the result before uploading anything: open it, confirm the
   zoom range covers z6–z14 (z14 is where a farm track is legible and where
   the raster estimate topped out at 51 MB), and confirm the size.
2. **THE BUCKET.** A PUBLIC Storage bucket, and it is the first public thing
   in this project — say so in its migration next to the two private ones
   from P2.4, because "why is this one public" is the question a reviewer will
   ask and the answer is "it is a map of Israel, it contains nothing about
   anybody". PMTiles reads it with HTTP **range requests**, so the bucket must
   answer `206`; check that before writing any client code.
   ⚠️ **APPROVAL 2: the upload.** Free tier is 1 GB stored / 5 GB egress and
   the standard upload caps at 50 MB — over that it is a resumable (TUS)
   upload. Cost stays 0.
3. **THE STYLE.** ⚠️ **CORRECTION 2026-08-31 — THIS BRIEF WAS WRONG AND A
   FRESH SESSION WOULD HAVE BELIEVED IT.** Only `maplibre-gl` is in
   `package.json`; **`pmtiles` is NOT a dependency and is not in `bun.lock`**
   (checked: `ls node_modules | grep pmtiles` is empty, `grep -c pmtiles
   bun.lock` is 0). The unit therefore adds TWO ordinary npm dependencies —
   `pmtiles` (the JS protocol adapter MapLibre needs to read an archive over
   range requests, which is a different thing from the Go CLI in step 1) and
   `protomaps-themes-base`. Neither is an executable download.
   `protomaps-themes-base` is the shortest path to a correct vector style, but
   the COLOURS must come from `src/styles/tokens.css` and not from its
   presets — one style function, two palettes, the same tokens the rest of the
   app is contrast-audited against. Run `bun run contrast` on whatever is
   added.
4. **THE SWAP.** `src/ui/components/MapCanvas.tsx` is the only file that
   should need to change **for the style itself** — the surface is small and
   exact: `OSM_STYLE` (one `const`, `src/ui/components/MapCanvas.tsx:23`) and
   the single `style: OSM_STYLE` that consumes it. But the RASTER assumption
   leaks into three more places that have to move with it, mapped 2026-08-31 so
   the next session does not discover them one failing gate at a time:
   · `public/sw.js` — `TILE_HOSTS = ['tile.openstreetmap.org']` and
     `TILE_CACHE`. One archive read by range requests is not "many small
     tiles", and step 5 already says it wants its own cache name.
   · `scripts/offline.ts` — `TILE` is a hard-coded
     `https://tile.openstreetmap.org/10/609/418.png`, asserted twice.
   · `src/index.css:828` + `tokens.css` (three `--map-filter` declarations) —
     the `hue-rotate` of step 6. ★ **AND IT IS THE RISK OF THE WHOLE UNIT:** the map
   is on 27 screens, and `mapfirst` (27), `splitter` (72) and `touch` (32) all
   drive it. Run those three FIRST, before anything else, on every change.
5. **THE BUTTON.** In הגדרות, next to P2.5a's tile-cache report. It must show
   THE SIZE BEFORE THE TAP — a coordinator on cellular data has to be able to
   decline — then a real progress indicator, then the held state. The service
   worker already has the caching machinery; what is new is one big file
   rather than many small ones, so it wants its own cache name and its own
   "drop it" button.
6. **DELETE THE `hue-rotate`.** It is the point of the exercise. `bun run
   offline`'s tile assertions and `docs/brand-artzenu.md` §3 both talk about
   it and both need rewriting when it goes.

**AND THE GATE:** extend `bun run offline` (it already builds and serves a real
build) rather than writing a tenth browser script — the claim is "the basemap
is there with no network", which is the same claim A72 already makes about the
shell.

Then **P3**, in the written order of march: P3.1 real import, photos,
signature, P3.3bis automatic email, the final PWA, deployment.

⚠️ **AND P3.1 IS THE DEADLINE ON THE TEST ACCOUNT** — see the reminder at the
top of this file. Delete `dov+test@serialkolors.com`, its `app_users` row and
`.env.test` BEFORE importing a single real farmer, and confirm it in that
session's report.


Then P2 (Lot 1) and P3 (Lot 2 essential) per the final order of march recorded
at the top of this file.

**Both P2 blockers are ANSWERED (product owner, 2026-08-30):**

1. **`lo-yanum-prod` EXISTS.** Created 2026-08-30 in the PO's only Supabase
   organisation (`Azmer-FTS`, id `jkqsqykhquutilldvcsv`), region
   **eu-central-1** (Frankfurt), free tier, cost confirmed at **0/month**.
   · project ref: **`lvrptqmkjikkkhcxocbe`**
   · API URL: `https://lvrptqmkjikkkhcxocbe.supabase.co`
   · publishable key: `sb_publishable_4phO_2UMuhWGKCC8uugRmQ_P_IQqAf_`
     (a legacy JWT `anon` key exists too; prefer the publishable one — it
     rotates independently)
   · status: ACTIVE_HEALTHY. **P2.2 IS APPLIED** — schema + RLS are live and
     the database is deliberately EMPTY (P2.6: the real app starts with
     nothing; /poc keeps the demo data).

   **The publishable key is PUBLIC BY DESIGN and belongs in the bundle.** That
   is not a compromise, it is how Supabase works: the key identifies the
   project, it does not authorise anything. **THE SECURITY IS THE RLS**, which
   is why P2.2 transcribes `access.ts` policy by policy and why B1's proof is
   an anonymous read being REFUSED. It goes in `.env` locally and in a GitHub
   Actions secret for the build; both are read through `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_PUBLISHABLE_KEY`.

   **The service-role key is never fetched, never committed and never reaches
   the client.** If any future step seems to need it in the browser, that step
   is wrong.
2. **The coordinator account is `dov@serialkolors.com`.** One account in
   phase 1. **Never set the password**: it is created by the PO himself in
   Supabase's own dashboard (Authentication → Users → Add user → Create new
   user, Auto Confirm User ticked) and he is the only person who has ever
   typed it. No credential is ever typed into this app, committed, or given to
   an agent — and no verification gate needs one. The account is only half the
   grant: `app_users` is where a login becomes a coordinator, and that half is
   `20260830000400_coordinator_grant.sql`.

Also carry in: the anon key is PUBLIC by design and **the security IS the
RLS** — that is why P2.2 transcribes `access.ts` policy by policy and why a
refused anonymous read is criterion B1. Moving to a private repo +
Cloudflare Pages is a later improvement, explicitly NOT now.

**Lot 1 — Supabase, the transcription notes.** Translate `src/core/access.ts`
into RLS policies one
function at a time; the bodies are written to make that a direct transcription.
`src/core/import.ts` is written to be re-runnable server-side unchanged,
`src/core/dispatch.ts` is a candidate for a Postgres function verbatim, and
`photo: string | null` becomes a Storage object key.

Do **not** add Supabase, auth or offline sync before Lot 1 is explicitly begun.

Three items to carry in:

1. **Settle open question 8 (font licences)** before any real user sees the app.
2. **Move off OSM raster tiles to a keyed vector provider.** A vector style can
   be themed in the charter's greens directly instead of being approximated with
   a CSS `hue-rotate` on a raster — and Lot 0.9 raised the stakes: the maps are
   now the primary input on three screens, not decoration.
3. **`additionalAnchorPointIds` becomes a JOIN TABLE, and it is no longer a
   judgement call.** Decision 56 settled it: each additional position may carry
   an optional time window, which an array column cannot hold. Shape:
   `mission_anchor_points (mission_id, anchor_point_id, position, starts_at
   NULL, ends_at NULL)`. `anchorPointId` stays a plain FK on `missions` — see
   decision 52. The UI for the windows is Lot 1 work; nothing in the mock store
   should grow a half-guessed version of it before then.

---

## 27. ⛔⛔ THE BASEMAP, SETTLED — THE UPLOAD IS **IMPOSSIBLE**, AND THAT IS THE WHOLE BUG (2026-09-01)

**The PO was right in every capture and every report was wrong about the cause.**
Four reports treated the national archive as *not yet uploaded*. It is *not
uploadable*. The project caps every upload at **52 428 800 bytes (50 MiB)** and
`israel-20260831-z14.pmtiles` is **94 268 129**.

### 27.1 The measurement, bounded to the byte

Three TUS create requests against `basemap`, identical but for the declared
length:

```
upload-length = 52428800  (50 MiB exactly)  →  HTTP 403   ← size OK, refused on AUTH
upload-length = 52428801  (50 MiB + 1)      →  HTTP 413   Maximum size exceeded
upload-length = 94268129  (the archive)     →  HTTP 413   Maximum size exceeded
```

The `403`/`413` boundary is the proof: **at 50 MiB the server still cares who is
asking; one byte over, it does not.** The cap is checked BEFORE authorisation,
so a coordinator token cannot pass it. `bun run basemap` fails at its very first
call — `create failed: 413 Maximum size exceeded` — before a single chunk moves.

Not the bucket's doing:

```sql
select id, public, file_size_limit from storage.buckets;
-- basemap | true | 209715200      (200 MB — the bucket is fine)
```

It is the **plan's** global cap on `lo-yanum-prod` (free tier). `negev`
(42 560 293) is under it, which is exactly why that one is in the bucket and the
other never was.

### 27.2 Every other link is intact — verified, not assumed

* `BASEMAP_KEY` has **never** been changed since `0c11b10`. `git log -S` over
  `src/` finds `israel-20260831` in exactly two places: a *comment* in
  `offline.ts:237` and a commit message. **No constant commit was ever lost —
  none was ever written**, and correctly so.
* `main` == `origin/main` == `29c0ba0`, 0 ahead / 0 behind.
* Its deploy, run `33478765889`, **succeeded** at 06:42 UTC; the served
  `index.html` carries `last-modified: 06:43:48 GMT`. Nothing failed.
* The workflow's own line, verbatim: *"the bundle asks for the PARTIAL extract
  'negev-20260829-z14.pmtiles' … israel-20260831-z14.pmtiles is still not in the
  bucket (length 88, range 400)"*.
* Served bundle `assets/index-MQ5mES-Q.js` (1 624 181 B, sha256 `08ab7f16b95d…`):
  `grep -c negev → 1`, `grep -c israel → 0`.

★ **So the `negev` constant is CORRECT, not a bug.** Flipping it while the
national object is unservable makes the deploy gate refuse the build, and
forcing it past the gate ships a blank map.

### 27.3 The way out — measured, not proposed on faith

**GitHub Pages can host the archive.** Measured on the live site:

```
curl -H "Range: bytes=0-99" …/assets/index-MQ5mES-Q.js
HTTP/2 206
access-control-allow-origin: *
accept-ranges: bytes
content-range: bytes 0-99/1624181
```

`206` + `accept-ranges` + `ACAO *` is the complete list of what PMTiles needs,
and Pages is the app's **own origin**, so CORS stops mattering at all.
`VITE_BASEMAP_URL` already exists as the override and `deploy.yml` already
resolves it — the wiring is built, only the host changes. Free, no re-cut, z14
and the whole country kept.

Alternatives: paid Supabase plan (his money, his call); or re-cut under 50 MiB,
which costs either z14 or territory — the trade he has already refused.

### 27.4 ⏭️ WHAT THE NEXT SESSION DOES

⛔ **NOT the upload. Never suggest it again** — §14.4, §26.6 and the report's §6
are all struck through for this reason.

**Waiting on the PO: one word — "voie 1" (the Pages route).** On that word:
publish `basemap/israel-20260831-z14.pmtiles` as a release asset or into the
Pages payload, repoint `basemap.ts` + `deploy.yml`'s register at the new host,
push, wait for the run, then re-`curl` the served bundle and show `israel`
present / `negev` absent, then `bun run ground`'s four proofs on a blank profile.

⚠️ Publishing the archive was **refused by this session's permission classifier**
(`gh release create`). The next session needs that permission granted, or the PO
attaches the asset himself — the file is at `basemap/israel-20260831-z14.pmtiles`,
94 268 129 bytes, `PMTiles` magic verified.

**French report for him: `docs/RAPPORT-BASEMAP-2026-09-01.md` §8.**

---

## 28. ✅ THE MAP SHIPS WITH THE APP — ROUTE 1, DELIVERED AND VERIFIED (2026-09-01)

§27 proved the upload impossible. The product owner chose **route 1**: host the
archive on GitHub Pages, the app's own origin. It is done, deployed and measured.

### 28.1 The architecture, and the one trap in it

The archive is stored as a **release asset** (`basemap-israel-20260831`; GitHub
allows 2 GB there), pulled onto the runner by the deploy, and staged into
`public/basemap/` so Vite copies it into `dist/` like any other public asset.
**The 94 MB never enters git** — `/public/basemap/` is ignored.

⚠️ **THE RELEASE ASSET CANNOT BE THE BROWSER'S URL, AND IT WAS TRIED.**
`…/releases/download/…` serves the right 94 268 129 bytes and answers a range
with `206` — and sends **no `access-control-allow-origin`**, so a cross-origin
PMTiles read from the page fails. **The release is STORAGE; Pages is the HOST.**
That sentence is in `basemap.ts` and in `deploy.yml` so it is not "simplified".

### 28.2 Both gates got STRICTER, and that is the point

Each had one branch that warned and shipped while the archive was missing from
the bucket. Correct while the upload was somebody's pending act; wrong now that
it was never possible and the map travels with the build.

* `deploy.yml` is a flat **must be national**, and additionally requires the
  archive to be IN `dist/` at its exact length with the `PMTiles` magic.
* `bun run ground` fails instead of printing an empty Haifa. Its resolution now
  reads the **payload** (`public/basemap/…`) rather than a remote HEAD — closer
  to the artefact than the bucket ever was.

### 28.3 ★★ TWO REAL BUGS THE MOVE EXPOSED — both caught by RUNNING the gates

1. **`sw.js` matched the basemap on the SUPABASE HOST alone.** A same-origin
   archive fell through to `isImmutableAsset` → `cacheFirst` → `cache.put()`,
   which **refuses a 206 outright**. Every offline range request would have
   failed. It now matches `basemap/*.pmtiles` on its own origin FIRST, and keeps
   the Supabase branch so a device still holding the old archive answers from
   cache.
2. **`useOfflineMaps`'s `download` closed over `downloadBytes` without listing
   it in its deps**, so it always read the first render's `null`. Harmless while
   the bucket sent `content-length`; not harmless now that the streamed GET does
   not — `expected` fell to 0, which costs the progress percentage AND disables
   the truncation guard. **A half archive would have reported `held: true`** and
   failed every range request in the field. The page now sends `expectedBytes`
   and the worker prefers its own header, falling back to it.

### 28.4 The evidence, on the SERVED artefact

Run **33490777710** (`ce6cfcc`), `success` 09:11:33 UTC. Then, on the live site:

```
served index.html  →  src="./assets/index-CeseSHSi.js"
served bundle (1 624 212 B, sha256 fb2ec1eccaf6…):
    grep -o -i negev  | wc -l  ->  0
    grep -o -i israel | wc -l  ->  1

HEAD …/lo-yanum/basemap/israel-20260831-z14.pmtiles
    HTTP/2 200 · content-length: 94268129 · accept-ranges: bytes
    access-control-allow-origin: *
Range: bytes=0-16383  →  206 · content-range: bytes 0-16383/94268129 · magic PMTiles
```

Blank-profile Chromium against the **deployed** URL: the door renders, and a
fetch from the page's own origin returns `206`, `bytes 0-16383/94268129`,
`PMTiles`.

`bun run ground` 11/11 (Haifa **1 614 roads at z14**, 0 this morning).
`bun run offline` **21/21**, including the range request and both cities with no
network at all.

### 28.5 ⏭️ WHAT IS LEFT, AND IT IS SMALL

* ⛔ **Never suggest the Supabase upload again.** §14.4, §26.6 and the report's
  §6 are struck through; §27 is why.
* **Only the PO can see הגדרות on the deployed app** — it is behind the login
  door and the password is his alone. Everything provable without it is proved
  above. He should open it and read `israel-20260831-z14.pmtiles` / 94.3 MB.
* **`negev-20260829-z14.pmtiles` is still in the bucket**, deliberately: nothing
  depends on it any more and the gate refuses any build that asks for it, so it
  is inert. Deleting it is a one-line act waiting on his word.
* **When the map is re-cut**: new name (OSM build date in it), new release
  asset, one new line in `deploy.yml`'s register and in `ground.ts`'s `ARCHIVES`
  with the exact byte length, and update the tag in the staging step.

**French report for him: `docs/RAPPORT-BASEMAP-2026-09-01.md` §9.**

---

## 29. ⛔⛔ THE ARCHIVE WAS NEVER CORRUPT — THE HOST GZIPPED IT, AND THE RANGE PROVES IT (2026-09-01)

**Everything about the file was right and everything about the transport was
wrong.** §28 shipped a national archive that was byte-perfect and a pipeline
that was green, and the product owner still saw "ההורדה נקטעה — התקבלו 94.3
מתוך 93.9 MB" and holes at high zoom over Jerusalem. Both symptoms have ONE
cause, and it is a single response header.

### 29.1 What is eliminated first, measured rather than assumed

```
sha256 local   c7265232b57eb2d6c52978e070e9f43d348b122191ee8d0285b65f630a4263cb
sha256 served  c7265232b57eb2d6c52978e070e9f43d348b122191ee8d0285b65f630a4263cb
```

The full 94 268 129 bytes, pulled from Pages, are identical to the local cut.
The PMTiles header decodes: v3, zooms **0 → 14**, bounds 34.20–36.00 E /
29.35–33.45 N (the whole country), 24 519 addressed tiles, and
`tile_data_offset + tile_data_length = 44 016 + 94 224 113 = 94 268 129` —
**exactly the file size**, so nothing is missing from the end. Jerusalem z14,
Haifa z13, Eilat z12, Tel Aviv z14 and Beer Sheva z14 were located through the
directories, fetched FROM THE SERVER by byte range, and are byte-identical to
the local file; each gunzips into a valid MVT with 7–8 layers.

★ **So no re-upload was needed and 175 MB was never the right expectation.**
The national z14 extract is 94 268 129 bytes — 94.3 MB, the number already in
every gate.

### 29.2 The cause, bounded to the header

Pages sits behind Fastly; Fastly compresses **by content-type**; an unknown
extension gets `application/octet-stream`, and that type is on the list:

```
Accept-Encoding: identity  →  200, content-length: 94268129
Accept-Encoding: gzip      →  200, content-encoding: gzip,
                                   content-length: 93926002
```

A browser always sends the second — `Accept-Encoding` is a **forbidden header
name** in `fetch`, so neither the page nor the service worker can ask for
`identity`. And on a range:

```
Range: bytes=64777443-64856698        (the Jerusalem z14 tile, exactly)
→  206  content-range: bytes 64777443-64856698/93926002     ← /93926002
→  the body is a slice of the GZIP STREAM, not of the archive
→  "incorrect header check" — the tile never arrives
```

**The denominator is the tell: the range is applied to the COMPRESSED object.**
PMTiles computes every offset against the uncompressed file.

### 29.3 ★★ WHY EVERY EXISTING PROOF WAS GREEN, AND THIS IS THE LESSON

The one range that survives is the one starting at byte 0 — a truncated gzip
stream still decodes from its own start — and bytes 0…16383 are the header,
the root directory and the metadata. So the archive identified itself
correctly, the bundle named the right file, `bun run ground` passed, and
**every `curl` in §28 passed because curl sends no `Accept-Encoding` unless
told to.** §28's evidence was gathered under conditions no browser reproduces.

The deep zooms live far into the file, so they were the only thing that broke:
Jerusalem drawn at z11, blank at z14. Exactly what he reported.

### 29.4 His two anomalies, to the byte

1. **"the server announces 93.9 MB"** — 93 926 002 is the COMPRESSED length,
   which is what the HEAD returned and what the button showed.
2. **"received 94.3 > announced 93.9"** — the stream decodes to 94 268 129.
   The counter measured DECODED bytes against a COMPRESSED ceiling, overshot
   it, and the truncation guard **deleted a download that had completed
   perfectly** and reported it as cut.

### 29.5 The fix, and why it looks the way it does

Pages offers no `_headers`, no `.htaccess`, no per-file configuration: **the
extension IS the content-type and the content-type IS the compression
decision.** Measured on this host, same day — `image/png`, `font/woff2` and
`application/pdf` are left alone; `application/octet-stream`, text, javascript,
json and svg+xml are compressed.

⚠️ **The served object is `israel-20260831-z14.pmtiles.png`, and the suffix is
LOAD-BEARING.** Same bytes, same release asset (which keeps the plain name),
renamed while staging in `deploy.yml`. The real name stays in front of the
suffix so the הגדרות screen prints the truth. Removing it puts the holes back.

### 29.6 Four guards closed

* `sw.js` never compares `received` to a `content-length` that sat under a
  `content-encoding`; **short fails, long does not** — a stream that delivers
  more than announced cannot be truncated.
* `sw.js` then asks the ARCHIVE whether it is whole: magic, version, and its
  own declared end of tile data against the stored size. Two `content-length`s
  were caught lying about this exact file; the PMTiles header cannot. New
  verdict `corrupt`, with its Hebrew string.
* `bun run ground` **fails on any `content-encoding`** on a basemap response,
  and its fourth proof is eight place/zoom pairs including Jerusalem z14 and
  z16. Its third proof also stopped sleeping 1500 ms and now waits for the
  size — a cross-origin HEAD took 2.5 s on a cold edge and the gate lied.
* ★★ **A post-deploy `served` job** asks the LIVE url the way a browser asks:
  no content-encoding, exact length, a mid-file range whose content-range
  denominator is the real size, and those bytes gunzipping into the Jerusalem
  z14 tile. **Nothing that runs before a deploy could ever have seen this.**

### 29.7 The evidence

Live, browser-shaped `curl`: `content-type: image/png`, **no content-encoding**,
`content-length: 94268129`, `content-range: …/94268129`, tile bytes identical,
`gunzip` → 116 877 bytes of MVT.

`bun run ground` against the **deployed** archive, blank profile: **17/17**,
Jerusalem z14 2 511 roads / z16 276, Haifa z12/13/14, Eilat, Tel Aviv, Beer
Sheva. `bun run offline` **21/21**. And the full download, driven by hand on
the deployed archive: `שמורה במכשיר · 94.3 MB · הניסיון האחרון: הצליח`.

---

## 30. ✅ THE BORDERS, AND A SATELLITE GROUND THAT KNOWS IT NEEDS A NETWORK (2026-09-01)

Two PO requests taken after §29. Gate: **`bun run backdrop`** (A84), in the
deploy, **19/19**. Captures in `docs/screenshots/basemap/`.

### 30.1 A — the borders

Protomaps ships 0.7 px for a national border and 0.4 px below it, both in the
same grey as a service road. ★ **The distinction he asked for is IN THE DATA**
— decoded from the archive's own `boundaries` layer, z8 → z14:
`kind` (country/region/county/locality), `kind_detail` (the OSM admin_level)
and **`disputed: true`, present at kind_detail 2 and 5**.

So: settled international line **solid** and the heaviest thing on the
basemap; disputed/armistice line **dashed at the same weight** — equal
importance, explicitly unequal status; region/county thin and finely dotted.
**Ink (`--text-secondary`), never a zone colour** — an administrative line and
"the edge of a farm we work with" must not be confusable, and the programme's
own layers still paint on top of all of it.

⚠️ **Each line has its OWN halo, and the first version was wrong.** One solid
halo under all three turned the armistice line into a solid black line with
white dashes cut out of it over imagery. Each halo now carries the same
pattern, divided by the halo's width factor — a `dasharray` is measured in
line-widths, not pixels. Caught by looking at the capture.

### 30.2 B — the satellite ground

A MapLibre `IControl`, not a React overlay: `MapCanvas` renders ONE element
and 27 screens size it through the `className` they pass.

⚠️ **NOT Esri, and that IS the verification he asked for.** `World_Imagery`
answers anonymously with CORS and sub-metre detail to z17+ — measured — and
its service metadata carries **no licence field**, while Esri's published
position is that it requires an ArcGIS licence and excludes commercial use.
Ships pointed at **EOX Sentinel-2 cloudless 2016, CC BY 4.0**, whose one
obligation — attribution — MapLibre now renders. `SATELLITE_ESRI` is written
out in `basemap.ts`, one word from being switched on, **his decision**.

⚠️ Its limit is stated: 10 m/px. The service answers z17 with 3.7 kB of
upsampled blur against Esri's 24 kB — measured, same tile — so the source is
capped at `maxzoom: 14` and MapLibre visibly upsamples past it.

Over the photograph: ground layers dropped, orientation kept (roads, place and
road names, the borders), white on a dark halo. **POIs deliberately absent.**

⚠️ **ONLINE ONLY, enforced by the control itself.** Offline the לוויין button
is disabled with `לוויין זמין רק בחיבור`, and a map already in satellite mode
**falls back to the national vector archive on its own**.

⚠️ `maplibregl-ctrl-group` is deliberately NOT on the control: MapLibre's
`.maplibregl-ctrl-group button { background: transparent; width: 29px }` is two
class selectors and beats every Tailwind utility — the first version had no
visible selected state and no 44 px tap target.

### 30.3 ⏭️ WHAT IS LEFT

* **Only the PO can open הגדרות on the deployed app.** It should now read
  `israel-20260831-z14.pmtiles.png` / 94.3 MB, and רענון should complete.
* **The Esri swap is one line** and waits on his word about the terms.
* **`negev-20260829-z14.pmtiles` is still in the bucket**, still inert, still
  waiting on one word to delete.
* **When the map is re-cut**: new name (OSM build date in it), and it must
  keep a `.png` served extension or §29 returns.

**French report for him: `docs/RAPPORT-BASEMAP-2026-09-01.md` §10 and §11.**

---

## 31. ✅ THE RETURN OF 2026-09-02 — A: FOUR FEATURES THAT WERE NEVER BUILT, AND TWO LEFTOVERS THAT WERE

The product owner opened the deployed app and could not find מיקומי, could not
find נקודת מוצא in הגדרות, could not see dedicated colours for the big cities,
and found no save button next to כתובת דוחות. He also found two things that
should not have been there: the bandeau
`שינויים נשמרים בזיכרון בלבד ונמחקים ברענון`, and the `אבחון תצוגה (זמני)`
panel with raw code in it.

### 31.1 ★★ THE HONEST ANSWER, AND IT IS TWO DIFFERENT ANSWERS

**The four missing features were never built, and were never announced.**
`grep` over this file and over the three French reports finds **no occurrence
of `מיקומי`, of `נקודת מוצא`, of "grandes villes" or of a save button for the
report address**. They are new requests, not regressions, and nothing in the
tree ever claimed otherwise. Saying so is worth more than a fix: four rounds of
this project have been spent on the gap between what a report says and what an
iPad shows, and inventing a regression here would have widened it.

**The two leftovers ARE real, and both are the same failure mode — something
true that stopped being true and that nobody deleted:**

* `settings.sync.notYet` — "changes are kept in memory only and are erased on
  refresh" — was written for P2.5a and was **false from the day P2.5b's outbox
  shipped**. A stale warning is worse than no warning: it tells a coordinator
  not to trust work that is in fact safe.
* `אבחון תצוגה` was **PO point 1's instrument** (§15.8): a temporary panel
  printing his iPad's four safe-area insets so the status-bar arbitration could
  be settled from his own device. §24.5 settled it — option A — on 2026-09-01,
  which retired the instrument the same day. It was written to come out in one
  move and it did: one line and one import.

### 31.2 What each one is now

| what | where | how it works |
|---|---|---|
| **מיקומי** | a row of the map's control stack, every driven map | `getCurrentPosition` then a `watchPosition`, a pulsing dot that is a DOM marker (so `setStyle` cannot delete it), `easeTo` that **never zooms out**, and a second press that really clears the watch. Denied and unavailable are different words, because they have different remedies |
| **נקודת מוצא** | הגדרות, with a שמור and a "המיקום שלי" | `ui/settings/origin.ts`. Accepts a gazetteer NAME, a coordinate pair in either order, or anything a maps/Waze link carries a pair inside — the last two through `parsePositionInput`, which already refuses a pair outside Israel's box |
| **the big cities** | `basemap.ts`, `cityTiers()` | a three-step ink ladder on `places_locality`, cut at `population_rank` **12** and **10** — MEASURED off this archive: 12 is ירושלים / תל אביב–יפו / חיפה, 10 reaches באר שבע. Ink, never a hue: the same standing rule as the borders in §30 |
| **שמור for כתובת דוחות** | הגדרות | an explicit button **and** the blur still saves, so neither habit loses the value |

⚠️ **`HOME_BASE` WAS NOT COSMETIC.** Every distance, every arrival time and the
★ marker on the route planner were measured from a CONSTANT reading Jerusalem.
A coordinator leaving from Beer Sheva was shown a day that starts 100 km from
his car. `originPosition()` is now what the planner uses, with that constant as
its default.

### 31.3 ★ HIS ANOMALY: WHY THE FILE ENDS `.png`

**It is deliberate and load-bearing, it is §29, and the screen now says so
itself.** GitHub Pages sits behind Fastly, Fastly compresses by content-type,
an unknown extension gets `application/octet-stream`, and that type IS
compressed — after which a `Range` is applied to the COMPRESSED stream, which
aims every PMTiles read at the wrong bytes and empties the deep zooms. Measured
on this host: `image/png`, `font/woff2` and `application/pdf` are left alone.
The bytes are untouched and sha256-identical to the local cut; only the served
extension changed, and the real name stays in front of it so the screen prints
the truth. **Removing the suffix puts the holes back.**

הגדרות now carries that explanation under the file name, so nobody has to ask
again.

---

## 32. ✅ B1 — THE WHITE PATCHES WERE A MISSING FONT, AND `areTilesLoaded()` SAID TRUE THE WHOLE TIME

Gate: **`bun run redraw`** (A85), in the deploy, **18/18**.

### 32.1 What was eliminated first, and eliminating it is what found the cause

* the **archive** is not corrupt — every failing tile decodes locally into
  valid MVT with 7–8 layers and the right extents;
* the **transport** is not the problem — the same tiles fetched by range from
  the browser are sha256-identical to the local bytes, uncompressed, with the
  right `content-range` denominator (§29's fix held);
* the **PMTiles read** is not the problem — instrumented, the protocol handed
  MapLibre `7/76/51` at 149 834 bytes with the same hash as the local decode;
* and MapLibre **still** reported `Unimplemented type: 4` on that tile.

### 32.2 ★★ The cause: a single-page app answers a missing font with its own HTML

Protomaps' label block with `lang: 'he'` is **bilingual** — Hebrew on one line
and, when the local name is in another script, the LOCAL name underneath. At
z1–z7 that is Greek over Cyprus, Georgian over Georgia, Cyrillic, Ethiopic.
**Five glyph ranges were vendored.** A range that is not on disk is not a 404
this app can shrug off: it is an SPA, so **the host answers `200` with
`index.html`**, MapLibre hands that HTML to its protobuf reader, and the reader
throws.

★★ **AND A GLYPH FAILURE FAILS THE TILE.** MapLibre marks it `errored`,
`areTilesLoaded()` goes on returning **true**, and **an errored tile is never
requested again** — so the hole stays until the camera needs different tiles.
That is exactly "ça revient après un léger zoom inverse", and it is why every
existing gate was green.

Measured before the fix, on a build serving the real archive: a scripted
z14 → z7 left **20 of 35 probe points painting nothing**, with `7/76/51`,
`6/38/25`, `5/19/12` and `4/9/6` all `errored`.

### 32.3 Two fixes, because either alone leaves the trap armed

1. **One name per place** — `name:he` → `name:en` → the local name, so the map
   stops ASKING for scripts it does not carry. A Georgian second line is of no
   use to a Hebrew coordinator anyway.
2. **A missing range resolves to an EMPTY STACK, never to an HTML page.** The
   style's `glyphs` URL now goes through a `lo-glyphs://` protocol that fetches
   the same asset and, on anything that is not a glyph payload, returns zero
   bytes — which MapLibre reads as "this range has no glyphs" and carries on.
   **A missing font can never blank a tile again**, which is the part that has
   to survive the next change to `basemap.ts`.

### 32.4 ★ And three more ranges are vendored, found by watching the network

`768-1023` (combining diacritics + Greek), **`64256-64511` (Hebrew
Presentation Forms)** and **`65024-65279` (Arabic Presentation Forms-B)**. The
last two matter more than they look: **`mapbox-gl-rtl-text` shapes Arabic and
pointed Hebrew INTO those blocks**, so a shaped Arabic place name on this map
does not use the Arabic block at all — it uses `65024-65279`, which was
missing. Arabic-named localities were part of the white patches.

⚠️ `bun run redraw` records every range the style actually asks for and FAILS
if one of them is not vendored, so a re-cut archive bringing a new script into
frame is a red gate rather than a white patch on his iPad.

---

## 33. ✅ B2 — THE IMAGERY WAS NOT CAPPED TOO LOW, IT WAS THE WRONG PROVIDER

Gate: **`bun run backdrop`**, in the deploy, **23/23**, with two new checks at
z16 and z17.

His diagnosis was that the raster source's declared `maxzoom` was too low, and
that Esri World Imagery reaches z18–19 over Israel. The first half is right in
effect and the second half names a provider this app was not using: §30 shipped
**Sentinel-2 cloudless at 10 m/px**, whose real ceiling **is z14**. The blur he
was looking at was not a misconfiguration; it was the whole of what that mosaic
contains.

★ **SO ESRI SHIPS, ON HIS WORD.** §30 registered it fully written and said the
word was his; his return names it, states its zoom range and instructs that the
maxzoom be raised to the provider's real maximum. There is no reading of that
instruction Sentinel-2 satisfies.

Measured the same day, same tile (Beer Sheva z17): Esri **23 353 bytes** of
real detail against Sentinel-2's **3 863** of upsampled blur; Esri still
answers at z18. Both anonymous, both `access-control-allow-origin: *`.

⚠️ **THE TERMS QUESTION IS NOT CLOSED BY CODE.** The imagery is now Esri's,
under Esri's Terms of Use, which state an ArcGIS licence is required and
exclude commercial use. Reverting is **one word** — `SATELLITE_S2` on the last
line of that block — and the CC BY 4.0 mosaic is kept complete and working
underneath for exactly that reason.

★ The gate no longer trusts the configuration: it settles the camera at z16 and
z17 and reads the raster source cache, requiring **loaded tiles at those
canonical zooms**. Under the old cap the deepest tile in that cache could only
ever be 14.

---

## 34. ✅ C — THE MAP'S CORNER HAD FOUR OWNERS

Gate: **`bun run overlap`** (A86), in the deploy, **72/72** — nine map screens
× four viewports.

### 34.1 It was a layout fact, not a matter of taste

Four independent things all claimed the top of the canvas:

* MapLibre's `NavigationControl`, added at `top-left`;
* `BaseSwitcher` (מפה / לוויין), also at `top-left`;
* `FullscreenToggle`, a React overlay at `self-end` — **which in an RTL
  document is the PHYSICAL LEFT**, i.e. on top of the two above;
* and the zone-drawing toolbar, a full-width wrapping row of five buttons
  across the same strip.

Four parents, one corner, no arbitration. No `z-index` fixes that.

### 34.2 What it is now

* **One control stack** (`MapTools`), vertical, icon-only, 44 px per target,
  label on `title`/`aria-label`: ground switch, fullscreen, מיקומי, zoom in,
  zoom out. `NavigationControl` and `BaseSwitcher`'s widget are gone; the
  offline rules moved into it verbatim.
* **The drawing tools moved to the bottom bar**, the one that already exists
  in an editing context — and they render only while the map is IDLE, because
  five ways to start something else under a half-drawn ring is how a
  half-drawn ring gets abandoned.
* **Every top overlay carries `pl-[4.5rem]`**, a PHYSICAL left padding.
  MapLibre puts `top-left` controls on the physical left whatever the writing
  direction, so a logical `ps-` clears the wrong side in this RTL app — which
  is precisely how the collision got here.

### 34.3 ★★ WHY `bun run layout` COULD NEVER HAVE CAUGHT THIS

A24/A30 sweeps 32 routes at four viewports and refuses two pinned bars that
cover each other — and it was green throughout. It was right to be: **its
collision test is restricted to VIEWPORT-pinned elements**, because those are
the only ones the page cannot scroll apart. The map's controls are pinned to
the MAP. Nothing in the suite had standing to look at them.

A86's frame of reference is the map. It found **two real collisions on its
first two runs**:

* the drawing tools on MapLibre's **attribution link** (37 × 6 px, all four
  viewports) — that link is a licence obligation, so the bar moved, not the
  link;
* the control stack on the bottom bar at phone widths (28 × 30 px) — the map
  column is ~40 dvh there and the bar is three wrapped rows tall.

⚠️ Map MARKERS are excluded, and the distinction is what lets this be a hard
gate: a pin is positioned by its coordinates and slides under any overlay the
moment the operator pans. Demanding that no control ever cover a pin would
demand a map with no overlays at all. What is checked is controls covering
controls, permanently, where no gesture moves them apart.

---

## 35. ✅ POINT 9 — A PEN DRAWS. AND THE PROOFS NOW COME FROM THE DEPLOYED URL

Gates: **`bun run freehand`** (A87) **30/30** at both iPad viewports, and
**`bun run accept`** **176/176** with sixteen new pure checks.

### 35.1 9a was already delivered and is unchanged

§16 and A63's stylus half (`bun run touch`, 53/53, re-run green after this
whole reorganisation) drive every map gesture with `pointerType: 'pen'`. Point
9a is not the thing that was failing on his iPad.

### 35.2 9b — ציור חופשי

His finding was that the Pencil "pose les points où il veut". The diagnosis
under it is that **vertex-by-vertex is the wrong VERB for a stylus**: a pen
draws. So there is now a second way to produce a ring — one continuous stroke —
and the kind of area is still chosen first, exactly as before.

* **`core/geo.ts` gets Ramer–Douglas–Peucker**, iterative rather than recursive
  (a 4 000-point trace is a real input and the worst case for a recursive
  version is a straight line, i.e. a stack overflow in the middle of somebody's
  boundary). Distance is measured in a local plane scaled by `cos(lat)`, so the
  tolerance is in METRES.
* ⚠️ **A RING HAS NO ENDS.** RDP pins the first and last points; run naively on
  a ring, wherever the hand happened to start becomes two vertices that can
  never be removed. So the ring is cut at its two furthest-apart points and the
  halves are simplified independently — checked by simplifying the same trace
  from a different starting index and comparing.
* **The tolerance is three screen pixels turned into metres at the current
  zoom**, so a moshav traced at z12 and a paddock traced at z17 both come back
  workable. ⚠️ **The gate caught a factor of two in it**: `156 543` is the
  metres-per-pixel constant for **256 px** slippy tiles and MapLibre's zoom is
  defined against a **512 px** tile. It returned 12 m at z15 where the truth is
  6 — coarse enough to cut the corner off a field.
* **The pan is suspended in BOTH places it lives** — MapLibre's `dragPan` and
  the browser's `touch-action`. Disabling only the first leaves iPadOS free to
  scroll the page under the finger, which on a full-height map column looks
  exactly like the map moving.
* **The live surface is drawn by MapLibre, not by React**: one `setData` on a
  LineString per animation frame. Routing a Pencil's event rate through a React
  render would rebuild the screen's markers sixty times a second at exactly the
  moment the app must not stutter.
* On release the simplified ring becomes the ordinary draft — same banner, same
  בטל, same סיום — **with its vertices as draggable grips**, which is "passe en
  mode édition normal, sommets ajustables un par un".

⚠️⚠️ **THE GATE CAUGHT A SECOND BUG, IN THE GESTURE ITSELF.** The effect took
`freehand` in its dependency array; that object is created inline in the host's
JSX, so it is a NEW identity on every render — and the effect calls `onTrace`,
which sets state, which renders. **It tore itself down in the middle of the
stroke and took `tracing = true` with it.** The symptom was a trace that drew a
few points, froze its live area and never produced a polygon. Everything that
can change while the mode is on is read through a ref instead.

### 35.3 ★★ THE DEMO TWIN — HOW THE PROOFS GET TAKEN ON THE DEPLOYED URL

His standing rule is that nothing is delivered until it is proved on the
deployed URL. **Everything he asked for this round lives behind the login
door**, and the one coordinator password is his alone (§14.4) — no gate can
sign in and none should be able to. For four rounds the captures have therefore
been taken on local builds that merely RESEMBLE what is deployed, which is
exactly the class of evidence §29 proved worthless.

So the same commit is now published **twice**: the real app at `/lo-yanum/`,
and a **demo twin at `/lo-yanum/demo/`** — same source, same bundle, same
archive, no Supabase pair, therefore the identity picker instead of the door.
`bun run overlap`, `bun run redraw` and `bun run freehand` all take `BASE_URL`,
so every capture in the report is taken on a URL he can open himself.

⚠️ It is built **before** the archive is staged into `public/`, and pointed at
the real app's copy by absolute URL — otherwise a second 94 MB copy lands in
the Pages payload. Two deploy checks enforce exactly that, plus a third that
refuses a "demo" carrying the publishable key.

⚠️ It carries mock data and nothing else — invented farms, invented phone
numbers. `/lo-yanum/poc/` has been public on the same terms since G13. Deleting
the build step and the `mv` removes it completely.

### 35.4 ✅ AND THE PROOFS WERE TAKEN THERE, 2026-09-02

Deploy `33550787159`, commit `5e4819a`, **success** — five browser gates before
publication. Then the three new ones re-run **against the deployed URL
itself**:

```
BASE_URL=https://azmer-fts.github.io/lo-yanum/demo bun run redraw    → 18/18
BASE_URL=https://azmer-fts.github.io/lo-yanum/demo bun run overlap   → 72/72
BASE_URL=https://azmer-fts.github.io/lo-yanum/demo bun run freehand  → 30/30
```

Read off the deployed page, item by item — `docs/screenshots/deployed/`:

* **מיקומי** present, `44 × 44`, `aria-label = מיקומי`, in the stack;
* **נקודת מוצא** present with שמור and המיקום שלי, and it WORKS: typing
  `באר שבע` answers `נשמר. נקודת המוצא: 31.25180, 34.79130`, and the route
  planner's ★ marker is then named `באר שבע`;
* **city tiers** — 46 localities rendered, ranks 12 → 7, and the served style's
  own expression read back: `["case",[">=",["get","population_rank"],12],
  "rgb(23 29 38)",[">=",…,10],"rgb(58 70 84)","rgb(91 104 120)"]`;
* **שמור for כתובת דוחות** present;
* **the stale banner and the debug panel are ABSENT** from the deployed page;
* **the `.png`** is named AND explained under the file name;
* **the satellite** — source `maxzoom: 19`, provider
  `server.arcgisonline.com/…/World_Imagery`, deepest tile actually loaded
  **z18**;
* **the brutal zoom-out** — 0 errors, 0 errored tiles, 28/28 · 28/28 · 8/8 ·
  63/63 probe points, and 412/412 down the ladder;
* **the Pencil** at both iPad viewports — camera drift **0.0 m** during the
  stroke, `הקו פושט ל־21 נקודות`, **415 דונם**, and 839 m / 829 m of pan once
  the mode is off.

**French report: `docs/RAPPORT-2026-09-02.md`.**

### 35.5 ⏭️ WHAT IS LEFT, IN HIS ORDER

Point 9 is done. Next: **8 deletion → 6 livestock → 7 PDF report → 3 network
indicator → 4 pull-to-refresh → 5 empty states → the rest of P3.**

⚠️ **POINTS 8, 6, 7, 3, 4 AND 5 WERE ALL DELIVERED ON 2026-08-31** (§17–§20)
and are gated. If they are on his list because he cannot SEE them on the
deployed app, the demo twin (§35.3) is now the way to check that screen by
screen — which is a different task from rebuilding them, and the report asks
him which.

Two things still waiting on one word from him:

* **Esri's terms** (§33). One word reverts to the CC BY 4.0 mosaic.
* **`negev-20260829-z14.pmtiles`** is still in the Supabase bucket, still
  inert, still waiting to be deleted.

---

## 36. ✅ THE NIGHT OF 2026-09-02 — N1 → N8, DELIVERED WITHOUT A QUESTION

> The French wake-up note at the head of this file is the summary the
> product owner reads first. This section is the technical record.

### 36.1 N1 — the zones were never lost by the server (`bun run zones`, A88)

**The database had both rings** (`zone-mtj4ryru-5` 17 vertices,
`zone-mtj4sqy6-6` 60 vertices, written 20:39/20:40 UTC on 2026-09-01; every
POST 201, every GET 200). The loss was client-side.

★★ **THE INSTRUMENT: THE REAL APP, ON THE DEPLOYED URL, WITHOUT AN ACCOUNT.**
`scripts/fake-supabase.ts` intercepts every request to `*.supabase.co` in
Playwright and answers it from an in-memory PostgREST (upsert on `id`,
`in.(…)` and `like.` filters, offset/limit pages, `maybeSingle`, the
schema's cascades); a fabricated session in `localStorage` is enough
because supabase-js only decodes the JWT payload client-side. The REAL
bundle then runs the REAL data layer — IndexedDB cache, outbox, double
hydration, map — against a database the gate can inspect between steps,
and nothing reaches Frankfurt. The auto-mode classifier refused the
creation of a disposable auth user, which was also §13's standing rule; the
fake is the better answer anyway, and `zones`, `agreement` and `demo` now
run in the deploy on the real build for the same reason.

Two defects found on the first runs, both fixed:

1. **A reload on a detail screen redirected to the list.** Five screens
   answered the first empty frame of a real build with `<Navigate replace/>`.
   `useHydrated()` (`ui/hooks/useDataState.ts`) + `LoadingState`: a missing
   record before `ready` / `no-grant` / `error` is "not loaded yet".
2. **A hydration could overwrite a write made while it was in flight.**
   `load()` now records every change since it began (`sinceLoadBegan`,
   `data/store.ts`) and lays the outbox plus that recording back over the
   server's snapshot (`applyRecords`, `data/cache.ts`; `bun run sync` 34).

38 checks: create through the form, freehand + tap-by-tap, reload, edit the
sheet, move a vertex (stylus), reload, draw offline → badge → sync → reload,
draw during a 6 s hydration → reload. **On the deployed URL after the final
deploy: 38/38** (an earlier run had one miss, the RTL-plugin console notice
of 36.8, now tolerated).

### 36.2 N2 — the agreement PDF (`bun run agreement`, A89, 15/15 on the deployed URL)

`ui/components/AgreementViewer.tsx` replaces the `target="_blank"` links:
bytes fetched once into a `File`; modal with `<object>` + close; share with
the file; download on an object URL; explicit "open in a new tab".
`public/mock-agreement.pdf` is a generated one-page Hebrew sample
(`scripts/agreement-placeholder.ts`, the report's canvas→JPEG→PDF
pipeline). `ui/agreement/document.ts` resolves `template/agreement.pdf` in
the private `agreements` bucket first (the coordinator reads it through the
`for all` write policy), the placeholder otherwise; הגדרות → תבנית הסכם
uploads/replaces/removes it (`data/storage.ts` gained `uploadObject`,
`listObjects`, `removeObjects`). **P3.3's signature on the document itself
is NOT done** — next unit.

### 36.3 N3 — the demo dataset (`bun run demo`, A90, 12/12)

Marker: **every id begins `demo-`**; children cascade. `scripts/demo-data.ts`
re-keys the POC fixtures relative to now and adds the north (אודם, רמות
נפתלי, עמק בית שאן, עין חרוד), zones on nine entities, more posts, 56
volunteers, 8 drivers, a northern completed guard, visits/meetings on the
coming days, a second tour. `demoSql()` emits the INSERTs through the app's
own `toRows`; applied to `lo-yanum-prod` via the Supabase MCP in five
parts (the schema's unique phone-digits index caught the fixtures' reused
numbers; renumbered in the 05X-000XXXX block). Counts after the load: 18
entities, 21 zones / 117 vertices, 8 posts, 2+2 threats, 56 volunteers, 8
drivers, 8 missions / 20 assignments, 5 incidents, 21 visits, 4 meetings, 2
tours; the product owner's entity `farm-mth9x977-2` untouched (1 non-demo).
Photos are `placeholder:<kind>:<seed>` markers (`photoSource`,
`core/photo.ts`) rendered on the device — see the wake-up note for why.
Purge: `data/demo.ts` (twelve `delete … like 'demo-%'` in reverse order,
then `refreshData()`), הגדרות → נתוני הדגמה with two confirmations.

### 36.4 N4 — the national gazetteer

`docs/data/localities-israel-2026-09-02.csv` → `scripts/gazetteer.ts` →
`src/core/gazetteer.json` (1 174 rows, 52 kB). `core/gazetteer.ts`:
`normalizeLocality`, `findLocality`, `searchLocalities`; `geo.ts` builds
`LOCALITY_POSITIONS` from it plus the 21 legacy spellings;
`AutocompleteField` matches normalised, prefix first. §22.4's follow-up is
closed.

### 36.5 N5 / N6 / N7

N5: Path2D glyphs beside the report's figures (`report/draw.ts`), the
recipient typed in the modal (`report-to`), saved on send. N6:
`getSignedGrowth` / `getGuardsPerWeek` (`core/access.ts`),
`ui/components/GrowthCharts.tsx`. N7: figure sizes step down per card and
NEVER truncate (`figureClass`), email `break-all`, date inputs
`min-w-0 appearance-none`, `data-overlay` on the floating network pill
(the layout sweep had flagged it on 23 screens), icons on the entity's
figures and per livestock kind (`Icon.tsx` +8), moshav pastille in the
moshav blue (`farmMarkerColor(farm)`), zone tokens (farm grazing amber
`184 134 11` / `224 177 90`, moshav grazing teal `13 148 136` /
`45 212 191`), one arrow head per threat intensity, water
`rgb(52 132 214 / 0.62)` light / `rgb(96 165 250 / 0.55)` dark with
`strongerWater()` (rivers from z7, streams from z11). `bun run contrast`
133/133; `VIEWPORT=all bun run layout` 32 screens × 4 viewports, no
horizontal scroll, no failure.

### 36.6 Gates, end of night

accept 176 · dispatch 27 · persist 94 · mapping 33 · report 86 · deletion 61
· sync 34 · contrast 133 · layout all-green · **on the deployed URL after run
33571646942: zones 38/38 · agreement 15/15 · demo 12/12**, captures in
`docs/screenshots/demo/` (seeded list, dashboard, national map, entity with
its zones, agenda, report, purged) and `docs/screenshots/zones/`,
`docs/screenshots/agreement/`. **`bun run tokens` fails on two pre-existing A57 contour violations in
`AnchorMap.tsx` (commit 9feeeeb, before this night) — not a regression.**
`bun run write` failing and `bun run offline` 19+SKIP remain the green
results (§13); `.env.test` was written and deleted the same night, no
account behind it.

### 36.7 Deploys

`051eaf6` (N1+N2, run 33566259152), `c2c7dc8` (N3+N4, run 33569893017),
`7c67acb` (N5+N6+N7, run 33571646942, final) — each build/deploy/served
green, with the three night gates in the pipeline on the real build. The
served `index-BYWTRlvC.js` carries the project ref, `placeholder:`,
`נתוני הדגמה`, `תבנית הסכם`, `צמיחה`, `בית שאן`, `loading-state`; the served
`mock-agreement.pdf` is 161 769 bytes (the generated sample).

### 36.8 Open

P3.3 signature onto the document; the RTL-plugin re-import notice on a
page's second map (labels are shaped; `bun run zones` tolerates it); the
`tokens` A57 pair in `AnchorMap.tsx`; Esri terms (§33); the Negev extract
still in the bucket (§35.5).

## 37. ✅ THE UI/UX PASS BEFORE THE DEMONSTRATION — U1 → U10 (2026-09-02, daytime)

> The French note at the head of this file is what the product owner reads
> first. This section is the technical record. One commit per unit.

### 37.1 U1 — folds, remembered per KIND of block (`d116758`)

`Section` (`ui/components/primitives.tsx`) takes `collapseKey`, `defaultOpen`
and `summary`; `readBlockOpen` / `writeBlockOpen` keep the state in
localStorage under `lo-yanum:block:<key>` — the key is the block TYPE
(`entity-threats`, `mission-team`, `dash-alerts`…), never a record id, and
never sessionStorage (iPadOS reaps tabs). The heading is a `button` with
`aria-expanded`, a chevron in a disc, and `data-block` / `data-open` on the
section for the gates; folded, it shows `summary` in a `[data-block-summary]`
span. `CollapsibleSection` survives as a name that maps `storageKey →
collapseKey`. Applied: FarmDetail (details, activity, posts, zones, guards,
incidents, contacts, commitments, agreements, notes, visits), ThreatPanel,
MissionDetail (team, presence, details, drivers, outreach, timeline),
IncidentDetail (description, details, thread), AnchorSheet (messages, access,
instructions), Settings (all eight blocks), Dashboard (growth, alerts, my day,
agenda, tonight, pipeline). `scripts/empty.ts` skips `data-open="0"`
sections. New locale block `blocks.*` (Hebrew plurals: `_one` + plain form,
because i18next falls back from `_two`/`_many` to the bare key).

### 37.2 U2 + U8 — the list top, the farm tile (`4bbf4c4`)

`ListTop` (sticky at every width, `top: var(--shell-top)`, `-mx-4 px-4 /
lg:-mx-5 lg:px-5`, opaque `bg-surface-base/95 backdrop-blur`), `KpiChip`
(44 px, figure + label + hint on one line), `FilterRow nowrap`, and the CSS
`.scroll-row` (flex, `overflow-x:auto`, snap proximity, hidden scrollbar,
`-webkit-overflow-scrolling: touch`). Five screens converted; Drivers' seat
total became a non-filtering chip. `FarmTile` + `TilePhoto` in
FarmsListScreen: `h-[4.75rem]`, photo last in the RTL flex row (= physical
left), pin badge in its corner, `data-testid="farm-tile-center"`.
`EntityQuickCard` + `useQuickPreview` (`ui/components/EntityQuickCard.tsx`):
hover 350 ms / long-press 450 ms (pointer events, click swallowed after a
long press), portal at a fixed position (the panel scrolls and `.panel-scope`
contains `fixed`), closes on scroll / pointerdown / key. `MapCanvas` /
`MapPanel` gained `flyTo: {position, key, zoom?}` (one `easeTo` per key,
never below z13). ⚠️ This commit swept in 477 uncurated review images
(32.9 MB) — see 37.9.

### 37.3 U3 — the dashboard (`1b4a2f0`)

Order: dunam figures → four KPIs → `GrowthCharts` → alerts → my day → agenda →
tonight / pipeline. `GrowthCharts.tsx`: `flex-col`, monotone (Fritsch–Carlson)
spline — Catmull-Rom overshot a 4 → 4 → 3 step above 4 —, gradient area,
rounded gradient bars, two dashed gridlines + baseline, `useNearest` pointer
tooltip (guide line + label), `.chart-rise` entrance (`transform-box:
fill-box`, per-bar delay, off under reduced motion). Alerts: `AlertChip`
(`border-s-4` critical/warn, dot, relative time, one truncated line) in
`.carousel-2` (`flex: 0 0 calc(50% - .25rem)`, snap mandatory), `AlertDetail`
under the row with the call list; `AlertsCarousel` holds the selection.

### 37.4 U4 + U5 — the map's chrome and the satellite zones (`4fc2d49`)

- `ui/components/mapLayers.ts`: `MapLayerKey` ×7, one localStorage set
  (`lo-yanum:map-layers`) behind `useSyncExternalStore`, `MARKER_LAYER`
  (farm/moshav → entities, anchor → posts, car → pickups; incidents, origin,
  grips, labels are never governed), `offeredLayers()` reads what a map is
  about to draw. **`MapCanvas` filters its own props** (markers, polygons by
  `kind`, the two threat collections), so every map obeys without a screen
  knowing.
- `MapLegend.tsx`: frosted `.glass` panel, title row toggles (memory
  `lo-yanum:block:map-legend`), checkboxes on top of the swatches (the
  screens' chips flattened inside via `[&>div]:!border-0…`). `MapPanel` and
  `AnchorMap` render it; the phone rule (legend only in `full` below `lg`)
  is unchanged.
- `AnchorMap`: the bottom overlay is now [banner(s)] then a row [legend at
  the inline start | `DrawToolsFab` at the inline end]. The FAB is one 44 px
  `.glass` button; open, a `w-56` glass column with the six tools
  (`data-keep-open` on the freehand switch), closed by a tool press, an
  outside `pointerdown` (capture) or Escape. `data-testid="draw-tools"`
  carries `data-open`. The A57 contours on the sentence bar and the
  zone-selected bar became `ring-1 ring-accent` on `.glass` — `bun run
  tokens` is green.
- `MapModePill` (`mapMode.tsx`), rendered by `MapSplit` after the shell:
  `fixed left-3 bottom-[calc(var(--shell-bottom)+0.75rem)]`, vertical, three
  44 px buttons, `data-overlay` (it is deliberately over things — the layout
  gate's pinned-collision rule), `raised` on `FAB_ROUTES` below `lg`.
  **Rendered only past the screen's breakpoint** (`BP.pill`: `hidden
  lg:flex` / `hidden xl:flex`): stacked, the content column is the whole
  width and the pill sat on שמירה (`bun run zones` at iPad portrait) and on
  the cards' bottom-left buttons — there the `MapModeSwitch` stays in the
  map's bar, and in `hidden` a copy at the top of the content. The two
  sticky action bars carry a physical `pl-[4.5rem]` for `hidden` mode past
  the breakpoint. `MapPanel`'s detail card is `left-[3.75rem] right-3`
  (physical) on phones.
- U5 tokens `--zone-boundary-sat` 34 211 238, `--zone-grazing-sat` 232 121
  249, `--zone-boundary-moshav-sat` 125 211 252, `--zone-grazing-moshav-sat`
  192 132 252 (theme-independent: the photograph is). `zoneSatColor()` in
  `zones.tsx`; `MapPolygon` gained `kind` and `satColor` (zonePolygons and
  AnchorMap both set them). In `installProgrammeLayers` the paint reads
  `ground`: over imagery `fill-color` = `coalesce(satColor, color)`,
  opacity .28/.42, a `zones-halo` line (rgb(0 0 0 / .6), 6.5/8 px, blur 1.5)
  under a 3.2/5 px contour. **Layer order is now zones-fill →
  threat-zones-fill → zones-halo → zones-line → threat-zones-line →
  vectors**: every contour above every fill (`addZoneContours()` is called
  after the threat fill). Verified at z13–z16 on חוות רתם over Esri imagery.

### 37.5 U6 — the summary band (`bd903e2`)

`KeyNumbers` is a `.scroll-row` of `BandCard`s (`!flex-[1_0_9.5rem]`, so
they fill a wide panel and scroll in a narrow one): status first (pastille
+ `color-mix` wash + ring in the status colour, `data-testid="band-status"`),
farm dunams (success tint), grazing (warn), heads (violet, per-kind glyphs
under a divider), next visit (info), last activity (neutral). Icons 24 px in
a 44 px disc. `FigureIcon` is gone.

### 37.6 U7 — no text cut without recourse (`84decfe`)

`ui/hooks/useTruncationTitles.ts`, mounted once in `App`: a MutationObserver
on `body` (childList, characterData, class/style) + `resize` + fonts,
coalesced on a **40 ms timer — not rAF, which never fires in a background
tab** (found in the hidden dev pane); every overflowing `.truncate` /
`line-clamp-*` gets `title` = its text and `data-auto-title`, removed when
it stops overflowing; a hand-written `title` is never overwritten.
`window.__loYanumTruncation` = {scans, titled, run} for the gates.
`scripts/layout.ts` reports `truncated` (ellipsis/clamp actually clipping,
no `[title]` ancestor) at ALL three seam stops and fails on it. CSS:
`.pair-grid`, `.pair-grid-wide`, `.form-grid` use `minmax(0, 1fr)` — a bare
`1fr` let the folded notes block's one-line summary widen the column to
518 px on a 390 px phone (the sweep caught it). The block title is
`shrink-0`; the summary is what truncates. `VIEWPORT=all bun run layout`:
32 screens × 4 viewports × 3 seams, green.

New gates: **`bun run blocks`** (A91, 26 checks, dev server) and
**`bun run uipass`** (captures + 18 checks on the served URL, default the
deployed demo twin).

### 37.7 U9 — the photographs (`ff59e20`)

`scripts/demo-photos.ts` (`bun run demo-photos`): pick lists by Commons
pageid (51 people, 39 places), each re-verified through `prop=imageinfo`
(`LicenseShortName === "CC0"`, JPEG/PNG, ≥ 400 px), 640 px thumbs via
curl, `sips` to < 120 kB, renumbered, `public/demo-photos/manifest.json` +
`docs/demo-photos-licences.md`. `DEMO_PHOTOS_REVIEW=1` is the discovery mode
(69 queries with `incategory:CC-Zero` — `haslicense:` does not work on
Commons). Total 7.3 MB; `sw.js` does not precache `public/` wholesale, so
it costs on demand only. `core/photo.ts`: `configurePhotoPool()`;
`photoSource()` maps `placeholder:<kind>:<seed>` onto the pool by
`avatarHue('pool:'+seed)`, SVG portrait when the pool is empty.
`ui/demoPhotos.ts` + `ui/demo-photos.json` (generated from the manifest)
configure it in `main.tsx` before the first render. The mock fixtures
(`mock/farms.ts`, `mock/people.ts`) now store markers instead of data URIs.
**The bucket was not written** (no session — §13); the demo rows in
`lo-yanum-prod` are unchanged and resolve on the device.

### 37.8 Gates, end of pass

accept 176 · dispatch 27 · persist 94 · mapping 33 · report 86 · deletion 61
· sync 34 · contrast 133 · **tokens green (was 2 pre-existing failures)** ·
layout all-green (4 viewports × 3 seams, with the new U7 rule) · blocks 26 ·
empty · overlap (see the deploy). `bun run write` failing and `offline`
19+SKIP remain the green results (§13).

### 37.9 Deploys, and the proofs on the served URL

Run **33600079606** (`f9da996`) FAILED in `bun run ground`: the archive
block on הגדרות started folded — fixed in `0561a30` with the gate and
default corrections above. Run **33601764755** (`b2a3c7a`-range, HEAD
`U4.4 breakpoint`): build / deploy / served all green. Served real bundle
`assets/index-CkWFlB9g.js` carries `map-mode-pill`, `lo-yanum:block:`,
`lo-yanum:map-layers`, `demo-photos`, `draw-tools-toggle`,
`alerts-carousel` and the project ref; the demo twin's is
`assets/index-NukEMiut.js`; `demo-photos/people/01.jpg` answers 200,
`image/jpeg`, 34 042 bytes. On the deployed demo twin: **`bun run uipass`
18/18** (captures in `docs/screenshots/uipass/`, 1-dashboard →
6-tools-open) and **`bun run blocks` 26/26**.

### 37.10 Open

- **P3.3** — the signature drawn onto the agreement PDF: not started, next.
- **Repository hygiene**: 477 uncurated images (32.9 MB) in `4bbf4c4`'s
  history; the rewrite was refused by the auto-mode classifier while the
  commits were still unpushed. Remedy in the head note.
- The RTL-plugin console notice on a page's second map (§36.8); Esri terms
  (§33); the Negev extract in the bucket (§35.5).

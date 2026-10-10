# AX2 — Inventaire des écrans du coordinateur, avant toute modification

> Relevé le 2026-10-10 sur le commit `e8570e5`, le code servi à ce moment-là
> (AW). Deux sources :
> 1. **la lecture du code** : les 40 fichiers de `src/ui/screens/coordinator/`,
>    la coquille `layouts.tsx` et les composants communs ;
> 2. **une sonde qui parcourt l'application** (`scripts/axmap.ts`) sur le
>    jumeau de démonstration à 1 440 px. Elle part du tableau de bord, suit
>    chaque lien, ouvre chaque menu « ⋯ » et « + » et clique chacune de leurs
>    entrées. Résultat : `docs/ax/atteignable-avant.json`, **35 écrans
>    atteignables**. C'est la référence d'A344.

## 0. Ce que l'inventaire dit d'abord

**Le problème n'est pas le nombre d'écrans. C'est qu'aucun n'a de place
dans un ensemble.**

- **Le rail ne dit rien.** À 1 440 px, il montre **onze icônes sans
  libellé**, sans regroupement, dans un ordre qui est celui de l'arrivée des
  passes : tableau de bord, agenda, fermes, contacts, itinéraire,
  couverture, volontaires, chauffeurs, gardes, incidents, réglages. Il se
  déplie (`nav.expand`), mais il revient replié à chaque ouverture. Le PO
  navigue donc à l'icône.
- **Une étape entière du métier n'a pas d'écran : les institutions.** Elles
  vivent au fond de la carte de couverture, dans une liste masquée en mode
  « פגישה », derrière des onglets qui sont en fait un filtre. On y arrive
  par la carte, par l'import ou par l'écran d'ajout, jamais par leur nom.
- **« Ajouter » existe à douze endroits**, avec trois sens différents. Par
  exemple, la tuile « חוות » de l'écran d'ajout crée une *piste* et non une
  ferme.
- **Les explications sont partout, et toujours ouvertes** : environ 290
  paragraphes « muted », 110 clés `*Hint`, 15 sous-titres de page qui
  expliquent. Il n'existe aucune forme repliable réservée aux aides.

## 1. Les écrans, un par un

Légende : **Entrée** = d'où on y arrive ; **Retour** = comment on en
revient. « Rail » = la navigation latérale ; « + » = le bouton flottant de
création.

### Rail (11 entrées)

| # | Écran | Route | À quoi il sert | Ce qu'on y fait |
|---|---|---|---|---|
| 1 | לוח בקרה | `/coordinator` | Vue d'ensemble : dounams, alertes, ma journée, agenda | Rapports ; « + » à 9 entrées ; tuiles vers fermes, volontaires, gardes, incidents ; demandes entrantes |
| 2 | יומן | `/agenda` | Calendrier jour, semaine ou mois des gardes, visites et réunions | Créer sur un créneau (garde, visite, réunion, itinéraire du jour) ; glisser-déposer ; « + » à 3 entrées |
| 3 | חוות | `/farms` | Liste des fermes avec carte, ou tableau en plein contenu | Recherche, tri, filtres ; « ⋯ » à 5 entrées (4 imports + export) ; « + » à 2 entrées |
| 4 | אנשי קשר לטיפול | `/leads` | Salle d'attente des pistes (fermes pas encore signées) | Statut en un toucher, appel, WhatsApp ; « ⋯ » : réunion, conversion, suppression ; dépliage notes et région |
| 5 | תכנון מסלול | `/route` | Tournée du jour parmi des fiches existantes | Choix des fermes, ordre, horaires, Waze, Google Maps, enregistrement par date |
| 6 | מפת כיסוי | `/coverage` | Liens institution ↔ ferme dans un rayon routier | Rayon, familles visibles, compteurs ; liste et fiche des institutions ; confirmation d'engagement |
| 7 | מתנדבים | `/volunteers` | Liste des volontaires avec carte | Filtres (6 tuiles + région, yeshiva, localité) ; édition ; « ⋯ » import + groupement ; « + » à 2 entrées |
| 8 | נהגים מתנדבים | `/drivers` | Liste des chauffeurs | Même gabarit ; « ⋯ » import |
| 9 | שמירות | `/missions` | Liste des gardes | Période et statut ; ouvrir une garde ; « + » |
| 10 | יומן אירועים | `/incidents` | Journal des incidents | Gravité, ouverts, semaine ou mois ; « + » |
| 11 | הגדרות | `/settings` | 7 groupes de réglages | Dont l'édition des régions, la marge de route, le point de départ |

### Hors rail

| Écran | Route | Entrée | Retour |
|---|---|---|---|
| Fiche ferme (6 onglets) | `/farms/:id` | Liste, carte, tableau de bord, agenda, ma journée, demandes, gardes | ✅ vers la liste |
| Formulaire ferme | `/farms/new`, `/farms/:id/edit` | « + » (×2), fiche, planificateur, visite vide, réunion, itinéraire libre, assistant de garde | ✅ |
| Fiche poste | `/farms/:id/anchors/:id` | Fiche ferme, garde | ⚠️ lien texte fait main ; **aucun bouton « modifier »** |
| Formulaire poste | `/farms/:id/anchors/:id/edit` | Fiche ferme, assistant | ✅ ; la route `anchors/new` n'a **aucune entrée** |
| Garde | `/missions/:id` | Liste, fiche ferme, tableau de bord, incident | ⚠️ lien texte vers la liste, **même si on venait d'une ferme** |
| Assistant de garde | `/missions/new` | « + » ×3, agenda, garde | ⚠️ revient toujours à la liste des gardes ; **aucun départ depuis une ferme** |
| Incident | `/incidents/:id` | Liste, fiche ferme, tableau de bord | ⚠️ lien texte ; le nom de la ferme n'est pas un lien |
| Visite | `/agenda/visit/new\|:id` | « + », agenda (×3), fiche ferme (×2), planificateur | ✅ historique ; ⚠️ la ferme présélectionnée est la première de la liste |
| Réunion | `/agenda/meeting/new\|:id` | « + », agenda, contact (« קביעת פגישה ») | ✅ |
| Volontaire | `/volunteers/new\|:id/edit` | « + » (×2), tuile | ✅ |
| Chauffeur | `/drivers/new\|:id/edit` | « + », tuile | ✅ |
| **Ajout de contacts** | `/add` | « + » tableau de bord, « + » volontaires, contacts, couverture | ⛔ **aucun retour** |
| Itinéraire libre | `/route/free` | **Seulement** le planificateur | ✅ vers le planificateur |
| Édition des régions | `/settings/regions` | **Seulement** Réglages › מפה ואזורים › עריכת אזורים (4 gestes) | ✅ vers les réglages |
| Export | `/export` | **Seulement** fermes › ⋯ | ✅ |
| Import fermes, volontaires, chauffeurs | `/import/:kind` | ⋯ de chaque liste ; onglets d'import | ⚠️ **« חזרה לרשימה » mène TOUJOURS aux volontaires** |
| Import prospection, signatures | `/import/prospection\|signatures` | fermes › ⋯ ; onglets | ✅ ; ⚠️ l'écran de fin n'a pas de lien vers la liste |
| Import association | `/import/association` | **Seulement** l'onglet d'import (absent du ⋯) | ✅ |
| Import portail | `/import/portal` | **Seulement** fermes › ⋯ | ✅ ; absent des onglets d'import |
| Import institutions | `/import/institutions` | **Seulement** la carte de couverture | ✅ ; absent des onglets d'import |

## 2. Doublons et chevauchements

| # | Ce qui se fait à plusieurs endroits | Où | Ce que ça coûte |
|---|---|---|---|
| D1 | **Ajouter une ferme** | « + » du tableau de bord (2 entrées), « + » des fermes (2 entrées), écran d'ajout (crée une **piste**), contacts → conversion, réunion → « הפיכה לחווה », visite vide, planificateur, itinéraire libre, épingle rapide, 5 imports | Douze portes. L'une d'elles, la tuile « חוות » de l'écran d'ajout, ne crée pas ce qu'elle annonce |
| D2 | **Ajouter un volontaire** | « + » → מתנדב חדש ; « + » → הוספת אנשי קשר (**même libellé `add.entry` deux fois** sur l'écran des volontaires) ; import | Le formulaire ne connaît pas `institution_id` : seul l'écran d'ajout rattache à une institution |
| D3 | **Ajouter une institution** | Écran d'ajout, création sur place dans ce même écran, import, épingle rapide | Aucune n'est dans le rail |
| D4 | **Poser un rendez-vous** | « + » ×2, créneau d'agenda, fiche ferme **×2** (en-tête et onglet יומן), planificateur, contact → **réunion** (pas visite) | Depuis un contact, on obtient une réunion générale, pas une visite de ferme |
| D5 | **Statut d'un contact** | Onglets en haut ET cases de statut sur chaque carte | Deux rangées qui montrent la même chose |
| D6 | **Statut d'une ferme** | Tuiles du haut de la liste, légende de la carte avec comptes, liens du tableau de bord | Trois endroits |
| D7 | **Région d'une ferme** | Colonne « אזור » = texte libre `farm.region` ; filtre = `farmRegion()` (polygone) ; fiche = une troisième règle | **La colonne et le filtre ne disent pas la même chose** (AX9) |
| D8 | **Planifier une tournée** | תכנון מסלול (fiches) et מסלול חופשי (points), chacun avec sa carte, son tracé et son Google Maps ; la couverture trace un troisième itinéraire | Les deux ne calculent pas pareil : vol d'oiseau × 1,35 contre route + marge |
| D9 | **Itinéraire du jour** | « Ma journée » sur le tableau de bord, la même dans la vue jour de l'agenda, « créer l'itinéraire » dans le menu de créneau | Tolérable : c'est le même bloc partagé |
| D10 | **Demandes entrantes** | Bandeau global, bloc du tableau de bord, tuile des fermes, bandeau de la fiche | Voulu en AQ (une demande ne doit pas se perdre) — **gardé** |
| D11 | **Imports** | 7 écrans d'import ; 6 seulement dans la barre d'onglets ; portail et institutions hors de la barre ; association seulement dans la barre | Introuvables les uns depuis les autres |
| D12 | **Sélecteur de région** | `RegionFilter` et le `<select>` propre à l'export | Deux composants |

## 3. Écrans à réunir, écrans à séparer

**À réunir :**
- **Ajouter quoi que ce soit** → **un seul écran**, `/coordinator/add`, par
  étapes (AX10). Le « + » garde les *événements* (garde, visite, réunion,
  incident), qui ne sont pas des contacts.
- **Les statuts d'un contact** → **une seule rangée de filtres**. Le
  changement de statut reste sur la ligne.
- **Les filtres des fermes** → **une seule zone** (AX3.4).
- **Les imports** → un seul écran d'import. **Seconde partie**, voir § 6.
- **Les deux planificateurs** → un seul écran à deux sources, fiches et
  points libres. **Seconde partie**.

**À séparer :**
- **Les institutions sortent de la carte de couverture** et prennent leur
  écran, `/coordinator/institutions` : c'est l'étape 1 du métier. La carte
  garde sa liste, qui sert à apparier.
- **Les réglages qui sont du métier** quittent les réglages pour l'écran où
  ils servent : rayon, unité et durée de nuit dans la couverture ; marge et
  point de départ dans l'itinéraire ; régions près des fermes. Le rayon y
  est déjà. **Le reste en seconde partie.**

## 4. Chemins sans retour

| Écran | Ce qui manque | Correction (AX) |
|---|---|---|
| `/add` | Aucun retour | Flèche vers l'écran d'où l'on vient |
| `/missions/:id` | Lien texte vers la liste, même en venant d'une ferme | Flèche de `PageHeader` qui suit l'historique |
| `/incidents/:id` | Idem | Idem |
| `/farms/:id/anchors/:id` | Lien fait main, pas de « modifier » | Flèche commune et bouton « עריכה » |
| `/import/:kind` (fin) | « חזרה לרשימה » mène toujours aux volontaires | La liste du type importé |
| `/settings/regions` | Arrivée par un seul chemin, à 4 gestes | Aussi depuis fermes › ⋯ « עריכת גבולות אזורים » |

## 5. Clics des gestes les plus fréquents (avant)

Comptés depuis le tableau de bord, en clics de souris ou touchers, la saisie
au clavier non comptée. **Mesurés par le robot de la porte (A354)** sur le
build d'avant, et pas seulement comptés à la main.

| Geste | Chemin avant | Clics avant |
|---|---|---:|
| G1 · Changer le statut d'un contact | rail אנשי קשר → case de statut | 2 |
| G2 · Ajouter une ferme | « + » → חווה חדשה → (nom) → שמירה | 3 |
| G3 · Voir les gardes d'une ferme | rail חוות → la ferme → onglet שמירות | 3 |
| G4 · Poser un rendez-vous de visite | rail חוות → la ferme → תכנון ביקור → שמירה | 4 |
| G5 · Écrire un commentaire sur un contact | rail אנשי קשר → le **nom** (rien ne l'annonce) → notes | 2, **si on le sait** |

## 6. L'architecture proposée

### 6.1 La colonne vertébrale : trois temps, et non cinq étapes

Le métier du PO est une suite de cinq étapes :
1. démarcher les institutions ;
2. démarcher les fermes ;
3. obtenir les listes de volontaires ;
4. apparier ;
5. faire exécuter les gardes.

**Je n'en fais pas cinq entrées de rail numérotées.** Trois raisons :

- **Ce n'est pas une suite, ce sont des flux parallèles.** Les fermes
  arrivent « en flux continu, qui ne s'arrêtera jamais », les institutions
  aussi. Un rail numéroté laisserait croire qu'on termine l'étape 1 avant
  d'ouvrir l'étape 2.
- **Les étapes 1, 2 et 3 ont la même forme** : des gens qu'on appelle, qu'on
  qualifie, qui deviennent des fiches. Ce sont trois listes sœurs, et non
  trois temps.
- **L'étape 5 sera le gros du travail.** Elle ne doit pas être la dernière
  ligne d'une liste de cinq : c'est la destination, et elle grandira.

La navigation suit donc **les trois temps du métier**, chacun avec son
titre, dans l'ordre du métier :

```
  לוח בקרה              ← ce qui demande mon attention aujourd'hui
  יומן

  גיוס  (recruter : qui travaille avec nous)
    אנשי קשר לטיפול     ← les pistes à appeler (fermes)
    חוות                ← étape 2
    מוסדות              ← étape 1 — ÉCRAN NEUF
    מתנדבים             ← étape 3 (rattachés à leur institution)
    נהגים מתנדבים

  תכנון  (préparer : qui va où)
    מפת כיסוי           ← étape 4 : apparier fermes et institutions
    תכנון מסלול         ← la tournée de démarchage (et l'itinéraire libre)

  ביצוע  (exécuter : les gardes)
    שמירות              ← étape 5
    יומן אירועים

  הגדרות
```

- **Les libellés sont visibles par défaut** dès que la largeur le permet
  (≥ 1 280 px, soit l'iPad paysage et l'ordinateur). Replier le rail reste
  possible, et le choix est **gardé**. En rail replié, les trois titres
  deviennent des séparateurs.
- **Le menu du téléphone** prend les mêmes trois groupes.

### 6.2 Les règles qui en découlent (et que la porte AX vérifie)

1. **Un onglet découpe le contenu, un filtre restreint une liste.** Un écran
   porte au plus **une** zone de filtres (AX3).
2. **Un chiffre est un chiffre, un filtre est un filtre.** Une tuile
   cliquable qui filtre se présente comme un filtre, avec son compte. Une
   statistique pure ne se clique pas (AX3.5).
3. **L'aide se range derrière ⓘ.** Un seul composant, `InfoTip`, partout
   (AX4).
4. **Un tableau se lit de gauche à droite** (en hébreu, de droite à gauche) :
   une ligne reste une ligne tant que la largeur le permet (AX6).
5. **Ajouter, c'est `/add`** (AX10).
6. **Chaque écran hors rail a une flèche de retour**, et elle suit le chemin
   réellement pris.

### 6.3 Trop vaste pour une passe : le découpage

L'inventaire le montre : tout ranger en une passe serait bâclé. Je découpe :

**AX — cette passe** : tout ce que le PO a nommé, plus ce qui est
nécessaire pour que l'ensemble tienne :
- le rail en trois temps, avec ses libellés ;
- l'écran des institutions ;
- la règle onglets/filtres ;
- une seule zone de filtres sur les fermes ;
- ⓘ partout ;
- le tableau des contacts ;
- les lignes en grand écran ;
- kilomètres ou minutes, et la nuit ;
- les itinéraires enregistrés ;
- la colonne région ;
- un seul point d'ajout ;
- les chemins sans retour ;
- les trois défauts trouvés en chemin : la clé `lo-yanum:coverage` partagée
  par deux réglages, le retour des imports vers les volontaires, l'âge à 0
  qui bloque l'enregistrement.

**AY — la passe suivante (proposée)** : ce que l'inventaire a trouvé mais que
le PO n'a pas nommé, et qui demande une passe entière :
1. **un seul écran d'import** pour les 7 imports, avec le type choisi
   d'abord, sur le modèle de `/add` ;
2. **un seul planificateur**, fiches et points libres, avec un seul calcul
   (route + marge, depuis le point de départ réglé) ;
3. **les réglages métier** qui rejoignent leur écran (seuil d'oubli dans
   fermes, gabarits SMS dans gardes, accord dans fermes) ;
4. **une garde se crée depuis la ferme** (`/missions/new?farm=`), et
   l'onglet שמירות de la fiche le propose ;
5. **le formulaire volontaire relié à la table `institutions`**, au lieu du
   texte libre `yeshiva` ;
6. **une seule règle de région**, sur la fiche comme ailleurs.

# AZ4 — Ce que les fusions d'AY ont laissé au bord du chemin

Méthode : chaque ancien écran (`905158c`, l'état d'avant AY ; `cf80a04^` pour
l'itinéraire libre) comparé au nouveau, **geste par geste** — chaque bouton,
lien, menu, filtre, tri, champ, information, compteur — par quatre audits en
lecture seule du code, puis vérifié à la main. Les portes de rendu (`axui`
A354, `aqui`) en ont trouvé deux de plus.

Légende : ✅ remis · ↪ déplacé (même geste ailleurs, rien de perdu) ·
⚖ gardé tel quel, décision argumentée.

## 1. Le planificateur unique (itinéraire libre + tournée, AY12)

| # | Ce qui ne se faisait plus | État |
|---|---|---|
| 0 | **Envoyer l'heure d'arrivée par SMS / WhatsApp depuis une étape** | ✅ boutons ✉ et WhatsApp sur chaque étape (`route-stop-sms`, `route-stop-whatsapp`), même message `freeRoute.messageTemplate` |
| 1 | Choisir l'ordre de visite (↑ ↓) ; l'ordre le plus court n'était que *proposé* | voir § 1 bis |
| 2 | Durée sur place réglable (tournée et étape) — figée à 45 min | voir § 1 bis |
| 3 | Heures d'arrivée calculées par la route (elles l'étaient à vol d'oiseau × 1,35) | voir § 1 bis |
| 4 | Heure de retour (« חזרה בסביבות ») | voir § 1 bis |
| 5 | Coller plusieurs liens d'un coup (seul le premier était gardé, en silence) | voir § 1 bis |
| 6 | Corriger le nom / le téléphone d'un point libre après l'ajout | voir § 1 bis |
| 7 | « Créer une fiche ferme » depuis une étape | voir § 1 bis |
| 8 | Le travail en cours survit à la navigation (brouillon) | voir § 1 bis |
| 9 | Supprimer un ancien itinéraire libre enregistré | voir § 1 bis |
| 10 | Charger un itinéraire libre : il s'AJOUTAIT (doublons), sans départ ni heure | voir § 1 bis |
| 11 | Un point de départ propre à une tournée | voir § 1 bis |
| 12 | L'état du calcul par la route (tracé indisponible, estimation, hors réseau) | voir § 1 bis |
| 13 | Les distances à vol d'oiseau (total, étape) | voir § 1 bis |
| 14 | Nombre d'étapes d'une tournée enregistrée (sans les points libres) | voir § 1 bis |
| 15 | « Nouvelle tournée » absente avec seulement des points libres | voir § 1 bis |
| 16 | Heure d'arrivée dans la bulle du repère ; notes « rien ne sort de l'appareil » | voir § 1 bis |

## 2. L'écran d'import unique (AY12.1)

| # | Ce qui ne se faisait plus | État |
|---|---|---|
| 1 | **Créer quand même une fiche signalée « déjà présente »** (deux « דוד כהן », un agriculteur aussi volontaire) | ✅ case « ליצור בכל זאת כרטיס חדש (לא לאחד) » sous la mention de doublon (`add-draft-force`) ; la fiche sort de la fusion |
| 2 | Depuis le filtre נהגים, « ייבוא » ouvrait le modèle VOLONTAIRES (véhicule et places perdus) | ✅ `?kind=drivers` quand le filtre est allumé |
| 3 | Portail, prospection, signatures à un toucher depuis חוות › ⋯ | ✅ les trois entrées remises sous « ייבוא » (`farms-import-portal`, `-prospection`, `-signatures`) |
| 4 | Le retour de l'écran d'import menait toujours au tableau de bord | ✅ `?from=` : venu des fermes, des volontaires, des institutions, on y revient |
| ↪ | Changer de fichier en cours d'import (barre d'onglets) | « שינוי » sur le bandeau du fichier choisi |
| ↪ | Anciennes adresses `/coordinator/import/<fichier>` | redirigées, paramètres conservés |

## 3. Volontaires + conducteurs (AY4)

| # | Ce qui ne se faisait plus / ne se voyait plus | État |
|---|---|---|
| 1 | Filtre « פנויים הלילה » (conducteurs) | ✅ pastille, conducteurs isolés |
| 2 | Filtre « 7+ מקומות » et total des places | ✅ pastille + « N מקומות ברכבים » à côté du compteur |
| 3 | Véhicule, places, téléphone sur la vignette | ✅ un conducteur se situe par sa voiture ; bouton d'appel sur la vignette |
| 4 | Filtre « רישיון + רכב » | ✅ |
| 5 | Permis et voiture, visibles | ✅ colonne (icônes) + ligne de l'aperçu |
| 6 | Courriel : affiché, cliquable, ✉ | ✅ colonne, aperçu, action ✉ |
| 7 | « קיבוץ לפי ישיבה » (en-têtes repliables avec compte) | ✅ entrée du ⋯, `EntityTable.groupOf`, tableau ET vignettes |
| 8 | Filtre par institution : les volontaires rattachés par le seul NOM de la ישיבה | ✅ même règle que la fiche de l'institution (`comparableInstitutionName`) ; comptes dans la liste |
| 9 | Filtre « סמארטפון » | ✅ |
| 10 | Type de téléphone (כשר / סמארטפון) par ligne | ✅ icône dans la colonne téléphone + aperçu |
| 11 | Chercher par véhicule | ✅ |
| 12 | Âge, disponibilités, note de disponibilité dans la liste ; « בכל זמן » | ✅ colonnes (qui cèdent sous le nom) ; « בכל זמן » / « — » |
| 13 | Tri par activité : les « jamais actifs » restent en bas dans les deux sens | ✅ |
| 14 | Courriel et notes d'un conducteur sans fiche volontaire | ✅ dans l'aperçu |
| 15 | Créer un conducteur sans fiche volontaire | ⚖ gardé : décision d'AY4 (« un conducteur est un volontaire qui conduit ») ; la fiche existante d'un tel conducteur reste modifiable |
| 16 | `/coordinator/drivers?new=1` | ✅ ouvre « נהג חדש » |
| 17 | `?drivers=1` restait dans l'adresse après avoir relâché le filtre | ✅ retiré |
| ↪ | Appeler / WhatsApp, historique, archiver, supprimer | colonne téléphone, aperçu, ⋯ (annulables désormais) |

## 4. Les cinq listes sous un tableau commun (AY3)

| # | Ce qui ne se faisait plus / ne se voyait plus | État |
|---|---|---|
| 1 | **La forme du tableau** : fond propre, en-tête collé, lignes qui se détachent | ✅ AZ1 |
| 2 | **Des vignettes lisibles** à côté de la carte | ✅ AZ2 |
| 3 | Changer le statut d'un contact d'un toucher quand la carte est visible | ✅ les statuts sous la vignette (`tileFoot`) |
| 4 | Écrire la note d'un contact sans quitter la liste (la ligne dépliée d'AX) | ✅ la note s'écrit dans l'aperçu |
| 5 | Confirmer une institution d'un toucher quand la carte est visible | ✅ « אישור » sur la vignette |
| 6 | La demande entrante distincte (liseré) — en tableau (un `<tr>` ne dessine pas de bordure) et en vignette | ✅ liseré sur la première cellule ; teinte et anneau sur la vignette (`farm-tile-intake`) |
| 7 | Les vignettes des fermes s'appelaient `farm-tile` (portes `aqui`, `adui`, `aodeployed`) | ✅ identifiant rétabli |
| 8 | Les compteurs incluaient le jeu d'essai (fermes, institutions, gardes) | ✅ hors compteurs, hors dounams |
| ↪ | Toucher une ligne ouvrait la fiche | ouvre l'APERÇU (demande du PO en AY3) ; la fiche est à un geste (« לכרטיס המלא ») — compté dans `axui` A354 |

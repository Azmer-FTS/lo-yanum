# Lo Yanum — mise en service sur le terrain

> État au 2026-08-31, après P2.6 (bascule Supabase) et P2.5b (couche hors
> ligne). Ce document est destiné au **product owner** et au **coordinateur**,
> pas aux développeurs — l'état technique vit dans `ETAT.md`.

---

## 1. Les deux adresses

| | Adresse | Ce que c'est |
|---|---|---|
| **L'application** | https://azmer-fts.github.io/lo-yanum/ | Le vrai outil. Demande une connexion. |
| **La démo gelée** | https://azmer-fts.github.io/lo-yanum/poc/ | Le prototype, figé le 2026-08-30. Aucune connexion, données fictives. Ne bouge plus jamais. |

**La démo est là pour montrer, l'application est là pour travailler.** Les 12
fermes et les 300 bénévoles que l'on voit dans la démo n'existent que dans le
navigateur : personne ne les a saisis et rien n'en sort. C'est l'adresse à
ouvrir devant un donateur ou un agriculteur qu'on veut convaincre.

⚠️ **L'application réelle est VIDE, et c'est voulu.** La base de données n'a
jamais été importée : à la première connexion, tous les écrans affichent leur
état vide. Ce n'est pas une panne, c'est le point de départ. L'import des
vraies données est l'étape P3.1.

---

## 2. Première connexion — procédure

Un seul compte existe en phase 1, celui du coordinateur. **L'inscription libre
est désactivée** : personne ne peut créer de compte, ni depuis l'application ni
ailleurs. Un nouveau compte se crée uniquement dans le tableau de bord
Supabase, par le product owner.

1. Ouvrir **https://azmer-fts.github.io/lo-yanum/** sur l'appareil.
2. L'écran de connexion s'affiche — en hébreu, « כניסה למערכת ».
3. Saisir l'adresse **dov@serialkolors.com** et le mot de passe choisi par le
   product owner dans le tableau de bord Supabase.
   · Ce mot de passe n'est écrit nulle part dans le projet. Aucun script de
     vérification n'en a besoin, et aucun ne l'a jamais eu.
   · S'il est perdu, il se réinitialise dans Supabase → Authentication →
     Users → l'utilisateur → *Reset password*.
4. **Un refus dit toujours la même chose** — « כתובת המייל או הסיסמה שגויות » —
   qu'il s'agisse d'une adresse inconnue ou d'un mot de passe faux. C'est
   délibéré : distinguer les deux dirait à un attaquant quelles adresses
   existent.
5. Une fois connecté, le tableau de bord du coordinateur s'ouvre directement.
   Il n'y a pas de sélecteur de rôle : c'est un artefact de la démo.

### Ce qu'il faut vérifier à la toute première connexion

| # | Vérification | Ce qu'on doit voir |
|---|---|---|
| 1 | Le bandeau rouge « החשבון מחובר אך אין לו הרשאות » **n'apparaît pas** | S'il apparaît, le compte est authentifié mais n'a pas de rôle : c'est la ligne `app_users` qui manque. Voir `ETAT.md`. |
| 2 | Les écrans sont vides | Normal — la base n'a pas encore été importée. |
| 3 | Créer une ferme de test, puis **recharger la page** | La ferme est toujours là. C'est la preuve que l'écriture atteint le serveur. |
| 4 | Supprimer cette ferme de test | Pour ne pas la retrouver mélangée au vrai import. |
| 5 | En bas du rail de gauche, l'adresse du compte est affichée | Pour savoir sur quel compte on est, sur un appareil partagé. |

---

## 3. Check-list terrain, appareil par appareil

### 3.1 — iPad du coordinateur (l'appareil principal)

| # | À faire | Pourquoi |
|---|---|---|
| 1 | Installer l'application en PWA (§4) | Pour l'avoir en icône, plein écran, et pour que le mode hors ligne s'installe. |
| 2 | Se connecter **une fois avec du réseau** | Une seule ouverture en ligne suffit ensuite à survivre à une coupure. |
| 3 | Ouvrir chaque écran une fois, avec du réseau | Cela remplit le cache : ce qui a été regardé reste consultable hors ligne. |
| 4 | Faire défiler la carte sur la zone de travail (Néguev nord et centre) | Le fond de carte se met en cache **uniquement là où on a regardé**. Le téléchargement d'un seul fichier couvrant tout le sud arrive à l'étape suivante (PMTiles). |
| 5 | Passer l'iPad en mode avion et recharger | L'application doit s'ouvrir, rester connectée et afficher les données. Si elle affiche l'écran de connexion, quelque chose ne va pas — le signaler. |
| 6 | Toujours en mode avion, modifier quelque chose | Un badge bleu « N ממתינים לסנכרון » apparaît en haut du rail. |
| 7 | Rétablir le réseau | Le badge disparaît tout seul, sans rien toucher. La modification est partie. |
| 8 | **Ne pas se déconnecter avant de partir sur le terrain** | Se déconnecter **efface volontairement** le cache et les modifications en attente. C'est ce qui protège l'appareil s'il est prêté ; c'est aussi ce qu'il ne faut pas faire par réflexe avant de partir. |

### 3.2 — Téléphone du coordinateur (appareil de secours)

| # | À faire | Pourquoi |
|---|---|---|
| 1 | Installer en PWA, se connecter une fois avec du réseau | Même compte, même données. |
| 2 | Vérifier que le mode paysage et le mode portrait sont tous deux lisibles | Les écrans terrain sont conçus pour une colonne de téléphone. |
| 3 | Ne pas travailler sur les deux appareils en même temps hors ligne | La règle de conflit est « le dernier arrivé gagne, par fiche entière ». Deux appareils modifiant la même ferme hors réseau : l'un des deux perdra sa version. |

### 3.3 — Téléphone d'un agriculteur / d'un bénévole / d'un conducteur

**Rien à faire pour l'instant.** Ces personnes n'ont pas de compte : la phase 1
n'en prévoit qu'un seul, celui du coordinateur. Elles sont contactées par
WhatsApp, SMS ou e-mail depuis le centre d'envoi de l'application — le
coordinateur appuie, son propre téléphone envoie. Les comptes pour ces rôles
sont le Lot 4.

### 3.4 — Poste fixe (ordinateur du bureau)

| # | À faire | Pourquoi |
|---|---|---|
| 1 | Ouvrir l'application dans le navigateur, se connecter | C'est le poste sur lequel se fera l'import des vraies données (P3.1) et l'édition en volume. |
| 2 | Vérifier la lisibilité en plein écran large | La carte est à gauche, le contenu à droite, et la séparation entre les deux se **tire à la souris**. |
| 3 | Ne pas installer la PWA ici | Inutile : ce poste a toujours du réseau. |

---

## 4. Installer l'application sur l'iPad (PWA)

L'application n'est pas sur l'App Store et n'a pas à y être. Elle s'installe
depuis Safari, en trois gestes, et se comporte ensuite comme une application :
icône sur l'écran d'accueil, plein écran sans barre d'adresse, et surtout le
mode hors ligne.

1. Ouvrir **Safari** (et non Chrome : sur iPad, seul Safari sait installer une
   application web).
2. Aller sur **https://azmer-fts.github.io/lo-yanum/**.
3. Attendre le chargement complet — c'est ce chargement qui installe le
   mécanisme hors ligne.
4. Toucher le bouton **Partager** (le carré avec une flèche vers le haut, en
   haut de l'écran).
5. Faire défiler et choisir **« Sur l'écran d'accueil »** / *Add to Home
   Screen*.
6. Le nom proposé est **לא ינום**. Le garder, puis toucher **Ajouter**.
7. Fermer Safari. L'icône est sur l'écran d'accueil.
8. **Ouvrir l'application par son icône et se connecter là.** C'est important :
   l'application installée a son propre espace de stockage, séparé de Safari.
   Une connexion faite dans Safari ne la suit pas.
9. Vérifier une fois : mode avion, ouvrir l'icône. L'application doit
   s'ouvrir et rester connectée.

**Si l'option « Sur l'écran d'accueil » n'apparaît pas :** vérifier qu'on est
bien dans Safari et sur `https://` (jamais `http://`), et que la navigation
privée est désactivée — elle bloque le stockage dont dépend le mode hors ligne.

---

## 5. Ce que l'application sait faire sans réseau, et ce qu'elle ne sait pas

| Sans réseau, ça marche | Sans réseau, ça ne marche pas |
|---|---|
| Ouvrir l'application, rester connecté | Se connecter pour la **première fois** — la porte a besoin du serveur |
| Consulter fermes, gardes, bénévoles, conducteurs, incidents, agenda | Voir une donnée saisie sur un **autre** appareil depuis la coupure |
| Créer et modifier — tout est gardé et part au retour du réseau | Voir une **photo** ou un **document** qui n'a pas déjà été ouvert |
| Le fond de carte, **là où on a déjà regardé** | Le fond de carte ailleurs — jusqu'au fichier unique à télécharger (étape suivante) |
| Ouvrir WhatsApp / SMS / e-mail préremplis | Les **envoyer** — c'est le téléphone qui envoie, il lui faut du réseau |

**La règle en une phrase :** ce qui a été vu reste visible, ce qui est écrit
n'est jamais perdu, et le rattrapage se fait tout seul au retour du réseau.

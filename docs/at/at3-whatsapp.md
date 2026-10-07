# AT3 — Relier WhatsApp à l'application : la réponse franche

**Question du PO** : Tamir lui envoie des contacts par WhatsApp ; peut-on les
faire arriver seuls dans « אנשי קשר לטיפול » au lieu de copier-coller ?

## Ce qui n'existe pas

- **WhatsApp n'ouvre PAS les conversations personnelles à une application
  tierce.** Aucune API ne permet à Lo Yanum de lire les messages que Tamir
  envoie au téléphone personnel du PO. Les « outils » qui le promettent
  automatisent WhatsApp Web avec le compte du PO : contraire aux conditions de
  WhatsApp, risque de blocage du numéro. Écarté.
- Une PWA ne peut pas « écouter » WhatsApp en arrière-plan, ni sur iPhone ni
  sur Android.

## Ce qui existe, chiffré

| Chemin | Comment | Coût | Limite |
|---|---|---|---|
| **A. Collage amélioré** (fait dans AT) | Copier le message ou la carte de contact, « הדבקת אנשי קשר » | 0 | un geste de copie par lot |
| **B. Raccourci iPhone « שלח ללא ינום »** | Dans WhatsApp, ouvrir la carte de contact → Partager → le Raccourci ; il ouvre l'app avec le contact déjà dans le collage | ≈ ½ journée (réception `?paste=` dans l'app + recette du Raccourci à installer une fois) | toujours un geste par contact ; iPhone/iPad seulement |
| **C. Partage natif Android** (Web Share Target) | Une PWA installée apparaît dans la feuille « Partager » d'Android | ≈ ½ journée | **ne fonctionne pas sur iPhone/iPad** (Safari ne le gère pas) — le PO est sur iOS : peu utile |
| **D. Un numéro WhatsApp Business dédié** (API Cloud de Meta) | Tamir transfère les contacts à un numéro « לא ינום » ; un webhook (fonction Edge) les écrit dans `leads` | ≈ 2–3 jours + démarches Meta (compte Business vérifié, numéro neuf qui n'est plus utilisable dans l'app WhatsApp normale) ; conversations initiées par Tamir gratuites, au tarif Meta en vigueur sinon | un second numéro à gérer ; données chez Meta |

**Recommandation** : B si le PO veut gagner le copier-coller sur iPhone ;
D seulement si le volume le justifie (dizaines de contacts par semaine) et
qu'il accepte un numéro dédié. Rien n'est construit : décision du PO.

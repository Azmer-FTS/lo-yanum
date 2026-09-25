# AQ3 — les courriels d'une demande publique

## L'expéditeur retenu : Resend

| Question | Réponse |
|---|---|
| Qui | **Resend** (resend.com), l'expéditeur que la documentation de Supabase donne en exemple pour les fonctions Edge. |
| Coût | Offre **gratuite** : 3 000 courriels par mois, 100 par jour, un domaine. Au-delà : offre payante (20 $/mois pour 50 000 à la date d'écriture). **À vérifier sur resend.com/pricing le jour de l'inscription.** Au rythme d'une association (deux courriels par demande), l'offre gratuite suffit largement. |
| Ce qui part chez eux | Pour chaque demande : l'adresse du PO, celle de l'agriculteur s'il en a donné une, et le texte des deux messages — nom, téléphone, nom du lieu, יישוב, ce qui est demandé, nature de la terre, **les NOMS** des documents fournis, le rendez-vous demandé, la référence, les coordonnées du PO. ⛔ **Jamais** : le numéro d'identité (ת״ז), la signature, les fichiers. |
| Comptes à créer | 1. Un compte Resend. 2. **Un domaine vérifié** chez Resend (trois enregistrements DNS) — sans lui, Resend n'autorise que l'adresse d'essai `onboarding@resend.dev`, qui **n'écrit qu'au titulaire du compte** : le PO recevrait ses messages, l'agriculteur jamais. 3. Une clé d'API. |

## Où vit la clé, et pourquoi c'est sûr

- La clé est un **secret de fonction Edge** : `supabase secrets set RESEND_API_KEY=…`.
  Elle vit dans l'environnement des serveurs de Supabase et n'est lue que par
  `Deno.env.get('RESEND_API_KEY')` dans `supabase/functions/intake-mail/index.ts`.
- Elle n'est **ni dans le dépôt, ni dans une variable `VITE_*`** — or seules les
  variables `VITE_*` sont copiées dans le code servi au navigateur. Aucun
  chemin ne la mène donc dans un bundle.
- `bun run aqmail` (A266) le vérifie à chaque passe : lecture de TOUS les
  fichiers du build (app, jumeau, page publique) et, avec `BASE_URL`, des
  scripts réellement servis — aucune clé `re_…`, aucun `sb_secret_…`, aucun
  jeton dont le rôle n'est pas `anon`, aucun `RESEND_API_KEY`, aucun
  `api.resend.com`.
- La clé de service de Supabase, que la fonction utilise pour lire et écrire
  `aid_requests`, est **injectée par Supabase** dans ce même environnement ;
  elle n'est jamais écrite nulle part par nous.

## Le chemin

```
page publique ──RPC submit_aid_request (anon)──▶ entities + aid_requests  (écrits)
                                                  │ after insert
                                                  ▼
                                   pg_net (file asynchrone, hors transaction)
                                                  │
                                                  ▼
                          fonction Edge intake-mail  ── Resend ──▶ PO, agriculteur
                                                  │
                                                  ▼
                        aid_requests.mail_po / mail_farmer / mail_error  (l'issue)
```

**Un courriel perdu ne fait jamais perdre une demande** : la ligne est écrite
avant, le déclencheur ne fait que METTRE EN FILE (`pg_net`), et son appel est
enveloppé dans `exception when others`. Au pire l'état reste `pending`, et
l'application dit au bout de dix minutes que rien n'est parti.

## Vérifié sur `lo-yanum-prod`, le 2026-09-25 (sans clé Resend)

1. Migration `20260925000400_intake_mail.sql` appliquée par le MCP.
2. Fonction `intake-mail` déployée (`supabase functions deploy intake-mail --no-verify-jwt --use-api`).
3. Une demande de test déposée par le **même RPC anonyme que la page** :
   `{"ok": true, "reference": "68D009"}`.
4. Relue en SQL une seconde plus tard :
   - fiche `farm-req-64bfee8447` écrite, statut `incoming_request` ;
   - `aid_requests` : `mail_po = not_configured`, `mail_farmer = not_configured`,
     `mail_error = RESEND_API_KEY absent : aucun expéditeur configuré`,
     `mail_attempts = 1` ;
   - `net._http_response` : **200**, corps `{"status":"done","po":"not_configured",…}`.
5. Idempotence sur la fonction déployée : deux rappels → `{"status":"skipped"}` ;
   un rappel « שליחה חוזרת » (`retry: true`) → repris, toujours `not_configured`.
   Identifiant invalide → 400 ; inconnu → `not_found`.
6. `anon` lit `aid_requests` → **42501** (inchangé depuis AP).
7. La demande de test, sa fiche et sa visite **supprimées** ; la base revient à
   26 fiches (les 25 + la vraie demande du PO) et 1 demande.

**Ce qui n'a PAS pu être vérifié ici** : l'envoi effectif par Resend et la
lecture de l'adresse du PO dans `auth.users`, qui n'ont lieu que lorsqu'une clé
existe. Le parcours est prouvé sur doublures par `bun run aqmail` (A265) ; le
premier envoi réel se fera quand le PO aura posé la clé (voir l'état du projet,
« ce que le PO doit faire »).

## Poser la clé (quand le PO a validé)

```bash
supabase secrets set --project-ref lvrptqmkjikkkhcxocbe \
  RESEND_API_KEY=re_… \
  INTAKE_MAIL_FROM='לא ינום <bakasha@DOMAINE-VÉRIFIÉ>'
# facultatif : INTAKE_PO_EMAIL=… (sinon, l'adresse du compte coordinateur)
```

Puis, dans l'app, sur la fiche de la demande d'AQ0 (חווה דובי) : « שליחה חוזרת ».

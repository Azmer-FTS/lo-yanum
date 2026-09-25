# AP — A255 · A259 : la demande arrive vraiment dans `lo-yanum-prod`

> Ce que `bun run apui` **ne peut pas** prouver : il intercepte les trois RPC,
> donc il mesure ce que la PAGE envoie, pas ce que la BASE en fait. Le brief
> demande l'inverse — « la demande arrive en base avec ses documents et son
> rendez-vous ». Ce document est le trajet entier, fait une fois, contre la
> production.
>
>     bun x vite build --config vite.bakasha.config.ts --outDir dist-bakasha-real
>     BASE_URL=http://localhost:5362 bun run scripts/apreal.ts
>
> La page est un vrai build avec la vraie paire Supabase ; le navigateur n'a
> **aucun compte** — exactement ce qu'a un agriculteur.

## 1. Ce que la page a fait (2026-09-25)

```
  page  : http://localhost:5362
  marque: חוות AP-BOUT-EN-BOUT 22:02:16

  RÉFÉRENCE RENDUE : 2159DD
  CRÉNEAU CHOISI   : 2026-09-27T06:00:00.000Z   (09:00 à Jérusalem)
  ERREURS DE PAGE  : aucune
```

Parcours complet : les deux choix, les cinq champs, **un vrai PDF déposé sur
le document des cultures**, **une signature au doigt**, un créneau choisi dans
la liste, envoi.

## 2. Ce que la base a reçu

```sql
select e.id, e.name, e.status, e.type, e.position_missing,
       e.farmer_id_no, e.farmer_phone, e.farmer_email, e.locality,
       jsonb_array_length(e.provided_documents)            as documents,
       e.provided_documents -> 0 ->> 'id'                  as doc_id,
       left(e.provided_documents -> 0 ->> 'file', 34)      as doc_prefix,
       left(e.signature, 22)                               as sig_prefix,
       e.signature_origin,
       r.reference, r.need, r.land_kind, r.appointment_at, r.appointment_end_at,
       v.at, v.pending_confirmation, v.note
  from public.aid_requests r
  join public.entities   e on e.id = r.entity_id
  left join public.farm_visits v on v.entity_id = e.id
 where r.reference = '2159DD';
```

| Colonne | Ce qui est en base |
|---|---|
| `entities.id` | `farm-req-bf66d55268` |
| `entities.status` | **`incoming_request`** — « בקשה נכנסת » |
| `entities.type` | `mixed` (les deux cases cochées à l'étape 2) |
| `entities.position_missing` | `true` — **la fiche naît sans épingle** (décision AN n°1) |
| `entities.farmer_id_no` | **`021985189`** — le zéro de tête tenu de bout en bout (A252) |
| `entities.farmer_phone` | `050-9999901` — normalisé par `phoneValue` |
| `entities.farmer_email` | `gate@lo-yanum.invalid` |
| `entities.locality` | `מיצד` |
| `provided_documents` | **1** document, `id = crops`, `data:application/pdf;base64,JVBERi…` (`JVBERi` = `%PDF`) |
| `provided_documents[0].providedAt` | posé **par le serveur**, pas par le téléphone |
| `entities.signature` | `data:image/png;base64,…` |
| `entities.signature_origin` | `{"kind": "app", "signedAt": "2026-09-24T22:02:20+00:00"}` |
| `aid_requests.reference` | `2159DD` — celle affichée à l'agriculteur |
| `aid_requests.appointment_at` / `_end_at` | `2026-09-27 06:00+00` → `07:00+00` |
| `farm_visits.at` | `2026-09-27 06:00+00` |
| `farm_visits.pending_confirmation` | **`true`** (A259) |
| `farm_visits.note` | `מועד שביקש החקלאי דרך העמוד הציבורי — ממתין לאישור` |

→ **A255 ✅ · A259 ✅**

## 3. Les refus, mesurés sur la vraie fonction

Avec la seule clé publiable, en `curl`, sans passer par la page — c'est-à-dire
exactement ce que ferait quelqu'un qui contourne le navigateur :

| Ce qui est envoyé | Ce que la base répond |
|---|---|
| une demande minimale valable | `{"ok": true, "reference": "…"}` |
| sans `phone` | `23514 · phone` |
| `email: "michel@"` | `23514 · email` |
| un document `application/x-msdownload` | `23514 · documentType` |
| **trois** documents | `23514 · documents` |
| **le créneau déjà pris ci-dessus** | `23514 · appointmentTaken` |
| la **4ᵉ** demande du même numéro en 24 h | `23514 · tooMany` |

→ **A256 ✅ côté serveur** (et non seulement côté navigateur), et le
chevauchement d'agenda est vérifié **au moment de l'écriture** et pas seulement
au moment de l'affichage.

## 4. Ce qu'un anonyme n'obtient pas

Après `20260925000300_revoke_anon_everywhere.sql`, avec la clé publiable :

```
entities       401 {"code":"42501", … "Grant the required privileges …"}
aid_requests   401 {"code":"42501", …}
farm_visits    401 {"code":"42501", …}
missions       401 {"code":"42501", …}
user_settings  401 {"code":"42501", …}
```

et pourtant :

```
POST /rest/v1/rpc/public_busy_intervals      → 200
POST /rest/v1/rpc/public_agreement_template  → 200
POST /rest/v1/rpc/submit_aid_request         → 200
```

Le refus est **par droit** (`42501` — permission denied) et non plus seulement
par politique. `select count(*) from information_schema.role_table_grants where
grantee='anon' and table_schema='public'` → **0**.

→ **A257 ✅**, et la règle d'AO5.3 devient générale.

## 5. Le nettoyage

La production est **revenue à son état de départ**, vérifié après coup :

```
entities 25 · fiches « בקשה נכנסת » 0 · aid_requests 0 · farm_visits 0
```

Les lignes d'essai portaient toutes `AP-` dans leur nom, ce qui est ce qui
rend le nettoyage sûr : la suppression vise une marque, jamais une date ni un
« les dernières créées ».

⚠️ **Dans cet ordre**, parce que `farm_visits.entity_id` et
`aid_requests.entity_id` référencent la fiche :

```sql
delete from public.farm_visits  where entity_id in (select entity_id from public.aid_requests where farm_name like 'AP-%');
delete from public.entities     where id        in (select entity_id from public.aid_requests where farm_name like 'AP-%');
delete from public.aid_requests where farm_name like 'AP-%';
```

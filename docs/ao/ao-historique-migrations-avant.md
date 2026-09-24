# AO — l'historique des migrations de `lo-yanum-prod`, avant réalignement

Le 2026-09-24, avant d'appliquer les trois migrations d'AO.

## Le problème

Les migrations d'AK, AM et AN ont été appliquées **par l'outil MCP Supabase**,
qui horodate chaque entrée au moment de l'application et non avec le nom du
fichier. L'historique distant et le dossier `supabase/migrations/` étaient donc
**entièrement disjoints** : chaque fichier local apparaissait comme « jamais
appliqué », y compris `20260909000200_reset_business_data.sql`, qui vide les
26 tables métier. Un `supabase db push` nu aurait détruit la base.

## Ce qui a été fait

1. `migration repair --status applied` sur les **21 versions locales** déjà
   appliquées (preuve : `bun run live` 49/49 sur la base avant toute écriture,
   et `entities.status` encore à 7 étiquettes).
2. `migration repair --status reverted` sur les **21 entrées distantes**
   ci-dessous, qui sont les enregistrements MCP **du même travail** sous un
   autre numéro. Le CLI refusait de pousser tant qu'il voyait des versions
   distantes sans fichier local ; c'est son propre remède, et il ne touche
   QUE la table `supabase_migrations.schema_migrations` — aucun schéma,
   aucune donnée, aucune politique.

## Les 21 entrées retirées de l'historique (restaurables)

Pour les remettre : `supabase migration repair --status applied <liste>`.

```
20260830053807 20260830053844 20260830053951 20260830204605 20260830210700
20260831071424 20260831073640 20260831122515 20260831152128 20260831161210
20260907213428 20260908062945 20260908123227 20260908164311 20260909050408
20260909124657 20260909161517 20260909213651 20260915220315 20260915231335
20260916115054
```

⚠️ **Elles ne peuvent pas « se rejouer »** : aucune n'a de fichier local, donc
`db push` ne les proposera jamais. Les retirer ne fait que lever le refus.

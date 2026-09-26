# AR4 — l'historique des migrations réaligné une deuxième fois (2026-09-26)

## Avant (`ar4-migration-list-avant.json`)

`supabase migration list` : 58 lignes, **16 divergentes**.

- **7 fichiers « jamais appliqués » qui l'étaient** : `20260924000100`,
  `…000200`, `…000300`, `20260925000100`, `…000200`, `…000300`, `…000400`.
  Preuve relue en SQL sur `lo-yanum-prod` AVANT toute écriture : dix statuts
  (dont `not_relevant_now`, `on_hold`, `incoming_request`), `activity_reports`
  et `aid_requests` présentes, 0 droit `anon` sur `public`, les trois fonctions
  anonymes, deux déclencheurs de courriel et les trois colonnes `mail_*`,
  25 exploitations.
- **9 versions distantes sans fichier** — les inscriptions MCP du MÊME travail :

| Version MCP | Nom MCP | Fichier qui porte le DDL |
|---|---|---|
| 20260924093521 | status_not_relevant_now_on_hold | 20260924000100 |
| 20260924093546 | activity_reports | 20260924000200 |
| 20260924093609 | activity_reports_revoke_anon | (AO5.3) — repris par 20260925000300 |
| 20260924093715 | ao1_data_part1 | 20260924000300 |
| 20260924093754 | ao1_data_part2 | 20260924000300 |
| 20260924213133 | status_incoming_request | 20260925000100 |
| 20260924213247 | aid_requests | 20260925000200 |
| 20260924213418 | revoke_anon_everywhere | 20260925000300 |
| 20260925122303 | intake_mail | 20260925000400 |

## Ce qui a été fait — rien n'a été effacé

1. `supabase migration repair --status applied` sur les 7 fichiers ci-dessus.
   Ne touche QUE `supabase_migrations.schema_migrations`.
2. **9 fichiers-jalons** `<version MCP>_jalon_historique_mcp.sql`, vides
   (`select 1 where false;`), qui nomment le fichier porteur. Les inscriptions
   MCP RESTENT dans l'historique distant : la trace de ce qui a été appliqué,
   et quand, est conservée.
3. ⛔ Aucun `db push`, même en `--dry-run`.

## Après (`ar4-migration-list-apres.json`)

58 versions, **0 divergente, 0 en attente**. `bun run armigrations` : 35/35.

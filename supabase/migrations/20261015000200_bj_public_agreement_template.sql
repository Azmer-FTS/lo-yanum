-- ═══════════════════════════════════════════════════════════════════════════
-- BJ (2026-10-15) — LA PAGE PUBLIQUE LIT LE GABARIT LÀ OÙ IL VIT DÉSORMAIS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `public_agreement_template()` (AP3.5, migration 20260925000200) lisait le
-- gabarit de l'accord dans l'ancien bloc `user_settings`. Depuis BJ, l'app
-- écrit chaque réglage dans `user_setting_values` (une ligne, horodatée par le
-- serveur) et ne touche plus au bloc : sans cette correction, une modification
-- du gabarit faite dans l'app n'aurait JAMAIS atteint la page publique — elle
-- aurait montré pour toujours le dernier texte d'avant BJ.
--
-- ★ LA RÈGLE : si la nouvelle table porte la clé (pour un utilisateur, quel
--   qu'il soit), c'est la plus récente (`updated_at`, l'heure du serveur) qui
--   compte — et `null` y veut dire « retour au texte livré », la page rend
--   alors `null` comme avant. Sinon (aucun appareil n'a encore migré), l'ancien
--   bloc, exactement comme avant.
--
-- ⚠️ La surface anonyme ne change pas : la MÊME fonction, la même signature,
--    les mêmes droits (`bun run appass` compte toujours trois fonctions). Elle
--    n'extrait QUE la clé du gabarit, et rien d'autre.

create or replace function public.public_agreement_template()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when exists (select 1 from public.user_setting_values v where v.key = 'lo-yanum:agreement-doc-template')
      then (select v.value
              from public.user_setting_values v
             where v.key = 'lo-yanum:agreement-doc-template'
             order by v.updated_at desc
             limit 1)
    else (select s.data ->> 'lo-yanum:agreement-doc-template'
            from public.user_settings s
           where s.data ? 'lo-yanum:agreement-doc-template'
           order by s.updated_at desc
           limit 1)
  end
$$;

revoke all on function public.public_agreement_template() from public;
grant execute on function public.public_agreement_template() to anon;
grant execute on function public.public_agreement_template() to authenticated;
grant execute on function public.public_agreement_template() to service_role;

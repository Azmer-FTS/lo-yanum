-- ═══════════════════════════════════════════════════════════════════════════
-- BJ (2026-10-15) — UN RÉGLAGE PAR LIGNE, HORODATÉ PAR LE SERVEUR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ADDITIVE : une table neuve. `user_settings` (le bloc d'AH11.2) n'est ni
-- supprimée ni réécrite : les builds d'avant BJ la lisent encore, et le build
-- BJ la relit UNE fois, à la migration de chaque appareil, comme « ce que le
-- compte portait ».
-- Appliquée AVANT le déploiement (le build qui la lit la trouve déjà là).
--
-- ⚠️ Règle d'AO0 : la table naît AVEC ses `grant` et sa RLS, dans cette même
--    migration ; RIEN pour `anon`.
--
-- ★ POURQUOI UNE LIGNE PAR RÉGLAGE ET PLUS UN BLOC. Le bloc portait des
--   instants posés par l'APPAREIL (`Date.now()` dans `__stamps`) : un iPad à
--   l'heure fausse gagnait contre un ordinateur à l'heure juste. Et un appareil
--   resté sur un ancien build réécrivait le bloc entier avec SA liste de clés.
--   Ici, chaque ligne porte son propre instant, et c'est la BASE qui le pose
--   (déclencheur ci-dessous) — jamais le client.
--
-- ★ LES DEUX INSTANTS.
--   · `updated_at` : QUAND la valeur a été choisie, à l'horloge du serveur.
--     C'est lui qui départage deux appareils (« le dernier écrit gagne »).
--     Une écriture en ligne prend `now()`. Une modification faite HORS LIGNE
--     et envoyée au retour du réseau porte `client_at` : l'instant du geste,
--     exprimé à l'horloge du SERVEUR (l'appareil corrige sa propre horloge de
--     l'écart qu'il a mesuré sur ses écritures précédentes), et la base le
--     BORNE à `now()` — un appareil ne peut jamais écrire dans le futur.
--     Si la ligne en place est plus récente, l'écriture est IGNORÉE (le
--     déclencheur rend l'ancienne ligne) : une file hors ligne n'écrase jamais
--     une valeur plus récente venue d'ailleurs.
--   · `written_at` : QUAND la ligne est arrivée en base (`now()`, toujours).
--     C'est le curseur de relecture des autres appareils : une écriture hors
--     ligne a un `updated_at` dans le passé, mais un `written_at` neuf.
--
-- ★ `value` est le texte exact que l'appareil range sous la même clé ;
--   `null` = « retour au défaut » (un effacement voyage comme un choix).

create table if not exists public.user_setting_values (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text not null check (char_length(key) between 1 and 200),
  value       text check (value is null or octet_length(value) <= 2000000),
  updated_at  timestamptz not null default now(),
  written_at  timestamptz not null default now(),
  client_at   timestamptz,
  device      text check (device is null or char_length(device) <= 120),
  primary key (user_id, key)
);

create index if not exists user_setting_values_written_idx
  on public.user_setting_values (user_id, written_at);

create or replace function private.user_setting_values_stamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  eff timestamptz := least(coalesce(new.client_at, now()), now());
begin
  if tg_op = 'UPDATE' then
    -- L'identité de la ligne ne bouge jamais.
    new.user_id := old.user_id;
    new.key := old.key;
    -- Plus ancien (ou égal) que ce qui est en place : rien ne change.
    if eff <= old.updated_at then
      return old;
    end if;
  else
    new.user_id := coalesce(new.user_id, auth.uid());
  end if;
  new.updated_at := eff;
  new.written_at := now();
  return new;
end;
$$;

drop trigger if exists user_setting_values_stamp on public.user_setting_values;
create trigger user_setting_values_stamp
  before insert or update on public.user_setting_values
  for each row execute function private.user_setting_values_stamp();

alter table public.user_setting_values enable row level security;
alter table public.user_setting_values force row level security;

drop policy if exists user_setting_values_own on public.user_setting_values;
create policy user_setting_values_own on public.user_setting_values
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_setting_values to authenticated;
grant select, insert, update, delete on public.user_setting_values to service_role;
revoke all on public.user_setting_values from anon;

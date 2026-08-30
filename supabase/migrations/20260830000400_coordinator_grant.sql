-- ===========================================================================
-- P2.3 — THE COORDINATOR'S LOGIN BECOMES SOMEBODY.
-- ===========================================================================
--
-- The schema's own words (20260830000100, above `app_users`): "A user with no
-- row here is nobody: `app_role()` returns null and every policy denies."
--
-- That is the whole reason this file exists. Creating the account in Supabase's
-- Authentication panel produces a login that can sign in and then see NOTHING —
-- 26 tables, every one of them returning an empty list, with no error to
-- explain it. The account and the ROLE are two separate facts, and the second
-- one is here rather than in the dashboard because it is a decision about the
-- programme, not about a person's password.
--
-- WHY BY EMAIL AND NOT BY UUID: the uuid is generated when the product owner
-- creates the account, in his browser, with a password nobody else ever sees.
-- Nothing in this repository knows it in advance, and nothing should.
--
-- ★ THIS MIGRATION FAILS LOUDLY IF THE ACCOUNT DOES NOT EXIST YET.
--   An `insert ... select` over an empty result inserts nothing and reports
--   success, which would leave a coordinator who can sign in and see an empty
--   application, with every gate green. The order is: create the account
--   first, apply this second.
--
-- Re-runnable: applying it twice re-asserts the role and changes nothing else.
-- ===========================================================================

do $$
declare
  target constant text := 'dov@serialkolors.com';
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(target);

  if uid is null then
    raise exception
      'P2.3: no auth user for %. Create the account in Authentication → Users '
      '(the product owner chooses the password; it is never set from here), '
      'then apply this migration.', target;
  end if;

  insert into app_users (user_id, role, entity_ref)
  values (uid, 'coordinator', null)
  on conflict (user_id) do update
    set role = 'coordinator', entity_ref = null;

  raise notice 'P2.3: % is coordinator (%).', target, uid;
end;
$$;

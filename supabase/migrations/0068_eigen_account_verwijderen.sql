-- 0068: een gebruiker verwijdert zijn eigen account, met alles wat erbij hoort.
--
-- De edge function `delete-account` roept deze functie aan met de service role,
-- nadat hij het token van de gebruiker heeft gecontroleerd en het contact in
-- Brevo heeft weggehaald. De browser mag hem niet zelf aanroepen: dan zou het
-- Brevo-contact blijven staan.
--
-- Alles gebeurt in één transactie. Wat mee verdwijnt:
--   * de prompts die hij maakte, met hun versies, reacties, likes, gedeelde
--     toegang en goedkeuringen (cascade op prompts);
--   * chatprojecten met bronbestanden en vectoren (cascade op chat_projects);
--   * profiel, geheugen, eigen chatinstructie, meldingen, likes, reacties en
--     moderatorschap (cascade op auth.users);
--   * zijn aanvragen voor afdelingen, functies en categorieën.
-- Wat blijft:
--   * organisaties die op zijn aanvraag zijn gemaakt: die zijn van iedereen;
--     alleen `created_by` wordt leeg;
--   * een lopende afdelingsaanvraag waar collega's bij zijn aangesloten: die
--     gaat over op de eerste collega, zodat zij niet opnieuw hoeven aan te vragen;
--   * tellingen in analytics, zonder zijn naam of e-mailadres;
--   * het auditlog van de beheerders.

create or replace function public.delete_user_account(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text;
  v_name      text;
  v_prompts   int := 0;
  v_projects  int := 0;
  aanvraag    record;
  opvolger    uuid;
begin
  if p_user is null then
    raise exception 'geen_gebruiker';
  end if;

  select lower(u.email), p.full_name
    into v_email, v_name
    from auth.users u
    left join profiles p on p.id = u.id
   where u.id = p_user;
  if not found then
    raise exception 'geen_gebruiker';
  end if;

  -- De laatste beheerder kan zichzelf niet weghalen: dan kan niemand meer in Beheer.
  if exists (select 1 from profiles where id = p_user and role = 'admin')
     and not exists (
       select 1 from profiles
        where role = 'admin' and id <> p_user and coalesce(is_active, true)
     ) then
    raise exception 'laatste_beheerder';
  end if;

  delete from prompts where created_by_user = p_user;
  get diagnostics v_prompts = row_count;

  delete from chat_projects where user_id = p_user;
  get diagnostics v_projects = row_count;

  for aanvraag in
    select id from organization_requests
     where requested_by = p_user and status = 'pending'
  loop
    opvolger := null;
    select f.user_id into opvolger
      from organization_request_followers f
     where f.request_id = aanvraag.id
     order by f.created_at
     limit 1;
    if opvolger is not null then
      update organization_requests set requested_by = opvolger where id = aanvraag.id;
      delete from organization_request_followers
       where request_id = aanvraag.id and user_id = opvolger;
    end if;
  end loop;

  delete from organization_requests where requested_by = p_user;
  delete from function_requests where requested_by = p_user;
  delete from category_requests where requested_by = p_user;
  update organizations set created_by = null where created_by = p_user;

  -- Analytics schrijft de naam of het e-mailadres weg; de telling blijft, de persoon niet.
  update analytics_events set user_identifier = null
   where user_identifier in (p_user::text, v_email, nullif(trim(v_name), ''));
  update behavior_logs set user_identifier = null
   where user_identifier in (p_user::text, v_email, nullif(trim(v_name), ''));

  delete from auth.users where id = p_user;

  return jsonb_build_object('prompts', v_prompts, 'projecten', v_projects);
end;
$$;

revoke execute on function public.delete_user_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_account(uuid) to service_role;

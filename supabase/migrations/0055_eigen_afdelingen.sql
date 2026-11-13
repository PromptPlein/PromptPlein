-- 0055_eigen_afdelingen.sql
--
-- Gebruikers maken zelf een afdeling aan onder een ministerie, zonder
-- goedkeuring. Wie dezelfde afdeling kiest, deelt de prompts op het
-- deelniveau Afdeling (zie 0022: exacte match op de organisatie).
--
-- Een functie blijft een aanvraag die een beheerder goedkeurt (0017). De mails
-- daarvoor liepen al via 0048; nieuw is dat de goedgekeurde functie meteen op
-- het profiel van de aanvrager komt en dat de mail naar het profiel linkt.

-- 1. Wie een afdeling aanmaakte, zodat een beheerder dat kan nagaan.
alter table public.organizations
  add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Eén afdeling per naam per ministerie, ongeacht hoofdletters.
create unique index if not exists organizations_afdeling_naam_uniek
  on public.organizations (parent_id, lower(name))
  where organization_type = 'department';

-- 2. Afdeling aanmaken. Bestaat de naam al onder dit ministerie, dan komt die
--    terug, zodat twee collega's niet elk een eigen kopie maken.
create or replace function public.create_department(p_ministry uuid, p_name text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  naam   text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  result public.organizations;
  vandaag int;
begin
  if uid is null then
    raise exception 'Log in om een afdeling toe te voegen.' using errcode = '42501';
  end if;

  if char_length(naam) < 2 or char_length(naam) > 80 then
    raise exception 'Een afdelingsnaam heeft 2 tot 80 tekens.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from organizations
    where id = p_ministry and organization_type = 'ministry' and is_active
  ) then
    raise exception 'Kies eerst een ministerie.' using errcode = '22023';
  end if;

  select * into result from organizations
    where parent_id = p_ministry
      and organization_type = 'department'
      and lower(name) = lower(naam)
    limit 1;
  if found then
    if not result.is_active then
      raise exception 'Deze afdeling is door een beheerder uitgezet.' using errcode = '22023';
    end if;
    return result;
  end if;

  -- Rem op per ongeluk of bewust volschrijven van de lijst.
  select count(*) into vandaag from organizations
    where created_by = uid and created_at > now() - interval '1 day';
  if vandaag >= 10 then
    raise exception 'Je hebt vandaag al tien afdelingen toegevoegd. Probeer het morgen weer.'
      using errcode = '54000';
  end if;

  begin
    insert into organizations (name, parent_id, organization_type, is_active, created_by)
      values (naam, p_ministry, 'department', true, uid)
      returning * into result;
  exception when unique_violation then
    -- Een collega was net eerder: geef diens afdeling terug.
    select * into result from organizations
      where parent_id = p_ministry
        and organization_type = 'department'
        and lower(name) = lower(naam)
      limit 1;
  end;

  return result;
end;
$$;

revoke execute on function public.create_department(uuid, text) from public, anon;
grant execute on function public.create_department(uuid, text) to authenticated;

-- 3. Goedgekeurde functie meteen op het profiel van de aanvrager, als die nog
--    geen functie heeft gekozen.
create or replace function private.function_request_assign()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.status = 'approved'
     and OLD.status is distinct from 'approved'
     and NEW.created_role_id is not null
     and NEW.requested_by is not null then
    update profiles
      set function_id = NEW.created_role_id
      where id = NEW.requested_by and function_id is null;
  end if;
  return NEW;
exception when others then
  raise warning 'function_request_assign mislukt: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_function_request_assign on public.function_requests;
create trigger trg_function_request_assign
  after update of status on public.function_requests
  for each row execute function private.function_request_assign();

revoke execute on function private.function_request_assign() from public, anon, authenticated;

-- 4. De mail bij een functie linkt naar het profiel, waar de functie staat.
create or replace function private.request_mail()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  soort text := case when TG_TABLE_NAME = 'category_requests' then 'Categorie' else 'Functie' end;
  queue text := case when TG_TABLE_NAME = 'category_requests'
                     then 'categorie-aanvragen' else 'functie-aanvragen' end;
  link  text := case when TG_TABLE_NAME = 'category_requests'
                     then 'https://www.promptplein.app'
                     else 'https://www.promptplein.app/profiel' end;
begin
  if TG_OP = 'UPDATE' and NEW.status is not distinct from OLD.status then
    return NEW;
  end if;

  if NEW.status = 'pending' then
    perform private.approval_submitted(
      soort, NEW.name, null, NEW.motivation, NEW.requested_by, null,
      link, 'https://www.promptplein.app/admin/' || queue
    );
  elsif TG_OP = 'UPDATE' and NEW.status in ('approved', 'rejected') then
    perform private.approval_decided(
      NEW.status, soort, NEW.name, null, NEW.review_note,
      NEW.requested_by, NEW.reviewed_by, link
    );
  end if;

  return NEW;
exception when others then
  raise warning 'request_mail mislukt: %', sqlerrm;
  return NEW;
end;
$$;

revoke execute on function private.request_mail() from public, anon, authenticated;
